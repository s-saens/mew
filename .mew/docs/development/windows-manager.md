---
title: "mewnager retirement notice"
description: "Preserves the Mewnager retirement notice and links its history, native Windows core, and the later installation-only WSL wizard without restoring the management app."
updated: "2026-11-05"
---

mewnager was retired on 2026-10-14. The app source, builds, and CI are removed, and the direction is unified around the shared mew CLI and Windows native execution layer. WSL distributions, projects, and accounts on existing PCs are not deleted.

The native execution implementation follows [Windows native](windows-native.md). A later user request adds a [single-file Windows installation wizard](windows-installer.md) under [ADR 0143](../decisions/0143-windows-installation-wizard.md). It prepares a private WSL environment through the shared CLI and provides a narrow launch shortcut; it does not recreate the former Tauri management application. Public publication and clean-Windows acceptance are still pending.

Previous content is preserved in [historical materials](../history/windows-manager-development.md), and the decision in [ADR 0210](../history/decisions/0210-mew-retire-mewnager.md).
