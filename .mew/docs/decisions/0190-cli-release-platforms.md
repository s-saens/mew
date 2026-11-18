---
title: "0190: Publish CLI runtimes for Linux and macOS"
description: "Separates native Windows verification from the CLI release matrix and retains Windows installation through WSL. Supersedes the platform count in ADR 0180."
status: accepted
date: "2026-11-18"
---

# Publish CLI runtimes for Linux and macOS

## Context

The Windows npm installer and setup wizard use a Linux runtime in WSL. The earlier release procedure also required native Windows x64 and arm64 archives, so failures in an experimental host build blocked installations that used none of its binaries. [ADR 0143](0143-windows-installation-wizard.md) · [ADR 0179](0179-unattended-npm-installation.md).

## Decision

Publish Linux and macOS runtimes on x64 and arm64. Keep the native Windows implementation and its two architectures in a manually dispatched CI workflow. A successful native check produces an Actions artifact for maintainers. This supersedes the six-runtime matrix in [ADR 0180](0180-shell-bootstrap-installation.md).

## Alternatives and consequences

Keeping all six runtime builds in one release would couple WSL installation to native Windows acceptance. Removing the native implementation would discard the platform adapters and their tests. Independent verification preserves that work for a future native release and lets each public installer depend on the binaries it consumes. The signed Windows wizard keeps its own signing and acceptance process. [CLI release procedure](../operations/cli-release.md).
