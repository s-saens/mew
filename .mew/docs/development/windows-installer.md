---
title: "Windows installation wizard"
description: "Defines the native Windows x64 installer for a private WSL 2 environment, pinned prebuilt runtime, reboot resume, launch control, and data-preserving repair. Separates implementation from signed publication and clean-Windows acceptance."
updated: "2026-11-05"
---

# Windows installation wizard

The wizard delivers one `mew-windows-setup-x64.exe`. It prepares the computer, installs Mew, and opens the first-administrator page in the Windows browser. Users do not enter WSL, package-manager, Node, or compiler commands. Administrator approval and a Windows restart remain visible when Windows requires them.

**Publication status:** the installer source and release path are implemented; no signed installer has been published or accepted on a clean Windows machine. The [release procedure](../operations/cli-release.md#windows-installation-wizard) owns publication gates. Until those gates pass, the [manual Windows guide](../../../docs/guides/getting-started-en.md#windows-wsl-2) remains the usable installation route.

## Components and boundaries

| Component | Responsibility |
| --- | --- |
| `apps/windows-installer/setup.iss` | Native Inno Setup wizard, per-user launcher installation, shortcut, and restart guidance. |
| `installer-core.ps1` / `install.ps1` | Owned installation journal, verified downloads, fixed WSL preparation, private environment import, provisioning, and resume. |
| `bootstrap-linux.sh` | Prepare the isolated Ubuntu runtime and versioned prebuilt files, browser dependencies, and a non-root Mew user. |
| `verify-linux.sh` | Check immutable file hashes, completion identity, and essential Node, CLI, and runtime executables before accepting an installed version. |
| `launcher-core.ps1` / `launch.ps1` | Own the WSL CLI process, validate local readiness addresses, and reopen the browser through private local control. |
| `launch-linux.sh` | Invoke the shared bundled CLI with private Node, managed workspace/data paths, and installer transport. |
| `build.mjs` / `downloads.json` | Pin prerequisite identities and embed the matching published runtime checksum in the installer. |

The native wizard installs a **dedicated WSL 2 Ubuntu 24.04 x64 environment**. It invokes the existing Linux runtime and UI, rather than maintaining another application implementation. Existing Linux-only login-desktop and provider installation features motivate this default. Native Windows core support remains a separate [platform implementation](windows-native.md), with its own feature and verification limits. ARM64 is rejected by this first wizard because ordinary Chrome automatic installation on Linux ARM64 lacks the same supported path. [ADR 0143](../decisions/0143-windows-installation-wizard.md) records the alternatives and consequences.

The former [Mewnager application remains retired](windows-manager.md). The new Windows process provides installation and narrow browser-launch control, not a second settings, account, or server-management UI.

## Privilege and ownership

The installer runs as the signed-in Windows user. Only Microsoft's fixed WSL enabling operation requests UAC. Application provisioning and launches are not run as an elevated Windows app. No compiler, Rust, CMake, LLVM, or Visual Studio development tools are installed on the Windows host. The private environment receives runtime libraries and browsers; Mew's native dependencies arrive prebuilt.

Installation state lives under `%LOCALAPPDATA%\mew\windows-install`. Its protected ACL permits the current SID and SYSTEM. A SID-derived `Mew-<hash>` name separates this environment from existing distributions. Before changing it, setup verifies its Windows registration path, installation journal, and Linux `/opt/mew/.installation-id`. A conflicting distribution or ambiguous ownership fails without adopting, unregistering, or replacing it. Setup retries are serialized by an exclusive Windows file handle.

The app files live under `%LOCALAPPDATA%\Programs\Mew`. The wizard does not weaken machine-wide execution policies, Defender, or SmartScreen. Process-local script execution options do not change the saved PowerShell policy.

## Preparation, resume, and integrity

Setup journals pending, reboot, import, provision, and ready phases. Windows feature activation and WSL package installation have separate preparation checkpoints: a feature restart can continue into package installation, without repeating the same failed stage indefinitely. When Windows needs a restart, setup saves a copy of the same installer and a user-specific HKCU RunOnce entry. It does not force a reboot. After sign-in, the same wizard resumes; running it manually is also supported. Failure or cancellation preserves the existing environment and user data. Windows virtualization or policy restrictions remain actionable setup failures rather than hidden workarounds.

Ubuntu rootfs and private Node downloads use exact official URLs and pinned SHA-256 hashes. Mew uses the Linux x64 archive from `mew-cli-v<version>`. The installer builder requires that immutable runtime release to exist and embeds its checksum. Downloads are cached by checksum, extracted only after verification, and retried without accepting partial files. The CLI dependency tree is bundled at build time; user machines do not run `npm install` or compile dependencies. Checksums provide transfer integrity; release signing and protected publication provide a separate publisher boundary.

The compiler download follows [Inno Setup's publisher-verification guidance](https://jrsoftware.org/isdl-verify.php). Preserve its built-in copyright and website notices under the [Inno Setup license](https://jrsoftware.org/files/is/license.txt). Private distribution import and explicit version selection follow [Microsoft's WSL command contract](https://learn.microsoft.com/en-us/windows/wsl/basic-commands#import-a-distribution).

Executables live in root-owned `/opt/mew/versions/<version>`. Each prepared version records hashes for its regular files in `.integrity.sha256`. Repair verifies those hashes, the runtime identity, and non-launching CLI/Node version checks, so readable but truncated files cannot pass merely because a completion marker remains. Accounts, projects, user-installed tools, and browser state live under the non-root `/home/mew` user, outside those version folders. The default workspace is `/home/mew/workspace`, retaining Linux filesystem behavior for Linux tools rather than placing it under a Windows-mounted drive. Repair stages a verified replacement within the version area and preserves `/home/mew`.

An interrupted initial import with no distribution registration can quarantine its nonempty environment folder before retrying only when the protected journal identifies the importing phase and no prior active version. It preserves the quarantined files. Marker creation uses a temporary file and rename and can resume an empty, non-symlink directory; arbitrary nonempty directories remain conflicts.

Remote desktop retains its [verified Windows helper package](remote-desktop-windows-setup.md) and existing feature installation/permission flow. The wizard does not install a virtual display driver or silently approve OS permissions.

## Launch and first use

The shortcut runs an unelevated controller. One controller per Windows SID owns its CLI process. Repeated shortcut launches request another local address through the private named-pipe channel rather than creating a competing server. The controller consumes structured CLI responses in memory and opens the Windows browser only after readiness. It validates the loopback host, HTTP scheme, port, path, and exact setup-fragment shape. It never persists or logs a setup URL.

The shared [first-administrator contract](first-owner-setup.md) owns enrollment and the private stdin/stdout protocol. Reopening unfinished setup rotates its capability through trusted CLI-host IPC without restarting Mew. An initialized installation receives only its base URL. Reopen errors use a fixed safe response and visible recovery guidance while preserving the running host; pending requests have bounded waits. Closing the controller's input requests graceful shutdown of the CLI host it owns. This is not an automatic startup service or permission to stop unrelated instances.

## Reinstall, update, and removal

Rerunning setup reuses the owned environment and preserves existing accounts and projects. Executable repair happens inside the version area. The release runtime and private Node identities remain fixed; updates require a matching new installer/runtime version. The journal retains the last verified active version separately from provisioning progress. A failed or interrupted upgrade can still launch that old version after verifying its saved identity and file integrity. Active metadata changes only after the replacement passes verification. Running versions are not forcibly restarted through an automatic updater.

Uninstall removes the Windows launcher and shortcuts and clears only its own matching resume entry. It deliberately leaves the dedicated environment, accounts, projects, and running processes intact. Destructive removal or migration of that environment is a separate explicit operator action. Existing Mewnager or manually installed WSL environments are neither migrated nor deleted.

## Verification boundary

Isolated tests cover plan decisions, ownership conflicts, restart resume, pinned downloads, protocol validation, and data-preserving paths. PowerShell parsing and mocked Windows execution do not establish successful WSL import, UAC handling, reboot resume, browser forwarding, distribution repair, signing, or a usable clean-host app. Those require the Windows acceptance matrix in the release procedure. No application deployment, launcher execution, or host WSL modification is authorized by tests or builds in this repository.
