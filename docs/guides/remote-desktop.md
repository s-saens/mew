---
title: "Remote Desktop Setup and Controls"
created: 2026-09-12
updated: "2026-10-24"
description: "Explains how to open the server's logged-in desktop from a PC or mobile device, the Rust helper app's build tools, OS permissions, and direct connection requirements, plus the on-screen keyboard, clipboard, and touch controls. Covers the comparison criteria for native FHD resolution and high image quality, quality/speed priority options, and actual performance limitations."
상위파일: "MOC.md"
---

Click **Remote Desktop** in the hamburger menu on PC or mobile. It does not appear in the Dock. Remote desktop feature permission is required and is granted to managers and owners by default. It fills the entire screen independently of work panels, sharing the logged-in desktop on Mac/Linux servers or the Windows desktop on WSL. Only one connection can be used across the entire server.

This is separate from [Mewlink](getting-started-ko.md#connect-remotely), which provides access to Mew documents and terminals. Headless Linux servers and containers have no desktop to share, and login screens, lock screens, and UAC screens are not supported. See the [development contract](../../.mew/docs/development/remote-desktop.md#verification) for the actual OS and high-resolution verification scope.

[First Connection and Permissions](#first-connection) · [Image Quality, Keyboard, and Clipboard](#display-and-settings) · [Touch Controls](#mouse-and-touch) · [Connection Failures and Networking](#network-and-configuration)

## First Connection

1. Log in to the server computer's desktop and check the OS-specific prerequisites below. Grant screen and input permissions on the **server computer**, rather than the phone used to connect.
2. Open **Menu → Remote Desktop** in Mew. If components are missing, preparation begins. Check progress and errors in **View Setup Details**.
3. Once screen and input are connected, select a monitor in **Settings → Shared Screen**. First check the connection using the defaults of FHD, 60 FPS, and Balanced, then adjust image quality.
4. When finished, use **Close** at the top to end the connection. The Mew server continues running after Remote Desktop is closed.

`./mew setup` installs the required helper app components in advance. It prepares components for the host OS on Mac/Linux and for Windows on WSL, with no need to run a separate app or npm command manually. The initial download may take a few minutes, and progress appears in the setup terminal. This step does not start screen capture or input control. Preparing installation files is separate from OS login, libraries, and permission approval listed in the table below.

On Mac, continue through [Permission Setup](#mac-permission-setup) below after installation. If helper app installation or permission setup fails during setup, a warning appears and Mew installation continues (Ctrl+C also stops setup). For older installations, missing components, or required updates, opening **Remote Desktop** from the hamburger menu automatically installs them before connecting. Click **View Setup Details** to check progress in the internal tmux session. If Mac permissions are insufficient, prepare them with `./mew desktop-setup` and reconnect.

**Close** in the log window lets preparation continue; **Exit** also stops preparation. Preparation continues even if you close Remote Desktop. Reopening it resumes waiting for the ongoing task. If it fails, check the error in the log and click **Reconnect**. Failed tasks are not retried indefinitely.

On Windows/WSL, the installed helper host is prepared in advance with the Mew server and reused for each connection. It does not capture or encode the screen while idle. Closing the screen releases input, capture, and encoder resources, and the GPU device is reused on the next connection. Initial installation, OS login, permission approval, and network connection require additional time.

When turning off a monitor on Windows removes the active display, Mew provides its own **Mew Virtual Display** option. It does not depend on StarDesk and requires a separate signed driver to be installed once with administrator privileges. **Currently, only source, build, and installation paths are provided; an officially signed package and headless testing on physical hardware are not ready.** Follow the [signing, installation, and verification procedure](../../.mew/docs/development/remote-desktop-virtual-display.md). After installation, selecting **Mew Virtual Display** under Shared Display creates a separate extended display only while connected. Windows remaining on the physical display are not automatically duplicated.

When Mew code is updated, component versions are also checked automatically. If dependencies are unchanged, the installed runtime is reused. The connection starts automatically when preparation finishes, so there is no need to close the terminal and click Reconnect.

Video and input are transmitted over a direct WebRTC connection between the browser and host. If a direct connection cannot be established, network recovery guidance is displayed. Video is not relayed through the server.

Once the initial screen and input are ready, the remotely accessed PC displays a **mew Remote Desktop Connected** system notification once per connection. Reconnecting triggers another notification. It may not appear if OS notifications are disabled or Do Not Disturb is enabled.

All server environments require Rust stable, CMake, libclang, a C++ compiler, and Perl. On WSL, install these tools on the **Windows side**. The initial Rust engine compilation takes additional time; if tools are missing, the preparation log shows the reason for failure. Preparing components does not start screen capture. See [engine installation and verification scope](../../.mew/docs/development/remote-desktop-rust.md).

| Server environment | Required OS setup |
| --- | --- |
| Mac | Requires macOS 13 (Ventura) or later, Apple Silicon arm64 or Intel x64, and Apple Command Line Tools (`xcode-select --install`). The native capture module is compiled during preparation. Log in to the desktop. In System Settings on the server Mac, opened by setup or desktop-setup, grant MewDesktop **Accessibility** and **Screen Recording** permissions. Remote Desktop connects after approval is detected |
| Linux X11 | Supports x64/arm64 Linux desktops. Requires DISPLAY/Xauthority from the logged-in user's environment, GStreamer 1.24 or later, a VA-API or NVENC hardware encoder, libX11, libXtst, and a screen-lock D-Bus service. Debian/Ubuntu input libraries: `libx11-6 libxtst6` |
| Linux Wayland | Supports x64/arm64 Linux desktops. Requires the logged-in user's D-Bus, PipeWire, xdg-desktop-portal, and compositor RemoteDesktop support. Approve screen sharing and the separate remote input request. Control the cursor through relative movement with the touchpad or joystick; keyboard input also requires approval of its permission |
| WSL | Log in to Windows as the same user and enable WSL interop. Mew automatically prepares a dedicated Windows Node/npm runtime. Windows Task Scheduler must allow tasks to run as the current user. Requires Visual Studio C++ Build Tools, Windows SDK, and a hardware H.264 encoder |

On WSL, you **can start or restart Mew inside tmux**. Even if started in Windows session 0, capture runs on the current Windows account's logged-in desktop through a temporary task when connecting. No login password, permanent service, or login startup entry is registered. The resident host is maintained only for the lifetime of the Mew server. Logged-out, pre-login, lock, and UAC screens are outside the supported scope.

On Windows/WSL, installation prepares permission for the helper app `runtime/node.exe` to receive UDP through **Windows UAC approval on the Mew server PC**. You must approve the prompt; if canceled, you can request it again with `desktop-setup`. Existing app blocking rules and organizational policies are not changed automatically. If **Blocked by Windows Firewall** guidance appears, check the relevant blocking policy. Preparing installation files and successfully obtaining network approval are treated separately, and the absence of an explicit inbound allow rule is also shown in direct connection failure guidance.

Windows files are prepared in `%LOCALAPPDATA%\Mew\remote-desktop`. PowerShell is located on the mounted Windows drive even if it is not in PATH. If the Windows drive or interop is disconnected, follow the connection error guidance. Servers/containers without a Linux GUI have no desktop to share, and the WSLg screen is not shown as a substitute for the full Windows desktop.

Mac/Linux also connect directly using hardware H.264 through Mew's resident native helper app. Follow the [OS-specific installation requirements](../../.mew/docs/development/remote-desktop-posix.md#installation-and-permissions). On Linux, the Mew server must also run in the logged-in desktop user's environment. Revoking sharing or input permission on Wayland ends the connection. See the [development documentation](../../.mew/docs/development/remote-desktop.md#verification) for areas still awaiting testing on actual Mac and Wayland systems.

On macOS 15 or later, separate approval may be required under **Privacy & Security → Local Network** for Mew Desktop or the app that launched it, as listed by the OS. If the Mac firewall asks whether to allow incoming connections, allow MewDesktop. Automatic router mapping on Linux requires `iproute2`. If UFW/firewalld policies block incoming UDP, the policy on that PC must also permit it. Temporary router mappings do not change these OS policies, and failed queries in read-only diagnostics are not treated as installation failures.

Manual preparation remains available for diagnostics. You can run `npm run desktop:install` in the Mew repository. The user builds the app and restarts the server according to the [execution and verification rules](../../.mew/docs/development/getting-started.md).

### Mac Permission Setup

This is included in `./mew setup`. If the Mew server is already running, run only the following command in a Mew terminal in the **Mew installation folder** or in a local terminal on the same Mac. If the current project folder is elsewhere, first change to the Mew installation folder.

```bash
./mew desktop-setup
```

The process proceeds through helper app installation → permission checks → opening required settings → detecting approval. **Approval prompts appear on the Mew server Mac's desktop, rather than on the connected phone or PC or inside the terminal.** Run as the same OS user logged in to the desktop, without `sudo`.

- Permissions already granted are not requested again. If permissions are missing, settings open in the order **Accessibility → Screen Recording**, and the user grants permission to the MewDesktop helper app.
- The terminal displays each permission's status and waits for up to 5 minutes. It finishes automatically when approval is detected. Even if the Mac requires **Quit & Reopen**, permissions are checked again with a new helper process. The Mew server is not restarted.
- When the completion message appears, open Remote Desktop in Mew or reconnect. This command itself does not start screen capture or remote input.
- Denial, timeout, a logged-in user mismatch, or management policy restrictions are marked incomplete. Installation files remain even if you interrupt with Ctrl+C; retry with the same command. `desktop-setup` exits with a failure code if incomplete.

The installation completion marker indicates only that files are ready. Permissions are checked with the OS each time; commands do not substitute for user approval or modify the permission database. In login environments where the terminal cannot open settings, check MewDesktop permissions directly in System Settings on the server Mac, then run the command again. The [development contract](../../.mew/docs/development/remote-desktop.md#mac-terminal-permission-preparation) defines the scope of testing on physical Macs.

## On-screen keyboard

Open it with the **On-Screen Keyboard** button at the top and select **Full Keyboard** or **Gaming**. You can still open it manually with this button after a physical keyboard is detected.

- **Full Keyboard**: Provides letters, numbers, F1–F12, editing/navigation keys, a numeric keypad, and Korean/English and Hanja keys. Ctrl, Shift, Alt, and Meta stay pressed when tapped once and release when tapped again, allowing combinations with other keys. On narrow or short screens, scroll within the keyboard to access the remaining keys.
- **Gaming**: Provides Q/W/E, A/S/D, and F/G/Space as the default layout. You can press multiple keys simultaneously or hold them down. Use the pencil button to change the key in each position, and use **Add Key**, Delete, and **Reset** to configure 1–24 keys. Select **Done** to return to the controls. Modifier keys in gaming mode release when you lift your finger.

Enabling **Keyboard Only** (the closed-eye icon) hides the remote video and virtual mouse, letting the keyboard use the remaining space. Both Full Keyboard and Gaming modes support this. Press the same button again or close the keyboard to restore the remote screen. Video reception and the connection remain active, and keystrokes continue to be sent. If the connection drops, reconnection guidance appears.

The selected mode, gaming key layout, and Keyboard Only setting are saved in browser storage for the current account and instance. Relevant keys are released when you lift your finger, a touch is canceled, the keyboard closes, the mode/layout changes, the display rotates, fullscreen toggles, focus is lost, or the connection ends. Actual input support depends on the remote OS and keyboard layout. This does not bypass OS security key combinations.

## Controls

You can select other panels from the bottom dock on the mobile remote screen as well. Switching to another panel ends the remote connection. Enabling **Fullscreen** hides the dock; exiting fullscreen restores it. The dock is also hidden while the keyboard is open.

### Display and Settings

The top tools are ordered **Fit → Input → Help → Rotate → Fullscreen → Settings → Close**. The Fullscreen button also hides the browser's address bar and tabs. Use the exit button to return; guidance appears if fullscreen is unsupported or the transition is denied. The Rotate button rotates the entire panel clockwise in 90-degree increments, including remote video, mouse, hotkeys, toolbar, and settings (0, 90, 180, and 270 degrees). It does not change host monitor settings. Rotating resets zoom and pan to Fit and control positions to the default layout. Direct click positions, the cursor, and drag directions remain aligned in the rotated video.

In **Settings**, select mouse cursor sensitivity (0.5–6×), shared display, video resolution, target FPS, video quality, transmission priority, and the hotkey modifier (Ctrl or Cmd on Mac). Cursor sensitivity defaults to **3×** and applies immediately to the cursor movement pad, dragging with the three buttons, and arrow-key movement. **Speed-proportional acceleration** moves the cursor farther the faster you swipe the pad with touch or a mouse. Moving the same 100 px in 0.05 seconds moves the cursor 10 times as far as moving it in 0.5 seconds (before reaching the screen edge). Move slowly for precise control; the cursor stops when you stop. The slider multiplier is applied to the accelerated movement. Arrow keys use only the sensitivity multiplier, without acceleration based on repeat speed. This does not change coordinates when pointing directly at the screen with a mouse, wheel speed, panning speed, or zoom speed. Sensitivity and video settings are saved in this browser. **Reset Sensitivity** restores 3×, and **Reset Button Positions** returns the mouse and hotkeys to their initial positions. **Reconnect** is also in Settings.

Choose video resolution from **HD, FHD, QHD, and 4K**; target FPS from **30, 60, 120, 144, 165, and 240**; and quality from **Balanced and High Quality**. Changing these reconnects to the same display. The default is FHD, 60 FPS, Balanced. High Quality requests a higher encoder bitrate. **Transmission Priority → Prioritize Quality** waits longer to transmit a frame for better clarity, while **Prioritize Speed** uses a shorter wait to prioritize responsiveness. Both modes reduce encoder output and transmission volume when the connection slows, so quality or FPS may decrease. Prioritize Quality does not wait several seconds to transmit ordinary frames, and it retains the configured resolution. Transmission limits follow the [development contract](../../.mew/docs/development/remote-desktop.md#transport-and-latency). The default is Prioritize Speed; previously saved High Quality settings without a priority are restored as Prioritize Quality. For clearer text, select High Quality and Prioritize Quality, but also check the actual received resolution and connection conditions. On very slow or highly lossy connections, both modes may discard and recover frames.

Selecting high resolution and high FPS together adjusts them to what the display, GPU, and browser support. In current Chromium, an FHD 240 request may drop to 165 FPS, a QHD 165 request to 144 FPS, and a 4K 144 request to 60 FPS.

To compare FHD at native size, set the remote display to 1920×1080 and start with **FHD, 60 FPS, High Quality**. Check that the actual received dimensions in the statistics are also 1920×1080. This mode initially requests 12 Mbps for video, excluding headers, retransmissions, and other overhead. Compare static text and scrolling separately using the same device, display scale, and network. Transmission overlaps preparation of the next frame, but compression is adjusted under actual congestion; High Quality does not mean lossless transmission. [FHD verification scope](../../.mew/docs/development/remote-desktop.md#stage-by-stage-diagnostics-and-fhd-verification) distinguishes synthetic checks from performance on actual devices.

In the Settings statistics, check **actual received resolution, received FPS / applied target FPS, round-trip time, Mbps, and transmission wait**. Received FPS counts decoded frames, so a lower value when the screen is static is normal. Round-trip time is network RTT and differs from the delay between a click and its appearance on screen. To actually see 144 FPS or more, the remote display, encoder, this device's decoder, and display refresh rate must also keep up. Video settings do not change the monitor refresh rate; the current **Mew Virtual Display** is 1080p at 60 Hz. See the [verification scope](../../.mew/docs/development/remote-desktop.md#verification) for actual hardware performance at high refresh rates and 4K.

The vertical **Hotkeys** bar on the left provides Esc, Tab, Enter, Backspace, Copy, Paste, Undo, and Switch Apps. It sends Ctrl or Cmd combinations according to the modifier selected in Settings. The Paste hotkey uses the **remote computer's clipboard**. To send text from your device, use the Input window at the top. Press the up arrow to collapse or expand the hotkey list. Even when collapsed, you can move the bar by dragging its bottom handle or focusing it and pressing the arrow keys. When the screen size changes, the bar is kept within the screen; on short landscape screens, the hotkey list scrolls.

When the remote screen has focus, Esc is also sent remotely. If Settings, Input, or Help is open, Esc or Back closes that window first. In fullscreen, it exits fullscreen first; in normal mode, it closes the remote connection. **Remote Esc** on the left sends Escape to the remote computer without closing the viewer.

### Mouse and Touch

The virtual mouse controls hide automatically when a mouse or trackpad is detected. They reappear when the browser reports that a pointer has disconnected, or when you touch the screen while no mouse is detected. Typing once on the remote screen hides the left hotkey bar. Browsers do not directly report keyboard connection or disconnection, so the hotkeys reappear when you close and reopen the screen. Keyboard detection does not affect mouse visibility.

The controls at the bottom right are shaped like a mouse. The top has left click (1), wheel (2), and right click (3); the bottom combines three cells into cursor movement (0). Pan (4) and Zoom (5) are placed in the right container, with the repositioning handle below it. The combined height of the right container and handle matches the mouse on the left.

```text
┌────┬────┬────┐
│ 1  │ 2  │ 3  │   4
├────┴────┴────┤
│      0      │   5
└─────────────┘
```

Like a touchpad, the cursor moves according to how far and how fast your finger moves. The cursor stops when your finger stops, without needing to return to the center. You can lift your finger and place it down again to continue moving. Left- and right-button dragging, and middle-button dragging by holding the wheel, also respond only to the distance moved.

**Wheel, Pan, and Zoom are speed joysticks**. Once you start pushing, speed increases gradually as you move farther from the control's center, and operation continues while you hold that position. The speed increase and maximum speed at larger distances are reduced to prevent excessive speed. Return near the center or lift your finger to stop. Wheel and Zoom use only vertical movement. The mouse controls and left hotkey bar have translucent backgrounds that show the remote screen through them while keeping text and icons clear.

| Joystick | Quick tap | Push immediately | Hold briefly, then push |
| --- | --- | --- | --- |
| 1 Left Click | Left click | Move while holding the left button | Same |
| 2 Wheel | Middle click | Push up or down and hold: continuous scrolling | Move in any direction while holding the middle button |
| 3 Right Click | Right click | Move while holding the right button | Same |
| 0 Cursor Movement | No click | Move the cursor only | Same |
| 4 Pan | — | Push and hold: continuously move the viewing position on the zoomed screen | Same |
| 5 Zoom In/Out | — | Push up and hold: zoom in; hold down: zoom out | Same |

The left- and right-click joysticks press the button immediately when movement starts. Middle-button dragging with the wheel starts after holding for about 0.32 seconds. The color changes while a button is held; lifting your finger or canceling releases it. Dragging the final **handle** moves the control group together and keeps it within the screen. You can also focus a joystick or handle and operate it with the arrow keys. On the left- and right-click joysticks, dragging continues while arrow keys are held and releases when all arrow keys are released or focus moves elsewhere.

On a phone, swipe the remote screen itself to pan and use two fingers to zoom. Use the joysticks for remote clicks. **Fit** resets zoom and pan. Zoom ranges from 1–6× and does not change the remote resolution.

With a mouse, you can move the cursor and click directly on the screen. Wayland uses joystick-based relative movement. To type, select the screen first. Remote input takes priority over mew tab shortcuts, so Ctrl/Cmd+W, N, Shift+N, T, number keys, and Tab, as well as Esc and F6, are sent to the remote computer; select tools and close controls with the mouse. When you enter fullscreen using the **viewer's fullscreen button** and select the remote screen, supported browsers on HTTPS/localhost request a lock for all permitted keys. Fullscreen entered with F11 alone cannot substitute for this. No separate keyboard helper app needs to be installed on the client. Outside fullscreen or in unsupported browsers, some reserved keys do not reach the webpage, and Ctrl+Alt+Delete, as well as the Windows key and Alt+Tab depending on the environment, may be handled by the local OS. In Chrome, hold Esc to release the fullscreen lock. Leaving remote focus returns to the lock for mew's internal tab shortcuts in fullscreen. **Input → Paste** overwrites the remote clipboard with the text you entered and pastes it. **Remote Esc** in the same window sends the Escape key to the remote computer.

On the remote screen, Ctrl/Cmd+C or X retrieves remote text into your clipboard, and Ctrl/Cmd+V pastes text from your clipboard remotely. You must grant clipboard permission in the browser, and HTTPS or localhost is required. If automatic sharing fails, a remote Ctrl/Cmd+V is sent to paste the existing contents of the remote clipboard. You can retry with **Input → Get Remote Clipboard / Paste My Clipboard** or use the existing text input. Only text up to 4096 code units is shared; images and files are not supported.

On supported displays on Windows/WSL and macOS, the cursor appears immediately on your device without waiting for a video update. Windows separates the cursor from GPU capture and displays error guidance if hardware capture or encoding cannot be prepared. After connecting, check **Help → Cursor Display** to see whether this is actually active. **Displayed Instantly on This Device** indicates a local cursor; **Included in Video** indicates the existing video cursor. Hover, click, and drag actions are sent to the remote computer. Video transmission pauses when the screen is unchanged and resumes when it changes. Mac uses ScreenCaptureKit to separate the screen and cursor. Unsupported displays, displays where initial capture fails, and Linux use the existing video cursor.

If multiple displays are available to share, switch using the **Shared Display** selector in Settings. This ends the previous connection and connects to the new display. When no auxiliary window is open, fullscreen is off, and a tool has focus, Esc or mobile Back ends the connection. Close at the top ends the connection immediately. Moving to the background ends the connection; press **Reconnect** when you return.

## Network and Configuration

**Connections are direct, without a separate relay/TURN server.** Login and negotiation use the existing Mew HTTPS/WebSocket connection, but video and input do not pass through it. The two devices must be able to reach each other over UDP. Mew first attempts a direct STUN connection; if delayed, it automatically requests a short-lived temporary NAT mapping from the router. Manually specifying ports is not the default procedure. Direct connections may fail with unsupported CGNAT or corporate firewalls. Access through an HTTPS tunnel does not guarantee a video connection.

All supported operating systems use direct connections with hardware H.264 and can request up to 4K at 240 FPS. Actual applied values, received FPS, and input latency vary by device, browser, and network. A browser supporting H.264 and a working GPU driver are required.

`MEW_DESKTOP_ICE_SERVERS` defaults to Google's public STUN server `stun:stun.l.google.com:19302` and Cloudflare's `stun:stun.cloudflare.com:3478`. These only identify external addresses and do not relay video or input. Specify `[]` if you do not want external lookups. Only `stun:` and `stuns:` are allowed; TURN is rejected. Automatic temporary router mapping can be disabled separately with `MEW_DESKTOP_AUTO_NAT=0`.

You can fix the native host's UDP port on supported operating systems, for example with `MEW_DESKTOP_UDP_PORT=50020`. Use the same setting when a firewall administrator requires allowing a specific port. A fixed manual router mapping is an operator option. See the [external direct connection documentation](../../.mew/docs/development/remote-desktop-connectivity.md) for the approval and support scope of default automatic connections. With CGNAT, router mapping alone does not provide a public IPv4 address.

`MEW_DESKTOP_HELPER_DIR` is an optional setting that changes the installation location. Use an absolute path on Mac/Linux or a Windows absolute path such as `C:\…` on WSL. Both the installation button and manual installation copy and install the helper app to this location, and connections use the same location.

HTTPS proxies/tunnels forward only login and connection negotiation. See [environment variables](../configuration/environment.md), [verification scope and unsupported screens](../../.mew/docs/development/remote-desktop.md), and [distribution licenses](../../.mew/docs/development/remote-desktop-distribution.md).
