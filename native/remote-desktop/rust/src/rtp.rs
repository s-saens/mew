use crate::gpu::{Meta, Mode, MAX_FRAME};
use serde_json::{json, Value};
use std::{collections::VecDeque, ops::Range};

pub fn annex_b(data: &[u8]) -> Vec<Range<usize>> {
    let mut starts = Vec::new();
    let mut i = 0;
    while i + 3 <= data.len() {
        let n = if data[i..i + 3] == [0, 0, 1] {
            3
        } else if i + 4 <= data.len() && data[i..i + 4] == [0, 0, 0, 1] {
            4
        } else {
            i += 1;
            continue;
        };
        if starts.len() >= 4096 {
            return Vec::new();
        }
        starts.push((i, i + n));
        i += n;
    }
    starts
        .iter()
        .enumerate()
        .filter_map(|(i, &(_, begin))| {
            let end = starts.get(i + 1).map_or(data.len(), |&(end, _)| end);
            (begin < end).then_some(begin..end)
        })
        .collect()
}

struct Frame {
    nals: Vec<Vec<u8>>,
    nal: usize,
    offset: usize,
    key: bool,
    timestamp: u32,
    at: f64,
    started: f64,
}
impl Frame {
    fn packet_size(&self) -> usize {
        let nal = &self.nals[self.nal];
        12 + if nal.len() <= 1180 {
            nal.len()
        } else {
            2 + (nal.len() - self.offset.max(1)).min(1178)
        }
    }
    fn packet(
        &mut self,
        buffer: &mut [u8; 1192],
        sequence: &mut u16,
        ssrc: u32,
        payload: u8,
    ) -> usize {
        let size = self.packet_size();
        let nal = &self.nals[self.nal];
        let end = if nal.len() <= 1180 {
            buffer[12..size].copy_from_slice(nal);
            true
        } else {
            let start = self.offset.max(1);
            let end = start + size - 14 == nal.len();
            buffer[12] = (nal[0] & 0xe0) | 28;
            buffer[13] =
                (nal[0] & 31) | if start == 1 { 0x80 } else { 0 } | if end { 0x40 } else { 0 };
            buffer[14..size].copy_from_slice(&nal[start..start + size - 14]);
            self.offset = start + size - 14;
            end
        };
        buffer[0] = 0x80;
        buffer[1] = payload
            | if end && self.nal + 1 == self.nals.len() {
                0x80
            } else {
                0
            };
        buffer[2..4].copy_from_slice(&sequence.to_be_bytes());
        *sequence = sequence.wrapping_add(1);
        buffer[4..8].copy_from_slice(&self.timestamp.to_be_bytes());
        buffer[8..12].copy_from_slice(&ssrc.to_be_bytes());
        if end {
            self.nal += 1;
            self.offset = 0;
        }
        size
    }
}

#[derive(Default)]
struct Metrics {
    frames: u64,
    bytes: u64,
    frame_bytes: usize,
    send_ms: f64,
    queue_ms: f64,
    poll_ms: f64,
    backpressure_ms: f64,
    encode_ms: Option<f64>,
    capture_ms: Option<f64>,
    options: Option<u32>,
    bitrate: Option<i32>,
}

