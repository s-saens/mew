---
title: "Security review of mew port 5000 tunnel exposure (2026-07-21)"
created: 2026-07-27
updated: 2026-07-27
description: "Preserves the security review of presence, WebSocket authentication, proxy IP handling, and related issues during two-port operation on 2026-07-21, along with subsequent resolution notes. Separate from the current authorization rules."
---

This is a **review snapshot as of 2026-07-21**. Code location references (`파일:줄`) are from that day and may differ from the current code. See [access-model.md](../../../docs/operations/access-model.md) for the current access model.

- Review scope: authentication, authorization, and network boundaries of the two servers, 5000 (team) and 5001 (guest)
- ⚠️ **Subsequent changes**: The 5001 guest server was later consolidated into a single-port (5000) model. The "AI agents have the same scope" item in §4 was **resolved** by [ADR 0014](decisions/0014-mew-agent-panel-removal.md) (complete removal of the agent window).
- ✅ **Rechecked on 2026-07-28 — §1, §2, and §3 have all been resolved.** Presence passes through per-recipient permission filters, tmux and collab WS authorization check `mustChangePassword`, and `clientIp` trusts headers only when the socket is loopback (= via cloudflared). The body and priority table below are records from 2026-07-21, so **leave them as they are and do not revise them again.** For the current state, see [access-model.md](../../../docs/operations/access-model.md).

## Conclusion first

Login itself (password hashing, sessions, CSRF, rate limiting) is well implemented, so the **"an unauthorized person logs in"** scenario is not a concern. The issue is **"exactly what does one approved email address authorize?"** Port 5000 serves not as a document editor but as a server granting development environment access effectively equivalent to SSH, including shell access to all of `~/dev/liiiiv`. If one account is compromised, the blast radius is "every project in this workspace," not "the docs project."

## 1. [High] Presence information is shared across team and guest boundaries

`presence.ts` declares `wss` and `clientState` as **module-global singletons**. Although `attachPresenceWebSocket()` is called for both the team and guest servers, broadcasts from both servers actually target **the same set of clients**.

This means even anonymous users connected as guests without authentication receive the **path** of the document a team member currently has focused and their cursor **color** in real time. The guest content API is restricted to the `docs` project, but presence broadcasts do not pass through that filter. When a team member opens a project other than `docs` (source code or internal planning documents), its path string is exposed as-is to the public internet.

Showing guests how many people are viewing a document is intentional, but using exactly the same channel without distinguishing team members from guests exceeds the intended scope.

**Impact**: Internal project structure and team activity patterns (who views what and when) are
exposed to anonymous users. **Remediation**: Pass a server scope identifier to `attachPresenceWebSocket` to separate broadcasts, or at least filter paths outside `docs` out of guest broadcasts.

## 2. [Medium] WebSocket authorize does not check `mustChangePassword`

`requireAuth`, which protects the HTTP API, also checks `session.user.mustChangePassword` to block users with temporary passwords. However, `authorize` for WebSocket upgrades only checks whether a session exists:

```ts
const authorize = (req: IncomingMessage) => sessionFromRequest(req) !== null
```

Even an account with only a temporary password **can obtain a shell through tmux** — effectively bypassing the HTTP guard through the WS path.

**Action**: `(req) => { const s = sessionFromRequest(req); return s !== null && !s.user.mustChangePassword }`

## 3. [Medium] `clientIp()` unconditionally trusts headers

It trusts `cf-connecting-ip` → `x-forwarded-for` → `socket.remoteAddress` in that order. This assumes traffic arrives **only through cloudflared**, but a direct tailnet access path also exists. Through that path, clients can set arbitrary headers, and the server trusts them as-is.

**Impact**: The login failure rate limit (IP + email, 10 attempts per 15 minutes) can be bypassed by using a different `x-forwarded-for` on every request, enabling
brute-force attacks. **Remediation**: Distinguish trusted routes (cloudflared) from untrusted routes (direct tailnet connections), and use only `socket.remoteAddress` on untrusted routes. The simplest approach is to block direct tailnet connections and require cloudflared exclusively.

