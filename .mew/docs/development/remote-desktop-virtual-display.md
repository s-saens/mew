---
title: "Windows in-house virtual display and headless GPU capture"
created: 2026-10-01
updated: 2026-11-04
description: "Defines the in-house Windows UMDF/IddCx virtual display's twelve resolution/refresh modes, versioned client negotiation, exact display activation, WGC capture, ownership and lease lifecycle. Covers signing and installation requirements, automated mode and CCD mock verification, and remaining hardware/headless validation."
상위파일: "MOC.md"
---

[Remote desktop contract](remote-desktop.md) · [Usage](../../../docs/guides/remote-desktop.md) · [ADR 0187](../history/decisions/0187-mew-independent-virtual-display.md)

## Current scope

Provides in-house UMDF 2/IddCx driver sources, package build, signing, and installation tools, and host integration for use without StarDesk. **An officially signed distribution package and installation testing on actual hardware are not yet available.** Successful source compilation is not treated as confirmation of operation with the monitor powered off. The existing `desktop-setup` updates only the capture helper and does not automatically install the driver.

After driver installation, `Mew 가상 화면` (`gpu:99`) is added to the screen list. The existing physical screen remains the default; if no physical screen exists, the virtual screen is selected. If the driver is missing and there is no active output, an installation required error is displayed. Windows may continue reporting the physical output as connected even with the monitor powered off; in this case, select the virtual screen manually. The existing screen selection setting also applies to the next connection.

The virtual screen is a **separate extended display** on the same Windows login desktop. It does not provide per-account isolation, physical screen mirroring, primary display changes, or automatic movement of existing windows. When a physical monitor is logically removed, Windows' own window rearrangement policy applies. Users must move windows remaining on the physical screen to the virtual screen.

## Driver and lifecycle

- `native/remote-desktop/virtual-display-driver.cpp` provides the `Root\MewVirtualDisplay` adapter. It supports at most one monitor with synthetic EDID `MEW0001`. Its preferred EDID timing remains 1920×1080 at 60Hz; the IddCx monitor/default/target callbacks advertise the twelve modes listed below. It does not use StarDesk, third-party driver DLLs, or private named pipes.
- There is no monitor, swapchain, or frame thread during initialization or idle periods. They are created when an authenticated session selects the screen and are owned by a single driver device file handle. Renew/release requests from other file handles are rejected.
- Local IOCTLs check the version, exact buffer size, and read/write access. Protocol version 2 adds requested width, height and FPS to the 24-byte acquire request and the selected mode to the 28-byte status response. Zero request values are rejected; only the owning file handle receives active state, selected mode and render LUID. At installation, the device ACL is restricted to SYSTEM, Administrators, and **one specified Windows user SID**. There is no network listener. It does not claim app-level isolation from other processes running as the same local OS user.
- The monitor is released on normal shutdown, handle cleanup, and power-down. Only active capture renews the device lease approximately every 1 second; if no renewal occurs for 10 seconds, the driver timer releases it. The timer is not rescheduled while idle. After host stop confirmation fails, the server delays starting a new host for 11.25 seconds to account for this lease as well. Driver acquire rechecks the existing owner.
- On display arrival, only its own output is added or updated through `SetDisplayConfig`, preserving the existing active paths, their order, source positions and source/target modes. A new virtual desktop is placed to the right of existing outputs, or at the origin when headless. An existing virtual desktop keeps its position. A source shared with another output is rejected. It does not request persistent layout storage, select a different primary screen or disable other monitors. The OS may adjust window placement as displays arrive or are removed.

## Resolution and refresh negotiation

| Desktop resolution | Advertised refresh rates |
| --- | --- |
| 1920×1080 | 60, 120, 144, 240Hz |
| 2560×1440 | 60, 120, 144, 240Hz |
| 3840×2160 | 60, 120, 144, 240Hz |

