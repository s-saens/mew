---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Dedicated virtual displays for Linux server browsers. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0163 — Dedicated virtual displays for Linux server browsers"
created: 2026-09-20
updated: 2026-09-20
---

- Date: 2026-09-20
- Status: Adopted
- Partially supersedes: [0129](0129-mew-browser-native-launch-cdp.md) — display target for windowed mode on Linux/WSL; direct launch, CDP, and per-account profiles remain
- Decision makers: User (requested that teammates' browser use not steal focus from the server desktop), Codex (implementation)

## Background

When teammates open the internal browser, new server Chromium windows and popups obscure the server user's work. The existing windowed mode is a launch method with confirmed successful Google login, so do not switch the default wholesale to headless.

## Decision

- When a regular server browser on Linux/WSL uses windowed mode, run it on a dedicated Xvfb instance per profile. Use `MEW_BROWSER_DISPLAY=desktop` to explicitly select the existing physical display. The default is `virtual`.
- Retain direct Chromium launch, CDP connections, sandboxing, profiles, and DOM relay. Explicitly select X11 to avoid connecting to the physical desktop through an inherited Wayland environment.
- Virtual displays use dynamic display numbers, temporary authentication cookies, and disabled TCP listening, and are cleaned up when the corresponding Chromium exits. If startup fails, do not silently fall back to the physical desktop or headless mode.
- `MEW_BROWSER_HEADLESS=1` continues to select execution without a GUI. macOS/Windows and the host restriction validation helper are outside the scope of this Linux-only change.
- Record launch settings and verification limitations in the [Project browser contract](../../../../docs/guides/browser.md).

## Rationale

An option to create tabs without activating them or merely minimizing windows cannot block both site popups and OS window activation. Isolating the browser on a virtual display preserves the site's original popup behavior while separating it from the server desktop. Xvfb must also be installed, and successful login to an actual provider requires separate user confirmation.
