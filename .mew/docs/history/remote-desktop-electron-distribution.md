---
title: "Previous Electron distribution and license review"
created: 2026-10-01
updated: 2026-10-01
description: "Preserves the review of licensing, notices, and commercial use for Electron, Chromium, and VP8 distributions before the switch to a native host. The current distribution contract follows a separate document."
---

This is a review record for distributions before ADR 0188. The current standard is the [Distribution contract](../development/remote-desktop-distribution.md).

## Notices and verified conditions

| Scope | Conditions and distribution artifacts |
| --- | --- |
| In-house transport, input, and protocol code | Mew's MIT license. The companion app also declares `license: MIT` and includes a standalone distribution `LICENSE` in the installation copy list |
| Electron 44.3.0 | Electron itself is MIT; Chromium and bundled components have their own licenses. Preserve the original `node_modules/electron/dist/LICENSE` and `LICENSES.chromium.html`, and reject missing files during installation completion checks |
| node-datachannel 0.33.4 / libdatachannel 0.24.5 | MPL-2.0. Preserve license and corresponding source conditions for covered files and notices accompanying binaries |
| VP8/libvpx | WebM BSD-style notices and a separate patent grant. Uses the browser/Chromium built-in implementation without copying libvpx code |
| koffi 3.2.1, dbus-next 0.10.2, ws | Each is MIT. Do not remove LICENSE/NOTICE from installed npm packages |
| Transitive npm dependencies | Preserve the conditions of MIT, ISC, BSD, Apache-2.0, BlueOak, Unlicense, and other licenses in the lockfile. BSD-3-Clause can be selected for `json-schema`. For jsbi 2.0.5, which has no license metadata, Apache-2.0 was confirmed in the package LICENSE; for map-stream 0.1.0, MIT was confirmed in LICENCE |
| Dedicated Windows Node | The entire official ZIP directory is moved, preserving the LICENSE for Node and its included components |

The [DEPS](https://github.com/electron/electron/blob/v44.3.0/DEPS) for Electron 44.3.0 specifies Chromium 152.0.7977.78 and bundled Node v24.20.0. Distinguish this from Windows Node 24.21.0, which the companion app installs separately when needed. Verified against the official [Electron license](https://github.com/electron/electron/blob/v44.3.0/LICENSE), [WebM software license](https://www.webmproject.org/license/software/), and [additional patent grant](https://www.webmproject.org/license/additional/).

## When distributing a bundled runtime

The original Electron notices downloaded by the current installer also include LGPL components such as FFmpeg. Therefore, do not label the entire runtime as MIT or claim that retaining license files alone satisfies all conditions. If distributing a new installer that includes Electron binaries, in addition to preserving notices, **provide the source, patches, and build information that exactly correspond to those binaries, and satisfy LGPL replacement/debugging rights and other requirements** as appropriate for the distribution method. The basis is the [official FFmpeg distribution guidance](https://ffmpeg.org/legal.html) and the original license text included in that distribution. This work does not create such a bundled installer.

## 2026-09-14 detailed inspection of the official distribution

Downloaded the official Linux x64 ZIP from the [Electron 44.3.0 release](https://github.com/electron/electron/releases/tag/v44.3.0) and inspected it without execution. The ZIP size was 122,830,582 bytes, and its SHA-256 `8b49b9efdd73c0f467edc3c1cd5678392c384ccf224f34ff54179f736e2f384b` matched `SHASUMS256.txt` from the same release. Inside, `version` was `44.3.0`, and `LICENSES.chromium.html` was 20,111,209 bytes.

Confirmed 779 product entries in the generated notices, including duplicates. This is **not evidence that all 779 libraries were linked into the binaries for that platform.** Platform-conditional and referenced components may be included; the following are representative entries actually listed in the notices. Windows and macOS distributions and the linking relationships of individual binaries were not checked in this review.

| Component | Role | License scope confirmed in the distribution |
| --- | --- | --- |
| Electron / Node.js | Desktop shell and server JavaScript runtime | MIT for the projects themselves; bundled components have separate notices |
| V8 / ANGLE / WebRTC | JavaScript, graphics, and real-time communication | Primarily BSD-family licenses; retain each component's accompanying notices |
| libvpx | VP8/VP9 codecs | BSD-family licenses and WebM patent grant |
| BoringSSL / ICU | Cryptography and internationalization | Apache-2.0 / Unicode License V3 and accompanying notices |
| dav1d / OpenH264 | AV1/H.264-related components | BSD-family licenses. Inclusion in the notices alone does not establish that patent conditions are satisfied |
| FFmpeg | Media processing | LGPL-2.1-or-later by default. Descriptions of optional GPL configurations in the original text do not establish that this binary is a GPL build |
| liblouis | Braille translation | LGPL-3.0-or-later |
| libbrlapi / libsecret / libusbx / Speech Dispatcher | Accessibility and system integration | LGPL-2.1-related notices |
| GTK | Linux GUI integration | GNU Library GPL v2 notice |
| axe-core / Eigen / symphonia | Accessibility checks, numerical computation, and media | MPL-2.0-related notices |

These licenses do not prohibit commercial use itself. Using LGPL components also does not automatically make all of Mew GPL. Distribution does, however, create obligations based on linking method, modifications, and each license version. MPL primarily requires providing source for distributed covered files and their modifications; it does not require blanket disclosure of separate Mew files. Sources: [LGPL-3.0 text](https://opensource.org/license/lgpl-3-0), [official MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).

### Previous VP8 selection and Electron codec configuration

The current Mac/Linux and older server transports negotiating VP8 is a choice about the actual screen transmission format. Electron 44.3.0's [official build configuration](https://github.com/electron/electron/blob/v44.3.0/build/args/all.gn) specifies `ffmpeg_branding="Chrome"` and `proprietary_codecs=true`. Therefore, using only VP8 does not remove H.264 and AAC support or other media libraries from the distributed Electron build. Here, `proprietary_codecs` is a codec support build option; it does not mean that Electron as a whole has a proprietary software license.

Distinguish software copyright permission from codec patent permission. WebM's grant also has an explicit scope and conditions and does not guarantee coverage of all third-party patents. Conversely, this build option alone does not establish that Mew must incur specific patent royalties. When changing codecs or distribution markets in the future, assess the actual form of distribution and use.

### Differences between cloud and customer distribution

| Distribution method | Checks applicable to Mew |
| --- | --- |
| Distribute Mew source/installers and download official runtimes in the customer's environment | Current method. Preserve notices in files provided by Mew and installed upstream notices. Separating the download path does not eliminate all obligations |
| Run the runtime only inside Mew's production servers | Internal server use of LGPL/MPL alone does not automatically create an obligation to provide customers with the entire server source. Assess web code and companion apps delivered to customers separately |
| Provide installers, ZIPs, or customer-downloadable VM/container images that include Electron | Satisfy requirements for binary notices, exact corresponding source, patches, and build information for covered components, and LGPL replacement, relinking, and modification debugging rights as appropriate for the distribution method |

The current findings alone provide no reason to remove Electron. Retain the official download method, but before releasing a directly bundled runtime, inspect the actual distribution and linking relationships for each supported OS and establish license notice and source provision procedures. Even if separate commercial restrictions are introduced for Mew itself, those restrictions must not override rights for third-party LGPL/MPL components. For a separate review of models and agent tools, see [Agent and model license review](../work/agent-model-license-review.md).

This review is limited to remote desktop changes and the distribution conditions of pinned dependencies. It is not an audit of all Mew dependencies or a guarantee against disputes in every country or over third-party patents. Recheck if runtime/dependency versions or distribution methods change.
