---
title: "Mewlink billing contract"
description: "Private Mewlink billing contract for Paddle, Polar, and Lemon Squeezy, including provider isolation, locally stored billing records, webhook handling, and rollout limits."
created: "2026-11-16"
updated: "2026-11-16"
---

# Mewlink billing contract

The private central service owns billing records. Its account settings page offers checkout through configured Paddle, Polar, and Lemon Squeezy providers and opens an existing subscription's original provider portal. Host workspace code and existing remote access remain unchanged. No price or paid feature is defined or enforced by this integration.

Provider adapters create checkouts for authenticated central accounts and verify webhook signatures. D1 retains provider-linked customers, transactions, subscriptions, entitlement state, event markers, and detected conflicts. A browser redirect never grants access. D1 is an operational copy, not a complete reconciled accounting ledger: delivery failures, refunds, and provider-specific records require monitoring and reconciliation. Back up D1 independently of the payment providers.

Providers stay disabled until configured. Sandbox and production require separate credentials and databases; do not enable real checkout until a paid benefit, account approval, configuration, and sandbox verification are complete. The integration does not automatically transfer an existing subscription or payment mandate to another provider. See [operator setup](../operations/mewlink-billing.md) and [ADR 0177](../decisions/0177-mewlink-multiple-billing-providers.md).

After a completed cancellation, a new checkout preserves the previous subscription association so delayed events cannot overwrite the new one. Lemon Squeezy checkout URLs can be reused until expiry; short expiry and local conflict detection cannot guarantee prevention of duplicate provider charges. An expired incomplete checkout, uncertain transaction creation, detected conflicts, and exhausted webhook retries require operator reconciliation. Real provider checkouts and production deployment remain unverified.
