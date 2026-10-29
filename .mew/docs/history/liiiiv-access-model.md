---
title: "Mew access model in the former Liiiiv workspace"
created: "2026-07-27"
updated: 2026-10-14
reviewed: 2026-08-21
review-after-days: 30
description: "Operational history preserving the port, account, tailnet, and shell access scope in the Liiiiv environment before the transition to an independent project; this is not the access policy for the current installation."
---

> This is an operational record from before the transition to an independent project on 2026-10-14. The current standards follow the [Mew access model](../../../docs/operations/access-model.md) and [independent project decision](../decisions/0001-independent-project.md).

A reference for **operating mew in our workspace** (reference). The repository's `SECURITY.md` is the canonical source for the model itself, including the role matrix and guest rules. The code is at `~/dev/liiiiv/mew`, run commands are in [Usage](../../../docs/guides/getting-started-ko.md), and the code structure is in the [development documentation](../development/MOC.md). See [security-review-2026-07-21.md](security-review-2026-07-21.md) for a review of how far this boundary actually holds.

> ⚠️ **A change that affects this document's contents falls under write-back trigger 4 (port and authentication model).** You must update this document along with the code.

> **2026-07-30 — The canonical source for the role matrix and guest rules was moved to `SECURITY.md` in the mew repository** ([ADR 0023](decisions/0023-mew-selfhost-packaging-repo.md)). A public repository must contain its own security model. **Only our operational details remain in this document** — the port table below, issued account status, and tailnet boundaries. To change the model itself, edit the repository's `SECURITY.md`.

## Ports

| Port | Purpose | Exposure | Authentication |
| --- | --- | --- | --- |
| 4999 | dev (vite, HMR) | **tailnet only — external exposure prohibited** | Same as 5000 |
| 5000 | Production (single port) | Exposed through a tunnel | Not logged in = guest; role assigned on login |
| Dynamic loopback port | Server Chromium CDP | Server internal use only · tunnel and external exposure prohibited | Local process access boundary; no Mew user authentication |

The CDP port is created and terminated with the browser profile process. It is not an API for general users, and any local process with access can control that browser ([ADR 0129](decisions/0129-mew-browser-native-launch-cdp.md)).

4999 uses the same authentication system as 5000 (guest without login). It is still restricted to the tailnet because the development server has limited surrounding defenses — unknown WebSocket upgrades are not disconnected to avoid breaking vite HMR, and source maps and prebuild assets are served as is.

## Roles

The hierarchy is **guest &lt; member &lt; manager &lt; owner**. Visitors who are not logged in are automatically guests; after login, they receive the role registered in the approval list. **Accounts that have not yet changed their temporary password are blocked from all APIs, shells, and collaboration regardless of role.**

### Permission matrix

**The table is in `SECURITY.md` in the mew repo** — it is not duplicated here. The next two sections are our record of *why* we changed
that table to its current form.

### Blocked regardless of role (in our workspace)

- `.data/`·`.git/`·`node_modules/` — rejected by API path validation.
- Documents under `archives/` in the docs project — immutable. Both saving and reverting are rejected.
- Protected projects (`docs` and mew itself) — even owners cannot rename or delete them.

### Secret files (`.env*`) are blocked for "guests only" (changed 2026-07-28)

For `.env`, `.env.local`, and similar files, **sidebar tree visibility, reading, editing, and search are all available to logged-in roles (member and above), and blocked only for guests.** Previously, the API blocked them regardless of role.

- **Reason for the change** — roles that can log in already have shell access (manager and owner) or broad file manipulation permissions (member). Blocking all roles provided no practical defense and only reduced UI convenience.
- **Guest blocking takes precedence over path rules** — granting a guest view access to the project root (`''`) does not extend to `.env*`.
- **Also enabled**: editing, deletion, renaming, full-text search results (content previews), and real-time collaboration rooms. Inclusion in collaboration rooms was also agreed to be within the allowed scope.
- `.data/` (accounts and sessions) remains blocked for all roles — only `.env*` was unblocked here.

### The sidebar tree is not filtered for owners and managers (changed 2026-07-29)

**The sidebar for owners and managers shows files as they exist on disk** — neither the extension whitelist nor the hidden list in settings applies. Members and below continue to see a filtered tree (docs: `.md` + media; other projects: text and media whitelist; hidden list applied).

