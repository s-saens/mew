---
title: "Restore the Circular Indicator on Attachment Upload Tags"
description: "Decision to distinguish three shared loading indicator types—logo, three dots, and circular—and restore attachment upload tags in agent input from three dots to circular, partially superseding the scope of ADR 0063."
created: "2026-10-27"
updated: "2026-10-27"
---

Status: Adopted

## Background

[ADR 0063](0063-shared-loading-indicator.md) assigned the logo to full entry and three dots to internal waits, and also changed attachment upload tags to three dots. The user requested keeping the original circular indicator for attachment tags in the agent panel and organizing all indicators into three types: logo, three dots, and circle.

## Decision

Add a circular `spinner` variant to `LoadingIndicator` in `@mew/ui`. Attachment upload tags in new agent input and queued input editing explicitly select it. Keep the existing usage scopes of the logo and default three dots. Shared CSS owns the circle's color, rotation, stopped state, reduced motion, and forced colors handling.

Because sending requires uploads to finish, attachment tags in sent user bubbles retain the completed file type icon. Do not add a separate loading state to bubble tags. The [shared UI contract](../development/ui-contracts.md#shared-loading-indicators) owns specific sizes and usage locations, and the [input and attachment feature contract](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md) owns detailed tag behavior.

## Alternatives and Rationale

Keeping three dots for all internal waits does not address the request to use a circle for attachments. Recreating attachment-specific CSS duplicates shared motion and accessibility handling. Add a variant to the shared component to distinguish the three types and apply the same behavioral standards.

## Impact

Replace only the part of ADR 0063 that applied three dots to attachment upload tags. Preserve the contracts for tag placement in input, upload states, send blocking, icons after completion, and display in user bubbles. Record verification and production application status in the [work record](../work/loading-indicators.md).
