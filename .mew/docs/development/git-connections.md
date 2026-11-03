---
title: "Per-account Git connections and execution"
created: 2026-09-29
updated: "2026-11-03"
description: "Per-account GitHub authorization, encrypted storage, and Git command boundaries. Covers author identity, OAuth cleanup and refresh races, scoped credentials, managed GitHub/GitLab cloning, connected repository pagination, and general-agent commit attribution."
상위파일: "MOC.md"
---

[Usage](../../../docs/guides/projects.md#github-login) · [Decision 0179](../history/decisions/0179-mew-account-git-connections.md)

## Ownership and storage

- Git connections are scoped by Mew email, provider ID, and host. They are not migrated from existing `gh` authentication, environment tokens, or SSH keys. Accounts remain disconnected until their first connection, after which connections persist across server restarts and Mew logins.
- The provider contract in `server/git-providers.ts` owns device authorization initiation, polling, token refresh, account verification, host/repository path validation, and the Git authentication username. The initial implementation is github.com. GitLab and Enterprise are not yet registered and require adding providers and their UI/authentication flows.
- `GitConnections` stores SHA-256 user/provider/host filenames in `MEW_DATA_DIR/git-connections/`. AES-256-GCM encrypts access/refresh tokens, expirations, and authors, binding the ownership key into AAD. Use 0700 directories and 0600 key/atomically written files; back up key and ciphertext together. This does not isolate secrets from users with OS file access permissions.
- Tokens and device codes are not included in APIs, browser storage, remote URLs, Git argv, or AI input. Only the user authorization code is returned for the user’s own login operation. API responses are no-store.
- Disconnecting removes the corresponding Mew connection. GitHub web sessions, other Mew users, and OS gh authentication are retained. Provider-side authorization is revoked in GitHub’s Authorized OAuth Apps.
- UI or CLI account deletion removes that account's Git connections for every registered provider. OAuth operations capture the account creation timestamp at startup and compare it with the current account on asynchronous replies, status queries, and restarts. Never store an old operation's tokens for a deleted account or a same-email replacement. Personal-setting retention does not retain external credentials.

## API and login

- `GET /api/git-connections/github`: Returns configuration availability, the user’s own connected account, and the user’s own login operation.
- `POST` on the same path: Starts the OAuth device flow or resumes the user’s own in-progress operation. Different accounts can proceed concurrently. Uses the built-in public Client ID by default, replacing it if `MEW_GITHUB_CLIENT_ID` contains a non-whitespace value. Token requests follow the provider’s interval, slow_down, and expiration rules.
- `DELETE` on the same path: Removes the connection and in-progress operation. Tokens arriving late are not stored, even if cancellation occurs just before completion.
- `POST /:id/stop`: Cancels the user’s own operation. `POST /:id/browser`: Opens the fixed GitHub authorization URL in the [login virtual screen](login-desktop.md). Uses the same git or filesWrite permission as connection operations.
- The connection API requires login and the git or filesWrite capability. As a personal integration setting, it does not require access to all repository files. Existing project and capability permission checks for actual Git APIs remain in place. The old `/api/git/github-auth` path is a compatibility path that retains the existing Git capability and full-project access checks.
- The external GitHub authorization link can be used without separate browser permission. The login screen inside the panel requires Chrome, Xvfb, FFmpeg, and Python input handling on Linux/WSL; gh is not required.
### Reauthorization and refresh

- Disconnected/expired connections, including GitHub-confirmed remote revocation, return HTTP 428 `git-auth-required` before explicit operations change anything. Open the shared login dialog, then retry the serialized original request exactly once after success. Cancellation/logout stops retry; general failures never rerun automatically. Retry headers carry URI-encoded Mew owner/workspace values, checked against the server's current values.
- Login operations are memory-only; restart them after a server restart. Refresh expired access tokens during account-status queries or Git connection checks, coalescing concurrent refreshes within the server for the same account/provider/host and retaining connection ID. Late refreshes cannot replace a disconnected or reconnected connection.
- Missing, expired, or revoked refresh tokens require login. Connections stored before refresh-token support have none and need one login after that support is applied. Temporary network/provider errors return HTTP 503 without deleting the connection. Device-flow refresh uses only the public Client ID ([GitHub's official refresh contract](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#refreshing-an-access-token-with-a-refresh-token)).

## Git execution boundaries

### Commit identity and command scope

- Pass the requesting user's author identity per regular, per-file, or AI commit, and committer identity for cherry-pick/revert. GitHub ID/login form `ID+login@users.noreply.github.com`; never modify shared `user.name`/`user.email`. Cherry-picks retain the original author under Git rules.
- The `simple-git` 4 environment allowlist admits only server-defined author/committer names/emails and AI's temporary `GIT_INDEX_FILE`. Remove inherited `GIT_*`, editor, pager, and authentication-token variables before adding account identity. Retain safeguards for command execution, configuration includes, and abbreviated options. Remote authentication separately adds a server-owned credential socket/fixed configuration path and uses the existing `execFile` route.
- Incidental commits for creation, copying, moving, deletion, uploads, and replacement require a connected account. Otherwise, or for unsupported remotes, perform the file operation without committing. Explicit save/history-restoration commits check the connection before writing; per-file commits exclude other staged files.
- Title bar branch creation and switching (`GET/POST /api/git/branches`) are local operations that check the Git capability, access to all project files, and the workspace in POST requests. They do not require a GitHub connection or remote lookup. Only actual local, remote, and tag refs from `for-each-ref` are allowed as a base; commit hashes are validated separately. `switch` runs without forced switching or stash. Selecting a remote branch directly creates a tracking local branch; creating a differently named branch with a specified base does not automatically set an upstream. Duplicate Pull/Push and branch operations on the same repository are blocked.
- Account selection follows the branch’s upstream remote → origin → sole remote order. Local repositories without a remote use the GitHub connection. Ambiguity among multiple remotes requires configuration.
- Pull/Push checks the registered provider and host of the actual fetch/push URL. GitHub SSH addresses are normalized to HTTPS at execution time without changing stored remotes. Arbitrary hosts, local paths, embedded credentials, multiple push URLs, and repository URL rewriting are rejected.
### Remote progress and credentials

- `POST /api/git/remote` with `Accept: application/x-ndjson` streams `progress`, `complete`, and `error` only once Git runs. Authentication/workspace/remote validation retains HTTP errors before streaming, including 428 for login.
- Run Git with `--progress` and `LC_ALL=C`; extract only phase, percentage, and object counters from stderr, never raw logs, URLs, or credentials. Send `complete` only on successful exit: 100% transfer is not remote success. Client disconnects neither rerun nor forcibly stop Git. Preserve regular JSON responses.
- Pass credentials only through a temporary Unix socket/helper accepting the exact HTTPS host/repository path. Exclude OS helpers, global/system configuration, extra authentication headers, cookies, interactive prompts, and HTTP redirects. Remove the socket on exit. This route supports Linux, macOS, and WSL.
### Managed project cloning and repository listing

`server/project-git.ts` supports project creation before a workspace is open. Its authenticated catalog APIs are available to signed-in members as well as managers and owners; guests are denied. They use the caller’s Mew identity, not an OS Git account. [The architecture contract](architecture.md#shared-project-registry-and-my-projects) owns API payloads and registry effects.

- Public clones accept HTTPS addresses on `github.com` and `gitlab.com`, including GitLab subgroup paths. Embedded credentials, custom ports, queries, fragments, path traversal, local transports, and other hosts are rejected. No account connection is required.
- A connected GitHub account supplies the existing refresh and repository-scoped credential helper for private or public GitHub cloning. Tokens stay out of the URL, argv, API responses, and browser state. GitLab account authentication and private GitLab cloning remain unsupported.
- Managed clones disable inherited Git authentication, global/system Git configuration, prompts, redirects, hooks, and templates. They allow only HTTPS transport and do not initialize submodules. The earlier external-folder clone API retains its existing OS-environment behavior and role restrictions.
- Connected repository listing calls GitHub’s authenticated [`GET /user/repos`](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user) with all visibility and owner, collaborator, and organization-member affiliation. It requests every page using the fixed GitHub API origin, without forwarding a token to a provider-supplied pagination URL. Access remains limited by the token’s repository permissions and organization SSO authorization.
- Disconnected accounts receive an empty list and can still clone a public URL. Provider revocation requires reauthorization; temporary failures and SSO/access errors are reported without substituting an empty connected list. A late result is rejected if the account connection has been removed or replaced.

### Agent execution and OS boundaries

- AI task files receive only the Mew owner and connection ID, provider, and host. The current connection ID is checked at execution start and immediately before each commit, and work does not continue with a disconnected or replaced connection. Tokens are not placed in AI prompts or input.json.
- General agents pin author/committer environment to the Mew account starting the request: connected GitHub name/private email, otherwise Mew profile name/login email. Overwrite/remove inherited server/runtime author/date variables without changing or forwarding shared Git settings or tokens.
- Detached supervisors and ACP children retain that identity through reconnection and process recreation. Already-running supervisors are unchanged; use a new tab. Internal execution without an account retains its environment.
- Regular terminals, cloning into external folders, and agent remote authentication use the existing OS execution environment. Account selection in the app is not a shell sandbox, and working trees are not cloned per user. Commit signing and hooks follow existing Git settings.

## Verification

- `server/agent-git-identity.test.ts`: Checks per-account author/committer identity in actual ACP child and detached supervisor Git commits, fallback to disconnected profiles, retention of the initial account when another account reconnects, preservation of shared Git settings, and no token forwarding.

2026-10-05: Added regression checks for automatic refresh after expiration, coalescing concurrent requests, encrypted storage, connection ID retention, disconnect/replacement races, distinguishing temporary failures from reauthorization, and refreshing during Git operations without the panel.

2026-09-29: Passed the server and browser tests below, existing Git workbench, file Git, permission, AI UI, and docking regressions, TypeScript, targeted lint, translation, and document boundary/link checks. No build or server restart was performed.

- `server/github-auth.test.ts`: Concurrent users, cancellation and late responses, expiration, unconfigured apps, OAuth protocol, and encrypted storage.
- `server/git-connections.test.ts`: Initial disconnected state using actual Git and HTTP, author/committer separation, preservation of shared settings and other staged files, retry user/workspace checks, and credential helper host/path restrictions.
- `server/git-ai-commit.test.ts`: Commit cancellation when disconnected during analysis and existing AI commit regressions.
- `server/github-auth-ui.test.ts`: Desktop/mobile login, external authorization links, keyboard access to internal authorization, disconnection, automatic login dialog, draft preservation after cancellation, and a single retry after success.
- Actual GitHub login and transfer require a registered app and user approval; the tests above use only fixtures.
