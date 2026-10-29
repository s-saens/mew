---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: make mew a self-contained repo ready for public release: native installation by default, Docker secondary. Preserves the choices and rationale at the time; decision 0053 partially supersedes the choice to make new releases of Mew itself under MIT."
title: "0023 — Make mew a self-contained repo ready for public release: native installation by default, Docker secondary"
created: 2026-07-30
updated: 2026-09-11
---

- Date: 2026-07-30
- Status: Adopted
- Follow-up decision: [0111](0111-mew-native-deployment-and-supervisor.md) — Docker app deployment support
- Follow-up decision: [0120](0120-mew-project-local-assets-replace-r2.md) — R2 asset storage and installation configuration
- Decision maker: Song Sanghoon (directive)

- Follow-up decision: [0053](../../decisions/0053-source-available-license.md) — Replace only the choice to make new releases of Mew itself under MIT with source-available terms. Existing MIT grants, third-party rights, and the remaining decisions stay in effect

## Background

mew was structured to run only on this development machine. It inferred the workspace root from the code location (`../..`),
stored settings and accounts inside the repo (`.env` and `.data/`), referenced these docs through relative paths, and used `@liiiiv/*`
as its internal package names. Others had to mimic the workspace structure to open their own folders.

There are three goals: release it as open source, keep using it as I do every day, and keep improving its features.
All three must use the same source; a separate internal branch would diverge.

## Options

1. Separate deployment packaging into its own repo (`deploy/mew`) — the app can stay private while deployment tools are released first. Cons: the Dockerfile changes in the same commit as the source, so two repos require matching versions manually forever. And as long as the app stays private, nobody can use the deployment repo alone — there is no source to build.
2. Docker as the default deployment format — best reproducibility. Cons: mew's terminal becomes an empty shell inside a container (without the user's claude, node, or git configuration). On Windows, Docker Desktop (administrator privileges and several GB) becomes a prerequisite.
3. One repo + native installation by default, containers optional — clone and run just `./mew setup`.

## Decision

Option 3. Make the single mew repo self-contained and ready for public release. Absorb and delete `deploy/mew`, which was created under option 1.

- The repo is stateless. Settings live in `~/.config/mew/config.env`, accounts and sessions in `~/.local/share/mew/`, and logs and pid files in `~/.local/state/mew/`
  (XDG). Path resolution and configuration loading are centralized in `server/config.ts`, which must be the entry point's first import;
  moving it later silently ignores `MEW_DATA_DIR` in the configuration file (as it originally did). If an old installation
  has `<앱>/.data`, keep using it, because an upgrade must not make accounts disappear.
- Installation uses a single command, `./mew setup`: check for Node 22.18+ (suggest installing nvm if missing); check for `build-essential`, `python3`, and `tmux` (provide
  a one-line apt command if missing, always obtaining confirmation first); ask for the folder and port; build; and create
  the first owner account. After that, use `start`, `stop`, `restart`, `update`, `status`, `logs`, and `users`.
- Containers remain an option in the same repo: `Dockerfile` plus the `app` profile in `docker-compose.yml`. They are for servers, VPS deployments,
  and public exposure. They share a file with `npm run db:up` (Postgres only) but are separated by profiles.
- Remove company traces: change the internal package scope from `@liiiiv/*` → `@mew/*` (86 occurrences across 35 files), remove internal
  paths and relative docs links from source and documentation, and change the shortcut localStorage key from `liiiiv-mew:shortcuts` → `mew:shortcuts` (fall back to reading the old key).
- The license is MIT (copyright holder listed as `mew contributors`).

## Rationale

- The terminal is mew's core feature. A container shell lacks the user's development tools, so making Docker the default loses the
  point of "using my tools in the browser." Keeping it optional is sufficient for situations where isolation helps (public exposure and
  VPS deployments).
- The Dockerfile changes in the same commit as the source. With 1 maintainer, splitting it into two repos costs more than it gains.
- A stateless repo unifies the three uses under one source. My installation keeps using `.data`, other people's installations use XDG,
  and data survives deleting and recloning the repo. A separate internal branch is no longer needed.

## Results

- The `deploy/mew` repo was absorbed and deleted. What survived: `Dockerfile`, `docker-compose.yml`, and `docker-entrypoint.sh` (moved
  to the mew repo root), the installation script skeleton (the `mew` CLI), and the `SECURITY.md` text.
- The canonical source for the access model moves to `SECURITY.md` in the mew repo. A public repo must
  contain its own security model. [ops/mew/access-model.md](../../../../docs/operations/access-model.md) retains only our operational details (port exposure policy, issued account
  status, and tailnet boundaries). `SECURITY.md` is the canonical source for the role matrix and guest rules.
- This is not an exception to the repo documentation allowlist — `SECURITY.md` is one of the four names already allowed by [ADR 0012](0012-docs-repo-doc-allowlist-and-absorption.md).
- `MEW_BIND` was added. The default remains `0.0.0.0` (tunnels and connections from other devices are normal use), and people who want to use
  it only on this computer can restrict it to `127.0.0.1`.
- Our production instance on port 5000 remains unchanged. It is still a host process, and the workspace remains `~/dev/liiiiv` (when
  `MEW_WORKSPACE` is unset, the default is the app folder's parent, so the result is the same).
- The docs-specific rules were retained: `DEFAULT_PROJECT='docs'` and the MOC coverage and archives immutability rules (`server/rules.ts`) remain hardcoded (at the user's direction). If someone
  else's workspace has a folder named `docs`, our documentation rules apply there too; after release,
  when the first report arrives, we will move them to a per-project opt-in.
- Remaining before release: the repo has substantial uncommitted work, so the commits need organizing. Confirmed that `.env` and `.data` had never been
  committed in the history (all 41 commits checked).
