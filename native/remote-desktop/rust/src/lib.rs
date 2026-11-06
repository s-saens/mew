mod engine;
mod gpu;
mod input;
#[cfg(any(windows, test))]
#[cfg_attr(not(windows), allow(dead_code))]
mod input_windows;
mod rtc;
mod rtp;

use serde_json::Value;
use std::{
    ffi::{c_char, CStr},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, Receiver, SyncSender},
        Arc, Mutex,
    },
    thread::JoinHandle,
    time::Instant,
};

const MAX_JSON: usize = 1024 * 1024;
type Command = (u64, Value);

pub struct Shared {
    epoch: AtomicU64,
    closed: AtomicBool,
    overflow: AtomicBool,
    lease: AtomicU64,
    failed_input_generation: AtomicU64,
    origin: Instant,
    input: Mutex<Option<Arc<input::Input>>>,
}
impl Shared {
    fn new() -> Self {
        Self {
            epoch: AtomicU64::new(0),
            closed: AtomicBool::new(false),
            overflow: AtomicBool::new(false),
            lease: AtomicU64::new(0),
            failed_input_generation: AtomicU64::new(0),
            origin: Instant::now(),
            input: Mutex::new(None),
        }
    }
    fn ms(&self) -> u64 {
        self.origin.elapsed().as_millis() as u64
    }
    fn authorized(&self, epoch: u64) -> bool {
        !self.closed.load(Ordering::Acquire)
            && !self.overflow.load(Ordering::Acquire)
            && self.epoch.load(Ordering::Acquire) == epoch
            && self.failed_input_generation.load(Ordering::Acquire) <= epoch
            && self.ms().saturating_sub(self.lease.load(Ordering::Acquire)) <= 8000
    }
}

#[derive(Clone)]
pub struct Events {
    tx: SyncSender<Value>,
    shared: Arc<Shared>,
}
impl Events {
    fn send(&self, value: Value) {
        if self.tx.try_send(value).is_err() {
            self.shared.overflow.store(true, Ordering::Release);
        }
    }
}

pub struct Engine {
    tx: SyncSender<Command>,
    rx: Mutex<Receiver<Value>>,
    pending: Mutex<Option<Vec<u8>>>,
    shared: Arc<Shared>,
    thread: Option<JoinHandle<()>>,
}

#[no_mangle]
pub extern "C" fn mew_engine_abi() -> i32 {
    1
}

/// # Safety
/// The caller owns a NUL-terminated UTF-8 helper directory for this call.
/// No capture starts until an authorized start command is processed.
#[no_mangle]
pub unsafe extern "C" fn mew_engine_create(directory: *const c_char) -> *mut Engine {
    if directory.is_null() {
        return std::ptr::null_mut();
    }
    let Ok(directory) = CStr::from_ptr(directory).to_str() else {
        return std::ptr::null_mut();
    };
    let directory = directory.to_owned();
    let (tx, commands) = mpsc::sync_channel(256);
    let (events, rx) = mpsc::sync_channel(256);
    let shared = Arc::new(Shared::new());
    let state = shared.clone();
    let output = Events {
        tx: events,
        shared: state.clone(),
    };
    let thread = std::thread::Builder::new()
        .name("mew-video".into())
        .spawn(move || engine::run(directory, commands, output, state));
    match thread {
        Ok(thread) => Box::into_raw(Box::new(Engine {
            tx,
            rx: Mutex::new(rx),
            pending: Mutex::new(None),
            shared,
            thread: Some(thread),
        })),
        Err(_) => std::ptr::null_mut(),
    }
}

/// # Safety
/// The handle must be live and bytes must reference length readable bytes.
/// All exported handle operations are serialized by the Node owner. Stop and
/// close revoke packet sending immediately, before the command queue is drained.
#[no_mangle]
pub unsafe extern "C" fn mew_engine_command(
    handle: *mut Engine,
    bytes: *const u8,
    length: i32,
) -> i32 {
    let Some(engine) = handle.as_ref() else {
        return -1;
    };
    if bytes.is_null() || length <= 0 || length as usize > MAX_JSON {
        return -1;
    }
    let Ok(value) =
        serde_json::from_slice::<Value>(std::slice::from_raw_parts(bytes, length as usize))
    else {
        return -1;
    };
    let kind = value["type"].as_str().unwrap_or("");
    if matches!(kind, "stop" | "close-peer" | "peer" | "close") {
        engine.shared.epoch.fetch_add(1, Ordering::AcqRel);
        if let Ok(mut input) = engine.shared.input.lock() {
            if let Some(input) = input.take() {
                input.revoke();
            }
        }
    }
    if kind == "peer" {
        engine
            .shared
            .lease
            .store(engine.shared.ms(), Ordering::Release);
    }
    if kind == "input-release" {
        if let Ok(input) = engine.shared.input.lock() {
            if let Some(input) = input.as_ref() {
                if input.matches(&value) {
                    input.release();
                }
            }
        }
        return 0;
    }
    if kind == "close" {
        engine.shared.closed.store(true, Ordering::Release);
        return 0;
    }
    if kind == "lease" {
        // The JS owner checks session identity before forwarding the lease.
        engine
            .shared
            .lease
            .store(engine.shared.ms(), Ordering::Release);
        return 0;
    }
    let epoch = engine.shared.epoch.load(Ordering::Acquire);
    if engine.tx.try_send((epoch, value)).is_err() {
        engine.shared.overflow.store(true, Ordering::Release);
        return -1;
    }
    0
}

