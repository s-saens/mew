---
title: "Accounts, permissions, and Mewlink identity linking"
description: "Covers first-administrator browser setup, personal profiles, owner management of account roles and feature/file permissions, per-account restoration of all feature defaults, temporary password resets from account popups, Mewlink identity linking and merging, and the host user management CLI. Links to owning security and implementation contracts."
created: 2026-10-22
updated: 2026-11-05
상위파일: "MOC.md"
---

# Accounts, permissions, and Mewlink identity linking

Covers account actions in the app and user management commands on the host. Follow the [Security operations standards](../operations/security.md) for permissions by role and precautions before sharing, and [Appearance settings](appearance.md) for visual preferences.

## First administrator

On a fresh installation, open the browser page launched by Mew or the private link printed by source setup. Enter your email, choose a password of at least 10 characters, and confirm it. Mew creates the administrator account and signs you in. This password does not need an initial reset. Existing installations show their ordinary login flow and keep all accounts.

If the page says to reopen Mew, use the Windows shortcut again. A source operator can rerun setup, or request a replacement token with `npm run users -- setup --json` while enrollment is still pending and open `<local-address>/#setup=<token>` locally. Treat the token as a password. Account loss after initialization requires local recovery rather than another signup. [Installation guide](../guides/getting-started-en.md#finish-setup) · [Bootstrap and recovery contract](../../.mew/docs/development/first-owner-setup.md).

## My account and account management

- **Log in**: Sign in with the email address and temporary password registered by an administrator, and change your password on your first password login. When accessing through Mewlink, you can also log in with an approved external account. Public signup is not available.
- **My Account**: Go to Menu → Settings → Account to change your display name, profile image, or password, or to log out. Changing your password invalidates password sessions on other devices. The password form is not shown to external-only users without passwords, and external logout ends the central session.
- **Account Management (owner)**: Go to Menu → Account Management, choose an email and role to add an account, and send the issued temporary password to that user. The permission tables show accounts and guest as columns, with roles and permission items as rows. Click an account photo or initial for account actions. Checkbox changes are saved immediately. The reset icon below each account photo in **Feature Permissions** restores all of that account's feature permissions to its role defaults. It is disabled when there are no overrides and leaves other accounts, roles, and file/folder rules unchanged.
- **Remote Access (owner)**: In local mew, click **Header Menu → Mewlink → Remote Access → Register Device**. Mewlink login manages device registration, listing, and deletion, while visitors to a device address log in with a local password or an approved external identity. Approving a request in **Account Management → Mewlink Account Access** immediately registers a member without a password; revoke external login on the same screen. Change roles in Account Management. Registration itself does not grant external access permissions. [Device registration](../../.mew/docs/operations/remote-central.md#5-connect-your-mew) · [Identity linking](../../.mew/docs/development/remote-access.md#approved-mewlink-account-login).
- **Host Administration**: Use the CLI below to create the initial owner, reissue passwords, or delete accounts. [Security](../operations/security.md#roles) is the canonical source for permissions by role.

Click the profile photo in My Account to open the **Default**, **Choose Photo**, and **Paste from Clipboard** menu. **Default** restores the default photo display. After changing the photo or display name, click **Save** to the right of the name field.

In the **File and Folder Permissions** tab, browse folders or enter a relative path, then select Inherit, Block, Read, or Edit for each account. Folder rules apply to descendants, and more specific rules take precedence. Disabling file reading or editing in the feature table overrides per-file allowances. Guest settings apply to all visitors who are not logged in.

To reset another user's password, click their photo or initial in either permission table, choose **Reset password**, and confirm. Copy the temporary password from the popup and send it securely to that user before closing it; it is not displayed again. Existing browser login sessions for that account end, and the user must choose a new password when they next sign in with a password. A failed reset can be retried in the same popup. Your own password is changed in **Settings → Account**. Accounts that only use Mewlink have no local password to reset; manage their external access under **Mewlink Account Access** instead. Password reset preserves account roles and permissions and does not revoke approved external identity connections.

### Linking Mewlink to an Existing Email Account

Verify both login methods within the same Mewlink connection. If you already have an email account, you can link it yourself without new access approval.

1. Log in with Mewlink at the Mewlink device address. On the access request screen, log in with your existing Mew email and password.
2. Open **Settings → Account → Link Mewlink Account**. If you are already logged in as a separate Mewlink user, click **Log In with an Existing Email Account**. When the screen reopens after email login, open **Settings → Account** again.
3. Check the Mewlink ID and the email to link, then click **Link to This Account**. Confirm that **Linked to Email** appears.

Afterward, that Mewlink ID connects with the email account's permissions and personal settings. If an existing Mewlink link exists, it is moved to the email account, and access through the old link is revoked. After merging, a previous account with no password or other Mewlink login remaining is automatically deleted and disappears from Account Management. Its existing sessions, trusted browsers, Git connections, and permissions are also revoked. Previous work records, files, and personal settings are preserved and are not automatically transferred to the target account. Accounts with other login methods remaining are retained, and merges that would delete the last owner are rejected. For a connection without a Mewlink identity, first **Log In with Mewlink**, then follow the same steps.


Server control features such as agents and terminals are not restricted by file rules. Terminal agents require both agent and terminal permissions. Storage and application scope follow the [permissions contract](../../.mew/docs/development/access-control.md).

## User management (on the host)

```bash
npm run users -- add <email> [role]   # 임시 비밀번호 발급 — 첫 로그인 때 변경 강제 (role 생략 시 member)
npm run users -- role <account-id> <role>  # 기존 계정의 역할 변경 (owner|manager|member)
npm run users -- reset <email>        # 임시 비밀번호 재발급 + 기존 세션 전부 무효화
npm run users -- remove <account-id>  # 사용자 삭제 (비밀번호·외부 연결도 회수)
npm run users -- list
```

Send temporary passwords to the users themselves through a secure channel. Source `./mew setup` and the prebuilt launcher use the browser flow above by default. Explicit local administration can still create an owner with `add <email> owner`, issuing a temporary password. The prebuilt CLI retains `--owner-email` for this automation. These commands are recovery or unattended-administration tools; later account management remains owner-only.

For existing email accounts, `account-id` is the email address; for external-only users, find the immutable ID in `list`. `role` and `remove` accept both forms. `reset` is for email-and-password accounts and does not create passwords for external-only IDs.