- **Reason for the change** — the roles that can view the unfiltered tree and **the roles that can use the terminal are the same set**. With a shell, users can already view and create anything, so the whitelist provided no defense and only caused confusion when "the file I just created does not appear in the sidebar."
- **Two categories still remain invisible** — these are structural constraints, not hiding rules.
  - `.git`·`node_modules`·`.data` — the API rejects the paths themselves (see §Blocked regardless of role above), so listing them in the tree would not make them openable, and `node_modules` alone contains tens of thousands of entries.
  - Artifacts in `build/` — only APK/AAB files are allowed through; the rest are collapsed. This rule prevents an "artifact flood" independently of the hidden list; a single flutter build produces 9,000 entries.
- **The cost** — everything previously on the hidden list appears in the owner and manager tree. The largest is `liiiiv-life/.next` (about 3,300 entries), and `.foam`·`.github`·`.vscode` appear together at the top level of docs. The hidden list remains and continues to apply to members and below, and to **search and tree watching**.
- **Tree visibility is not an authorization boundary.** Even invisible files can be read through the API if their paths are known — the actual boundaries are guest rules (`guestAccess.ts`) and blocked paths (`paths.ts`). Decisions are made in only two places in the mew repository: `server/tree.ts` (`isPathVisible`) and `server/reqAuth.ts` (`seesEveryFile`).
- **Operations that make a file invisible display a notice** — if a file a member creates or renames disappears from their tree, a "You do not have permission" toast notifies them. The operation itself succeeded, and the file remains on disk.

## Guest boundaries · Authentication

**The canonical source for rules and procedures is `SECURITY.md` in the mew repo** (path rule precedence, absolute blocking of `.env*`, no shell access for
guests, allowlist, session, and lock policies, and known inconsistencies in `/file-revert`). This document covers only our operational facts — accounts are provisioned
only through the CLI on this host, and guest permissions are granted per path rather than for entire folders.

## Account profiles

Logged-in users change **their own** display name and profile photo in settings. Names and photos are stored together in the account ledger and provided only to logged-in users as public profiles for collaboration interfaces such as chat. Email addresses, roles, and password status are separate, and the profile API cannot modify other users' accounts.

Only JPG, PNG, WebP, and GIF photos up to 512 KB are accepted. SVG and external URLs are not accepted, preventing images containing scripts or external tracking requests.

## What this boundary means

**"Only approved email addresses can use it" means "an approved email address grants permissions comparable to SSH on this development machine."** The server on port 5000 provides a tmux shell with the workspace root (`~/dev/liiiiv`) as its cwd, so managers and above can view and modify not only mew's own source but all adjacent projects. API-level path blocking (`.env`·`.data/`) is not a meaningful boundary for users with a shell.

If one account is compromised, the blast radius is \*\*"all projects in this workspace + the secrets inside them"\*\*, rather than a "document editor." Minimize account issuance and use a tailnet boundary instead of a public tunnel when possible. For rationale and details, see [security-review-2026-07-21.md](security-review-2026-07-21.md) §4.

> **As of 2026-07-28, the only issued accounts are 1 owner + 1 manager, with no member accounts.** Everyone currently able to log in therefore has a shell. **The moment the first member account is issued**, the member row in the matrix above becomes an actual boundary for the first time. Even without a shell, that role **can read `.env*` in every project in the workspace** (decision dated 2026-07-28). If a role must not see secrets, grant guest access with path rules rather than member access.

## See also

- repos.md (`이전 Liiiiv 문서: ops/repos.md`) — list of workspace folders accessed by mew
- [ADR 0023](decisions/0023-mew-selfhost-packaging-repo.md) — decision to organize mew as a self-contained repository suitable for public release. This is the rationale for moving the permission model's canonical source to the repository's `SECURITY.md`. When running in a container, the shell described in §"What this boundary means" above is restricted to **inside the container + one mounted folder**. **Our production server on port 5000 is still a host process, so the facts below remain valid**
- [mew ADR map](../decisions/README.md) — current decisions on agent panel, session, and CLI permissions. The removal decision in [ADR 0014](decisions/0014-mew-agent-panel-removal.md) was superseded by [ADR 0034](decisions/0034-mew-agent-panel-acp-reintroduction.md)
- company/services.md (`이전 Liiiiv 문서: company/services.md`) — external service and account inventory
