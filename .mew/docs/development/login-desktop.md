---
title: "Browser login jobs"
description: "Defines login-job URL selection and cleanup in the same Chrome H.264/WebRTC component, account profile, and nativeBrowser permission as the internal Browser. Covers HTTP entry checks, opaque job ownership, shared-session takeover, workflow completion, and retired JPEG transport."
created: "2026-10-20"
updated: "2026-11-06"
---

## Shared browser

Login screens and the internal Browser use the same `BrowserDesktopPanel`, WebRTC peer, native input, `BrowserDesktopSession`, and Chrome runtime. `LoginDesktopViewer` is a thin embedded wrapper around that panel. It adds no image decoder, capture loop, alternate transport, or separate browser profile. The [native browser contract](browser-desktop.md) owns H.264 encoding, Chrome selection, virtual X11 isolation, input, the persistent account profile, and runtime lifetimes.

Both entry points require the same **Browser** (`nativeBrowser`) permission in Account Management. `agent`, `git`, `filesWrite`, `desktop`, and `portPreview` do not independently grant browser access. The agent and GitHub workflows retain their own permissions for starting and inspecting their jobs; opening those jobs in Chrome additionally checks `nativeBrowser`. The general login-page API requires browser permission without requiring an agent grant. Cleanup remains available to a job's authenticated owner after browser access is revoked.

The shared account profile is `DATA_DIR/browser/profiles/<sha256("browser-desktop:<account>")>`. Login cookies and ordinary browsing cookies persist in that same browser-only profile. Other accounts and the host user's personal Chrome profile use different namespaces. The old login-only profile is no longer selected; its cookies are not automatically merged or deleted. Browser permission grants ordinary host Chrome access, including native address-bar navigation under the server OS user's rights; a profile namespace does not sandbox host files or network access.

## Job entry points

| Entry | Checks and result |
| --- | --- |
| `POST /api/login-desktop` | Current `nativeBrowser`; accepts a registered provider's HTTPS login/account URL and returns `{id, job, url, streamUrl}` |
| `POST /api/agent-runtimes/:id/auth/:method/browser` | Existing `agent` and current `nativeBrowser`; selects the registered URL from the active official CLI job |
| `POST /api/git/github-auth/:id/browser` | Existing `git` or `filesWrite`, plus current `nativeBrowser`; selects the owned GitHub device job |
| Shared MCP authorization callback | Existing connection-job authority; checks current browser permission only when OAuth actually needs Chrome, leaving stdio and already-authenticated probes available |
| `DELETE /api/login-desktop/:id` | Authenticated job owner; removes the binding and closes its viewer if it still owns the account browser |
| `WS /api/browser-desktop/ws?login=<id>` | The same browser permission, account, Origin, revocation, command, video, and input checks as the dock, plus a live binding for that account |

`server/browser-login-jobs.ts` stores opaque login bindings, not Chrome runtimes. Bindings expire after eight hours and are bounded to 32 per account. Reusing the same account/job/URL returns its binding; changing that job's URL invalidates the old token. Initial login navigation comes from the binding, rather than the viewer's submitted `open.url`. Generic provider pages retain their registered HTTPS allowlist; official CLI/MCP authorization URLs retain their HTTP(S) validation, including loopback callback support. No job URL, video, input, pasted text, or code is added to logs or transcripts.

## Session and workflow ownership

There is one browser runtime and active viewer per account across both purposes. Opening login takes over the same Chrome window with the selected job URL. A general dock open at `about:blank` reattaches to the current window; it does not discard a login page already open. Reconnecting the same login binding preserves the current page. A new binding can select its login URL in an already-running browser. The native profile, cookies, toolbar, tabs, decoder, input, eight-hour runtime ceiling, and 60-second disconnect grace are identical.

Workflow completion or cancellation removes its binding. It closes Chrome only if that binding still owns the current browser viewer; it cannot terminate a later general-browser viewer or a different login job. Explicit panel closure and permission loss use the common runtime cleanup. Completed official CLI credentials retain their own lifetime outside the browser profile.

The old `/api/login-desktop/ws` JPEG endpoint is not attached or admitted by Mewlink. The old JPEG parser, frame ACK loop, and standalone login renderer were removed. [The historical contract](../history/login-desktop-jpeg.md) preserves the earlier behavior; [ADR 0150](../decisions/0150-shared-browser-login.md) records the reversal.

## Verification and application

Regression tests cover the shared rendered component, real H.264 login and general-browser switching, native input, one account profile and cookies, job URL selection, ownership, permission grants/revocation, binding cleanup, and retention of an unrelated active viewer. Native checks use test-owned displays, Chrome, profiles, peers, and HTTP fixtures. They do not establish real Google/Antigravity acceptance, CAPTCHA completion, physical-phone input, or internet/Tailscale latency.

Apply server changes with the user's normal restart procedure; a UI build does not reload server handlers. Mewlink uses `/api/browser-desktop/ws` for both purposes, with the existing host/central update boundary. Repository agents must follow [execution restrictions](getting-started.md#execution-and-verification) and must not operate those services.
