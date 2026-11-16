---
title: "Mewlink billing contract"
description: "Central Mewlink Paddle subscription integration, account ownership, checkout and webhook boundaries, disabled default, and current limitations."
created: "2026-11-16"
updated: "2026-11-16"
---

# Mewlink billing contract

The private central service owns subscription records; the account settings page offers checkout and customer-portal links when configured. The host workspace and existing remote access remain unchanged. No price or paid feature is defined by this integration.

The server creates a Paddle transaction for an authenticated central account and retains the transaction association. Signed webhooks update subscription status; a browser redirect never grants access. Provider events can arrive more than once or out of order. The service keeps the existing transaction when creation fails ambiguously to avoid creating a duplicate chargeable checkout.

Paddle's public checkout page and notification endpoint are separate from authenticated account actions. Sandbox and production require separate credentials and databases. Do not enable real checkout until a paid benefit, account approval, configuration, and sandbox verification are complete. See [operator setup](../operations/mewlink-billing.md) and [ADR 0176](../decisions/0176-mewlink-paddle-billing.md).

After a completed cancellation, a new checkout preserves the previous subscription association so delayed events cannot overwrite the new one. Uncertain transaction creation and exhausted webhook retries require operator reconciliation. Paddle's real checkout, payment methods, and production deployment remain unverified.
