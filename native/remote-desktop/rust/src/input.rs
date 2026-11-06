//! Snapshot ordering and release policy shared by callback-driven native input.
use crate::{gpu::Screen, Events, Shared};
use serde::Deserialize;
use serde_json::Value;
use std::{
    collections::BTreeSet,
    sync::{Arc, Mutex},
};

pub trait Adapter: Send {
    fn allowed(&self) -> bool;
    fn apply(&mut self, action: &Action) -> Result<(), String>;
}
#[derive(Clone, Debug, PartialEq)]
pub enum Action {
    Move(f64, f64),
    Point(f64, f64),
    Button(u8, bool),
    Wheel(f64, f64),
    Key(String, bool),
}
#[derive(Clone, Deserialize)]
struct Snapshot {
    v: u8,
    seq: u64,
    epoch: u64,
    x: f64,
    y: f64,
    #[serde(rename = "wheelX")]
    wheel_x: f64,
    #[serde(rename = "wheelY")]
    wheel_y: f64,
    buttons: u8,
    keys: Vec<String>,
    point: Option<[f64; 2]>,
}
impl Snapshot {
    fn valid(&self) -> bool {
        self.v == 1
            && self.seq <= 9_007_199_254_740_991
            && self.epoch <= 9_007_199_254_740_991
            && [self.x, self.y, self.wheel_x, self.wheel_y]
                .iter()
                .all(|n| n.is_finite() && n.abs() <= 1e12)
            && self.buttons <= 7
            && self.keys.len() <= 16
            && self.keys.iter().all(|k| {
                !k.is_empty() && k.len() <= 24 && k.bytes().all(|c| c.is_ascii_alphanumeric())
            })
            && self
                .point
                .is_none_or(|p| p.iter().all(|n| n.is_finite() && (0. ..=1.).contains(n)))
    }
}
struct Receiver {
    adapter: Box<dyn Adapter>,
    previous: Option<Snapshot>,
    pending: Option<Snapshot>,
    held_buttons: u8,
    held_keys: BTreeSet<String>,
    last_at: Option<u64>,
    window: u64,
    motion: u32,
    reliable: u32,
    enabled: bool,
}
impl Receiver {
    fn release(&mut self) {
        for bit in [1, 2, 4] {
            if self.held_buttons & bit != 0 {
                let _ = self.adapter.apply(&Action::Button(bit, false));
            }
        }
        for key in &self.held_keys {
            let _ = self.adapter.apply(&Action::Key(key.clone(), false));
        }
        self.held_buttons = 0;
        self.held_keys.clear();
        self.pending = None;
        if let Some(p) = &mut self.previous {
            p.buttons = 0;
            p.keys.clear();
        }
    }
    fn emit(&mut self, action: Action, authorized: &impl Fn() -> bool) -> Result<(), String> {
        if !authorized() || !self.adapter.allowed() {
            return Err("Desktop input permission ended".into());
        }
        // Track downs before the OS call so a partially failed injection is released.
        match &action {
            Action::Button(bit, true) => self.held_buttons |= bit,
            Action::Key(key, true) => {
                self.held_keys.insert(key.clone());
            }
            _ => {}
        }
        self.adapter.apply(&action)?;
        match &action {
            Action::Button(bit, false) => self.held_buttons &= !bit,
            Action::Key(key, false) => {
                self.held_keys.remove(key);
            }
            _ => {}
        }
        Ok(())
    }
    fn rate(&mut self, reliable: bool, now: u64) -> Result<bool, String> {
        if now.saturating_sub(self.window) > 1000 {
            self.window = now;
            self.motion = 0;
            self.reliable = 0;
        }
        if reliable {
            self.reliable += 1;
            if self.reliable > 256 {
                return Err("Too many desktop input messages".into());
            }
        } else {
            self.motion += 1;
            if self.motion > 300 {
                return Ok(false);
            }
        }
        Ok(true)
    }
    fn accept(
        &mut self,
        next: Snapshot,
        reliable: bool,
        now: u64,
        authorized: &impl Fn() -> bool,
    ) -> Result<(), String> {
        if !next.valid() {
            return Err("Invalid desktop input".into());
        }
        let (seq, epoch, buttons, keys) =
            self.previous.as_ref().map_or((None, 0, 0, &[][..]), |p| {
                (Some(p.seq), p.epoch, p.buttons, p.keys.as_slice())
            });
        if !reliable && next.epoch > epoch {
            if self.pending.as_ref().is_none_or(|p| next.seq > p.seq) {
                self.pending = Some(next);
            }
            return Ok(());
        }
        if seq.is_some_and(|s| next.seq <= s) || next.epoch < epoch {
            return Ok(());
        }
        if !reliable && (next.buttons != buttons || next.keys != keys) {
            return Ok(());
        }
        let previous = self.previous.clone();
        let (x, y, wx, wy, point) = previous.as_ref().map_or((0., 0., 0., 0., None), |p| {
            (p.x, p.y, p.wheel_x, p.wheel_y, p.point)
        });
        let old_keys = keys.to_vec();
        if let Some(p) = next.point {
            if Some(p) != point
                || next.buttons != buttons
                || next.wheel_x != wx
                || next.wheel_y != wy
            {
                self.emit(Action::Point(p[0], p[1]), authorized)?;
            }
        } else if next.x != x || next.y != y {
            self.emit(
                Action::Move(
                    (next.x - x).clamp(-4096., 4096.),
                    (next.y - y).clamp(-4096., 4096.),
                ),
                authorized,
            )?;
        }
        for bit in [1, 2, 4] {
            if next.buttons & bit != 0 && buttons & bit == 0 {
                self.emit(Action::Button(bit, true), authorized)?;
            }
        }
        if next.wheel_x != wx || next.wheel_y != wy {
            self.emit(
                Action::Wheel(
                    (next.wheel_x - wx).clamp(-4096., 4096.),
                    (next.wheel_y - wy).clamp(-4096., 4096.),
                ),
                authorized,
            )?;
        }
        for bit in [1, 2, 4] {
            if next.buttons & bit == 0 && buttons & bit != 0 {
                self.emit(Action::Button(bit, false), authorized)?;
            }
        }
        for key in old_keys.iter().filter(|k| !next.keys.contains(k)) {
            self.emit(Action::Key(key.clone(), false), authorized)?;
        }
        for key in next.keys.iter().filter(|k| !old_keys.contains(k)) {
            self.emit(Action::Key(key.clone(), true), authorized)?;
        }
        self.last_at = Some(now);
        self.previous = Some(next);
        if reliable
            && self
                .pending
                .as_ref()
                .is_some_and(|p| p.epoch <= self.previous.as_ref().unwrap().epoch)
        {
            let pending = self.pending.take().unwrap();
            self.accept(pending, false, now, authorized)?;
        }
        Ok(())
    }
}

