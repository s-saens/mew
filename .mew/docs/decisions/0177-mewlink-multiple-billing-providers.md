---
title: "Support multiple Mewlink billing providers"
description: "Decision to add Polar and Lemon Squeezy alongside Paddle, retain independent billing records, and route existing subscriptions to their original provider."
created: "2026-11-16"
updated: "2026-11-16"
---

# Support multiple Mewlink billing providers

Status: Accepted for local implementation; provider activation and production verification remain pending. This extends [ADR 0176](0176-mewlink-paddle-billing.md).

## Context

Mewlink needs an alternative checkout if a payment provider becomes unavailable. Customer and billing records must remain available independently of any one provider's dashboard.

## Decision

Keep billing implementation in the private Mewlink central repository. Use provider-specific adapters for Paddle, Polar, and Lemon Squeezy behind a common account and subscription contract. Save customer, transaction, subscription, and entitlement records in central D1. New customers choose among configured providers; existing subscriptions stay with the provider that created them.

## Alternatives and consequences

A single provider is simpler but leaves new sales dependent on it. A provider-neutral API alone does not transfer existing payment mandates, synchronize missed events, or make backups automatic. Operators must configure and test each provider, monitor and reconcile notifications, and back up D1. No paid feature is defined or enforced by this decision.
