---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: use an in-house virtual display for Windows headless remote screens. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0187 — Use an in-house virtual display for Windows headless remote screens"
created: 2026-10-01
updated: 2026-10-01
---

- Date: 2026-10-01
- Status: Adopted
- Follow-up to: [0185](0185-mew-desktop-resident-direct-host.md) — Add virtual screen and driver installation boundaries
- Decision makers: User (requested independent operation after removing StarDesk and a custom driver if possible), Codex (implementation design)

## Decision

- Provide the Windows UMDF 2 and IddCx-based `Mew Virtual Display` driver as source code. Do not depend on StarDesk drivers, private protocols, or third-party virtual display control pipes.
- The driver creates no monitors at startup. Bind ownership of one virtual monitor to a device handle held by an authorized local user SID, and release it on handle cleanup, explicit shutdown, or lease expiration. Limit display creation to authenticated remote sessions.
- Specify the render GPU LUID before creating the display. Verify the actual swapchain render GPU, and use Windows Graphics Capture, D3D11 NV12 conversion, and hardware H.264 on the same physical GPU. Do not add CPU pixel readback or a software encoder fallback.
- The virtual display is a separate extended display. Do not mirror physical monitors, change the primary display, move windows automatically, or disable other displays. When no monitor is present, activate the virtual display so Windows uses it as the only desktop output.
- Mark the viewer as connected only after confirming both the first decoded video frame and input channel readiness. If only the channel opens and no video arrives, terminate with an error within a bounded time.
- Separate driver package creation from production installation. The production installer rejects unsigned custom builds. The user installs a signature-verified package once with Windows administrator privileges, while the mew host retains its existing standard user privileges. Do not automate disabling Secure Boot, enabling test signing, or installing a custom root certificate.
- Development agents must not change running servers, installed instances, or actual display configurations. Perform isolated compilation and verify GPU capture of existing outputs, and distinguish whether signing, driver installation, and verification with the monitor powered off were performed.

## Rationale and limitations

The [Microsoft IDD model](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/indirect-display-driver-model-overview) provides user-mode virtual monitors and DirectX surfaces. [Render adapter selection](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/iddcx/nf-iddcx-iddcxadaptersetrenderadapter) is only a preference, so verify the actual GPU. Writing and compiling a driver alone does not provide a trusted signing certificate or installation verification on actual hardware. The [project contract](../../development/remote-desktop-virtual-display.md) owns the build, signing, and installation procedures and the current verification scope.
