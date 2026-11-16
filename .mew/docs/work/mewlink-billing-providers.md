---
title: "Mewlink billing provider implementation"
description: "Records local multi-provider billing implementation, migration checks, verification, and remaining provider and reconciliation limits."
created: "2026-11-16"
updated: "2026-11-16"
---

# Mewlink billing provider implementation

Added provider adapters and local billing records in the private central repository. The [billing contract](../development/mewlink-billing.md) owns behavior and the [setup guide](../operations/mewlink-billing.md) lists operator actions.

Local checks passed: root and central builds, central type checks, 28 billing and Worker tests, eight browser, unit, and SQLite migration tests, and root lint with existing warnings. The full central suite passed 259 tests and failed two pre-existing removed-port-route tests. Documentation descriptions passed; the link check reported 39 pre-existing errors.

Actual provider accounts, checkout, and deployment were not tested. Missing webhooks and pre-existing provider transactions are not automatically imported or reconciled; D1 backup is an operator responsibility. Lemon checkout links can be reused until expiry, so provider-side double charging remains possible. No paid product or feature enforcement is defined. Conflicting legacy Paddle customer ownership blocks migration and requires investigation.
