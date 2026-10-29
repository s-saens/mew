---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew displays a reliable summary alongside the raw CLI account usage output. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0100 — mew displays a reliable summary alongside the raw CLI account usage output"
created: 2026-08-31
updated: 2026-09-11
---

- Date: 2026-08-31
- Status: Superseded by: 0104
- Supersession confirmed: 2026-09-11 — [0104](0104-mew-agent-account-usage-dashboard-link.md). CLI output parsing and the limit summary UI were removed. Current account queries follow 0130.
- Partially supersedes: [0098](0098-mew-agent-account-usage-cli-bridge.md) — the scope of displaying only raw output in the Info popup
- Decision makers: Song Sanghun (direction), Codex (implementation)

## Background

The CLI bridge in 0098 displayed the full terminal output in the Info popup without taking ownership of account credentials. Frequently checked values such as limits and reset times were mixed into text stripped of ANSI codes, making it difficult to quickly assess remaining usage. While refreshing server state, the CLI may not provide numbers, as with `refresh requested`.

## Options

1. Keep only the raw output — resilient to provider output changes, but requires reading the key values every time.
2. Read account credentials or the provider billing API directly — provides accurate structured data but breaks the credential boundary in 0098.
3. Summarize only limits and reset times that can be conservatively recognized in the permitted raw CLI output, and retain the raw output and a link to the official Usage dashboard.

## Decision

Adopt option 3.

- The server structures only `N% left|remaining` and the reset time on that line. It does not guess unrecognized formats, credits, or provider-specific values.
- When numbers are available, the Info popup shows the remaining percentage and reset time for each limit first, with the raw output available in a collapsed section.
- Do not draw empty gauges when the CLI is refreshing or provides no numbers. Show the `아직 수치 없음` state, a refresh action, and a link to the official Usage dashboard.
- Continue displaying raw output temporarily in the browser only; do not store it in Mew data, events, or logs. Do not make direct API calls or parse authentication stores.

## Rationale

Structured numbers represent only what the CLI actually displayed, allowing routine checks at a glance while respecting the credential boundary and CLI-first principle. Retaining the raw output also keeps CLI format changes and new items visible.