`virtual-display-modes.h` owns the mode table, selection policy and timing totals shared by the driver and capture helper. The host passes the negotiated stream width, height and FPS through acquire and activation. Selection uses the largest advertised resolution that fits both requested dimensions, with 1920×1080 as the minimum, and the greatest advertised refresh rate at or below the requested FPS, with 60Hz as the minimum. A 2560×1440/165fps request selects 2560×1440 at 144Hz; a 1280×720/30fps stream captures the 1920×1080/60Hz desktop and scales it for transmission. All advertised desktops are 16:9; arbitrary aspect ratios and custom timings are outside this contract. Display refresh and encoded stream FPS are distinct limits.

The client supplies the exact source dimensions and target signal timings to [SetDisplayConfig](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setdisplayconfig), validates them, then applies them. It omits `SDC_ALLOW_CHANGES` so Windows cannot silently substitute modes on existing outputs to satisfy the request. A validation or activation failure prevents capture startup. An already active virtual output is only accepted without reapplication when both source/target dimensions and target refresh match. Driver mode callbacks report the full required count and reject undersized nonempty arrays before writing any modes.

Protocol version 2 is incompatible with the previous single-mode driver/helper pair. The INF identifies the new package as driver version `2.0.0.0` dated 2026-11-04. Rebuild, sign and install the matching driver package and update the capture helper before verifying these modes. `desktop-setup` still updates only the helper. No automatic driver update or display reconfiguration outside the selected virtual output is performed.

## GPU and first frame

`virtual-display-client.h` opens only its own device interface. It passes the physical D3D11 GPU LUID as the preferred render adapter, then reads back the LUID actually selected by the OS for the swapchain. Windows does not guarantee this preference, so capture and the encoder are initialized on the actual GPU. It shuts down if the GPU changes during execution.

`gpu-windows.cpp` ABI 5 uses Windows Graphics Capture `CreateForMonitor` and a free-threaded 2-buffer frame pool for both physical and virtual outputs. It retains only the latest GPU surface, creates NV12 using a VideoProcessor on the same device, and passes it to a Media Foundation hardware H.264 MFT restricted by LUID. There is no raw pixel CPU Map, IPC, WASM, or software encoder fallback. It is not called fully zero-copy because it includes internal GPU copies. The OS WGC capture border may be visible.

The GPU device can be warmed up even without an output. Virtual monitor arrival and activation are confirmed within at most 4 seconds. Capture also exits with an error if no initial surface arrives within 4 seconds. The capture thread reads actual pixel coordinates with Per-Monitor DPI awareness and creates the input adapter after actual screen coordinates are established. The viewer displays `connected` only after both input channels and the initial `framesDecoded > 0` condition are satisfied. A connection without video ends with a capture error at the 20-second limit. Black pixels themselves are not considered an error.

## Build and official signing

