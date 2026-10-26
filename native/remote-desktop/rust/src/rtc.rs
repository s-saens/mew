use crate::Events;
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
}
impl Callback {
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
    ctx(ptr).emit("rtc-state", json!(value));
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
    ctx(ptr).emit("rtc-closed", Value::Null);
}
unsafe extern "C" fn error(_: i32, _: *const c_char, ptr: *mut c_void) {
    ctx(ptr).emit("rtc-error", Value::Null);
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
        c.emit("rtc-error", Value::Null);
        return;
    }
    let bytes = CStr::from_ptr(data).to_bytes();
    if bytes.len() > 16384 {
        c.emit("rtc-error", Value::Null);
        return;
    }
    match std::str::from_utf8(bytes) {
        Ok(text) => c.emit("rtc-message", json!(text)),
        Err(_) => c.emit("rtc-error", Value::Null),
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
}
impl Peer {
    pub fn new(value: &Value, events: Events) -> Result<Self, String> {
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
        };
        let context = |label| {
            Box::new(Callback {
                events: events.clone(),
                session: session.clone(),
                negotiation,
                label,
                key: peer.key.clone(),
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
    pub fn answer(&self, sdp: &str) -> Result<(), String> {
        check(unsafe {
            sys::rtcSetRemoteDescription(self.pc, cstr(sdp)?.as_ptr(), cstr("answer")?.as_ptr())
        })?;
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
