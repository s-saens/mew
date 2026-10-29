---
title: "Retry Temporary Model Capacity Shortages Using Account Settings"
description: "Decision selecting an execution policy and storage method that distinguish temporary provider model capacity shortages from actual exhaustion of user limits and retry within the same logical turn using per-account wait times and maximum attempt counts."
created: "2026-10-26"
updated: "2026-10-27"
---

Status: Adopted

## Background

A provider reporting insufficient capacity for the selected model does not necessarily mean the user's subscription or remaining allowance is exhausted. If existing error handling ends the task, the user must request it again, with a risk of repeating work already performed. The user requested retries for these temporary failures at a default interval of 30 seconds for 20 attempts, with values adjustable in the agent default instruction settings.

## Decision

Retry only explicit model capacity shortages and overloads in ACP chat within the same logical turn. Detect both RPC failures and normal turn completion following a capacity error at the end of a response. Retain existing error handling for exhausted user limits, subscription, billing, and authentication errors, and ordinary rate limits. Preserve the running session, model, effort level, and permissions, and do not automatically select another model. The official TUI, ordinary terminals, and rerunning CLI commands are outside the scope.

Provide the wait time and maximum attempt count in the Mew-wide scope of default instructions. Store the values as metadata in the `capacityRetry` settings section of the account's `agent-guidance.md` and update them through the existing revision API. Do not create a separate settings file; accounts without the section use defaults without modifying the source text. Exclude the execution policy from instructions sent to the model.

Read retry settings once per logical turn from the account that started the session. Maintain busy status and the queue while waiting, and request continuation from work already completed. A user stop or tab closure cancels the wait and retry request. Once attempts are exhausted, return to the final error and paused queue.

## Alternatives and Rationale

Sending only retry wording to the agent leaves no actor to execute it after the provider rejects the request. Retrying every error sends unnecessary requests even for actual limit or authentication issues. Automatic model switching changes the execution conditions selected by the user. Use narrowly scoped server-side detection and cancellable waits to preserve the same execution conditions.

Keeping execution metadata in the existing account instruction file allows reuse of the settings dialog's permission, revision, and source text preservation contracts. A separate JSON file would add another storage canonical source, so it is not selected.

## Impact

Automatic retries do not guarantee that a failed request will succeed. After a partial response, request continuation in the context of the same conversation, but do not guarantee provider or tool idempotency. Restoring wait timers after server or supervisor shutdown is not included. Apply this execution setting even when automatic project guidance is disabled.

The [Session Contract](../development/agent-sessions.md#automatic-retry-for-insufficient-model-capacity) owns the detailed contract for current values, storage, detection, and cancellation; [Usage](../../../docs/guides/project-setup.md#model-congestion-retries) owns configuration instructions; and the [Work Record](../work/agent-capacity-retry.md) owns verification and production application status.
