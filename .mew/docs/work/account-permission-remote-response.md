---
title: "Mewlink account access change responses"
description: "Records the 2026-10-31 fix for successful account permission saves being reported as interrupted Mewlink requests, request-specific response preservation with continued revocation, regression verification, and pending user application."
created: "2026-10-31"
updated: "2026-10-31"
---

## Purpose and resulting behavior

Account permission saves changed the policy revision and synchronously notified active Mewlink dispatchers. Revalidation then canceled the initiating HTTP request before its success response, even though the policy had already been saved. Feature changes, feature-default resets, file rules, and account deletion shared this failure; changing the caller's own role could also invalidate its response.

Reuse the existing dispatcher account-access transition through a shared request helper for those mutations and owner-issued password resets. Only the initiating operation receives updated authority for its response. Other pending HTTP requests and WebSockets continue to be revoked immediately, stale request bodies cannot mutate access, and subsequent requests enforce the new permissions. Ordinary HTTP keeps its existing behavior. The [access control contract](../development/access-control.md#mewlink-local-login) and [accounts feature](../features/appearance-accounts-operations/accounts-roles-feature-permissions-and-guest-sharing.md) own current behavior.

## Verification and application

- `node --test server/remote-account-access.test.ts`: 3 passed, 0 failed. The in-memory dispatcher uses the actual API routes and synchronous access-change revalidation for both password and approved Mewlink accounts. It verifies completed feature saves, default resets, file rules, password resets, account deletion, and self-demotion; persisted changes; previous HTTP/WS revocation; new permission enforcement; rejected stale bodies; and nonowner rejection.
- With only the pre-fix `access-routes.ts` loaded through a temporary Node module hook, the same regression fails for both login methods because the initiating feature-save request receives `permission-revoked`. The hook and temporary directory were removed without replacing working source files.
- `node --test server/access-feature-reset.test.ts server/access-policy.test.ts server/admin-users.test.ts server/remote-local-auth.test.ts server/remote-mewlink-auth.test.ts server/remote-trusted-device.test.ts`: 37 passed, 0 failed, 0 skipped.
- `npx tsc -b` and `npx oxlint server/access-routes.ts server/remote-access-context.ts server/api.ts server/remote-account-access.test.ts` passed.
- `npm run check:docs` and `git diff --check` passed.

No app build, deployment, launcher execution, or running-server restart is part of this change. The user must build and apply the change; actual-instance and external-network verification remain pending.
