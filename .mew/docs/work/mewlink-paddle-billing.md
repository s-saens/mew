---
title: "Mewlink Paddle billing implementation"
description: "Records the local Paddle subscription integration, isolated verification, and remaining product and rollout limits."
created: "2026-11-16"
updated: "2026-11-16"
---

# Mewlink Paddle billing implementation

Added opt-in checkout and subscription management to the private central service. The [contract](../development/mewlink-billing.md) defines the behavior; the [setup checklist](../operations/mewlink-billing.md) lists the operator's next steps.

Local checks passed: the root and central builds, central type checks, seven Workers/D1 tests, and six checkout/dashboard browser and unit tests. Root lint passed with existing warnings. Before the resubscription follow-up, the full central suite passed 238 tests and failed two existing port-preview admission tests that still expect removed routes. The repository documentation check reported 39 pre-existing link errors; descriptions passed. Actual Paddle sandbox, live checkout, and deployment have not been verified. Failed-event reconciliation remains a manual limitation.
