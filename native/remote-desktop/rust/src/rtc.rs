use crate::{input::Input, Events, Shared};
use datachannel_sys as sys;
use serde_json::{json, Value};
use std::{
    ffi::{c_char, c_void, CStr, CString},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

struct Callback {
    events: Events,
    session: String,
    negotiation: u64,
    label: &'static str,
    key: Arc<AtomicBool>,
    shared: Arc<Shared>,
    direct_input: bool,
    input: Arc<std::sync::Mutex<Option<Arc<Input>>>>,
}
impl Callback {
    fn fail(&self) {
        if let Ok(input) = self.input.lock() {
            if let Some(input) = input.as_ref() {
                input.revoke();
            }
        }
        self.emit("rtc-error", Value::Null);
    }
    fn emit(&self, kind: &str, value: Value) {
        self.events.send(json!({"type":kind,"session":self.session,"negotiation":self.negotiation,"label":self.label,"value":value}));
    }
}
unsafe fn ctx<'a>(ptr: *mut c_void) -> &'a Callback {
    &*(ptr as *const Callback)
}
unsafe extern "C" fn description(
    _: i32,
    sdp: *const c_char,
    kind: *const c_char,
    ptr: *mut c_void,
) {
    let c = ctx(ptr);
    c.emit("rtc-description",json!({"sdp":CStr::from_ptr(sdp).to_string_lossy(),"type":CStr::from_ptr(kind).to_string_lossy()}));
}
unsafe extern "C" fn candidate(_: i32, value: *const c_char, mid: *const c_char, ptr: *mut c_void) {
    ctx(ptr).emit("rtc-candidate",json!({"candidate":CStr::from_ptr(value).to_string_lossy(),"sdpMid":CStr::from_ptr(mid).to_string_lossy()}));
}
unsafe extern "C" fn state(_: i32, value: sys::rtcState, ptr: *mut c_void) {
    let c = ctx(ptr);
    if [3, 4, 5].contains(&value) {
        if let Ok(input) = c.input.lock() {
            if let Some(input) = input.as_ref() {
                input.revoke();
            }
        }
    }
    c.emit("rtc-state", json!(value));
}
unsafe extern "C" fn gathering(_: i32, value: sys::rtcGatheringState, ptr: *mut c_void) {
    ctx(ptr).emit("rtc-gathering", json!(value));
}
unsafe extern "C" fn opened(_: i32, ptr: *mut c_void) {
    let c = ctx(ptr);
    if c.label == "video" {
        c.key.store(true, Ordering::Release);
    }
    c.emit("rtc-open", Value::Null);
}
unsafe extern "C" fn closed(_: i32, ptr: *mut c_void) {
    let c = ctx(ptr);
    if let Ok(input) = c.input.lock() {
        if let Some(input) = input.as_ref() {
            input.revoke();
        }
    }
    c.emit("rtc-closed", Value::Null);
}
unsafe extern "C" fn error(_: i32, _: *const c_char, ptr: *mut c_void) {
    ctx(ptr).fail();
}
unsafe extern "C" fn message(_: i32, data: *const c_char, size: i32, ptr: *mut c_void) {
    let c = ctx(ptr);
    if data.is_null() {
        return;
    }
    if c.label == "video" {
        if !(4..=65536).contains(&size) {
            return;
        }
        let packet = std::slice::from_raw_parts(data as *const u8, size as usize);
        let mut offset = 0;
        while offset + 4 <= packet.len() {
            let n = (u16::from_be_bytes([packet[offset + 2], packet[offset + 3]]) as usize + 1) * 4;
            if offset + n > packet.len() {
                break;
            }
            if packet[offset + 1] == 206 && matches!(packet[offset] & 31, 1 | 4) {
                c.key.store(true, Ordering::Release);
            }
            offset += n;
        }
        return;
    }
    if size >= 0 {
        c.fail();
        return;
    }
    let bytes = CStr::from_ptr(data).to_bytes();
    if bytes.len() > 16384 {
        c.fail();
        return;
    }
    match std::str::from_utf8(bytes) {
        Ok(text) => {
            if let Ok(input) = c.input.lock() {
                if let Some(input) = input.as_ref() {
                    let result = serde_json::from_str::<Value>(text)
                        .map_err(|_| "Invalid desktop input".to_string())
                        .and_then(|value| input.message(&value, c.label == "control", &c.shared));
                    match result {
                        Ok(true) => return,
                        Err(_) => {
                            input.revoke();
                            c.emit("rtc-error", Value::Null);
                            return;
                        }
                        Ok(false) => {}
                    }
                }
            }
            if c.direct_input
                && serde_json::from_str::<Value>(text).is_ok_and(|v| v["type"] == "input")
            {
                // The channels may open before capture has configured display bounds.
                return;
            }
            c.emit("rtc-message", json!(text));
        }
        Err(_) => c.fail(),
    }
}
fn check(code: i32) -> Result<i32, String> {
    if code < 0 {
        Err(format!("Native WebRTC operation failed ({code})"))
    } else {
        Ok(code)
    }
}
fn cstr(value: &str) -> Result<CString, String> {
    CString::new(value).map_err(|_| "Invalid WebRTC string".into())
}

pub struct Peer {
    pc: i32,
    pub track: i32,
    motion: i32,
    control: i32,
    // Deletion waits for native callbacks; these boxes outlive every RTC object.
    // Native callbacks retain pointers; Vec growth must not move the contexts.
    #[allow(clippy::vec_box)]
    callbacks: Vec<Box<Callback>>,
    pub key: Arc<AtomicBool>,
    pub input: Arc<std::sync::Mutex<Option<Arc<Input>>>>,
    pub playout_delay: Option<u8>,
}
impl Peer {
    pub fn new(value: &Value, events: Events, shared: Arc<Shared>) -> Result<Self, String> {
        static LOGGING: std::sync::Once = std::sync::Once::new();
        LOGGING.call_once(|| unsafe { sys::rtcInitLogger(sys::rtcLogLevel_RTC_LOG_NONE, None) });
        let session = value["session"]
            .as_str()
            .ok_or("Missing session")?
            .to_owned();
        let negotiation = value["negotiation"].as_u64().ok_or("Missing negotiation")?;
        let servers = value["iceServers"]
            .as_array()
            .ok_or("Invalid ICE servers")?;
        if servers.len() > 1 {
            return Err("Only one STUN server per attempt".into());
        }
        let servers: Vec<CString> = servers
            .iter()
            .map(|v| {
                let s = v.as_str().ok_or("Invalid STUN URL")?;
                if !s.starts_with("stun:") && !s.starts_with("stuns:") {
                    return Err("Relayed transport is forbidden".into());
                }
                cstr(s)
            })
            .collect::<Result<_, String>>()?;
        let mut pointers: Vec<*const c_char> = servers.iter().map(|s| s.as_ptr()).collect();
        let mut config: sys::rtcConfiguration = unsafe { std::mem::zeroed() };
        config.iceServers = pointers.as_mut_ptr();
        config.iceServersCount = pointers.len() as i32;
        config.disableAutoNegotiation = true;
        config.enableIceTcp = true;
        config.mtu = 1280;
        config.maxMessageSize = 16384;
        if let Some(port) = value["udpPort"].as_u64() {
            if !(1024..=65535).contains(&port) {
                return Err("Invalid ICE port".into());
            }
            config.portRangeBegin = port as u16;
            config.portRangeEnd = port as u16;
        }
        let pc = check(unsafe { sys::rtcCreatePeerConnection(&config) })?;
        let mut peer = Self {
            pc,
            track: -1,
            motion: -1,
            control: -1,
            callbacks: Vec::new(),
            key: Arc::new(AtomicBool::new(true)),
            input: Arc::new(std::sync::Mutex::new(None)),
            playout_delay: None,
        };
        let context = |label| {
            Box::new(Callback {
                events: events.clone(),
                session: session.clone(),
                negotiation,
                label,
                key: peer.key.clone(),
                input: peer.input.clone(),
                shared: shared.clone(),
                direct_input: cfg!(windows) && value["directInput"].as_bool().unwrap_or(false),
            })
        };
        let mut p = context("peer");
        unsafe {
            sys::rtcSetUserPointer(pc, &mut *p as *mut Callback as *mut c_void);
            // Retain context before registering callbacks, including error paths.
            peer.callbacks.push(p);
            check(sys::rtcSetLocalDescriptionCallback(pc, Some(description)))?;
            check(sys::rtcSetLocalCandidateCallback(pc, Some(candidate)))?;
            check(sys::rtcSetStateChangeCallback(pc, Some(state)))?;
            check(sys::rtcSetGatheringStateChangeCallback(pc, Some(gathering)))?;
            let sdp = cstr(value["media"].as_str().ok_or("Missing video description")?)?;
            peer.track = check(sys::rtcAddTrack(pc, sdp.as_ptr()))?;
            let mut track = context("video");
            sys::rtcSetUserPointer(peer.track, &mut *track as *mut Callback as *mut c_void);
            peer.callbacks.push(track);
            peer.register(peer.track)?;
            let history = value["nackHistory"]
                .as_u64()
                .unwrap_or(512)
                .clamp(512, 4096) as u32;
            check(sys::rtcChainRtcpNackResponder(peer.track, history))?;
            for (label, unreliable) in [("motion", true), ("control", false)] {
                let mut init: sys::rtcDataChannelInit = std::mem::zeroed();
                init.reliability.unordered = unreliable;
                init.reliability.unreliable = unreliable;
                let name = cstr(label)?;
                let channel = check(sys::rtcCreateDataChannelEx(pc, name.as_ptr(), &init))?;
                if unreliable {
                    peer.motion = channel;
                } else {
                    peer.control = channel;
                }
                let mut callback = context(label);
                sys::rtcSetUserPointer(channel, &mut *callback as *mut Callback as *mut c_void);
                peer.callbacks.push(callback);
                peer.register(channel)?;
            }
            check(sys::rtcSetLocalDescription(pc, cstr("offer")?.as_ptr()))?;
        }
        Ok(peer)
    }
    unsafe fn register(&self, id: i32) -> Result<(), String> {
        check(sys::rtcSetOpenCallback(id, Some(opened)))?;
        check(sys::rtcSetClosedCallback(id, Some(closed)))?;
        check(sys::rtcSetErrorCallback(id, Some(error)))?;
        check(sys::rtcSetMessageCallback(id, Some(message)))?;
        Ok(())
    }
    pub fn answer(&mut self, sdp: &str) -> Result<(), String> {
        check(unsafe {
            sys::rtcSetRemoteDescription(self.pc, cstr(sdp)?.as_ptr(), cstr("answer")?.as_ptr())
        })?;
        self.playout_delay = playout_delay(sdp);
        Ok(())
    }
    pub fn candidate(&self, value: &Value) -> Result<(), String> {
        check(unsafe {
            sys::rtcAddRemoteCandidate(
                self.pc,
                cstr(value["candidate"].as_str().ok_or("Missing candidate")?)?.as_ptr(),
                cstr(value["sdpMid"].as_str().unwrap_or("video"))?.as_ptr(),
            )
        })?;
        Ok(())
    }
    pub fn is_open(&self) -> bool {
        unsafe { sys::rtcIsOpen(self.track) }
    }
    pub fn send(&self, packet: &[u8]) -> bool {
        unsafe {
            sys::rtcSendMessage(
                self.track,
                packet.as_ptr() as *const c_char,
                packet.len() as i32,
            ) >= 0
        }
    }
    pub fn control(&self, text: &str) -> Result<(), String> {
        if text.len() > 16384 {
            return Err("Control message too large".into());
        }
        if unsafe { sys::rtcIsOpen(self.control) } {
            check(unsafe { sys::rtcSendMessage(self.control, cstr(text)?.as_ptr(), -1) })?;
        }
        Ok(())
    }
}
impl Drop for Peer {
    fn drop(&mut self) {
        if let Ok(mut input) = self.input.lock() {
            if let Some(input) = input.take() {
                input.revoke();
            }
        }
        unsafe {
            if self.track >= 0 {
                sys::rtcDeleteTrack(self.track);
            }
            if self.motion >= 0 {
                sys::rtcDeleteDataChannel(self.motion);
            }
            if self.control >= 0 {
                sys::rtcDeleteDataChannel(self.control);
            }
            sys::rtcDeletePeerConnection(self.pc);
        }
    }
}

// Only the offered one-byte extension ID in a receiving video section is usable.
fn playout_delay(sdp: &str) -> Option<u8> {
    let mut video = false;
    let mut id = None;
    for line in sdp.lines().map(str::trim) {
        if line.starts_with("m=") {
            video = line.starts_with("m=video ") && !line.starts_with("m=video 0 ");
        }
        if !video {
            continue;
        }
        if matches!(line, "a=sendonly" | "a=inactive") {
            return None;
        }
        if let Some(ext) = line.strip_prefix("a=extmap:") {
            let mut words = ext.split_whitespace();
            let spec = words.next().unwrap_or("");
            if words.next() == Some("http://www.webrtc.org/experiments/rtp-hdrext/playout-delay")
                && matches!(spec, "1" | "1/recvonly" | "1/sendrecv")
            {
                id = Some(1);
            }
        }
    }
    id
}

#[cfg(test)]
mod tests {
    use super::playout_delay;
    #[test]
    fn playout_delay_requires_matching_receiving_video_negotiation() {
        let uri = "http://www.webrtc.org/experiments/rtp-hdrext/playout-delay";
        for spec in ["1", "1/recvonly", "1/sendrecv"] {
            assert_eq!(
                playout_delay(&format!(
                    "m=video 9 RTP/SAVPF 102\r\na=recvonly\r\na=extmap:{spec} {uri}\r\n"
                )),
                Some(1)
            );
        }
        for spec in ["2", "15", "1/sendonly", "1/inactive"] {
            assert_eq!(
                playout_delay(&format!(
                    "m=video 9 RTP/SAVPF 102\r\na=extmap:{spec} {uri}\r\n"
                )),
                None
            );
        }
        assert_eq!(
            playout_delay(&format!(
                "m=audio 9 RTP/SAVPF 111\r\na=extmap:1 {uri}\r\nm=video 9 RTP/SAVPF 102\r\n"
            )),
            None
        );
        assert_eq!(
            playout_delay(&format!("m=video 0 RTP/SAVPF 102\r\na=extmap:1 {uri}\r\n")),
            None
        );
        assert_eq!(
            playout_delay(&format!(
                "m=video 9 RTP/SAVPF 102\r\na=extmap:1 {uri}\r\na=inactive\r\n"
            )),
            None
        );
        assert_eq!(
            playout_delay("m=video 9 RTP/SAVPF 102\r\na=recvonly\r\n"),
            None
        );
    }
}
