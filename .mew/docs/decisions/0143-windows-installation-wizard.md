---
title: "0143: Guide Windows installation through a private WSL runtime"
description: "Accepts a native x64 setup wizard that owns an isolated WSL 2 runtime and invokes the shared prebuilt CLI. Adds installation-only launch control after Mewnager retirement while preserving native Windows code, user data, and publication gates."
status: accepted
date: "2026-11-05"
---

# 0143: Guide Windows installation through a private WSL runtime

## Context

The user requested one Windows installer that handles WSL and dependencies, then opens browser account creation. Installing Rust or other build tools on the user's Windows desktop is not an acceptable ordinary installation path. [ADR 0140](0140-windows-desktop-prebuilt-packages.md) already moves the Windows remote-desktop helper to prebuilt packages.

The shared native Windows implementation exists, but login-desktop and some provider installers still depend on Linux facilities. [ADR 0210](../history/decisions/0210-mew-retire-mewnager.md) retired the separate Tauri management app and requires a new explicit decision for any reintroduction. The requested installation experience does not require restoring that app's management surface.

## Decision

Provide a native Inno Setup wizard for Windows x64 that prepares a dedicated Ubuntu 24.04 WSL 2 environment and runs the shared prebuilt Linux CLI. The wizard owns only installation, restart resume, and a narrow launch controller. The browser remains the product UI, including [first-owner setup](../development/first-owner-setup.md). Retain the native Windows platform code and its independent acceptance gates.

Run as the current Windows user, elevate only the fixed WSL enabling operation, and resume the same wizard after a user-approved reboot. Bind the distribution to a protected SID-specific journal, registration path, and installation marker. Never adopt an unrelated distribution. Pin official prerequisite downloads and the matching immutable runtime archive. Keep executable versions separate from the non-root user home, and preserve accounts/projects through retries, repair, and uninstall.

Use a private per-user local controller and the CLI's structured installer channel for readiness and reopening. Tokens stay in memory and browser fragments, with no token file or public setup-minting endpoint. The wizard installs runtime components, not a developer toolchain. Public installer publication requires Authenticode verification, protected release approval, and clean-Windows acceptance.

This decision partially extends the delivery direction of ADR 0210: installation-only Windows GUI and managed WSL are now explicitly authorized. The Mewnager code removal, preservation of existing user data, and rejection of a duplicate management app remain in force. The [installer contract](../development/windows-installer.md) owns implementation and operational details.

## Alternatives

- Automatically install Rust, Visual Studio, and build prerequisites on the user host: increases setup cost and couples ordinary installation to compilation.
- Make native Windows the only wizard backend now: requires completing the remaining Linux-specific features before matching the existing installation experience.
- Restore the former Tauri manager: duplicates lifecycle/settings work and introduces another app and build chain.
- Require a terminal or Microsoft Store distribution setup: leaves the internal dependency work with the user.

## Consequences

The normal path becomes setup → required Windows approval/restart → browser administrator creation. WSL still consumes disk and runtime resources; the wizard hides routine preparation, not the underlying runtime. Default Linux home storage avoids crossing the Windows/Linux filesystem for normal project work. Performance is not claimed to have been benchmarked.

The first wizard is x64-only and needs network access. OS policy, disabled virtualization, signing credentials, first runtime publication, and clean-machine verification remain release concerns. Uninstall preserves the environment, so disk reclamation is an explicit separate action. The [work record](../work/guided-installation-and-first-owner.md) distinguishes local verification from publication and actual Windows installation.
