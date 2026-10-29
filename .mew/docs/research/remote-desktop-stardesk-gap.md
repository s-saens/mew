---
title: "Remote desktop quality and latency gaps versus StarDesk and an improvement design"
description: "A study of quality and latency gaps comparing official materials with the code before the improvements in follow-up decision 0024 dated 2026-10-20. Preserves the investigation and synthetic reproductions of serial processing, congestion misclassification, slow image quality recovery, and Windows setting verification, while distinguishing subsequent implementation from unverified real-device performance and direct StarDesk comparisons."
created: 2026-10-20
updated: 2026-10-22
---

> The investigation and synthetic reproductions below use the code before the follow-up improvements in [Decision 0024](../decisions/0024-remote-desktop-fhd-pipeline.md) dated 2026-10-20 were implemented. Subsequent changes added overlapping processing of up to two frames, RTT relearning, time-based quality recovery, verification of Windows setting application, and diagnostics at each stage. The current contract and validation scope follow the [Shared architecture](../development/remote-desktop.md). The original research text and figures are preserved; actual GPU testing, external networks, production application, and direct StarDesk comparisons remain separate items to verify even in the follow-up decision.

For Mew to respond quickly even at high image quality, **encoder processing and transmission must overlap, incorrect slowdowns must be eliminated, and text sharpness and motion must be evaluated together.** The current architecture has concrete room to improve all three. Raising bitrate and FPS caps alone is unlikely to resolve the remaining bottlenecks.

This document studies the resident native path in the 2026-10-20 working tree. The current contract follows the [Shared architecture](../development/remote-desktop.md), [Mac/Linux paths](../development/remote-desktop-posix.md), [External direct connectivity](../development/remote-desktop-connectivity.md), and [ADR 0009](../decisions/0009-remote-desktop-quality-latency.md). The designs below are proposals that are not implemented. The OS, GPU, network, and actual negotiated mode in the user's comparison environment have not yet been confirmed, and no direct comparison with StarDesk on the same devices was performed.

## Comparison details confirmed in public materials

