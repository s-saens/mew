use crate::{
    gpu::{Gpu, Mode, MAX_FRAME},
    rtc::Peer,
    rtp::Pacer,
    Command, Events, Shared,
};
use serde_json::{json, Value};
use std::{
    sync::{atomic::Ordering, mpsc::Receiver, Arc},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

pub fn run(directory: String, commands: Receiver<Command>, events: Events, shared: Arc<Shared>) {
    let mut gpu = match Gpu::open(&directory) {
        Ok(gpu) => gpu,
        Err(error) => {
            events.send(json!({"type":"error","message":error}));
            return;
        }
    };
    events.send(json!({"type":"ready","screens":[]}));
    let mut peer: Option<Peer> = None;
    let mut pacer: Option<Pacer> = None;
    let mut active: Option<u64> = None;
    let mut session = String::new();
    let mut negotiation = 0;
    let mut mode = Value::Null;
    let mut encoded = vec![0u8; MAX_FRAME];
    let mut last_key = None::<Instant>;
    let mut last_report = Instant::now();
    let mut next_poll = Instant::now();
    let mut poll_interval = Duration::from_millis(2);
    let mut ssrc = 0;
    let result = (|| -> Result<(), String> {
        loop {
            if shared.closed.load(Ordering::Acquire) {
                break;
            }
            if shared.overflow.load(Ordering::Acquire) {
                return Err("Native control queue overflow".into());
            }
            if let Some(epoch) = active {
                if !shared.authorized(epoch) {
                    // Stop/peer replacement invalidates the epoch synchronously.
                    // A frozen Node owner cannot keep capture alive past its lease.
                    gpu.stop()?;
                    pacer = None;
                    active = None;
                    if shared.epoch.load(Ordering::Acquire) == epoch {
                        return Err("화면 공유 승인이 만료됐습니다.".into());
                    }
                }
            }
            let wait = if active.is_some() {
                Duration::from_millis(1)
            } else {
                Duration::from_millis(100)
            };
            let first = commands.recv_timeout(wait).ok();
            let mut command = first;
            for index in 0..32 {
                let Some((epoch, value)) = command else { break };
                let kind = value["type"].as_str().unwrap_or("");
                // Revoked work queued before stop must never restart capture.
                if epoch == shared.epoch.load(Ordering::Acquire) {
                    match kind {
                        "list" => {
                            if gpu.active {
                                return Err("Capture is already active".into());
                            }
                            let screens = gpu.screens()?;
                            if screens.is_empty() {
                                return Err("공유할 데스크톱 화면이 없습니다.".into());
                            }
                            events.send(json!({"type":"listed","session":value["session"],"screens":screens.iter().map(|s|s.json()).collect::<Vec<_>>() }));
                        }
                        "peer" => {
                            gpu.stop()?;
                            pacer = None;
                            active = None;
                            peer = None;
                            session = value["session"].as_str().ok_or("Missing session")?.into();
                            negotiation =
                                value["negotiation"].as_u64().ok_or("Missing negotiation")?;
                            ssrc = value["ssrc"]
                                .as_u64()
                                .filter(|n| *n > 0 && *n <= u32::MAX as u64)
                                .ok_or("Invalid video SSRC")?
                                as u32;
                            peer = Some(Peer::new(&value, events.clone())?);
                        }
                        "close-peer" => {
                            gpu.stop()?;
                            pacer = None;
                            active = None;
                            peer = None;
                        }
                        "stop" => {
                            gpu.stop()?;
                            pacer = None;
                            active = None;
                            peer = None;
                            events.send(json!({"type":"stopped","session":value["session"]}));
                        }
                        _ => {
                            if value["session"].as_str() != Some(&session)
                                || value["negotiation"].as_u64() != Some(negotiation)
                            {
                                command = if index < 31 {
                                    commands.try_recv().ok()
                                } else {
                                    None
                                };
                                continue;
                            }
                            match kind {
                                "answer" => peer
                                    .as_ref()
                                    .ok_or("Missing peer")?
                                    .answer(value["sdp"].as_str().ok_or("Missing SDP")?)?,
                                "candidate" => peer
                                    .as_ref()
                                    .ok_or("Missing peer")?
                                    .candidate(&value["candidate"])?,
                                "start" => {
                                    gpu.stop()?;
                                    pacer = None;
                                    active = None;
                                    let id = value["id"]
                                        .as_str()
                                        .and_then(|s| s.strip_prefix("gpu:"))
                                        .and_then(|s| s.parse::<u32>().ok())
                                        .ok_or("Invalid display ID")?
                                        as i32;
                                    let modes = value["modes"]
                                        .as_array()
                                        .filter(|m| !m.is_empty() && m.len() <= 256)
                                        .ok_or("Invalid video modes")?;
                                    let began = Instant::now();
                                    let mut selected = None;
                                    for candidate in modes {
                                        if began.elapsed() > Duration::from_secs(2)
                                            || !shared.authorized(epoch)
                                        {
                                            break;
                                        }
                                        let parsed: Mode =
                                            serde_json::from_value(candidate.clone())
                                                .map_err(|e| e.to_string())?;
                                        match gpu.start(id, &parsed, &value["source"]) {
                                            Ok(screen) => {
                                                selected =
                                                    Some((candidate.clone(), parsed, screen));
                                                break;
                                            }
                                            Err(_) => gpu.stop()?,
                                        }
                                    }
                                    if !shared.authorized(epoch) {
                                        gpu.stop()?;
                                        if shared.epoch.load(Ordering::Acquire) == epoch {
                                            return Err("화면 공유 승인이 만료됐습니다.".into());
                                        }
                                        command = if index < 31 {
                                            commands.try_recv().ok()
                                        } else {
                                            None
                                        };
                                        continue;
                                    }
                                    let (value, parsed, screen) = selected
                                        .ok_or("지원하는 하드웨어 영상 설정이 없습니다.")?;
                                    let mut seed = [0; 6];
                                    getrandom::fill(&mut seed).map_err(|e| e.to_string())?;
                                    poll_interval = Duration::from_millis(if parsed.fps >= 120 {
                                        1
                                    } else {
                                        2
                                    });
                                    pacer =
                                        Some(Pacer::new(parsed, ssrc, seed, shared.ms() as f64));
                                    active = Some(epoch);
                                    mode = value;
                                    last_key = None;
                                    next_poll = Instant::now();
                                    last_report = Instant::now();
                                    events.send(json!({"type":"started","session":session,"negotiation":negotiation,"screen":screen.json(),"video":mode}));
                                }
                                "keyframe" => {
                                    if let Some(peer) = &peer {
                                        peer.key.store(true, Ordering::Release);
                                    }
                                }
                                "bitrate" => {
                                    if let Some(pacer) = &mut pacer {
                                        let rate = value["value"]
                                            .as_i64()
                                            .and_then(|v| i32::try_from(v).ok())
                                            .ok_or("Invalid bitrate")?;
                                        gpu.bitrate(rate)?;
                                        pacer.bitrate(rate);
                                    }
                                }
                                "control" => {
                                    if let Some(peer) = &peer {
                                        peer.control(
                                            value["text"]
                                                .as_str()
                                                .ok_or("Invalid control message")?,
                                        )?;
                                    }
                                }
                                "stats" => {
                                    if let Some(pacer) = &mut pacer {
                                        events.send(json!({"type":"rtc-stats","session":session,"negotiation":negotiation,"value":pacer.stats(shared.ms() as f64),"mode":mode}));
                                    }
                                }
                                _ => return Err("Unknown native engine command".into()),
                            }
                        }
                    }
                }
                command = if index < 31 {
                    commands.try_recv().ok()
                } else {
                    None
                };
            }
            let (Some(epoch), Some(peer), Some(pacer)) = (active, peer.as_ref(), pacer.as_mut())
            else {
                continue;
            };
            if !shared.authorized(epoch) {
                continue;
            }
            if !peer.is_open() {
                continue;
            }
            let now = shared.ms() as f64;
            pacer.tick(now, |packet| shared.authorized(epoch) && peer.send(packet));
            if pacer.congested {
                pacer.congested = false;
                events.send(
                    json!({"type":"rtc-congested","session":session,"negotiation":negotiation}),
                );
            }
            if !pacer.sending_key()
                && (pacer.need_key || peer.key.load(Ordering::Acquire))
                && last_key.is_none_or(|time| time.elapsed() >= Duration::from_millis(200))
            {
                gpu.keyframe()?;
                pacer.need_key = false;
                peer.key.store(false, Ordering::Release);
                last_key = Some(Instant::now());
            }
            if Instant::now() >= next_poll && pacer.can_read(now) {
                let start = Instant::now();
                if let Some((length, meta)) = gpu.read(&mut encoded)? {
                    if shared.authorized(epoch) {
                        pacer.frame(
                            &encoded[..length],
                            meta,
                            start.elapsed().as_secs_f64() * 1000.,
                            shared.ms() as f64,
                        )?;
                    }
                }
                next_poll = Instant::now() + poll_interval;
            }
            if last_report.elapsed() >= Duration::from_secs(1)
                && pacer.packets_sent > 0
                && shared.authorized(epoch)
            {
                let time = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_err(|e| e.to_string())?;
                let ntp = ((time.as_secs() + 2_208_988_800) << 32)
                    | (((time.subsec_nanos() as u64) << 32) / 1_000_000_000);
                if !peer.send(&pacer.sender_report(ntp, shared.ms() as f64)) {
                    return Err("RTCP sender report failed".into());
                }
                last_report = Instant::now();
            }
        }
        Ok(())
    })();
    let stopped = gpu.stop();
    drop(peer);
    drop(gpu);
    if let Err(error) = result.and(stopped) {
        events.send(json!({"type":"error","session":session,"message":error}));
    }
    // The Node wrapper drains remaining events before reporting thread exit.
}
