---
title: "Set up Mewlink billing"
description: "Short operator checklist for configuring, testing, and enabling Paddle subscriptions in the Mewlink central service."
created: "2026-11-16"
updated: "2026-11-16"
---

# Set up Mewlink billing

Billing is disabled by default. Existing Mewlink access remains free; the paid benefit and price still need a product decision.

1. Create a Paddle sandbox account, recurring product and price, API key, and client-side token. Use a separate test Worker and D1 database. Set Paddle's default payment link to that Worker's `/central/billing/checkout` URL; for live use, set it to `https://link.mew.run/central/billing/checkout` after domain approval.
2. Add a Paddle notification destination at `https://link.mew.run/central/billing/webhook` (or the test Worker's equivalent) for subscription events. Copy its signing secret.
3. Add these string values to the central service's protected `mewlink/.secrets.json`, preserving existing entries: `PADDLE_ENVIRONMENT` (`sandbox` or `production`), `PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN`, `PADDLE_PRICE_ID`, `PADDLE_WEBHOOK_SECRET`, and `PADDLE_ENABLED` (`true` to allow new checkouts). Do not put secrets in documents or chat.
4. Apply the central service through the [deployment procedure](remote-central.md), then test checkout, renewal, cancellation, and the customer portal with a sandbox account. A build alone does not deploy it.
5. Before accepting real payments, choose the paid benefit, finish Paddle's live account and domain approval, create separate live credentials and product, and repeat the checks in production. Confirm settlement and tax handling for your business.

See the [billing contract](../development/mewlink-billing.md) for the current integration and limitations.

If checkout creation has an uncertain result or notifications fail repeatedly, check the transaction and subscription in Paddle before any manual recovery. Automatic retry of uncertain checkout creation and webhook reconciliation are not yet provided.
