---
title: "Research on Remote Desktop High Image Quality and 144Hz Optimization"
description: "Original research analyzing the native GPU remote desktop's 1080p, 60fps, and 6Mbps limits, send queues, and congestion control as of 2026-10-07. Distinguishes subsequent configuration expansion from processing overlap and quality recovery in Decision 0024; these are not measurements of high refresh rates or real-device performance."
created: 2026-10-07
updated: 2026-10-22
---

> The analysis below is based on the code as of 2026-10-07. Resolution, FPS, and bitrate settings were later expanded, and [Decision 0024](../decisions/0024-remote-desktop-fhd-pipeline.md) incorporated processing overlap, RTT relearning, quality recovery, and verification that Windows settings were applied. The current scope follows the [development contract](../development/remote-desktop.md), and follow-up research follows the [quality and latency gap research](remote-desktop-stardesk-gap.md). The original analysis and proposals are preserved; this research does not verify actual sustained high refresh rates, image quality or latency improvements, or application to production.

There is substantial room to improve image quality and responsiveness while retaining the current GPU hardware encoding and direct WebRTC architecture. FHD/QHD at 144fps is a worthwhile initial validation target; 165fps and above and 4K should be expanded incrementally based on the host and receiving GPUs and display refresh rates. In particular, before increasing resolution and bitrate, **transport control that observes actual send backlogs and keeps them short** is needed.

The analysis is based on the working tree from 2026-10-07. It follows the [current common contract](../development/remote-desktop.md) and [Mac/Linux contract](../development/remote-desktop-posix.md). Whether the running installation matches the working tree requires separate verification of applied changes. The improvements below are proposals; no measurements establish actual 144fps sustain rates or improvements in input-to-screen-change latency. The existing [initial connection measurements](../work/remote-desktop-resident-direct.md) are distinct from sustained FPS or input latency measurements.

## Current Limits and Code Evidence

| Area | Verified current behavior | Impact when expanding |
| --- | --- | --- |
| Windows invocation | `start()` in [gpu-windows.mjs](../../../native/remote-desktop/gpu-windows.mjs) passes 1920×1080, 60fps, and an initial 6Mbps | Higher source resolutions are also downscaled. Configuration values must be passed through to native code |
| Windows native code | `mew_gpu_start()` in [gpu-windows.cpp](../../../native/remote-desktop/gpu-windows.cpp) allows only up to 4096×2160, 120fps, and 20Mbps | There is internal capacity for larger dimensions, but 144fps is rejected even if only the call argument is changed. These values do not demonstrate current 4K runtime performance |
| Mac/Linux | [gpu-posix.mjs](../../../native/remote-desktop/gpu-posix.mjs) is also fixed at 1080p and 60fps. [gpu-macos.m](../../../native/remote-desktop/gpu-macos.m) and [gpu-linux.cpp](../../../native/remote-desktop/gpu-linux.cpp) check for 60fps and a maximum of 6Mbps | OS-specific native validation and actual capture and encoder settings must be changed together |
| Mac frame timing | In addition to the capture interval, 60 is used for expected FPS, encode duration, and timestamp correction for forced refresh | Changing only the capture interval makes timing information inconsistent with encoder policy |
| Virtual display | The EDID and target mode in [virtual-display-driver.cpp](../../../native/remote-desktop/virtual-display-driver.cpp) are 1920×1080 at 60Hz | Obtaining 144 distinct frames on a virtual display requires expanding the mode and driver validation as well |
| Codec negotiation | [native-direct.mjs](../../../native/remote-desktop/native-direct.mjs) fixes H.264 at `42e033` and SDP bitrate at 6000kbps | The advertised Constrained Baseline and Level 5.1 must be aligned with the actual encoder SPS and receiver capability |
| Adaptive control | The same file decreases the rate by 25% and increases it by 5% within 350kbps–6Mbps. It uses loss above 3% or jitter buffer above 80ms | It cannot use the bandwidth needed for higher resolutions and refresh rates or distinguish bottleneck causes |
| Control interval | Post-connection stats in [desktop-connection.ts](../../../src/utils/desktop-connection.ts) run about every 1 second. Host feedback has a minimum interval of 750ms | Latency can accumulate before brief backlogs are detected |
| Worker handoff | [native-host.mjs](../../../native/remote-desktop/native-host.mjs) ACKs the worker immediately after calling `direct.frame()` | The IPC limit of one compressed frame does not verify browser receipt or display, or drainage of downstream transport queues |
| Send queue check | Returns 0 if `Track.bufferedAmount()` is unavailable | Congestion and frame limits based on 192/256KiB do not work with the currently installed binding |
| Polling and GPU resources | [gpu-worker.mjs](../../../native/remote-desktop/gpu-worker.mjs) and [gpu-posix-worker.mjs](../../../native/remote-desktop/gpu-posix-worker.mjs) poll every 2ms. Windows allows up to 3 encoder inputs and creates an NV12 texture/view/sample for each frame | At higher FPS, waiting and allocation costs and internal encoder backlogs become more significant. A cap of 3 does not mean there is always a 3-frame delay |
| Mouse input | Motion in [desktop-input.ts](../../../src/utils/desktop-input.ts) runs at 30/60Hz depending on local cursor and button state | Raising video alone to 144fps still leaves remote hover, drag, and scroll updates independently limited. Buttons and keys are sent immediately over reliable transport |
| Input limit | `native-host.mjs` terminates when total input messages exceed 240 per second | 240Hz motion leaves no headroom for heartbeats, buttons, or keys. Budgets for each input type must be designed together |

