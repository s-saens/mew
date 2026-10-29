---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
title: "0111 — Limit supported mew deployment to native installation and a supervisor process"
created: 2026-09-04
updated: 2026-10-14
description: "Define the boundaries for native servers, non-administrator users, loopback, HTTPS, supervisor processes, and unsupported app containers. Link the WSL management app and Windows native support in the common OS execution layer to follow-up decisions."
---

- Date: 2026-09-04
- Status: Adopted
- Follow-up decision: [0201](0201-mew-windows-manager-wsl.md) — Manage installation and operation of a native server in dedicated WSL 2 through a portable Windows GUI; retain server execution, non-administrator, and loopback boundaries
- Follow-up decision: [0195](0195-mew-account-based-p2p-remote-access.md) — Add an opt-in central account and P2P remote access design (not implemented); retain native execution, loopback binding, and existing HTTPS deployment
- Partially supersedes: [0023](0023-mew-selfhost-packaging-repo.md) — The scope that retained Docker as a supported container option in the same repository
- Subsequent decision: [0209](0209-mew-native-windows-host-platform.md) — add native Windows support through a common app and OS execution layer; retain existing supervisor lifecycle, loopback, and personal data boundaries
- Decision makers: Song Sanghun (deployment documentation direction), Codex (comparison against the current implementation and recording)

## Background

[ADR 0023](0023-mew-selfhost-packaging-repo.md) made native installation the default while keeping the Dockerfile and Compose
`app` profile as options for servers and VPSs. The Dockerfile was later removed,
but the old Compose `app` service and README instructions remained, leaving `docker compose --profile app up -d --build` broken.

mew's `manager` and `owner` can reach server OS user privileges through terminals and agents. Simply exposing a port or documenting
an incomplete container path does not match the actual deployment boundary. Also, `start` in the built-in `mew` CLI
is a personal-use path based on `nohup` and does not guarantee automatic recovery after reboot.

## Options

1. Restore the Dockerfile immediately and support Compose again—this requires revalidation with the current code, dependencies, tmux, and workspace
   mounts; deployment documentation alone cannot restore the execution path.
2. Hide the Docker path only in the documentation—the Compose file and README send conflicting signals, and the next operator
   retries a failing command.
3. Explicitly limit the supported path to native installation, and operate the server with local binding, an HTTPS proxy or tunnel, and a supervisor
   process.

## Decision

Adopt option 3.

- The currently supported installation runs Node natively on Linux and macOS. Run the server as a dedicated non-administrator OS user,
  and keep only projects that user may read and write in the workspace.
- When exposing the server publicly, mew binds only to `MEW_BIND=127.0.0.1`. An HTTPS reverse proxy or tunnel preserves the
  original `Host`, `X-Forwarded-Proto: https`, and WebSocket upgrade and forwards traffic to the root path (`/`) of a dedicated hostname. Deployment
  under a subpath is not supported.
- Do not mix personal-use `./mew start` with a server process manager. A supervisor such as systemd handles server restarts and recovery after reboot,
  and updates take effect by restarting the supervisor after installing dependencies, validating, and building.
- `docker compose --profile app` is not supported while the Dockerfile is absent. Compose is used only for the auxiliary Postgres path in `/db`. Before
  offering an app container again, write a new ADR that validates the Dockerfile, mounts, tmux/agent permissions,
  image updates, and security.
- Back up `config.env`, `MEW_DATA_DIR`, the workspace, and separate Postgres individually as recovery targets. Account, session, and
  guest rules reside in `MEW_DATA_DIR` and cannot be replaced by Git.

Use "Server Deployment (Native)" in the [mew README](../../../../README.md), which changes alongside the code, as the reference for specific
installation commands, systemd examples, and validation steps. Keep internal pre- and post-deployment checks in the [operations
runbook](../../../../docs/operations/deployment.md).

## Rationale

Native execution uses the existing development tools, tmux, and agent CLIs at the core of mew directly within the same OS user context.
Restricting public ingress to a single TLS proxy or tunnel keeps session Secure cookies, Origin checks, and WebSocket behavior consistent and makes
the operational boundary easier to understand than directly exposed ports. Stating the actual deployable scope is safer
for recovery, audits, and subsequent decisions than retaining an unsupported container path.

## Results

- Remove failing container app commands from the README and provide Korean instructions for native deployment, systemd, and backups.
- Do not currently promote the Docker Compose `app` service and entrypoint as an execution path. Decide whether to remove them or reintroduce containers
  in subsequent implementation work.
- This decision preserves the existing security boundary of not publicly exposing the `npm run dev` development server.