Requires Windows 10 2004 or later, a logged-in user, a GPU driver, and hardware H.264. Driver builds use MSVC C++ Build Tools, the Windows SDK, and the WDK. Default tool versions are SDK/WDK `10.0.26100.0`, UMDF 2.25, and IddCx 1.4, with source paths provided for x64 and arm64. Compilation on actual hardware was verified only for x640,000. The extracted `c` directory from [Microsoft WDK NuGet](https://learn.microsoft.com/en-us/windows-hardware/drivers/install-the-wdk-using-nuget) can also be specified with `-Wdk`. The agent does not install the system WDK.

Use the repository's `native/remote-desktop` as the working directory in Windows PowerShell. Specify an output directory that does not yet exist.

```powershell
.\build-virtual-display.ps1 -Output C:\mew-display-release
# WDK NuGet를 사용한다면 -Wdk C:\wdk-package\c
```

The builder creates the DLL, INF, catalog, and license files and runs Inf2Cat checks. It does not register devices, install certificates, or change Secure Boot. The catalog contains DLL and INF hashes, so **do not modify the INF/DLL after generation.**

An existing trusted code signing certificate and private key must be present in `Cert:\CurrentUser\My` to run the next step. Specify the issuer's HTTPS RFC 3161 timestamp URL.

```powershell
.\sign-virtual-display.ps1 -Package C:\mew-display-release `
  -CertificateThumbprint <발급받은_코드서명_인증서_thumbprint> `
  -TimestampUrl <발급기관의_HTTPS_timestamp_URL>
```

The signer checks current validity, the Code Signing EKU, the private key, and the certificate chain, signs the catalog with SHA-256, then verifies its members. It does not issue certificates or install its own trusted root. Obtaining a certificate, issuer-specific signing services/policies, and additional driver policies in managed environments are separate distribution requirements. It does not assume that general UMDF and kernel drivers have identical signing requirements ([Microsoft signing guidance](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/windows-driver-signing-tutorial)).

The current development Windows environment had no Code Signing certificate with a valid private key in the CurrentUser/LocalMachine `My` stores. This check did not print or modify raw certificate or key contents. Therefore, release signing and production installation could not be performed during this work.

## One-time installation and removal

After obtaining a signed package, run it in **administrator Windows PowerShell**. Find the target login user's SID using `whoami /user` in Windows PowerShell opened as that user. Even when installing from another administrator account, explicitly specify the SID of the user who will run mew.

```powershell
.\install-virtual-display.ps1 -Package C:\mew-display-release `
  -UserSid <mew를_실행하는_Windows_사용자_SID> `
  -SignerThumbprint <신뢰하는_릴리스_서명자_thumbprint>
```

The installer verifies the trusted catalog's signer and the INF/DLL member hashes with SignTool, then registers or updates only its own root device. It rejects unsigned packages, signer mismatches, and tampered packages. Group SIDs are rejected. Do not run the host or browser as administrator. The driver does not add a screen until a connection is established. If Windows requests a reboot, the user reboots according to the output.

```powershell
# 장치 변경 없이 패키지 서명만 확인
.\install-virtual-display.ps1 -Package C:\mew-display-release `
  -SignerThumbprint <신뢰하는_릴리스_서명자_thumbprint> -CheckOnly
# 자체 어댑터 제거. Driver Store의 패키지와 다른 공급자 장치는 보존
.\install-virtual-display.ps1 -Remove
```

After installation, the user applies the ABI 5 helper with `./mew desktop-setup`. The user builds and applies changes to the running app according to the [execution rules](getting-started.md). Select the virtual screen and verify actual display, window movement, pointer coordinates, and screen release after shutdown, then reconnect with the monitor powered off. Until this is checked, do not treat StarDesk removal as completed support validation.

## Verified items and remaining validation

On 2026-10-01, the in-house driver DLL, installer EXE, and WGC GPU DLL were compiled with MSVC in an isolated temporary Windows path. Inf2Cat signability checks, catalog generation, and InfVerif `/u` passed without errors. Rejection of an unsigned package with `-CheckOnly` was also tested in actual PowerShell. No certificates, drivers, display settings, or production helpers were installed or modified.

Two repeated sessions using an existing physical output passed through the actual Windows login session → WGC GPU surface → hardware H.264 → direct transmission to Windows Chrome path. Local first display on a warmed-up host took approximately 297–372ms, and the next connection took 135–230ms, excluding host startup, installation time, and Internet paths. These values are **not virtual monitor performance validation.**

Automated tests verify file ownership, invalid renew/release requests, rejection of renewal after expiration, normal cleanup, first decode/input channel ordering, and timeouts without video. Existing synthetic WebRTC UI, security, and lifecycle tests also passed.

On 2026-11-04, the portable C++ mode-selection/timing and existing lease harnesses passed. A Windows SDK/MSVC executable with mocked CCD calls also passed exact 1440p144 and 2160p240 activation, physical path/mode/position preservation, existing-mode no-op, strict validation failure, shared-source rejection and headless-origin tests. `native/remote-desktop/test-virtual-display-client.ps1` builds and runs that fixture in a disposable Windows directory; it does not open devices or change displays. The Node test invokes it when `MEW_DESKTOP_TEST_POWERSHELL` is set. These checks exercise client planning and SDK compatibility, not an installed driver or real display configuration. The local Windows SDK is available, but the required IddCx/UMDF WDK components were absent at their configured default location, so this change has no new driver DLL/package compilation result.

Obtaining an official signer, actual hardware testing of the new modes and DDI/ACL/lease behavior in the installed in-house UMDF driver, monitor power-off, fully headless operation, rebooting, display hotplugging, sustained load, and power consumption remain unverified. No driver signing, installation or running-instance application was performed for the new modes.
