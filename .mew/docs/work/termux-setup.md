---
title: "Termux setup prerequisites"
description: "Records the Termux source setup prerequisite detection and package-install changes, local verification, and remaining Android installation limits."
created: "2026-11-16"
updated: "2026-11-16"
---

# Termux setup prerequisites

Source setup treated Termux as ordinary Linux, offering nvm for Node and `sudo apt` for build tools. The setup script now detects a native Termux environment and offers `pkg` installation of Node LTS and npm, or the missing compiler, make, Python, and tmux. It checks the Node version after installation and provides manual commands when installation is declined or noninteractive. The [installation guide](../../../docs/guides/getting-started-en.md#termux-on-android) owns user-facing instructions and limitations.

Local verification: six prerequisite regression checks passed with mocked package commands; `bash -n mew`, scoped oxlint, `git diff --check`, and `npm run build` passed. Documentation metadata validation passed, but the repository-wide link check reported existing missing MOC and decision links and an unrelated absolute task asset link. No actual Termux package installation, Android device test, launcher execution, deployment, or server lifecycle operation was performed. Full source installation remains unverified on Android; native npm modules and mandatory browser preparation remain potential blockers.