/// # Safety
/// The handle must be live and serialized with destruction by its Node owner.
#[no_mangle]
pub unsafe extern "C" fn mew_engine_input_sequence(handle: *mut Engine) -> i64 {
    handle
        .as_ref()
        .and_then(|e| e.shared.input.lock().ok())
        .and_then(|input| input.as_ref().map(|i| i.sequence()))
        .unwrap_or(-1)
}

/// Return one JSON event, 0 when empty, or the negative required buffer size.
///
/// # Safety
/// The handle must be live and bytes must reference capacity writable bytes.
/// Calls must be serialized with destruction by the owning Node thread.
#[no_mangle]
pub unsafe extern "C" fn mew_engine_event(
    handle: *mut Engine,
    bytes: *mut u8,
    capacity: i32,
) -> i32 {
    let Some(engine) = handle.as_ref() else {
        return -1;
    };
    if bytes.is_null() || capacity < 1 {
        return -1;
    }
    let Ok(mut pending) = engine.pending.lock() else {
        return -1;
    };
    if pending.is_none() {
        let Ok(rx) = engine.rx.lock() else { return -1 };
        if let Ok(value) = rx.try_recv() {
            *pending = serde_json::to_vec(&value).ok();
        }
    }
    let Some(value) = pending.as_ref() else {
        return 0;
    };
    if value.len() > capacity as usize {
        return -(value.len() as i32);
    }
    std::ptr::copy_nonoverlapping(value.as_ptr(), bytes, value.len());
    let count = value.len() as i32;
    *pending = None;
    count
}

/// # Safety
/// The handle must be null or live and not concurrently destroyed.
#[no_mangle]
pub unsafe extern "C" fn mew_engine_finished(handle: *mut Engine) -> i32 {
    let Some(engine) = handle.as_ref() else {
        return 1;
    };
    i32::from(
        engine
            .thread
            .as_ref()
            .is_none_or(|thread| thread.is_finished()),
    )
}

/// # Safety
/// The caller must exclusively own this handle and never use it after success.
/// Never join a live driver thread on the Node event loop. A stuck engine makes
/// the owning helper process unusable; the supervisor retires that process.
#[no_mangle]
pub unsafe extern "C" fn mew_engine_destroy(handle: *mut Engine) -> i32 {
    if handle.is_null() {
        return 0;
    }
    if mew_engine_finished(handle) == 0 {
        return -1;
    }
    let mut engine = Box::from_raw(handle);
    if let Some(thread) = engine.thread.take() {
        let _ = thread.join();
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stale_synchronous_release_cannot_touch_current_input() {
        struct Adapter(Arc<Mutex<Vec<input::Action>>>);
        impl input::Adapter for Adapter {
            fn allowed(&self) -> bool {
                true
            }
            fn apply(&mut self, action: &input::Action) -> Result<(), String> {
                self.0.lock().unwrap().push(action.clone());
                Ok(())
            }
        }
        let shared = Arc::new(Shared::new());
        let actions = Arc::new(Mutex::new(Vec::new()));
        let input = Arc::new(
            input::Input::new(Box::new(Adapter(actions.clone())), 0).scoped("current".into(), 2),
        );
        input.message(&serde_json::json!({"type":"input","v":1,"seq":1,"epoch":0,"x":0,"y":0,"wheelX":0,"wheelY":0,"buttons":1,"keys":[]}),true,&shared).unwrap();
        *shared.input.lock().unwrap() = Some(input);
        let (tx, _rx) = mpsc::sync_channel(2);
        let (_events, rx) = mpsc::sync_channel(2);
        let mut engine = Engine {
            tx,
            rx: Mutex::new(rx),
            pending: Mutex::new(None),
            shared,
            thread: None,
        };
        for (session, negotiation, expected) in
            [("old", 2, 1), ("current", 1, 1), ("current", 2, 2)]
        {
            let command=serde_json::to_vec(&serde_json::json!({"type":"input-release","session":session,"negotiation":negotiation})).unwrap();
            assert_eq!(
                unsafe { mew_engine_command(&mut engine, command.as_ptr(), command.len() as i32) },
                0
            );
            assert_eq!(actions.lock().unwrap().len(), expected);
        }
    }
    #[test]
    fn revocation_invalidates_queued_work_and_expires_without_js() {
        let shared = Shared::new();
        assert!(shared.authorized(0));
        shared.epoch.fetch_add(1, Ordering::AcqRel);
        assert!(!shared.authorized(0));
        assert!(shared.authorized(1));
        shared.overflow.store(true, Ordering::Release);
        assert!(!shared.authorized(1));
        let shared = Shared {
            origin: Instant::now() - std::time::Duration::from_millis(8001),
            ..Shared::new()
        };
        assert!(!shared.authorized(0));
    }
}
