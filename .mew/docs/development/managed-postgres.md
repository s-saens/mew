---
title: "CLI-managed PostgreSQL"
description: "Defines automatic private PostgreSQL provisioning for the prebuilt CLI, external DATABASE_URL precedence, persistent sibling storage, process ownership, failure recovery, pinned binaries, and isolated verification."
created: "2026-11-17"
updated: "2026-11-17"
---

# CLI-managed PostgreSQL

The prebuilt [CLI](cli-distribution.md) prepares PostgreSQL before starting the application host. A fresh installation needs no Docker, system PostgreSQL installation, database URL, username, or password prompt. `apps/cli/src/postgres.mjs` owns the database process and returns its connection URL to the launcher. The application continues to use its existing `DATABASE_URL` and database service APIs.

An explicit nonempty `DATABASE_URL` takes precedence. The CLI passes that value through without inspecting, initializing, resetting, or stopping the external server. Source installations retain their existing environment-variable behavior.

## Installation and storage

The application runtime pins `embedded-postgres` to **18.6.0-beta.19**, whose platform packages contain PostgreSQL **18.6**. All published versions of that npm distribution use prerelease suffixes; the pin identifies the packaging version. Linux and macOS x64/arm64 use their matching binaries. Windows installations use the Linux runtime in the managed WSL environment; the loader also supports the upstream native Windows x64 package.

The database has a stable, private directory beside the account data directory: `<MEW_DATA_DIR>.postgres`. For example, `/home/alex/.local/share/mew` uses `/home/alex/.local/share/mew.postgres`. It is outside the account directory so database provisioning does not make a fresh installation appear to contain existing account state.

| Path within the managed directory | Ownership |
| --- | --- |
| `installation.json` | Format, PostgreSQL major, generated credentials, and last selected port |
| `cluster/` | Persistent PostgreSQL cluster and user tables |
| `.password-<id>` | Temporary `initdb` password input, removed after initialization or failure |

The directory uses mode `0700`, and credentials use `0600`. Credentials are generated once from 32 random bytes. Symlinked state or cluster paths, invalid installation records, and unrecognized nonempty directories are rejected. PostgreSQL runs as the current regular OS user; the CLI does not create OS accounts or run it as root.

The cluster listens only on `127.0.0.1`. Unix sockets are disabled, host and local authentication use SCRAM-SHA-256, and the generated password is passed to `initdb` through a private temporary file rather than an argument. An available local port is selected automatically, avoiding a PostgreSQL instance already listening on another port. The `mew` database is created after an authenticated connection verifies the cluster's exact data directory. Connection URLs and passwords are not printed in progress messages.

## Relaunch and process lifetime

The launcher's existing data lock serializes setup for each account data directory. Relaunch preserves the credentials, cluster, and tables and does not run `initdb` again. A different `PG_VERSION` major causes startup to fail while preserving the data; automatic major-version migration is not implemented. Interrupted initialization with nonempty partial cluster files also fails without deleting them.

The managed database starts before the application host. Initialization, readiness, and shutdown have bounded waits. Cancellation during preparation stops owned child processes and removes temporary password files. The returned `stop()` terminates only the process started by that invocation. Unexpected database exit is exposed through a failure promise so the launcher can stop reporting the application as ready.

After an abnormal launcher exit, a surviving managed database can be reused only after checking its process marker and authenticating with the stored credentials against its recorded port and exact data directory. An invalid marker or an unauthenticated live process fails startup. The CLI does not kill an unrelated process or delete a marker merely because a PID appears in a file.

## Distribution and verification

The binary loader resolves dependencies from the downloaded, verified application runtime rather than the ephemeral npm CLI directory. It checks both wrapper and platform-package versions and recreates the relative symlinks required by the binary distribution when necessary. Runtime packaging must preserve platform binary files, symlink metadata, and redistribution notices.

The [PostgreSQL notices](../../../resources/help/postgresql-notices/README.md) preserve the exact upstream wrapper, binary-build, and PostgreSQL license texts with source identities and hashes. Bundled library notices still require a per-platform publication review; these three primary licenses alone do not establish that review's completeness. Public release gates remain in [CLI releases](../operations/cli-release.md).

The default CLI suite uses temporary directories and mocked child processes to verify external-URL bypass, private sibling storage, authentication settings, credential handling, relaunch, major-version rejection, foreign-state preservation, authenticated orphan reuse, cancellation, unexpected exit, and port collisions:

```bash
node --test apps/cli/test/postgres.test.mjs
```

The opt-in binary smoke test creates its own temporary cluster, runs SQL, stops its database, relaunches, and verifies that rows persist. It never reads a normal `DATABASE_URL`, `.env`, or production database:

```bash
MEW_TEST_EMBEDDED_POSTGRES=1 node --test apps/cli/test/postgres.test.mjs
```

By default, the smoke test loads binaries from the repository runtime dependencies. `MEW_TEST_POSTGRES_RUNTIME` may select an isolated prepared runtime instead. Actual Linux x64 initialization, SQL, shutdown, and persistent relaunch were verified in an isolated temporary runtime on 2026-11-17. Other OS and architecture checks remain release acceptance gates. These checks do not establish npm publication, service installation, application deployment, or production database availability.
