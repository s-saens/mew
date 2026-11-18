---
title: "Unattended npm installation and remote onboarding"
description: "Records implementation of the mew-ide npm entry, managed Postgres, background startup, Windows WSL bootstrap, and remote onboarding. Includes local verification for the 0.1.1 release preparation and the 0.1.2–0.1.3 cross-platform fixes and pending publication."
updated: "2026-11-18"
---

# Unattended npm installation and remote onboarding

## Purpose and result

Provide one installation entry after Node.js/npm: `npx mew-ide`. Application
setup uses default configuration, prepares a private Postgres database, opens
browser administrator creation, and presents Mewlink, Tailscale, and Cloudflare
Tunnel in one popup also available from **Menu → Mewlink**.

The CLI package is unscoped; runtime tags remain versioned under the existing
release convention. POSIX stages a durable launcher and dependencies, registers
login startup, and owns background readiness/reopen/stop through a private local
socket. Browser prerequisites are prepared before detaching; login startup
checks them without hidden installation prompts. Windows reuses the owned WSL
installer and persistent launch controller. Existing accounts, projects,
unrelated WSL distributions, and explicit external databases are preserved.

[ADR 0179](../decisions/0179-unattended-npm-installation.md) records the decision.
Current behavior belongs to [CLI distribution](../development/cli-distribution.md),
[managed Postgres](../development/managed-postgres.md),
[Windows installation](../development/windows-installer.md), and
[remote access](../development/remote-access.md).

## Verification

Checks ran with Node.js **24.16.0**. All local checks use injected processes or
test-owned temporary resources. No existing application server, WSL
distribution, OS startup registration, or production database was started,
stopped, replaced, or reconfigured by this work.

| Check | Result |
| --- | --- |
| `npm run test:cli` | 53 passed; the opt-in binary smoke test was skipped in this default run. Covers durable dependency staging, login definitions, Windows bootstrap payload, database lifecycle, private control, and reopen recovery. |
| Opt-in managed PostgreSQL tests | 11 passed, including real Linux x64 PostgreSQL 18.6 initialization, SQL, shutdown, relaunch, and row preservation in a temporary cluster. |
| Document database service, routes, and row-page suites | 48 passed against a fresh managed cluster, with `MEW_DB_TEST_DATABASE_URL` explicitly set to that test-owned database and serial test execution. |
| First-owner UI, remote-method chooser, existing remote UI, CLI host, and runtime suites | 35 passed, including desktop/mobile layout, provider controls, one-shot first-owner display, private setup IPC, and compiled runtime imports. |
| Portable Windows startup/bootstrap fixtures | Six passed as part of the CLI suite. Five portable installer tests also passed. |
| Full Windows installer suite | Five passed; five failed before their PowerShell fixtures could execute because the host's Windows/WSL interop returned `UtilAcceptVsock: accept4 failed 110`. No service or distribution operation was attempted. |
| `npm run build` | Passed TypeScript and Vite on Node 24, retaining large-chunk warnings. |
| `npm run lint` | Passed with existing repository warnings; new installer modules were checked directly. |
| Local npm package | Packed `mew-ide@0.1.0` to a temporary directory: 24 files, eight Windows assets, executable entry, README, and license; no workspace or private state. No publication. |
| Documentation | 837 descriptions passed with zero metadata errors. Global link validation reported 39 pre-existing errors outside the added references. Direct inspection passed for 17 changed/new descriptions and 31 added local links and anchors. |

The runtime graph check exposed an existing broad `release-*` exclusion that
removed application API providers. Packaging now excludes only named release
build tools, with a regression fixture proving application providers remain.
The real database run also found a stale test expecting a row-page filename to
stay unchanged after its title changed; its assertion now follows the existing
canonical rename contract. Application row-page behavior was not changed.

Temporary browser images were inspected at 390px and 1100px. They are local
verification artifacts rather than public screenshot updates. Test-owned
browsers and PostgreSQL processes were closed after verification.

## 0.1.1 release preparation

Aligned the CLI package, npm lockfile, and shell installer at version `0.1.1` so the runtime tag and installer refer to the same release. The local build, shell syntax check, and release action test passed on Node.js 24.16.0. The CLI suite passed 75 tests and skipped the opt-in real PostgreSQL test. GitHub Actions and clean-host installation remain pending. See the [release procedure](../operations/cli-release.md).

## 0.1.2 release preparation

The 0.1.1 runtime checks failed on both macOS architectures when the temporary directory included a symlink and on both Windows architectures when the test compared POSIX permission bits. The next candidate resolves the archive root before comparing physical paths and checks directory and credential modes on POSIX. Local regression coverage includes a symlinked staging root and an existing directory with permissive modes.

On Linux with Node 24.16.0, the build and lint passed. Of 77 CLI tests, 76 passed and the opt-in database test was skipped. All eight release runtime and action tests passed. Documentation metadata passed and the global checker reported 39 existing missing links. Native release verification uses the protected GitHub workflow.

## 0.1.3 release preparation

Both Windows runners passed the CLI test that failed in 0.1.1. The next candidate resolves Windows workspace junctions against the physical runtime root and extracts the pinned psmux executable with Windows system tar. On macOS it supports long daemon socket paths, resolves staged dependency paths, and preserves shell errors and quoted paths in Bash 3.2. The installer fixtures passed with Bash 3.2.57 and bsdtar on Linux. The Windows junction regression also passed on Linux. Native packaging and clean-host acceptance require separate verification.

## Remaining gates

The initial npm package and matching runtime releases are not published by this
task. Verify package ownership and protected publication separately. Clean
Linux/macOS installation, Windows WSL absence/preparation/UAC/reboot resume,
login startup, terminal closure, Postgres behavior on the other supported platforms, browser
opening, provider sign-in, and remote connectivity require platform acceptance.
OS policy and npm's own package-download confirmation are distinct from Mew's
configuration-free setup.

The upstream Postgres binary packages do not contain a complete per-platform
set of bundled-library notices. Primary notices and provenance are preserved,
but that redistribution review remains a publication gate alongside platform
acceptance; this work does not claim it is complete.