| Category | Confirmed details | Implications for comparison |
| --- | --- | --- |
| StarDesk public specifications | Advertises up to 4K, 144FPS, and HDR | This does not mean simultaneous achievement on all devices and settings or measured latency. [Official introduction](https://www.stardesk.net/lp/main/) |
| Text sharpness | Provides 4:4:4 True Color. On some devices it cannot be used with Original and may fail under GPU overload | Quality of small colored text must be compared separately from video bitrate. [Official help](https://www.stardesk.net/help/stardesk-true-color.html) |
| Device differences | The 2026-08-25 help article explicitly states that True Color is unsupported on Android and some older macOS devices | Check whether 4:4:4 was used on the devices the user compared. [Support conditions](https://www.stardesk.net/help/true-color-missing.html) |
| Latency technology explanation | The company's blog describes minimizing copies, prioritizing hardware, small buffers, proprietary congestion control, and an accelerated network | This is neither a public implementation nor an independent benchmark. Do not use it to infer specific codecs, GPU paths, or control algorithms. [Company explanation](https://www.stardesk.net/blog/stardesk-zero-latency-remote-desktop.html) |

This review of official materials did not establish StarDesk's specific codec. Its official introduction describes a connection policy of direct P2P first and relay on failure; the actual path of the session the user compared is unconfirmed. Compare processing performance on the same LAN separately from path differences on external networks.

## Remaining bottlenecks in the current code

The fixed 1080p, 60FPS, and 6Mbps limits in the [Earlier high-quality/144Hz study](remote-desktop-quality-and-144hz-optimization.md) were resolved by subsequent implementation. The current implementation already provides 4K/240FPS requests, High/Baseline negotiation, GPU NV12 conversion, reuse of 3 Windows surfaces, a bounded pacer, and linked encoder/pacer bitrates. It would be inaccurate to describe removing CPU round trips for uncompressed screens on Windows/Mac as new work still required.

| Priority | Behavior confirmed in code | Potential performance impact |
| --- | --- | --- |
| P0 | With `waiting` in the [Windows worker](../../../native/remote-desktop/gpu-worker.mjs), and in the [POSIX worker](../../../native/remote-desktop/gpu-posix-worker.mjs), `gpu.next()` is not called after sending a frame until its ACK arrives. The ACK along [host](../../../native/remote-desktop/native-host.mjs) → [nativeDirect](../../../native/remote-desktop/native-direct.mjs) → [pacer](../../../native/remote-desktop/video-pacer.mjs) occurs after the entire frame is sent or discarded | Waiting to send a large frame also blocks processing of the next encoder input and output. As higher quality increases frame sizes, the benefits of overlapping processing may disappear. The ACK does not confirm completed reception or display |
| P0 | In [adaptation control](../../../native/remote-desktop/video-adaptation.mjs), `minimumRtt` is the minimum over the entire session. If the current RTT is 25ms above it, repeated slowdowns occur. Recovery proceeds in 4% increments at intervals of at least 500ms | A change in the path's baseline latency may continue to be treated as congestion. Image quality may remain low for a long time after a brief slowdown |
| P0 | The results of initial low-latency, CBR, VBV, and B-frame settings in [Windows C++](../../../native/remote-desktop/gpu-windows.cpp) are ignored. The [JS wrapper](../../../native/remote-desktop/gpu-windows.mjs) also discards the dynamic bitrate function's return value | If the actual encoder rejects a change, only the pacer may slow down while large compressed frames continue to be produced. Whether this failed on the GPU currently in use is unconfirmed |
| P1 | Windows video timestamps are generated from QPC immediately before input submission instead of the original WGC time. The pacer's `queueMs` starts counting only after a frame arrives in JS | Waiting inside the capture pool and encoder is hidden from the statistics. The screen may be stale even when the displayed transmission wait is small |
| P1 | [Receiver feedback](../../../src/utils/desktop-video.ts) sends decode cost and frame deltas, but adaptation control does not use `decode` cost in its decisions. There is no dynamic FPS adjustment either | It may respond identically to insufficient network capacity and insufficient receiver processing capacity, or miss receiver overload |
| P1 | Windows cursor checks occur approximately every 33ms within the same worker poll as video | Transmission waits also block cursor metadata updates. Local cursor response and actual remote app response are separate |
| P2 | [Video negotiation](../../../native/remote-desktop/video-settings.mjs) offers only H.264 High/Baseline. The [virtual display](../../../native/remote-desktop/virtual-display-driver.cpp) has a single 1080p/60Hz mode | Requests exceeding the receiver's level or the source refresh rate cannot produce an actual high refresh rate. With a Level 5.2 response, an FHD 240 request may be capped at 165FPS, QHD at 144FPS, and 4K at 60FPS |

The OS capture session itself does not terminate while waiting for an ACK. The Windows WGC pool and Mac ScreenCaptureKit callbacks remain active, but Windows dequeue, conversion, and encoder submit/drain stop, as do Mac output consumption and the next submit. On Linux, failure to consume appsink's single-frame buffer applies backpressure upstream. Linux X11 also still uses CPU capture followed by GPU upload. Priorities vary with the actual environment used on each OS.

Verifying Windows setting application requires distinguishing return codes precisely. `S_FALSE` from `ICodecAPI::SetValue` means read-only, but the current C++ `SUCCEEDED()` may treat it as success. It is more appropriate to check `S_OK`, support status, read-back values, and actual output bitrate together. [Microsoft API contract](https://learn.microsoft.com/en-us/windows/win32/api/strmif/nf-strmif-icodecapi-setvalue)

## Weaknesses reproduced with the current logic

A fake clock and synthetic feedback were supplied to the current `videoAdaptation()` instead of using an actual GPU or network. The values below describe the logic's responses, not measurements of the user's actual latency or image quality.

| Input conditions | Reproduction results | Scope of interpretation |
| --- | --- | --- |
| Maximum 12Mbps. Initial RTT 10ms, then RTT 40ms every 200ms, loss 0, average receive buffer 10ms, 12 frames each received and decoded, decode time 1ms | 350kbps after 4 seconds | A sustained RTT increase alone drives the bitrate to its floor even when other inputs are normal. This experiment cannot distinguish whether increased latency on an actual network is due to congestion or a route change |
| Maximum 24Mbps. Trigger 30 congestion events at 200ms intervals to slow down to 350kbps. Then, every 250ms: RTT of 5ms, loss of 0, buffer of 10ms, 36 frames each received/decoded, and decode time of 1ms | 55 seconds from the last congestion event to recovery to 24Mbps | The first normal feedback arrives 250ms after the last congestion event. The result depends on the sampling interval and requested cap, and shows that image quality recovery may be slow after conditions return to normal |
| Maximum 24Mbps. Every 250ms: RTT of 5ms, loss of 0, buffer of 10ms, 36 frames received, 2 frames decoded, and decode time of 80ms | Target remains at 24Mbps even after 10 seconds | Confirms that the current adaptation control does not lower the transmission mode or FPS based on high decode cost alone. This is not a benchmark simulating actual decoder behavior |

ADR 0009 already addressed misclassifying a fixed receive buffer as congestion and throughput loss from short timers. The issues above remain after those changes. Currently, feedback updates approximately every 200ms after connection, and the UI updates approximately every 1 second.

## Recommended implementation order and pass criteria

### 1. Measure latency at each stage and eliminate incorrect slowdowns first

The first implementation unit is instrumentation connecting original capture time → dequeue → conversion/encode submission → encode output → pacer entry/completion. Examine compressed frame size, IDR size, requested settings and application results, actual output rate, and retransmission volume together. Do not directly subtract values from different clocks, such as the host and browser clocks; record clock conversion and synchronization errors. Anonymous aggregates are sufficient, without storing video content, input content, or credentials.

Design expiry, relearning after path changes, and persistent-congestion detection for the RTT baseline. Use loss, receive progress, arrival rate, and queue growth together so that simply raising the baseline does not normalize actual bufferbloat. Change recovery to a time-proportional policy with bounded probing to avoid recovery speed varying with the feedback interval. Propagate Windows setting failures upward, and specify handling and reinitialization for unsupported properties.

Pass criteria are preventing unnecessary repeated collapse in the synthetic RTT case above, preventing continuous queue buildup under actual sustained congestion, and shortening image quality recovery after conditions return to normal. Also cover encoder control rejection, read-only properties, and low decode throughput as separate regression cases.

### 2. Overlap encoder processing and transmission without producing stale frames

```mermaid
flowchart LR
  C[최신 미인코딩 GPU 화면 한 칸] --> E[인코더 입력·출력 독립 처리]
  E --> Q[시간·바이트로 제한한 압축 프레임 인계]
  Q --> P[경로 용량과 deadline에 맞춘 RTP 송신]
  P --> V[브라우저 디코드·표시]
  V -. 수신 진행·혼잡 feedback .-> E
  V -. 수신 진행·혼잡 feedback .-> P
```

Separate transmission-completion ACKs from the worker's next poll. Preserve the existing tracked sample lifetime for GPU surfaces held by the encoder, and replace screens not yet encoded with the latest screen. Drain encoder output during transmission while keeping the compressed queue bounded. Avoid continuously encoding faster than the network can transmit.

Arbitrarily replacing an already encoded P-frame with the latest frame breaks reference relationships. Skip before input, or use a discard and IDR recovery policy that understands the reference structure. Include large IDRs and retransmissions in the same transmission budget. Separate cursor metadata from video transmission waits.

Passing requires improvements in encoder input intervals, actual displayed FPS, and input-to-display p95 at the same codec, image quality, and output size, without worsening queues, memory use, or recovery freezes. The existing internal transmission limits of 100ms for normal frames and 500ms for IDRs are not total latency targets; reevaluate them against actual frame age after the improvements.

### 3. Compare packet-arrival-based congestion control and hardware settings

Compare the current control based on receive deltas, RTT, and buffers against a transport path using mature packet-arrival-based control such as TWCC/GCC in isolation. Do not consider the work complete merely by wiring up a library feature name; verify RTP extension negotiation, receiver feedback, retransmission and input bandwidth, and queue measurements end to end. Consider native processing for JS per-packet allocation and 1ms timer costs if CPU profiling confirms they are bottlenecks.

If actual Windows Media Foundation settings or output are the bottleneck, comparison with dedicated NVENC, QSV, and AMF paths is worthwhile. NVIDIA offers LL/ULL tuning and P1–P7 presets as separate selection dimensions. Start with a small VBV and removal of reordering and future-frame waits, then choose presets, AQ, and multi-pass by measuring quality and latency together. Do not use the slowest HQ setting as the default for high quality. [NVIDIA official guidance](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.1/nvenc-video-encoder-api-prog-guide/index.html)

### 4. Test HEVC/AV1 and text sharpening separately

The assumption that browsers support only H.264 is no longer correct. Chrome 136 officially announced WebRTC HEVC support and MediaCapabilities queries. Mew must add the codec path, including an encoder, SDP, an RTP packetizer, and reception checks; a browser support announcement alone does not make it usable. [Chrome release](https://developer.chrome.com/release-notes/136#h265_hevc_codec_support_in_webrtc)

Negotiate H.264/HEVC/AV1 for the actual sending and receiving GPUs at each resolution and FPS. After querying support, verify sustained decoding and display, and compare hardware acceleration, latency, power consumption, and required traffic at the same image quality. Do not assume HEVC or AV1 is faster on every device. Switching to HEVC alone does not provide 4:4:4 either.

The current loss of color resolution in NV12 4:2:0 is difficult to fully recover by increasing bitrate alone. For text and thin colored lines, compare combinations that actually support native 4:4:4, quality allocation to text regions, and progressive sharpening of static regions. Showing motion first with low latency and then adding precise detail to stable regions is a promising approach for Mew's document and code work. This is a design judgment, not a performance result.

Microsoft AVC444 specifies a structure that reconstructs color information from two 4:2:0 views and improves auxiliary color information later. This principle can serve as a reference, but it is not the same functionality as Mew's own auxiliary video and tile implementation. The costs of additional decoding, GPU compositing, bandwidth, and frame/screen generation synchronization must be verified first. [Microsoft protocol](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpegfx/844018a5-d717-4bc9-bddb-8b4d6be5dd3f)

### 5. Determine whether exceeding the source refresh rate and browser display limits is necessary

Check the actual physical/virtual screen mode, receiving display Hz, negotiated codec mode, and decoding and display FPS separately. If the virtual screen runs at 60Hz, the required resolution and refresh rate modes must be added to the driver, and signing, installation, and headless operation on actual hardware must be verified.

The browser already sets `jitterBufferTarget=0`, but this does not guarantee an actual 0ms buffer. Observe display progress and available timing from `requestVideoFrameCallback` together with WebRTC stats. Distinguish these observations from measurements of photon output from the physical display as well. [WebRTC receive buffer contract](https://www.w3.org/TR/webrtc/#dom-rtcrtpreceiver-jitterbuffertarget)

Consider an optional native viewer when improvements to the browser path on each device still cannot meet the target 4:4:4 hardware decoding and display latency. Even with WebCodecs, `prefer-hardware` is a hint with no guarantee, and transport, recovery, and display control become new responsibilities. Instrument each stage before concluding that the browser as a whole is slow. [WebCodecs contract](https://www.w3.org/TR/webcodecs/#videodecoderconfig)

Currently, only direct connections are allowed. On external networks, gaps caused by different paths from StarDesk cannot all be resolved through capture and codec optimization. Introducing relays or an acceleration network requires a separate decision because it changes operating costs and the existing direct connection policy.

## Comparative experiments to assess an advantage

Alternate between Mew and StarDesk using the same host, client, source screen, display refresh rate, and network. Record the OS, GPU, driver, browser/app versions, actual codec, resolution, FPS, color mode, and connection path. First verify that the installed Mew helper version matches the working tree.

| Comparison axis | Measurements |
| --- | --- |
| Is it faster at the same image quality? | Match text and color accuracy and motion quality, then compare input-to-display p50/p95/p99, long freezes, and display FPS |
| Is it sharper at the same latency? | Within the same latency budget, compare quality against the source for small text, 1px colored lines, scrolling, and game scenes. Do not substitute a single photographic quality score for text quality |
| Does it hold up when the connection fluctuates? | On a separate isolated network, introduce capacity changes, loss, and increases in baseline RTT, then measure rate reduction, image quality recovery time, and IDR recovery |
| Which stages consume resources? | Compare host capture/encode, actual send rate/retransmissions, receive buffer, decode, drop/freeze, display progress, and CPU/GPU usage and power on both ends |

Separate static document/IDE screens and fast scrolling, video and games, and heavy remote GPU load, and test LAN and external networks separately. Start with FHD/QHD at 60·120/144Hz, then expand to 4K on combinations with confirmed support. For each condition, propose alternating measurements 3 times for at least 10 minutes after warm-up. Do not compare unsupported devices simply by requesting the same nominal FPS.

Measure input-to-display latency by capturing the input event and screen change together, for example with an external high-speed camera. One frame at 240FPS is approximately 4.17ms, so report small differences together with measurement resolution and error. Do not substitute RTT or immediate movement of the local cursor for this latency. Calculate interval deltas from cumulative WebRTC statistics, and do not treat unsupported values as 0. [W3C statistics definitions](https://www.w3.org/TR/webrtc-stats/)

The draft development goal is to **reduce input-to-display p95 by at least 30% compared with StarDesk at equal or better image quality, improve text and color accuracy within an agreed latency budget, and avoid worsening long freezes or display FPS**. These figures are proposed comparison criteria, not guaranteed achievements. First use measurements to determine the feasible devices and workloads, then finalize the product goals.

## Validation performed in this investigation

- Compared the current native capture, encoder, send, and receive code against ADR 0009 and the current owning documents. Did not apply limitations of the previous Electron/VP8 path to the current path.
- Directly imported the current `videoAdaptation()` and ran the three synthetic scenarios above. This does not validate encoder performance on actual hardware or actual network performance.
- `node --test server/remote-desktop-video.test.ts src/utils/desktop-video.test.ts`: 21 passed. These check configuration, negotiation, pacing, and feedback regressions; they do not validate an advantage over StarDesk.
- `npm run check:docs`: description and internal link checks passed.
- Reviewed official product help, browser releases, standards, and GPU manufacturer documentation. Did not perform actual GPU capture, run StarDesk, or build, deploy, or restart the app.

It makes sense to combine instrumentation by stage, verification that Windows settings take effect, and congestion control criteria and recovery policies into the first follow-up implementation task. Then, comparing an H.264 path with sending separated from encoder processing can distinguish gaps that can be resolved before switching codecs from gaps that require changing the codec or display path.