## 4. Structural limitation — what "approved emails only" means in practice

This is a consequence of the design, not a bug. The summary has been moved to "What this boundary means" in [access-model.md](../../../docs/operations/access-model.md).

- **Workspace-wide access** — `WORKSPACE_ROOT` is `~/dev/liiiiv`, and every top-level folder under it is treated as a project. Users logged into the team server can view and modify mew's own source and neighboring projects through the API.
- **Full shell access** — The tmux WebSocket spawns a pty with `cwd: WORKSPACE_ROOT`. API-level path validation (blocking `.git`, `node_modules`, `.data`, and `.env*`) only prevents "accidental UI exposure"; it is not a boundary for users with a shell. Sessions, password hashes, and other project secrets in `.env` and `.data/` can all be read with a single `cat` command.
- ~~**AI agents have the same scope**~~ — `server/agent.ts` ran Claude Code headlessly from the workspace root with `bypassPermissions`. **Resolved** — Completely removed under [ADR 0014](decisions/0014-mew-agent-panel-removal.md).

**Recommendation**: Issue accounts only to a small number of trusted people. A tailnet is a much safer boundary than a public internet tunnel. Consider shortening the session TTL.

## 5. [Low] ~~No per-user quota on `/upload`~~ — Decided not to impose a quota (2026-07-28)

> In response to this finding, a daily 200 MB quota per account was added, then **removed again on 2026-07-28.** With only two issued accounts, owner and manager, both with shell access, "cost-based DoS" was not a practical threat; the quota was friction that blocked normal use (large asset uploads). **Do not add it again** — Reassess if the model changes to issuing accounts broadly to external users. The following is the record from 2026-07-21.

Files up to 500 MB each are allowed, and R2 uploads have no per-user or per-period quota. Only authenticated users can upload, but repeated uploads can increase storage costs — a cost-based DoS vector if one account is compromised.

## 6. [Low] Unlimited Yjs collab rooms can be created once authenticated

`roomKey` is taken directly from the client query parameter. Without validation or ownership checks, repeatedly connecting with arbitrary room keys accumulates `Y.Doc` instances in memory. They are cleaned up when the client count reaches 0, but can grow indefinitely if concurrent connections are maintained. Priority is low because nothing is written to disk and authentication is required.

## 7. What is working well

- Passwords: scrypt + per-user salt, timing-safe comparison, and dummy hash responses even for unregistered emails to prevent timing attacks that reveal account existence
- **No HTTP endpoints at all** for self-registration or password reset — accounts can only be issued through the host-local CLI, leaving no remote account creation attack surface
- Session tokens are stored as sha256 hashes rather than plaintext — sessions cannot be reused even if the store is leaked
- Changing a password invalidates all sessions on other devices
- Login rate limiting, CSRF protection (SameSite=Lax + Origin validation), HttpOnly + conditional Secure cookies
- Both code and comments clearly enforce the boundary that guests can never connect to tmux; all write routes are blocked
- `/link-preview` is intentionally excluded from the guest whitelist due to SSRF concerns
- Security headers (nosniff, `X-Frame-Options: DENY`, Referrer-Policy) applied to both servers

## Priority summary

| Rank | Item | Remediation difficulty |
| --- | --- | --- |
| 1 | Separate team/guest presence channels (§1) | Low — add a scope parameter |
| 2 | Check `mustChangePassword` in WS authorize (§2) | Very low — one line |
| 3 | Review trusted paths for `clientIp` / block direct tailnet connections (§3) | Medium — network configuration needs to be checked |
| 4 | Minimize account issuance on the premise that "approved email = workspace-wide access" (§4) | Policy decision |
| 5 | Upload quotas, collab room cleanup (§5, §6) | Low, not urgent |