pub struct Pacer {
    queue: VecDeque<Frame>,
    mode: Mode,
    ssrc: u32,
    sequence: u16,
    base: u32,
    rate: i32,
    credit: f64,
    last_tick: f64,
    waiting_key: bool,
    sps: Option<Vec<u8>>,
    pps: Option<Vec<u8>>,
    pub need_key: bool,
    pub congested: bool,
    drops: u64,
    metrics: Metrics,
    sample_at: f64,
    blocked_at: Option<f64>,
    pub last_timestamp: u32,
    last_sent_at: f64,
    pub packets_sent: u32,
    pub octets_sent: u32,
}
impl Pacer {
    pub fn new(mode: Mode, ssrc: u32, seed: [u8; 6], now: f64) -> Self {
        Self {
            rate: mode.bitrate,
            mode,
            ssrc,
            sequence: u16::from_be_bytes([seed[0], seed[1]]),
            base: u32::from_be_bytes(seed[2..].try_into().unwrap()),
            queue: VecDeque::with_capacity(2),
            credit: 0.,
            last_tick: now,
            waiting_key: true,
            sps: None,
            pps: None,
            need_key: true,
            congested: false,
            drops: 0,
            metrics: Metrics::default(),
            sample_at: now,
            blocked_at: None,
            last_timestamp: 0,
            last_sent_at: now,
            packets_sent: 0,
            octets_sent: 0,
        }
    }
    fn burst(&self) -> f64 {
        (self.rate as f64 * 1.15 / 8000. * 5.).max(2480.)
    }
    pub fn bitrate(&mut self, rate: i32) {
        self.rate = rate.clamp(350_000, 50_000_000);
        self.credit = self.credit.min(self.burst());
    }
    pub fn can_read(&mut self, now: f64) -> bool {
        let allowed = self.queue.len() < 2 && !self.queue.iter().any(|f| f.key);
        if !allowed {
            self.blocked_at.get_or_insert(now);
        } else if let Some(at) = self.blocked_at.take() {
            self.metrics.backpressure_ms = self.metrics.backpressure_ms.max(now - at);
        }
        allowed
    }
    fn invalidate(&mut self, congested: bool) {
        self.drops += self.queue.len() as u64;
        self.queue.clear();
        self.waiting_key = true;
        self.need_key = true;
        self.congested |= congested;
    }
    pub fn frame(&mut self, data: &[u8], meta: Meta, poll_ms: f64, now: f64) -> Result<(), String> {
        if data.is_empty() || data.len() > MAX_FRAME || meta.timestamp < 0 {
            self.invalidate(false);
            return Err("Invalid encoded frame".into());
        }
        if self.queue.len() == 2 {
            self.invalidate(true);
            return Ok(());
        }
        let ranges = annex_b(data);
        if ranges.is_empty() {
            self.invalidate(false);
            return Err("Missing Annex-B NAL units".into());
        }
        for r in &ranges {
            let nal = &data[r.clone()];
            if matches!(nal[0] & 31, 7 | 8) && nal.len() > 65536 {
                self.invalidate(false);
                return Err("Invalid H.264 parameter set".into());
            }
            match nal[0] & 31 {
                7 => {
                    if nal.len() < 4
                        || nal[1] != if self.mode.profile == "high" { 100 } else { 66 }
                        || nal[3] > self.mode.level as u8
                    {
                        self.invalidate(false);
                        return Err("GPU H.264 profile/level exceeds negotiated mode".into());
                    }
                    self.sps = Some(nal.to_vec());
                }
                8 => self.pps = Some(nal.to_vec()),
                _ => {}
            }
        }
        let key = ranges.iter().any(|r| data[r.start] & 31 == 5);
        if self.waiting_key && !key && !self.queue.iter().any(|f| f.key) {
            self.need_key = true;
            return Ok(());
        }
        let mut nals = Vec::new();
        if key {
            let (Some(sps), Some(pps)) = (&self.sps, &self.pps) else {
                self.invalidate(false);
                return Ok(());
            };
            nals.push(sps.clone());
            nals.push(pps.clone());
        }
        for r in ranges {
            if !key || !matches!(data[r.start] & 31, 7 | 8) {
                nals.push(data[r].to_vec());
            }
        }
        if nals.is_empty() {
            self.invalidate(false);
            return Ok(());
        }
        let timestamp = self
            .base
            .wrapping_add(((meta.timestamp as u128 * 9 + 50) / 100) as u32);
        self.queue.push_back(Frame {
            nals,
            nal: 0,
            offset: 0,
            key,
            timestamp,
            at: now,
            started: now,
        });
        self.metrics.frames += 1;
        self.metrics.bytes += data.len() as u64;
        self.metrics.frame_bytes = self.metrics.frame_bytes.max(data.len());
        self.metrics.poll_ms = self.metrics.poll_ms.max(poll_ms);
        if cfg!(windows) {
            self.metrics.encode_ms = Some(
                self.metrics
                    .encode_ms
                    .unwrap_or(0.)
                    .max(meta.encode_us as f64 / 1000.),
            );
            if meta.capture_us >= 0 {
                self.metrics.capture_ms = Some(
                    self.metrics
                        .capture_ms
                        .unwrap_or(0.)
                        .max(meta.capture_us as f64 / 1000.),
                );
            }
            self.metrics.options = Some(meta.options);
            self.metrics.bitrate = (meta.bitrate >= 350_000).then_some(meta.bitrate);
        }
        Ok(())
    }
    pub fn tick(&mut self, now: f64, mut send: impl FnMut(&[u8]) -> bool) {
        self.credit = (self.credit
            + (now - self.last_tick).max(0.) * self.rate as f64 * 1.15 / 8000.)
            .min(self.burst());
        self.last_tick = now;
        let mut packet = [0u8; 1192];
        while let Some(frame) = self.queue.front_mut() {
            let age = (now - frame.at).max(0.);
            self.metrics.queue_ms = self.metrics.queue_ms.max(age);
            let deadline = if frame.key {
                500.
            } else {
                (if self.mode.priority == "quality" {
                    100f64
                } else {
                    24f64
                })
                .max(2000. / self.mode.fps as f64)
            };
            if age > deadline {
                self.invalidate(true);
                break;
            }
            let cost = (frame.packet_size() + 48) as f64;
            if self.credit < cost {
                break;
            }
            self.credit -= cost;
            let size = frame.packet(
                &mut packet,
                &mut self.sequence,
                self.ssrc,
                self.mode.payload,
            );
            if !send(&packet[..size]) {
                self.invalidate(true);
                break;
            }
            self.last_timestamp = frame.timestamp;
            self.last_sent_at = now;
            self.packets_sent = self.packets_sent.wrapping_add(1);
            self.octets_sent = self.octets_sent.wrapping_add((size - 12) as u32);
            if frame.nal == frame.nals.len() {
                self.metrics.send_ms = self.metrics.send_ms.max(now - frame.started);
                self.waiting_key = false;
                self.queue.pop_front();
                if let Some(next) = self.queue.front_mut() {
                    next.started = now;
                }
            }
        }
    }
    pub fn sending_key(&self) -> bool {
        self.queue.iter().any(|f| f.key)
    }
    pub fn stats(&mut self, now: f64) -> Value {
        let elapsed = (now - self.sample_at).max(1.);
        let m = std::mem::take(&mut self.metrics);
        let mut result = json!({"queueMs": m.queue_ms.round(), "drops":self.drops,"pendingFrames":self.queue.len(),"frameBytes":m.frame_bytes,"sendMs":m.send_ms.round(),"pollMs":m.poll_ms.round(),"backpressureMs":m.backpressure_ms.round(),"encodedFps":(m.frames as f64 * 1000. / elapsed).round(),"encodedMbps":(m.bytes as f64 * 8. / elapsed).round()/1000.});
        for (name, value) in [("encodeMs", m.encode_ms), ("captureMs", m.capture_ms)] {
            if let Some(value) = value {
                result[name] = json!(value.round());
            }
        }
        if let Some(value) = m.options {
            result["encoderOptions"] = json!(value);
        }
        if let Some(value) = m.bitrate {
            result["encoderBitrate"] = json!(value);
        }
        self.sample_at = now;
        result
    }
    /// Compound RFC 3550 SR + SDES. NACK retransmissions remain in libdatachannel.
    pub fn sender_report(&self, ntp: u64, now: f64) -> [u8; 44] {
        let mut p = [0u8; 44];
        p[..4].copy_from_slice(&[0x80, 200, 0, 6]);
        p[4..8].copy_from_slice(&self.ssrc.to_be_bytes());
        p[8..16].copy_from_slice(&ntp.to_be_bytes());
        let timestamp = self
            .last_timestamp
            .wrapping_add(((now - self.last_sent_at).max(0.) * 90.).round() as u32);
        p[16..20].copy_from_slice(&timestamp.to_be_bytes());
        p[20..24].copy_from_slice(&self.packets_sent.to_be_bytes());
        p[24..28].copy_from_slice(&self.octets_sent.to_be_bytes());
        p[28..32].copy_from_slice(&[0x81, 202, 0, 3]);
        p[32..36].copy_from_slice(&self.ssrc.to_be_bytes());
        p[36..41].copy_from_slice(&[1, 3, b'm', b'e', b'w']);
        p
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn mode() -> Mode {
        serde_json::from_value(json!({"width":1920,"height":1080,"fps":60,"bitrate":6000000,"profile":"high","level":42,"payload":102,"priority":"quality"})).unwrap()
    }
    fn key(size: usize) -> Vec<u8> {
        let mut b = vec![
            0, 0, 0, 1, 0x67, 100, 0, 42, 0, 0, 1, 0x68, 1, 0, 0, 1, 0x65,
        ];
        b.resize(b.len() + size, 0xff);
        b
    }
    #[test]
    fn annex_b_handles_short_long_empty_and_truncated_prefixes() {
        let b = [0, 0, 0, 1, 0x67, 1, 0, 0, 1, 0, 0, 0, 1, 0x65, 2, 0, 0];
        assert_eq!(annex_b(&b), vec![4..6, 13..17]);
        assert!(annex_b(&[0, 0]).is_empty());
    }
    #[test]
    fn fragment_marker_sequence_and_timestamp_preserve_payload() {
        let mut p = Pacer::new(mode(), 42, [255; 6], 0.);
        let b = key(4000);
        p.frame(
            &b,
            Meta {
                timestamp: 1000000,
                ..Meta::default()
            },
            0.,
            0.,
        )
        .unwrap();
        let mut packets = Vec::new();
        for time in 0..100 {
            p.tick(time as f64, |b| {
                packets.push(b.to_vec());
                true
            });
        }
        assert_eq!(packets.len(), 6);
        assert!(packets.iter().all(|p| p.len() <= 1192));
        assert_eq!(
            u16::from_be_bytes(packets[0][2..4].try_into().unwrap()),
            65535
        );
        assert_eq!(u16::from_be_bytes(packets[1][2..4].try_into().unwrap()), 0);
        assert!(packets[..5].iter().all(|p| p[1] & 128 == 0));
        assert_eq!(packets[5][1], 230);
        assert_eq!(packets[2][13] & 0x80, 0x80);
        assert_eq!(packets[5][13] & 0x40, 0x40);
        let restored: Vec<u8> = std::iter::once(0x65)
            .chain(packets[2..].iter().flat_map(|p| p[14..].iter().copied()))
            .collect();
        assert_eq!(restored, b[16..]);
    }
    #[test]
    fn bounded_burst_backpressure_and_idr_recovery() {
        let mut p = Pacer::new(mode(), 1, [0; 6], 0.);
        p.frame(&key(100000), Meta::default(), 0., 0.).unwrap();
        assert!(!p.can_read(0.));
        let mut bytes = 0;
        p.tick(100., |b| {
            bytes += b.len() + 48;
            true
        });
        assert!(bytes as f64 <= p.burst());
        p.tick(501., |_| true);
        assert!(p.can_read(501.));
        assert!(p.need_key);
        assert_eq!(p.drops, 1);
        p.frame(&[0, 0, 1, 0x41, 1], Meta::default(), 0., 502.)
            .unwrap();
        assert!(p.queue.is_empty());
        p.frame(&key(10), Meta::default(), 0., 503.).unwrap();
        p.tick(504., |_| true);
        assert!(p.queue.is_empty());
        p.frame(&[0, 0, 1, 0x41, 1], Meta::default(), 0., 505.)
            .unwrap();
        p.frame(&[0, 0, 1, 0x41, 2], Meta::default(), 0., 506.)
            .unwrap();
        assert!(!p.can_read(506.));
        assert_eq!(p.queue.len(), 2);
    }
    #[test]
    fn rejects_unnegotiated_profile_and_invalid_parameter_sets() {
        let mut p = Pacer::new(mode(), 1, [0; 6], 0.);
        assert!(p
            .frame(&[0, 0, 1, 0x67, 66, 0, 42], Meta::default(), 0., 0.)
            .is_err());
        assert!(p
            .frame(
                &key(0),
                Meta {
                    timestamp: -1,
                    ..Meta::default()
                },
                0.,
                0.
            )
            .is_err());
        let mut b = vec![0, 0, 1, 0x68];
        b.resize(70000, 1);
        assert!(p.frame(&b, Meta::default(), 0., 0.).is_err());
    }
}
