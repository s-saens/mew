---
title: "Use Paddle for Mewlink subscriptions"
description: "Decision to integrate Paddle in the central Mewlink account service while keeping existing remote access free and billing disabled until configured."
created: "2026-11-16"
updated: "2026-11-16"
---

# Use Paddle for Mewlink subscriptions

Status: Accepted for local implementation; production application and product pricing remain pending.

## Context

Mewlink needs a subscription checkout for central accounts. Price and paid benefits are not yet specified, and existing users must retain access.

## Decision

Use Paddle in the independent central service. Bind server-created transactions to authenticated accounts and derive subscription status from verified webhooks. Keep billing disabled until configured; do not gate existing remote access. [Setup](../operations/mewlink-billing.md) and the [contract](../development/mewlink-billing.md) describe the resulting boundaries.

## Alternatives and consequences

Polar and a simultaneous two-provider launch were considered. Paddle supports Korean payment methods; starting with one provider reduces initial subscription and support complexity. A later provider needs its own account binding and lifecycle handling. Checkout requires Paddle approval and environment-specific setup; the implementation alone does not establish live payment readiness.