Actual capture on Windows uses WGC. The Desktop Duplication description remaining in the common development document's transport section is not used as this research's execution path. JS IPC of source pixels and CPU readback have already been removed from the current primary Windows/Mac paths. Linux X11 still uses CPU capture through `ximagesrc` and GPU upload.

## Transport Constraints Verified in the Binding

We imported the repository's installed `node-datachannel` 0.33.4 in a separate Node process and inspected the library version and prototypes. The local Linux binary uses libdatachannel **0.24.5**; `Track` has no `bufferedAmount()`, and `PacingHandler` has only a constructor and `addToChain()`. The same version's [Track wrapper](https://github.com/murat-dogan/node-datachannel/blob/v0.33.4/src/cpp/media-track-wrapper.cpp) and [pacing wrapper](https://github.com/murat-dogan/node-datachannel/blob/v0.33.4/src/cpp/media-pacinghandler-wrapper.cpp) also confirm this scope. Before implementation, inspect installed binaries on other operating systems the same way.

The current media chain is H.264 packetizer → Sender Report → NACK responder, with no pacing connected. It can therefore send a large frame's packets in a short burst. `Video.setBitrate()` is an SDP description and must be distinguished from APIs that control the actual encoder and packet transmission rate.

A key pitfall is that **simply attaching the existing pacer cannot solve the queue problem**. The [libdatachannel 0.24.5 implementation](https://github.com/paullouisageneau/libdatachannel/blob/v0.24.5/src/pacinghandler.cpp) adds RTP packets to an internal queue and provides neither a queue cap nor dynamic bitrate changes. Even exposing the channel's buffered amount would not measure all backlog in the pacer, OS socket, and network. A bounded queue, frame deadlines, a dynamic pacing rate, and overflow recovery must be added to the native transport layer, or a verified version and binding that provide those features must be integrated.

## Requirements for Supporting 144Hz and Above

The frame interval is 16.67ms at 60fps and 6.94ms at 144fps. In a simple model assuming a uniform phase relationship between input and the next frame, the average wait at one stage decreases from 8.33ms to 3.47ms, a reduction of about **4.86ms**. This cannot be guaranteed as the overall latency improvement, but a high refresh rate itself can improve responsiveness if frame processing and transport keep up.

The throughput below was calculated using `폭 × 높이 × FPS`. The H.264 level lower bounds were derived by comparing `ceil(폭/16) × ceil(높이/16) × FPS` with [MaxMBPS in Annex A of ITU-T H.264 2024](https://www.itu.int/rec/T-REC-H.264-202408-S/en). Other constraints, including frame size, profile, DPB, and frame rate, as well as actual decoder support, must also be satisfied separately. Align SDP with the actual bitstream according to the negotiation rules in [RFC 6184](https://www.rfc-editor.org/rfc/rfc6184.html#section-8.1).

| Validation target | Frame interval | Pixel throughput relative to current FHD 60fps | H.264 level lower bound based on MaxMBPS |
| --- | --- | --- | --- |
| FHD 144fps | 6.94ms | 2.40× | 5.2 |
| QHD 144fps | 6.94ms | 4.27× | 5.2 |
| QHD 165fps | 6.06ms | 4.89× | 6.0 |
| 4K 144fps | 6.94ms | 9.60× | 6.1 |

The current Level 5.1 MaxMBPS of 983,040 falls short even of the 1,175,040 required for FHD 144fps. QHD 144fps exactly reaches Level 5.2's 2,073,600. Raising the FPS cap while leaving the advertised level, actual encoder settings, and receiver capabilities unchanged does not qualify as official support. The pixel throughput multiplier is not the required bitrate multiplier.

[NVIDIA's official performance table](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.1/nvenc-application-note/index.html) shows encoder throughput exceeding 144fps with specific GPUs, 1080p resolution, and encoding settings. This provides a basis for considering FHD 144fps worth validating. It does not guarantee mew performance encompassing capture, color conversion, GPU usage by games, transmission, receiver decoding, and display.

If the actual screen updates at only 60Hz, repeatedly transmitting the same screen does not produce 144fps worth of information. Check the host source refresh rate, physical/virtual display mode, receiver display refresh rate, and hardware decoding at the specified resolution/FPS together. Even with a 144Hz display, the presentation rate may vary with browser power policies and background state.

## Order of improvements to reduce latency at high image quality

### Control actual queues and congestion first

This is the highest priority. Combine pacing that spreads frame transmission into appropriate portions, queues with short time budgets, and congestion estimation for the actual path into one policy. Adjust encoder bitrate and pacer rate together, leaving headroom for RTP headers, retransmissions, and input traffic. Fixing the pacer below the average video bitrate causes the backlog to keep growing, while excessively long pacing intervals delay frame delivery.

Using a fixed 256KiB as a latency budget is also inappropriate. In a simple serialization calculation, 256KiB takes about 350ms at 6Mbps and about 105ms even at 20Mbps. This is a `바이트 × 8 / 전송률` calculation, not a measurement of the current actual queue length. Use a time budget based on queue age and the actual available transmission rate, and discard old **unencoded surfaces** first. When discarding an already encoded reference P-frame, also discard dependent subsequent references and recover with IDR/SPS/PPS.

Current feedback sends only loss and the jitter-buffer average. Diagnose causes by separating received FPS, decode cost, queue age, path RTT changes, and send/receive throughput. Experiment with a control interval of around 100–250ms, but avoid React updates on every frame or sending all stats. In the long term, integrating RTCP-based bandwidth and arrival-time feedback can reduce the response delay of control at intervals measured in seconds. Do not treat shortening the feedback interval alone as complete congestion control.

`decoded: framesDecoded > 0` remains true after the first decode, so it cannot determine whether a moving screen later stopped. Compare increments in reception and decoding with actual screen changes on the host. Distinguish a static desktop from loss to avoid repeatedly requesting keyframes. Also evaluate the NACK cache of 512 entries and the minimum 200ms interval between keyframe requests against recovery policies for high bitrate and RTT.

### Negotiate source resolution and high refresh rates

Cross-check the browser's receive codec capabilities, `MediaCapabilities` evaluation of the target resolution/FPS, and host encoder capabilities. Distinguish desired values, negotiated values, and actual received resolution/FPS. Start validation with FHD 120 → 144fps and QHD 60 → 144fps, then check 165fps and higher. Connect each OS's validation conditions, wrapper, worker start, SDP bitrate, encoder profile/level, and frame duration through the same configuration.

Extending virtual display modes follows the installation, signing, lifetime, and headless hardware test conditions in the [separate driver contract](../development/remote-desktop-virtual-display.md). Checking the physical display 144fps path first makes it easier to distinguish driver work from video pipeline issues. Retain the default 60fps path for devices with insufficient capabilities or bandwidth.

### Encoder quality settings that maintain low latency

The first candidate is to negotiate H.264 Main/High or Constrained High without B-frames. Provide a fallback that preserves the compatibility benefits of the current Baseline profile, and compare bitrate and encode time at the same image quality with more efficient profiles. [Apple's low-latency VideoToolbox explanation](https://developer.apple.com/videos/play/wwdc2021/10158/) also discusses Constrained High's compression efficiency and checking decoder capabilities. Using High profile does not automatically require B-frames.

Windows already requests `MF_LOW_LATENCY`, `AVLowLatencyMode`, CBR, and 0 B-frames. However, because it does not check several `SetValue()` results, it cannot guarantee that the driver accepted all settings. Check support with APIs such as [ICodecAPI::IsSupported](https://learn.microsoft.com/en-us/windows/win32/api/strmif/nf-strmif-icodecapi-issupported), and validate the setting results and actual stream. Compare VBV size, presets, and QP policies; do not select the slowest high-quality preset by default.

The [NVENC guidelines](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.1/nvenc-video-encoder-api-prog-guide/index.html) recommend LL/ULL, CBR, and a small VBV for low-latency use. A small VBV limits bursts and latency but may reduce quality in complex scenes, so comparison is necessary. Linux NVENC's [GStreamer settings](https://gstreamer.freedesktop.org/documentation/nvcodec/nvh264enc.html) provide separate `tune`, `vbv-buffer-size`, and quality-related properties in addition to `zerolatency`. mew does not explicitly set these values.

If common Media Foundation settings alone do not meet the target, compare dedicated NVIDIA NVENC, AMD AMF, and Intel VPL paths. The [AMD AMF API](https://github.com/GPUOpen-LibrariesAndSDKs/AMF/blob/master/amf/public/include/components/VideoEncoderVCE.h) provides low-latency usage, VBV, and frame size controls, while [Intel VPL](https://intel.github.io/libvpl/latest/API_ref/VPL_enums.html) provides quality/speed target usage. Do not replace the existing path on the assumption that dedicated APIs are faster on every GPU; start comparisons on devices where the encoder is the bottleneck.

Mac/Linux's keyframe interval of 1 second and Windows' GOP of 10 seconds also affect the frequency of large compressed frames. Compare GOP, requested IDRs, and supported intra refresh while maintaining recovery speed. For example, merely delivering a 250KB IDR over a 20Mbps path takes about 100ms. This calculation assumes a frame size; actual mew IDR sizes must be measured.

### Select HEVC and AV1 per device

Reducing transmission volume at the same image quality at high resolutions can also reduce network serialization and backlog costs. Consider combinations that support both hardware encoding and decoding of HEVC/AV1. Switching to a software decoder may incur latency and power costs that outweigh compression efficiency gains.

The current Node bindings already include `addH265Codec`, `H265RtpPacketizer`, `addAV1Codec`, and `AV1RtpPacketizer`. Extending codec support does not necessarily require building an entirely new transport system. However, OS encoders, bitstream formats, RTP packetization, SDP, and receiving browser behavior must all be implemented and validated.

The [official Chrome 136 release notes](https://developer.chrome.com/release-notes/136#h265_hevc_codec_support_in_webrtc) state support for WebRTC HEVC. Do not use this as a guarantee that every OS, browser, and device handles the specified resolution/FPS in hardware. Query codec capabilities and `MediaCapabilities`, then check the actual decoder and decode FPS. Retain H.264 as a compatibility path.

### Reduce GPU resource overhead and polling waits

Reuse Windows NV12 textures, views, and samples through pools, but only after the encoder has finished using them. Also reduce GPU capture surface copies after checking lifetime and synchronization. Maintain the current condition of capturing, converting colors, and encoding on the same GPU adapter.

Compare a path that wakes the next task through capture FrameArrived and encoder output events instead of 2ms polling. Within the 6.94ms budget at 144fps, polling waits across multiple stages become difficult to ignore. Use a dedicated GPU worker thread and clear surface lifetimes rather than merely shortening polling intervals and increasing CPU usage and power consumption. Compare both throughput and latency for Windows in-flight limits of 1/2/3 and Mac's serial processing of one frame at a time.

Compressed frames are copied multiple times: native output → JS Buffer → transferable Uint8Array → RTC Buffer. Although the cost is lower than copying source pixels, allocation and GC latency are worth measuring as bitrate increases. Later, if needed, pass compressed output directly to a native packetizer so Node can focus on lifetime and control paths.

For Linux X11, paths supporting GPU capture or actual DMA-BUF import merit separate evaluation. On Wayland as well, using PipeWire alone does not guarantee zero-copy, so check the negotiated memory type and GPU/CPU copies. Do not again present source pixel CPU copies, already removed on Windows and Mac, as the main improvement target.

### Improve input and static screen quality together

Send motion during input at 120/144Hz or a rate suited to the display and input device, and coalesce multiple events in the same frame to the latest position. Maintain immediate local cursor display, reliable button/key transmission, final motion recovery, and leases. Organize host input limits into a separate token budget. A local cursor is not evidence that the actual remote app responded sooner, so measure input-to-screen-change latency separately.

For documents, code, and terminals, evaluate preserving source resolution, adjusting ROI/QP for text and UI boundaries, and enhancing quality after changes stop. Return to a low-latency update policy when motion starts. Windows/Mac already focus processing on changed screen content, whereas Linux X11 uses `use-damage=false`. Avoid repeatedly encoding a static screen 144 times.

With the current NV12 4:2:0, bitrate alone may not resolve blurring of small colored text and subpixel boundaries. Check source resolution and scaling first, and treat 4:4:4 or separate text enhancement as separate candidates after validating browser hardware decoding and implementation complexity.

## Measuring ping and screen response

The round-trip time in the current UI is the selected candidate pair's `currentRoundTripTime`. Under the [W3C stats definition](https://www.w3.org/TR/webrtc-stats/#dom-rtcicecandidatepairstats-currentroundtriptime), this is the ICE/STUN path RTT; it does not include capture, encoding, decoding, or monitor presentation time. If high image quality exceeds available bandwidth, backlog can also increase RTT, but image quality settings alone do not reduce propagation delay on the same direct path.

The response users perceive is affected jointly by input delivery, remote app processing, the next screen update, capture/conversion, encoding, frame transmission, receiver processing, and presentation. Measure the following values over the same interval.

| Stage | Measurements |
| --- | --- |
| Host | Capture time of actually changed frames, conversion/encode time, in-flight count, compressed frame and IDR sizes |
| Sending | pacer queue age/depth, packet/frame deadline overruns, actual payload/total transmission rate, retransmission volume |
| Receiving | `ΔframesDecoded/Δ시간`, `ΔtotalDecodeTime/ΔframesDecoded`, `ΔjitterBufferDelay/ΔjitterBufferEmittedCount`, freeze/drop |
| Screen presentation | Frame progression and presentation metadata from `requestVideoFrameCallback`, `framesRendered` where available, actual receiver display refresh rate |
| User response | p50/p95 of input → actual screen change, using a test scene linking input IDs to screen changes or high-speed recording |

`totalProcessingDelay` measures time from the first RTP packet's arrival to decode completion, including jitter and decoding. Adding it to the receiver values above would double-count them. Browser frame callbacks are not equivalent to actual monitor light output, and directly subtracting `performance.now()` values from different devices must not be reported as one-way latency. Current Windows timestamps are generated at encoder input time rather than the original capture time, so instrumentation that preserves source capture time is needed.

The `jitterBufferTarget=0` setting is already applied. Under the [W3C WebRTC contract](https://www.w3.org/TR/webrtc/#dom-rtcrtpreceiver-jitterbuffertarget), it is a requested target; the browser and network determine the actual minimum buffer. Do not count adding the same setting again as a new improvement.

## Validation stages and adoption criteria

| Stage | Work | Evaluation criteria |
| --- | --- | --- |
| 1 | Instrument each stage at the existing FHD 60fps. Record the actual codec/decoder and source display mode | Separate RTT from input → screen latency, and establish p50/p95 and decode/display FPS baselines in moving scenes |
| 2 | Improve observable bounded pacing, queue age, and feedback; check encoder setting results | Compare latency and freezes at the same resolution and bitrate, and verify that old video does not accumulate when bandwidth drops |
| 3 | Negotiate native QHD and 120/144fps; connect level, duration, and motion | Received and displayed FPS in actually changing scenes keep up with the target, improving both input latency and text quality over the default 60fps |
| 4 | Compare H.264 High, VBV/preset/GOP, and HEVC/AV1 | Compare bitrate and encode/decode latency at the same visual quality. Do not judge superiority solely by comparisons at the same bitrate |
| 5 | GPU resource pools, event handling, and fewer compressed data copies | Check p95 improvements at bottleneck stages and CPU/GPU and power costs |
| 6 | Extend support to 165/240fps, 4K, and virtual modes | Record as supported only combinations whose device, codec, and actual stream constraints have been checked |

For hardware test combinations, distinguish Windows NVIDIA/AMD/Intel, Mac Intel/Apple Silicon, and Linux X11/Wayland, and record the receiving browser, GPU, resolution, and refresh rate. It is acceptable to start with a narrow set of combinations actually in use. Compare static text, scrolling/window movement, and fast-motion video scenes in the order wired LAN → Wi-Fi → external network. For each selected combination, measure each scene 3 times for at least 60 seconds each, and also check power consumption, temperature, and FPS degradation with at least 5 minutes of continuous motion.

Reproduce bandwidth drops, loss, and jitter in an isolated environment. An initial bitrate sweep can use 6/12/20/35/50Mbps, but these are comparison inputs, not recommended bandwidth requirements. Removing the current cap and establishing stable transmission control must come first. Use text crops and visual comparisons alongside SSIM/VMAF where available, and evaluate latency improvements with identical scenes and quality.

The default proposal is **instrumentation and transmission control → source resolution and 144fps → profiles/codecs → detailed GPU optimization, while retaining the current direct connection architecture**. A full replacement with libwebrtc would change [ADR 0185](../history/decisions/0185-mew-desktop-resident-direct-host.md), which selected the current small native transport module, so consider it as a separate decision when the preceding stages fail to meet the target and the benefits of complete congestion control have been confirmed.
