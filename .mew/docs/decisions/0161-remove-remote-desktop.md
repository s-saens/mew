---
title: "Remove integrated remote desktop"
description: "Records removal of Mew's integrated remote desktop, native helpers, setup and release pipeline, and the resulting boundary with browser-based workspace access."
created: "2026-11-10"
updated: "2026-11-10"
---

## Status

Accepted. Supersedes the remote desktop integration decisions in [ADR 0024](0024-remote-desktop-fhd-pipeline.md), [ADR 0059](0059-remote-desktop-rust-engine.md), [ADR 0140](0140-windows-desktop-prebuilt-packages.md), and [ADR 0158](0158-remote-desktop-feedback-timing.md). Their historical rationale remains available.

## Context

Mew's integrated remote desktop required native capture and input helpers, operating-system permissions, direct network connections, and Windows packages matched to helper source revisions. Maintaining and publishing this separate system added operational work and could block setup when an exact package was unavailable. The project owner requested removing the integration.

## Decision

Remove the remote desktop viewer, server integration, native helpers, installer and release pipeline from Mew. Retain the independent host Browser and Mewlink workspace access under their own contracts. Previous remote desktop documentation remains as historical evidence and is not an operating guide.

## Alternatives and consequences

Continuing the integration or separating its release process would retain desktop access inside Mew but also retain the native and distribution maintenance burden. Removing it means users must choose a separate desktop access product if they need one. Previously installed components and published packages are outside this source change; this decision does not claim they have been uninstalled or withdrawn. Applying the source change to a running installation remains an operator action.
