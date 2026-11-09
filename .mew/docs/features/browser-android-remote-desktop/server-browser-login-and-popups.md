---
id: "mew-remote-browser"
parent: "mew-remote"
title: "Host browser and login screens"
status: "implemented"
created: "2026-09-18"
updated: "2026-11-09"
description: "Current host Chrome Browser and login screen feature scope and permissions, with the removal of Mew Port and a link to the previous contract."
---

# Host browser and login screens

Browser and agent login screens use the same account-owned Chrome profile, native video and input. The `nativeBrowser` permission controls access. The [Browser contract](../../development/browser-desktop.md) and [user guide](../../../../docs/guides/browser.md) own behavior and prerequisites.

Mew Port, port discovery, command-port buttons, and the port shutdown action have been removed. Terminal links use normal viewing-device link behavior. See [ADR 0160](../../decisions/0160-remove-mew-port.md). The [former contract](browser-before-port-removal.md) is retained as history.