pub struct Input {
    state: Mutex<Receiver>,
    epoch: u64,
    session: String,
    negotiation: u64,
}
impl Input {
    #[cfg(any(windows, test))]
    pub fn new(adapter: Box<dyn Adapter>, epoch: u64) -> Self {
        Self {
            epoch,
            session: String::new(),
            negotiation: 0,
            state: Mutex::new(Receiver {
                adapter,
                previous: None,
                pending: None,
                held_buttons: 0,
                held_keys: BTreeSet::new(),
                last_at: None,
                window: 0,
                motion: 0,
                reliable: 0,
                enabled: true,
            }),
        }
    }
    #[cfg(any(windows, test))]
    pub fn scoped(mut self, session: String, negotiation: u64) -> Self {
        self.session = session;
        self.negotiation = negotiation;
        self
    }
    pub fn matches(&self, value: &Value) -> bool {
        value["session"].as_str() == Some(&self.session)
            && value["negotiation"].as_u64() == Some(self.negotiation)
    }
    pub fn watch(
        self: &Arc<Self>,
        shared: Arc<Shared>,
        events: Events,
        session: String,
        negotiation: u64,
    ) -> Result<(), String> {
        let input = self.clone();
        std::thread::Builder::new().name("mew-input-watch".into()).spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_millis(50));
            if shared.epoch.load(std::sync::atomic::Ordering::Acquire) != input.epoch
                || shared.closed.load(std::sync::atomic::Ordering::Acquire)
                || input.state.lock().is_ok_and(|state| !state.enabled) { break; }
            if let Err(error) = input.tick(&shared) {
                let _ = error;
                events.send(serde_json::json!({"type":"rtc-error","session":session,"negotiation":negotiation,"label":"control","value":null}));
                break;
            }
        }).map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn revoke(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.enabled = false;
            state.release();
        }
    }
    pub fn release(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.release();
        }
    }
    pub fn sequence(&self) -> i64 {
        self.state
            .lock()
            .ok()
            .and_then(|s| s.previous.as_ref().map(|p| p.seq as i64))
            .unwrap_or(-1)
    }
    fn operate<T>(
        &self,
        shared: &Shared,
        op: impl FnOnce(&mut Receiver, &dyn Fn() -> bool) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut state = self.state.lock().map_err(|_| "Input state poisoned")?;
        let authorized = || shared.authorized(self.epoch);
        let result = if !state.enabled || !authorized() || !state.adapter.allowed() {
            Err("Desktop input permission ended".into())
        } else {
            op(&mut state, &authorized)
        };
        if result.is_err() {
            state.enabled = false;
            state.release();
            shared.failed_input_generation.fetch_max(
                self.epoch.saturating_add(1),
                std::sync::atomic::Ordering::AcqRel,
            );
        }
        result
    }
    pub fn message(&self, value: &Value, reliable: bool, shared: &Shared) -> Result<bool, String> {
        match value["type"].as_str() {
            Some("input") => self.operate(shared, |state, auth| {
                if !state.rate(reliable, shared.ms())? {
                    return Ok(true);
                }
                let snapshot =
                    serde_json::from_value(value.clone()).map_err(|_| "Invalid desktop input")?;
                state.accept(snapshot, reliable, shared.ms(), &auth)?;
                Ok(true)
            }),
            Some("paste") => self.operate(shared, |state, _| {
                if !reliable {
                    return Err("Invalid paste channel".into());
                }
                state.rate(true, shared.ms())?;
                state.release();
                Ok(false)
            }),
            _ => Ok(false),
        }
    }
    pub fn chord(&self, keys: &[String], shared: &Shared) -> Result<(), String> {
        if keys.len() > 16
            || keys.iter().any(|k| {
                k.is_empty() || k.len() > 24 || !k.bytes().all(|c| c.is_ascii_alphanumeric())
            })
        {
            return Err("Invalid key chord".into());
        }
        self.operate(shared, |state, auth| {
            let held: Vec<_> = state.held_keys.iter().cloned().collect();
            for key in &held {
                state.emit(Action::Key(key.clone(), false), &auth)?;
            }
            for key in keys {
                state.emit(Action::Key(key.clone(), true), &auth)?;
            }
            for key in keys.iter().rev() {
                state.emit(Action::Key(key.clone(), false), &auth)?;
            }
            for key in held {
                state.emit(Action::Key(key, true), &auth)?;
            }
            Ok(())
        })
    }
    pub fn tick(&self, shared: &Shared) -> Result<(), String> {
        self.operate(shared, |state, _| {
            if state
                .last_at
                .is_some_and(|at| shared.ms().saturating_sub(at) > 1500)
            {
                Err("Desktop input response expired".into())
            } else {
                Ok(())
            }
        })
    }
}
impl Drop for Input {
    fn drop(&mut self) {
        self.revoke();
    }
}

