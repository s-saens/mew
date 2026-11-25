---
title: "0216: Allow local homepage controls"
description: "Allows an exact-path homepage script for a persistent theme switch and clipboard copy, while retaining static delivery and keeping account requests outside the homepage."
status: accepted
date: "2026-11-25"
---

# Allow local homepage controls

## Context

The [public homepage](../features/mew-run-homepage.md) previously shipped with scripts disabled by its content security policy. The setup guide needs a one-click copy action for the install command and a theme switch that remembers the visitor’s choice.

## Decision

Keep the public page in the static asset binding and allow only its exact, same-origin controls script in `script-src`. The script stores the theme in browser storage and uses the clipboard API on request. The rest of the policy continues to block account requests and framing. The standalone preview embeds the same script with its other offline assets.

This replaces the original script-free implementation. The origin, compatibility, and account boundaries in [ADR 0167](0167-homepage-and-mewlink-subdomain.md) still apply.

## Alternatives and consequences

CSS can follow the device theme and allow a temporary theme change. A script also supports persistence and copying. Reusing a management bundle would add dependencies and account-facing code to a static guide. The dedicated script gives both controls a small scope. If scripting or storage is disabled, the installation and connection steps remain usable and the theme starts from the device preference.
