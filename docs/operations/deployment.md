---
title: "mew deployment operations runbook"
created: 2026-09-04
updated: 2026-10-30
description: "Defines native installation, OS user, Mewlink/HTTPS entry point, backup, permission, and workspace search-exclusion checks for Mew operators before and after applying changes, plus Tailscale proxy-target diagnosis, macOS failure diagnosis, and retry restrictions."
---

[ADR 0111](../../.mew/docs/history/decisions/0111-mew-native-deployment-and-supervisor.md) is authoritative for currently supported paths and boundaries, and [Native Server Deployment](../deployment/native.md), which changes in the same commit
as the code, is authoritative for actual installation and systemd commands. This document retains only items Mew operators need to check repeatedly. When moving the source folder, follow [Changing the Repository Location](project-location.md).

## Before public exposure

- Verify that this is a supported native installation. `docker compose --profile app` without a Dockerfile is not a deployment path. Start
  Postgres separately with Compose only when `/db` is needed.
- Run mew as a dedicated non-administrator OS user. `MEW_WORKSPACE` contains only projects that user may access, with no entire home directory,
  production secrets, or data from other services.
- Verify `MEW_BIND=127.0.0.1`, and do not open the mew port on the external firewall. Use Mewlink or an HTTPS proxy/tunnel as
  the public entry point. Mewlink follows the verification and application scope in [Device Registration and Direct Connections](../../.mew/docs/development/remote-access.md).
- Verify that the proxy forwards the original Host and `X-Forwarded-Proto: https` and relays all WebSocket upgrades. Serve mew only
  at `/` on a dedicated hostname.
- Deliver the first owner account's temporary password through a secure channel and verify that it was changed at first login. Minimize the number of manager
  and owner accounts, and use guest path rules instead of member accounts for simple read-only sharing.
- Verify recoverable backups of `config.env`, `MEW_DATA_DIR`, the workspace, and Postgres when using `/db`.

## Before and after applying changes

- Record the current commit, state, and backup completion time, and perform fast-forward updates only with a clean working tree.
- For personal `./mew start` installations, **Update Mew** in the header checks ahead/behind status against `origin/main` and runs the same CLI update in a hidden tmux session. On success, the page automatically refreshes after the new server responds. Branch divergence and working-tree conflicts remain `--ff-only` failures; no automatic merge, stash, or reset is performed.
- After installing new dependencies, complete tests and the build, then restart the supervisor once. Do not run a `nohup` process launched by the
  personal `mew` CLI and systemd at the same time.
- Check login, password changes, autosave, and collaboration WebSockets on the public domain. Test manager/owner terminals only with
  restricted test accounts.
- Following the [search policy](search-discovery.md), check `noindex` on host HTML and files and the text robots response. Check indexing of public product introductions separately on the relevant site.
- When a failure occurs, check supervisor logs first. You may revert the app clone to a known-good commit, rebuild,
  and restart, but do not roll back by deleting or resetting the workspace or `MEW_DATA_DIR`.

## Diagnosing Tailscale access failures

Compare `tailscale serve status` with the actual Mew listener (`ss -ltnp` on Linux) and the port in [server configuration](../configuration/environment.md). A healthy loopback server can still be unreachable through Tailscale when Serve forwards to an old port.

1. Request `http://127.0.0.1:5000/api/auth/me`, replacing `5000` with the actual Mew port. Expect JSON even before signing in.
2. If the local response works but the HTTPS proxy target is wrong, update only that listener with `tailscale serve --bg --https=443 http://127.0.0.1:5000`. Preserve unrelated Serve listeners; do not use `tailscale serve reset`.
3. Request `/` and `/api/auth/me` through the printed HTTPS address. Then check browser login and WebSockets from another tailnet device. A request from the host alone does not verify that device's Tailscale connection or access policy.

Keep Mew on loopback. For an explicitly requested private `http://<tailscale-ip>:5000` endpoint, `tailscale serve --bg --tcp=5000 tcp://127.0.0.1:5000` adds TCP forwarding within the tailnet. Prefer the HTTPS address for browser features that require a secure context. Proxy corrections do not require restarting Mew. Follow the [Tailscale setup guide](../guides/getting-started-en.md#2-tailscale) for installation and HTTPS prerequisites.

## Diagnosing macOS agent and terminal failures

- First compare whether the same CLI and tmux run in a regular terminal. If only
  the web terminal is blank, check `[mew:tmux]` and `posix_spawnp failed` in the server logs. Follow [macOS Terminal Verification Guide](../guides/getting-started-ko.md#running-and-updating) for correcting PTY helper file permissions and verifying them.
- When investigating ACP's `Falling back from WebSockets to HTTPS` and `Connection refused`, distinguish the provider connection from the browser→mew connection. Since mew communicates
  with ACP adapters over stdio, do not conclude from these messages alone that the
  public proxy has a WebSocket upgrade problem.
- Locally check for HTTP(S)/ALL_PROXY settings remaining in the environment that started mew and in the CLI's configuration files.
  For Codex, also check `.env` under `CODEX_HOME` (default: `~/.codex`). Do not copy proxy addresses or credentials into docs or shared logs. Compare actual listeners against
  the configuration rather than deleting all proxies indiscriminately, including required ones.

## Do not retry

Do not revive Compose's `app` profile as a temporary deployment method before revalidating the Dockerfile, image, and permission model.
Before retrying the container app path, first complete the separate decision and validation required by ADR 0111.
