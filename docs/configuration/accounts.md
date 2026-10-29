---
title: "Accounts, permissions, and Mewlink identity linking"
description: "Covers the photo menu and saving the display name for your account; owner management of accounts and feature/file permissions; linking Mewlink identities to existing email accounts, including deletion of the previous account when merging; and the host user management CLI. Links to separate owning documents for role and sharing security standards and implementation contracts."
created: 2026-10-22
updated: 2026-10-26
상위파일: "MOC.md"
---

# Accounts, permissions, and Mewlink identity linking

Covers account actions in the app and user management commands on the host. Follow the [Security operations standards](../operations/security.md) for permissions by role and precautions before sharing, and [Appearance settings](appearance.md) for visual preferences.

## My account and account management

- **Log in**: Sign in with the email address and temporary password registered by an administrator, and change your password on your first password login. When accessing through Mewlink, you can also log in with an approved external account. Public signup is not available.
- **My Account**: Go to Menu → Settings → Account to change your display name, profile image, or password, or to log out. Changing your password invalidates password sessions on other devices. The password form is not shown to external-only users without passwords, and external logout ends the central session.
- **Account Management (owner)**: Go to Menu → Account Management, choose an email and role to add an account, and send the issued temporary password to that user. The feature permissions table shows each account and guest as rows and features as columns. Checkbox changes are saved immediately, and Reset restores the role defaults. Roles are also changed in the same table.
- **Remote Access (owner)**: In local mew, click **Header Menu → Mewlink → Remote Access → Register Device**. Mewlink login manages device registration, listing, and deletion, while visitors to a device address log in with a local password or an approved external identity. Approving a request in **Account Management → Mewlink Account Access** immediately registers a member without a password; revoke external login on the same screen. Change roles in Account Management. Registration itself does not grant external access permissions. [Device registration](../../.mew/docs/operations/remote-central.md#5-connect-your-mew) · [Identity linking](../../.mew/docs/development/remote-access.md#approved-mewlink-account-login).
- **Host Administration**: Use the CLI below to create the initial owner, reissue passwords, or delete accounts. [Security](../operations/security.md#roles) is the canonical source for permissions by role.

Click the profile photo in My Account to open the **Default**, **Choose Photo**, and **Paste from Clipboard** menu. **Default** restores the default photo display. After changing the photo or display name, click **Save** to the right of the name field.

In the **File and Folder Permissions** tab, browse folders or enter a relative path, then select Inherit, Block, Read, or Edit for each account. Folder rules apply to descendants, and more specific rules take precedence. Disabling file reading or editing in the feature table overrides per-file allowances. Guest settings apply to all visitors who are not logged in.

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

Send temporary passwords to the users themselves through a secure channel. For source installations, create the initial owner with this administration CLI or `./mew setup`. The prebuilt execution CLI creates the same temporary-password account when the first email is entered—afterward, an owner can change other accounts' roles in the in-app settings popup.

For existing email accounts, `account-id` is the email address; for external-only users, find the immutable ID in `list`. `role` and `remove` accept both forms. `reset` is for email-and-password accounts and does not create passwords for external-only IDs.
