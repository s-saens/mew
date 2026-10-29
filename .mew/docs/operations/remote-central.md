---
title: "mewlink Cloudflare Deployment"
description: "Maintainer runbook covering Mewlink central service configuration, deployment, key preservation, access revocation, verification, rollback, and localhost preview DNS and HTTPS preparation. Links to work records for deployment results by date."
created: "2026-10-07"
updated: "2026-10-29"
---

Recurring deployment, configuration, and recovery procedures for central service maintainers. Results of changes by date are preserved in the [deployment history](../work/mewlink-deployment-history.md).

## What I Need to Do

**Initially, configuring just Google or GitHub is sufficient.** Apple can be added later.

### 1. Create a configuration file

Run in the terminal.

```bash
cd /home/saens/dev/mew/mewlink
npm ci --ignore-scripts
npm run setup
```

### 2. Obtain values for the login button

**To use Google**

1. [Google Console](https://console.cloud.google.com/) → select or create a project.

2. **Google Auth platform → Branding → Get started** → enter `mewlink` as the app name and enter an email address.

3. Select **Audience → External** → add your Google account under **Test users**.

4. Select **Clients → Create client → Web application**. Enter the address below under **Authorized redirect URIs**.

   `https://mew.saens.kr/auth/google/callback`

5. Copy the generated **Client ID** and **Client secret**.

**To use GitHub**

1. [GitHub Settings](https://github.com/settings/developers) → **OAuth apps → New OAuth App**.

2. Enter the values shown below and click **Register application**.

   | Field | Value to enter |
   | --- | --- |
   | Application name | `mewlink` |
   | Homepage URL | `https://mew.saens.kr` |
   | Authorization callback URL | `https://mew.saens.kr/auth/github/callback` |

3. Copy the **Client ID** → click **Generate a new client secret** → copy the generated secret.

**To also use Apple — Apple Developer Program membership required**

1. [Apple Developer Account](https://developer.apple.com/account/) → copy the **Team ID** under **Membership details**.

2. Under **Certificates, Identifiers & Profiles → Identifiers**, enable **Sign in with Apple** for the app ID.

3. Create a web login ID through **Identifiers → + → Services IDs**. Under **Sign in with Apple → Configure**, select the app from step 2 and save the following addresses.

   | Field | Value to enter |
   | --- | --- |
   | Domains and Subdomains | `mew.saens.kr` |
   | Return URLs | `https://mew.saens.kr/auth/apple/callback` |

4. Under **Keys → + → Sign in with Apple**, select the same app and create a key. Copy the **Key ID** and use **Download** to download the `.p8` file.

### 3. Save the values you received

Open `mewlink/.secrets.json` and add entries only for the login methods you use.

| Copied value | Name to use in the file |
| --- | --- |
| Google Client ID | `GOOGLE_CLIENT_ID` |
| Google Client secret | `GOOGLE_CLIENT_SECRET` |
| GitHub Client ID | `GITHUB_CLIENT_ID` |
| GitHub Client secret | `GITHUB_CLIENT_SECRET` |
| Apple web login ID (Services ID) | `APPLE_CLIENT_ID` |
| Apple Team ID | `APPLE_TEAM_ID` |
| Apple Key ID | `APPLE_KEY_ID` |
| Contents of the Apple `.p8` file | `APPLE_PRIVATE_KEY` |

For example, **if you use only GitHub**, enter the following. Replace the text inside the quotation marks with the actual values.

```json
{
  "GITHUB_CLIENT_ID": "복사한 Client ID",
  "GITHUB_CLIENT_SECRET": "복사한 Client secret"
}
```

Add to any existing values without deleting them. To insert the Apple file contents, use the command in the [detailed Apple instructions](#3-apple-services-id-team-id-key-id-p8) below. Do not paste actual values into this document or chat.

### 4. Deploy to Cloudflare

Run in the same terminal. When the browser opens, sign in with **the Cloudflare account that manages `saens.kr`**.

```bash
npx wrangler login
npm run deploy
```

This command automatically prepares the database and server keys.

### When ERR_TOO_MANY_REDIRECTS Appears

When the Worker rewrites a page request to `/index.html`, Cloudflare Static Assets' default HTML normalization issues a 307 redirect to `/`. The same handling repeats at `/`, causing an infinite redirect loop. For page routes, the Worker internally requests the canonical URL `/` to retrieve HTML while preserving the dashboard, registration, device, and launch URLs in the browser. [Cloudflare HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/).

With the corrected source, rerun `npm run deploy` from `mewlink/`. After redeployment, verify that `curl -I https://mew.saens.kr/` returns status `200` with no `Location: /`. Regression tests use `public/index.html` and the actual Cloudflare Assets binding instead of build artifacts to check GET and HEAD requests for central pages and internal launch pages.

### 5. Connect your mew

1. Build and apply the new version of local mew. Follow the [local installation guide](../../../docs/deployment/native.md).
2. Log in to local mew as `owner`, then click **Header menu → Mewlink → Remote Access → Register Device**. **Settings → Account** contains personal profile and password settings and has no Remote Access option.
3. On the `mew.saens.kr` page that opens, log in → enter a device name → approve registration.
4. Open the registered device link on another PC or phone to verify the connection.

The user performed the initial deployment. Provider login and P2P connections over external networks have not yet been verified. **The user runs the commands listed in this document.**

---

## Detailed references

Read the following for additional login configuration, troubleshooting, and operational information.

[Implementation and transport contract](../development/remote-access.md) · [Local installation](../../../docs/deployment/native.md) · [Work and release gates](../work/remote-access.md) · [ADR 0203](../history/decisions/0203-mewlink-workers-p2p-ui.md)

**Cloudflare implementation and local automated verification are complete; the user performed the initial deployment.** mewlink provides only login, device lists, registration, connection approval, and signaling. Actual mew HTML, JS, CSS, workers, images, and work APIs are received from registered local A over an authenticated WebRTC DataChannel. The central deployment does not include mew's `dist/` or workspaces. Supabase is not used.

## Location and deployment configuration

The central project is `mew/mewlink/`. The `/mewlink/` exclusion in the parent [.gitignore](../../../.gitignore) and the npm workspace exclusion remain in place; no separate Git repository has been created yet. The public mew project's default installation, type checking, and tests work without this folder. Central source code, dependencies, and lockfiles exist only in this folder, so the folder must be kept in a separate repository or backup.

Also exclude the previous central implementation `server/remote-central/`, dedicated tests `server/remote-central.test.ts` and `server/remote-access-authenticated.test.ts`, and previous central UI `src/components/remote-dashboard.tsx` from the public mew Git history. Deleting current files and updating [.gitignore](../../../.gitignore) alone do not clean up past commits. Keep the public connection client and shared protocol, and store central source code and recovery backups made before rewriting history outside the public repository. When restoring, ensure these files do not reenter public history.

| Component | Responsibility |
| --- | --- |
| `mewlink/src/worker.ts` | OAuth callbacks, sessions, registration, membership, single-use launch, connection proofs |
| `mewlink/src/client.ts`, `mewlink/public/index.html` | Small frontend for login, device selection, and P2P connections |
| Worker's `ASSETS` | Serves only mewlink's `dist/`. Excludes the parent mew build |
| D1 `DB` | Accounts, registration, hashed sessions, membership, single-use requests, expiration cleanup |
| Per-device Durable Object `SIGNAL` | A's persistent WSS connection, SDP and ICE for approved connections, leases and revocation |
| Public `shared/remote-access*.ts`, `src/utils/remote-*` | Connection, signing, and resource contracts shared by mew and mewlink |

The frontend and backend are bundled into **one Workers + Static Assets deployment**. There is no need to create a separate Pages project and Worker. Using Durable Objects with Pages Functions requires a separate Worker, so this configuration fits the unified deployment requirement. [Cloudflare full-stack app deployment](https://developers.cloudflare.com/workers/static-assets/), [Durable Objects binding in Pages](https://developers.cloudflare.com/pages/functions/bindings/#durable-objects).

A Node process on a production server, internal port `5002`, and an HTTPS reverse proxy are no longer required. Public access uses Cloudflare HTTPS `443`, while local A runs at the existing `localhost:5000` or configured `5001`. The development Wrangler port is not a production port.

## Access URLs and P2P UI

Users open only `https://mew.saens.kr/{중앙 계정 ID}/{기기 이름}` or `/dashboard`. The address bar retains this path. The internal connection frame opens at `https://mew-ui.saens.kr/launch/{임시 ID}`, and the actual UI within it is received from A starting with `/__mew_ui/{임시 ID}/index.html`. Absolute resource URLs for JS, CSS, and workers are also routed through a connection-specific prefix, binding dynamic imports and worker requests to the same A. Refreshing creates a new connection proof and P2P connection.

`mew-ui.saens.kr` is an **internal execution origin** attached to the same Worker. It is not a site that separately deploys the entire mew UI. It provides a boundary that separates the login host's `__Host-mew_central` cookie and authentication and account APIs from P2P app code. Merely separating `/user/device` paths under one origin allows JS on that origin to call authentication APIs. The central service's single-use launch proof, valid for 60 seconds, is passed only to the exact internal frame; central cookies and launch proofs are not passed to the actual app.

The resource Service Worker uses only the transport of the exact corresponding connection page and tab. Browser storage is scoped by central account and instance ID. Do not describe the shared app origin as security isolation between mutually untrusted devices. If A is offline or cannot be reached directly, UI and work requests fail; there is no fallback to a central HTTP proxy or TURN.

### OAuth credentials

| Provider | `mewlink/.secrets.json` entries | Exact callback |
| --- | --- | --- |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `https://mew.saens.kr/auth/google/callback` |
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | `https://mew.saens.kr/auth/github/callback` |
| Apple | `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (PKCS8 `.p8`, preserve line breaks in the JSON string) | `https://mew.saens.kr/auth/apple/callback` |
| Optional email OIDC | `EMAIL_OIDC_ISSUER`, `EMAIL_CLIENT_ID`, `EMAIL_CLIENT_SECRET` | `https://mew.saens.kr/auth/email/callback` |

Each provider is configured independently. Google and GitHub each require both an ID and a secret, and Apple requires all four values for its button to appear. You may configure and deploy one provider first and add others later. All callbacks use the **login host** `mew.saens.kr`. Do not register `mew-ui.saens.kr` or local mew ports as OAuth callbacks. The console paths and official resources below were checked on 2026-10-08.

### 1. Google: Client ID and Client Secret

1. Log in to [Google Cloud Console](https://console.cloud.google.com/) and select or create a project for mewlink using the project selector at the top. The Google Cloud project name and number are not the `GOOGLE_CLIENT_ID`.
2. Open **Google Auth platform → Branding**. For initial setup, use **Get started** to enter the app name `mewlink`, user support email, and developer contact email. Use actually published URLs for the production homepage, privacy policy, and terms of service, and set the authorized domain to `saens.kr`.
3. In **Audience**, select **External** for a service that accepts regular Google accounts. During testing, add the accounts you will use under **Test users → Add users**. Organization-only Internal access is restricted to that organization's Workspace accounts. Before public release, check the publishing status in Audience and the Branding verification requirements.
4. In **Data Access**, configure only the `openid`, email, and basic profile scopes needed for login. The current code requests `openid profile email` and does not request Drive or Gmail permissions. [Official consent screen setup guide](https://developers.google.com/workspace/guides/configure-oauth-consent).
5. Under **Clients → Create client**, select **Web application** and name it `mewlink production`. Add exactly `https://mew.saens.kr/auth/google/callback` to **Authorized redirect URIs**. Authorized JavaScript origins is not required for the current server redirect flow. If you enter a value, use only `https://mew.saens.kr` without a path.
6. From the creation screen or the client's details, copy **Client ID** to `GOOGLE_CLIENT_ID` and **Client secret** to `GOOGLE_CLIENT_SECRET`. The ID typically ends in `.apps.googleusercontent.com`. If the secret cannot be displayed, add a new secret and save its value. [Create a client](https://developers.google.com/workspace/guides/create-credentials), [Add or rotate a secret](https://support.google.com/googleapi/answer/6158849?hl=en).

For `redirect_uri_mismatch`, compare the registered callback's protocol, host, path, and trailing `/`. For test account access errors, check Test users and publishing status in Audience. Do not put a Google API key or service account JSON in the OAuth secret field.

### 2. GitHub: OAuth App Client ID and Client Secret

1. Click **New OAuth App** in [GitHub OAuth Apps settings](https://github.com/settings/developers). The menu path is profile **Settings → Developer settings → OAuth apps**. To create an organization-owned app, register it in the organization's settings with administrative permissions for that organization.
2. Enter `mewlink` for **Application name**, `https://mew.saens.kr` for **Homepage URL**, and `https://mew.saens.kr/auth/github/callback` for **Authorization callback URL**, then click **Register application**. Current central login uses web authentication, so **Enable Device Flow** is unnecessary. [Official OAuth App registration guide](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).
3. Copy **Client ID** from the app details to `GITHUB_CLIENT_ID`. Save the value generated through **Client secrets → Generate a new client secret** in `GITHUB_CLIENT_SECRET`. Save it when generated because it may not be displayed again. [Official guide to locating the Client ID and secret](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api#using-basic-authentication).
4. The currently requested scope is `read:user`. Repository access permission `repo` and Personal Access Tokens are not required for central login. Distinguish the ID of local A's Device Flow app for Git authentication from the ID of the central mewlink OAuth app.

A GitHub App's App ID, installation ID, and PAT are not substitutes for the two values above. For callback errors, correct the URL in the app details and log in again. For accounts requiring approval under organization policies, also check those policies.

### 3. Apple: Services ID, Team ID, Key ID, `.p8`

Apple requires Apple Developer Program membership and preparation to link a web Services ID to a **primary App ID with Sign in with Apple enabled**. Work with the development team's Account Holder or Admin. Simply signing in with an Apple Account does not provide access to every registration menu. [Features available by membership](https://developer.apple.com/help/account/basics/account-landing-page/), [Web authentication linking requirements](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/).

1. Select the correct team in your [Apple Developer account](https://developer.apple.com/account/) and save the **Team ID** from **Membership details** in `APPLE_TEAM_ID`. This is the 10-character team identifier assigned by Apple, distinct from the App Store Connect Issuer ID. [Official Team ID guide](https://developer.apple.com/help/glossary/team-id/).
2. Under **Certificates, Identifiers & Profiles → Identifiers**, select the App ID to link and enable **Sign in with Apple**. If there is no App ID, register an explicit Bundle ID for the app and configure the capability. Use this App ID as the primary App ID in the next step; enter the Services ID in `APPLE_CLIENT_ID` for web login.
3. Register a new web identifier through **Identifiers → + → Services IDs**. Set Description to `mewlink web` and Identifier to a reverse-domain name unique within the team (for example, `kr.saens.mewlink.web`). Do not use the example string as though it were an automatically issued value; save the actually registered Identifier in `APPLE_CLIENT_ID`.
4. Open the Services ID and select the primary App ID above under **Sign in with Apple → Configure**. Register `mew.saens.kr` (without a protocol or path) under **Domains and Subdomains** and `https://mew.saens.kr/auth/apple/callback` under **Return URLs**, then save through **Done → Continue → Save**. Current official Apple guidance does not require uploading a domain verification file to the server for this registration. [Configure the Services ID and web URLs](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/).
5. Under **Keys → +**, enter `mewlink Sign in with Apple` as the name and select **Sign in with Apple**. Link the same primary App ID under **Configure**, then register the key. Save **Key ID** from the key details in `APPLE_KEY_ID` and use **Download** to download the `.p8` file. Use a key for Sign in with Apple rather than a `.p8` key for the App Store Connect API. [Create an Apple sign-in key](https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key/).
6. `APPLE_PRIVATE_KEY` is the **entire file contents** from `-----BEGIN PRIVATE KEY-----` to the end, not the path to the `.p8` file. The file can be downloaded only once, so protect it and back it up separately. [Official key download and storage guide](https://developer.apple.com/help/account/keys/create-a-private-key/).

To safely store the actual line breaks in `.p8` as a JSON string, **the user runs the following from `mewlink/`**. Replace only the argument with the actual absolute path to the downloaded file. It reads the existing configuration and adds only this key, preserving other provider values and the automatically generated `SIGNING_KEY`. It does not print the key contents to the terminal.

```bash
node --input-type=module - '/절대/경로/AuthKey_실제KeyID.p8' <<'NODE'
import fs from 'node:fs/promises'
const file = '.secrets.json'
const settings = JSON.parse(await fs.readFile(file, 'utf8'))
settings.APPLE_PRIVATE_KEY = await fs.readFile(process.argv[2], 'utf8')
await fs.writeFile(file, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 })
await fs.chmod(file, 0o600)
NODE
```

Line breaks in the file contents appear as `\n` in JSON and are restored to actual line breaks after parsing. Do not manually double-escape them. `APPLE_CLIENT_SECRET` is not a current configuration entry. The Worker creates a short-lived client secret JWT from the four values above, so do not separately obtain and paste a long-lived JWT.

### 4. Optional email OIDC: Obtain from the provider

You can start with Google, GitHub, or Apple. Set up an OIDC provider supporting email, magic links, or similar methods only if separate email login is needed. This project has not selected an email provider, so follow the selected provider's instructions for console menu names.

1. Register a **server-side web application (confidential client)** under Applications/Clients in the provider console. Verify support for Authorization Code, PKCE `S256`, `openid profile email`, signed ID tokens, and JWKS.
2. Register `https://mew.saens.kr/auth/email/callback` as an allowed callback/redirect URL. Enter the issued Client ID and Client Secret in `EMAIL_CLIENT_ID` and `EMAIL_CLIENT_SECRET`, respectively.
3. Copy the **issuer** shown in the application's OpenID Connect settings or discovery document to `EMAIL_OIDC_ISSUER`. Use the exact original `https://` issuer; do not enter the discovery document URL itself, a login page, or a JWKS URL. Do not arbitrarily remove any path or trailing `/`. mewlink uses issuer discovery, so the configured value must match the issuer returned by the provider. [OIDC Discovery standard](https://openid.net/specs/openid-connect-discovery-1_0.html).
4. Enable email login in the provider console and configure the provider's sending domain and SMTP if needed. Current mewlink does not use `SMTP_PASSWORD` or an email API key. The provider is responsible for sending email and managing passwords.

### 5. Copy into the configuration file

`npm run setup` creates only an empty `mewlink/.secrets.json` and does not issue provider credentials. Use string values and commas in JSON, without comments. The following is an **example with fake values that enables only Google and GitHub**. Refer to its structure for initial setup; if the existing file contains `SIGNING_KEY`, add only the required entries instead of overwriting the entire file.

```json
{
  "GOOGLE_CLIENT_ID": "발급받은-client-id.apps.googleusercontent.com",
  "GOOGLE_CLIENT_SECRET": "발급받은-Google-secret",
  "GITHUB_CLIENT_ID": "발급받은-GitHub-client-id",
  "GITHUB_CLIENT_SECRET": "발급받은-GitHub-secret"
}
```

To add Apple, add the four entries above to the same object; to add email OIDC, add the three entries above. Omit entries for unused providers. Changing a secret does not automatically update an already deployed Worker. When the user reruns `npm run deploy`, the changes are applied through `wrangler deploy --secrets-file`. Removing entries from the file alone does not delete existing Worker secrets, so separately verify that remote secrets are deleted when disabling a provider.

### 6. Cloudflare authentication and automatically generated values

The default deployment uses Wrangler's browser OAuth login, so a separate Cloudflare API token is unnecessary. From `mewlink/`, the user runs `npx wrangler login` to log in to the account that manages `saens.kr` and checks the target account with `npx wrangler whoami`. [Official Wrangler login guide](https://developers.cloudflare.com/workers/wrangler/commands/#login).

| Value | Where to obtain it and how it is handled | Storage location |
| --- | --- | --- |
| Cloudflare Account ID | If you need to select a target from multiple accounts, copy the target account's ID from the Dashboard. You can also find the Account ID in the Overview for the `saens.kr` zone. Specify it through `CLOUDFLARE_ACCOUNT_ID` in the deployment environment. | Deployment shell environment variable. Do not put it in `mewlink/.secrets.json` |
| Cloudflare Zone ID | Zone ID in the `saens.kr` Overview. The current deployment script does not accept it as direct input. | No manual configuration required |
| `CLOUDFLARE_API_TOKEN` | For noninteractive deployment such as CI, issue a token through profile → API Tokens → Create Token in the Dashboard. It must permit Workers, D1, and domain operations for the target account and zone. Omit it when using local browser login. | CI secret store or deployment shell environment variable. Do not put it in the Worker OAuth configuration file |
| D1 `database_id` | `npm run deploy` looks it up by the name `mewlink`, creates it if absent, and records the UUID. Stops if a different ID is already present. | `mewlink/wrangler.jsonc` |
| `SIGNING_KEY` | Automatically generates an Ed25519 private JWK during initial deployment when neither a remote nor a local key exists. This value is not issued by an OAuth provider. | JSON string in `mewlink/.secrets.json` and a Worker secret |
| Central and app origins | `CENTRAL_ORIGIN` and `APP_ORIGIN`, already configured for the current domains. These are not IDs or secrets. | `vars` in `mewlink/wrangler.jsonc` |
| Central account ID and device URL | Generated by mewlink after provider login and device registration. Distinct from the OAuth Client ID and Cloudflare Account ID. | Available in the dashboard and device links |

[Find Account and Zone IDs](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/), [Deployment environment variables](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/), [Issue an API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/). Cloudflare credentials authenticate deployment tools, while OAuth secrets from Google and other providers are for user login; they are not interchangeable. If A is already registered, retain the existing key and backups instead of creating a new `SIGNING_KEY`.

#### Handling a missing Worker during initial deployment

During initial deployment, `wrangler secret list` may return `Worker "mewlink" not found.`. In this case, the deployment script proceeds with no remote secrets, prepares the required signing key, then deploys the Worker and secrets together using `deploy --secrets-file`. Other lookup errors, including authentication, permission, and network errors, stop deployment; protection of the existing Worker's signing key remains in place.

#### When deployment stops due to a D1 ID mismatch

`기존 D1 ID와 이름이 다릅니다` or `D1 ID 불일치` means that the ID stored in `wrangler.jsonc` differs from the UUID of the database with the same name in the current account. The process stops without automatically switching databases.

Run the following query commands from `mewlink/`.

```bash
npx wrangler whoami
npx wrangler d1 list --json
```

First verify that the target Cloudflare account is correct. If it is a different account, correct the deployment account. If the account is correct and `mewlink` in the list is the database to use, change `database_id` for the `DB` binding under `d1_databases` in `wrangler.jsonc` to the returned `uuid`, then rerun `npm run deploy`. If you are restoring existing accounts and device registrations, do not substitute an empty database; first check the account containing the existing database and its backups. This recovery does not require deleting the database or regenerating the signing key. [D1 query commands](https://developers.cloudflare.com/d1/wrangler-commands/).

Google/GitHub/email use Authorization Code + PKCE; Apple uses the official confidential-client flow with `form_post`, state, and nonce. Apple's metadata does not declare PKCE support, so do not assume it applies. OIDC validates the issuer, audience, nonce, expiration, and JWKS signature. The login cookie for Apple's cross-site POST uses `SameSite=None`, and the central session cookie uses `SameSite=Lax`. Identities are identified by provider/issuer/immutable subject; accounts are not merged based on matching email addresses.

[Google web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [GitHub web OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [Apple web authentication configuration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/), [Apple authentication metadata](https://appleid.apple.com/.well-known/openid-configuration).

## State, keys, and recovery

The host waits 5 seconds for a response to its heartbeat sent every 20 seconds, retransmits once and waits another 5 seconds, then forcibly closes and reconnects WSS. The handshake is limited to 30 seconds. The host monitoring fix must be applied to the server. The lightweight presence API, cause-specific browser recovery, and authentication body limits separately require a central launcher build and Worker deployment. See [implementation, verification, and private source retention scope](../work/mewlink-efficient-recovery.md). If the central `offline` status differs from the host's `online` status, check whether the server process is running and whether this response monitoring has been applied. Follow the [remote access contract](../development/remote-access.md#reattaching-the-same-rtc-after-a-brief-signaling-interruption) for detailed liveness checks and RTC retention criteria.

Apply the D1 migrations in order from `mewlink/migrations/0001_accounts.sql` through `0006_instance_rate_keys.sql`. Central management sessions expire after 7 days, login/registration requests after 5 minutes, and launch after 60 seconds; replay-prevention proofs and rate limits each have their own expiration values. An hourly Cron removes expired rows while retaining browser access revocation records. The DO preserves browser key fingerprints, authentication, and negotiation state in WebSocket attachments and revalidates them after hibernation. A's heartbeat every 20 seconds is handled with automatic responses; offline status is determined after 60 seconds without a response, with expiration checks every 10 seconds. Open work connections have a 60-second lease renewed every 20 seconds; browser revocation and registration revocation send termination messages to the corresponding DO and A. Follow the [remote authentication contract](../development/remote-access.md#approved-mewlink-account-login) for the boundary between central logout and local trusted sessions.

The central Ed25519 `SIGNING_KEY` is generated during the initial deployment and stored in protected `mewlink/.secrets.json` and a Worker secret. `.deployment-state.json` records only the deployed public key fingerprint. The existing Worker's key is not automatically replaced with a different value. If the local key is missing, the already deployed Worker secret is retained. If the key is lost and the Worker secret has also been deleted, a new key will differ from the public key pinned on existing A instances, requiring recovery or explicit re-registration. Automatic key rotation is not provided.

Back up a consistent D1 export/recovery set together with the signing key. Automatic migration of `central.sqlite` and `signing-key.json` from the former Node central service is not provided. If actual historical registrations exist, check the keys, accounts, and registrations, then perform a separate migration or re-registration approved by the owner. Retention/privacy notices, account deletion, and disaster recovery exercises are pre-release operational gates.

Do not log OAuth callback query/form data, Cookie, launch, registration codes, SDP, ICE, or connection proofs. The Wrangler configuration disables invocation logs, and error responses contain no secrets. No central `/api` route is provided for user work data.

## Members, configuration, and verification

A's default central address is `https://mew.saens.kr`; `MEW_REMOTE_ORIGIN` changes the initial registration target. After registration, the saved origin and key are used, so changing the address/key requires unregistering and re-registering. CLI `./mew remote-access account` provides guidance only and does not replace owner authorization. The local bind and port are retained.

Members first log in to the central service and click their name in the header to copy their account ID. A's owner links this ID to an existing local account under **Member Access**. Temporary passwords, roles, features, and file permissions continue to be checked locally. Revoke access on A; delete the central registration through the owner dashboard or by unregistering A.

```bash
# 공개 mew: 빌드·서비스에 영향을 주지 않는 검증
npx tsc -b
npm run lint
node --test server/remote-ui.test.ts server/remote-access.test.ts

# 비공개 중앙: Cloudflare 런타임과 실제 브라우저/네이티브 RTC 검증
cd mewlink
npm run check
npm test
npm run test:browser
```

Browser integration tests use Chromium, native RTC, and rolldown from the parent mew development environment and compile a small test fixture in memory. They do not use or build the actual app's `dist/`. Current verification covers Worker/D1/DO registration, permissions, one-time approval, hibernation, and logout; OAuth using provider response fixtures; and P2P UI, workers, resources, refreshes, and multiple tabs with actual Chromium and A. The user performed the Cloudflare production deployment; production application of the fixes is checked after redeployment. Actual OAuth app login and success rates for Windows/WSL/Mac ↔ Android/LTE/5G have not been verified. Follow the [work record](../work/remote-access.md) for general release decisions.

## Preserving and restoring signaling authorization state

Device and browser authorization state is also persisted in each device's DO SQLite. The central code creates the `mew_signal_instances` and `mew_signal_browsers` tables and imports existing D1 records on first access. Apply this through central redeployment without D1 schema changes, device re-registration, or restarting local mew. [Current authorization contract](../development/remote-access.md#central-signaling-authorization-state) · [ADR 0025](../decisions/0025-mewlink-signaling-authority.md).

Browser revocation and device revocation are recorded in the DO first, then D1 is updated. Even if the management request fails because the D1 update fails, the DO revocation remains in effect. Rerun the same revocation request to confirm that it is reflected in D1. Do not resolve errors at this stage by re-registering the device or deleting DO state.

Backups include the DO's persistent authorization state along with the central signing key and D1. A D1 export alone cannot restore DO revocation records that have not yet been reflected in D1. Before rolling back to an older version, confirm that revocation records are reflected in D1 and terminate open connections. When restoring state, do not overwrite DO revocations with old active records. Follow [Cloudflare PITR](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#pitr-point-in-time-recovery-api) for DO SQLite recovery capabilities.

## localhost app preview origin

Port connections at `mew.run/<user>/<device>/<port>` require `PREVIEW_DOMAIN=preview.mew.run` and the `*.preview.mew.run/*` Worker route. Point proxied wildcard DNS to the same Worker and prepare an HTTPS certificate for `*.preview.mew.run`. The default `*.mew.run` certificate alone does not cover nested subdomains. Each preview uses a separate random hostname, and app assets, APIs, and WebSockets are forwarded over the existing P2P transport.

`wrangler deploy` registers a wildcard Worker route but does not create a DNS record for that route. DNS `ENOTFOUND` may persist even after redeploying the central service. Follow the DNS prerequisites for [Cloudflare Worker routes](https://developers.cloudflare.com/workers/configuration/routing/routes/).

When retaining the current `PREVIEW_DOMAIN=preview.mew.run`, prepare the following record under **mew.run → DNS → Records** in Cloudflare.

| Item | Value |
| --- | --- |
| Type | `CNAME` |
| Name | `*.preview` |
| Target | `mew.run` |
| Proxy status | **Proxied** |
| TTL | Auto |

This DNS record routes `*.preview.mew.run` to the same Worker. A record for `preview.mew.run` itself does not handle random hostname lookups. [Deep wildcard DNS](https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/) is supported, but HTTPS requires an active Edge Certificate that explicitly includes `*.preview.mew.run`. The default Universal SSL `*.mew.run` does not secure this address, so check existing certificates before deciding how to provision the required certificate. Follow [Universal SSL coverage](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/).

The user deploys after applying the central `src/port-preview.ts`, `public/port-preview-launch.js`, `public/port-preview-worker.js`, and `public/port-preview-runtime.js` together with the Worker entry point, client, and configuration. Follow [port preview](../development/port-preview.md) for detailed permission/security boundaries and unsupported items. This work did not include central deployment, actual domain checks, or external network checks.

In the read-only check on 2026-10-27, the public device preview entry point returned HTTP 200, but DNS lookups for `preview.mew.run` and different random subhosts returned `ENOTFOUND`. Even with Worker configuration in place, previews cannot connect unless external DNS is ready. This check did not change DNS, certificates, or the Worker deployment.

Operators check readiness in the following order.

1. Point the `*` DNS record under the domain matching `PREVIEW_DOMAIN` to the same Worker, and verify its proxied status and the `*.preview.mew.run/*` route.
2. Verify an active HTTPS certificate that explicitly includes `*.preview.mew.run`. Do not substitute a certificate that includes only `*.mew.run`.
3. Verify DNS and the HTTPS response from `https://<난수>.preview.mew.run/__mew_preview_launch` on a newly created subhost with a 32-digit base-16 name. Do not stop after checking only the public device page's 200 response.
4. Apply the host and public preview launcher fixes respectively, then check modules, APIs, and WebSockets at `/<port>` on the actual device address. Follow the [preview contract](../development/port-preview.md#mewlink) for remote initialization failures and the 15-second limit.

From the repository root, use the following command to perform read-only checks of DNS, HTTPS, the launcher, and public assets on two different random hosts matching the configuration. This command does not create DNS records, certificates, or Workers, or build the app.

```bash
npm run check:port-preview
npm run check:port-preview -- --config mewlink/wrangler.jsonc
```

If `PREVIEW_DOMAIN` is empty, report previews as disabled and skip the checks. Exit with failure if any configured preview DNS, HTTPS, Worker response, Service Worker scope, or launcher initialization completion notification is not ready. The private `mewlink/scripts/deploy.mjs` also runs the same checks after Worker deployment and does not print the overall completion message if readiness checks fail. Worker changes may already have been applied at that point and are not automatically rolled back. After DNS and HTTPS are ready, only the checks above can be rerun. Passing these checks does not establish successful actual login, P2P connection, or upstream app display.