pub fn windows(
    screen: Screen,
    keys: &Value,
    epoch: u64,
    session: String,
    negotiation: u64,
) -> Result<Option<Arc<Input>>, String> {
    #[cfg(windows)]
    {
        Ok(Some(Arc::new(
            Input::new(
                Box::new(crate::input_windows::Windows::new(screen, keys)?),
                epoch,
            )
            .scoped(session, negotiation),
        )))
    }
    #[cfg(not(windows))]
    {
        let _ = (screen, keys, epoch, session, negotiation);
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicBool, Ordering};
    struct Fake {
        actions: Arc<Mutex<Vec<Action>>>,
        allowed: Arc<AtomicBool>,
        fail_down: bool,
    }
    impl Adapter for Fake {
        fn allowed(&self) -> bool {
            self.allowed.load(Ordering::Acquire)
        }
        fn apply(&mut self, action: &Action) -> Result<(), String> {
            self.actions.lock().unwrap().push(action.clone());
            if self.fail_down && matches!(action, Action::Key(_, true)) {
                Err("Injection failed".into())
            } else {
                Ok(())
            }
        }
    }
    fn receiver(fail_down: bool) -> (Input, Arc<Mutex<Vec<Action>>>, Arc<AtomicBool>) {
        let actions = Arc::new(Mutex::new(Vec::new()));
        let allowed = Arc::new(AtomicBool::new(true));
        (
            Input::new(
                Box::new(Fake {
                    actions: actions.clone(),
                    allowed: allowed.clone(),
                    fail_down,
                }),
                0,
            ),
            actions,
            allowed,
        )
    }
    fn snapshot(seq: u64, epoch: u64, x: f64, buttons: u8, keys: &[&str]) -> Value {
        json!({"type":"input","v":1,"seq":seq,"epoch":epoch,"x":x,"y":0,"wheelX":0,"wheelY":0,"buttons":buttons,"keys":keys})
    }
    #[test]
    fn lossy_motion_cannot_overtake_reliable_transitions() {
        let (input, actions, _) = receiver(false);
        let shared = Shared::new();
        input
            .message(&snapshot(2, 1, 20., 1, &["KeyA"]), false, &shared)
            .unwrap();
        assert!(actions.lock().unwrap().is_empty());
        input
            .message(&snapshot(1, 1, 10., 1, &["KeyA"]), true, &shared)
            .unwrap();
        assert_eq!(
            *actions.lock().unwrap(),
            vec![
                Action::Move(10., 0.),
                Action::Button(1, true),
                Action::Key("KeyA".into(), true),
                Action::Move(10., 0.)
            ]
        );
        input
            .message(&snapshot(3, 2, 20., 0, &[]), true, &shared)
            .unwrap();
        input
            .message(&snapshot(2, 1, 99., 1, &["KeyA"]), false, &shared)
            .unwrap();
        assert_eq!(input.sequence(), 3);
        assert_eq!(
            &actions.lock().unwrap()[4..],
            &[Action::Button(1, false), Action::Key("KeyA".into(), false)]
        );
    }
    #[test]
    fn malformed_and_partial_input_fail_closed_and_release_every_held_key() {
        let (input, actions, _) = receiver(true);
        let shared = Shared::new();
        assert!(input
            .message(&snapshot(1, 1, 0., 1, &["KeyA"]), true, &shared)
            .is_err());
        assert_eq!(
            *actions.lock().unwrap(),
            vec![
                Action::Button(1, true),
                Action::Key("KeyA".into(), true),
                Action::Button(1, false),
                Action::Key("KeyA".into(), false)
            ]
        );
        assert!(input
            .message(&snapshot(2, 1, 10., 0, &[]), true, &shared)
            .is_err());
        let (input, _, _) = receiver(false);
        let shared = Shared::new();
        let mut invalid = snapshot(1, 0, 0., 0, &[]);
        invalid["point"] = json!([1.1, 0]);
        assert!(input.message(&invalid, true, &shared).is_err());
    }
    #[test]
    fn lock_generation_lease_and_input_timeout_release_without_node_polling() {
        for reason in ["lock", "generation", "lease", "timeout", "revoke"] {
            let (input, actions, allowed) = receiver(false);
            let mut shared = Shared::new();
            input
                .message(&snapshot(1, 1, 0., 1, &["KeyA"]), true, &shared)
                .unwrap();
            match reason {
                "lock" => allowed.store(false, Ordering::Release),
                "generation" => {
                    shared.epoch.fetch_add(1, Ordering::AcqRel);
                }
                "lease" => shared.origin -= std::time::Duration::from_millis(8001),
                "timeout" => shared.origin -= std::time::Duration::from_millis(1501),
                _ => input.revoke(),
            }
            assert!(input.tick(&shared).is_err(), "{reason}");
            assert_eq!(
                &actions.lock().unwrap()[2..],
                &[Action::Button(1, false), Action::Key("KeyA".into(), false)],
                "{reason}"
            );
            assert!(input
                .message(&snapshot(2, 1, 100., 1, &["KeyA"]), true, &shared)
                .is_err());
        }
    }
    #[test]
    fn watchdog_releases_keys_while_video_and_node_are_not_running() {
        let (input, actions, allowed) = receiver(false);
        let input = Arc::new(input);
        let shared = Arc::new(Shared::new());
        input
            .message(&snapshot(1, 1, 0., 1, &["KeyA"]), true, &shared)
            .unwrap();
        let (tx, rx) = std::sync::mpsc::sync_channel(8);
        input
            .watch(
                shared.clone(),
                Events {
                    tx,
                    shared: shared.clone(),
                },
                "session".into(),
                4,
            )
            .unwrap();
        allowed.store(false, Ordering::Release);
        let event = rx.recv_timeout(std::time::Duration::from_secs(1)).unwrap();
        assert_eq!(event["type"], "rtc-error");
        assert_eq!(event["negotiation"], 4);
        assert_eq!(
            &actions.lock().unwrap()[2..],
            &[Action::Button(1, false), Action::Key("KeyA".into(), false)]
        );
    }
    #[test]
    fn stale_input_watchdog_failure_cannot_revoke_a_new_generation() {
        let (old, _, _) = receiver(false);
        let shared = Shared::new();
        shared.epoch.store(1, Ordering::Release);
        assert!(old.tick(&shared).is_err());
        assert!(shared.authorized(1));
        let (mut current, _, allowed) = receiver(false);
        current.epoch = 1;
        allowed.store(false, Ordering::Release);
        assert!(current.tick(&shared).is_err());
        assert!(!shared.authorized(1));
        assert!(old.tick(&shared).is_err());
        assert!(!shared.authorized(1));
        assert!(!shared.closed.load(Ordering::Acquire));
    }
    #[test]
    fn reliable_limit_releases_inputs_and_motion_limit_drops_only_excess() {
        let (input, actions, _) = receiver(false);
        let shared = Shared::new();
        for seq in 0..256 {
            input
                .message(&snapshot(seq, 0, 0., 1, &[]), true, &shared)
                .unwrap();
        }
        assert!(input
            .message(&snapshot(256, 0, 0., 1, &[]), true, &shared)
            .is_err());
        assert_eq!(
            *actions.lock().unwrap(),
            vec![Action::Button(1, true), Action::Button(1, false)]
        );
        let (input, _, _) = receiver(false);
        let shared = Shared::new();
        for seq in 0..301 {
            input
                .message(&snapshot(seq, 0, seq as f64, 0, &[]), false, &shared)
                .unwrap();
        }
        assert_eq!(input.sequence(), 299);
    }
    #[test]
    fn absolute_touch_and_paste_chord_preserve_snapshot_state() {
        let (input, actions, _) = receiver(false);
        let shared = Shared::new();
        let mut point = snapshot(1, 0, 0., 0, &["ShiftLeft"]);
        point["point"] = json!([0.25, 0.75]);
        input.message(&point, true, &shared).unwrap();
        input
            .chord(&["ControlLeft".into(), "KeyV".into()], &shared)
            .unwrap();
        assert_eq!(
            *actions.lock().unwrap(),
            vec![
                Action::Point(0.25, 0.75),
                Action::Key("ShiftLeft".into(), true),
                Action::Key("ShiftLeft".into(), false),
                Action::Key("ControlLeft".into(), true),
                Action::Key("KeyV".into(), true),
                Action::Key("KeyV".into(), false),
                Action::Key("ControlLeft".into(), false),
                Action::Key("ShiftLeft".into(), true)
            ]
        );
        assert!(!input
            .message(&json!({"type":"paste","text":"hello"}), true, &shared)
            .unwrap());
        assert_eq!(
            actions.lock().unwrap().last(),
            Some(&Action::Key("ShiftLeft".into(), false))
        );
    }
}
