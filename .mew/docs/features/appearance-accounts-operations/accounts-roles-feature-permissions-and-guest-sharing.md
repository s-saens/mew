---
id: "mew-settings-accounts-access"
parent: "mew-settings"
title: "Accounts, roles, feature permissions, and guest sharing"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-30"
status_hash: "65b2a28fe6a84c2ae5140eff868f32aefcd8cd25f5aabc3ea17d470b8cd0ec3d"
files: ["src/components/account-access-matrix.tsx", "src/components/account-role-select.tsx", "src/components/account-column-headers.tsx", "src/components/account-profile-form.tsx", "src/components/AdminSettingsModal.tsx", "src/components/mewlink-access-settings.tsx", "src/components/mewlink-account-connection.tsx", "src/components/SettingsModal.tsx", "src/components/LoginPage.tsx", "server/access-policy.ts", "server/auth.ts", "server/authRoutes.ts", "server/mewlink-identities.ts", "server/mewlink-auth-routes.ts"]
commits: []
description: "Defines My Account with a photo menu and a Save button beside the name, an account management dialog the same size as Settings, a responsive add form, permission tables with profile photo columns and item rows, and account popups and role lists within the modal. Covers passwords, logout, owner management of roles, feature/file permissions and deletion, Mewlink access approval, email account linking, merging and revocation, guest path permissions, and revocable public file/folder links with viewing or editing, explorer badges, and a minimal anonymous editor; excludes device registration and public sign-up."
상위파일:
  - "MOC.md"
  - "_appearance-accounts-operations.md"
---

## Requirements

- Manage accounts and the scope of file and feature access.

### Scope

- Provides personal profile, password, and logout controls, owner management of accounts, roles, and feature/file permissions, and guest path sharing.

- My Account places **My Account** and the email address at the upper right of the profile photo, with the display name input and **Save** button side by side below them. The profile photo serves as a button that opens a menu with **Default**, **Choose Photo**, and **Paste from Clipboard**. No separate file selection or photo removal buttons, or file extension/size guidance, are displayed.

- Feature and file permission tables place profile photos in columns and roles and permission items in rows. A default icon is displayed if a photo is missing or fails to load. Pressing a photo provides the name, account ID, role changes, and account deletion. For guest, only a group icon and name are displayed.
- Deletion requires confirmation within the popup, and failures can be retried in the same place. Users cannot delete themselves or the last owner. Account deletion revokes login and feature/file permissions while preserving project files, personal settings, and work records.

- When an owner approves an access request from a Mewlink login identity, a member without a password is registered immediately and displayed in the approved account list. Roles are changed in account management.
- Users with an existing email account link it themselves under **Settings → Account → Link Mewlink Account**. This requires both a verified Mewlink identity on the same connection and a completed email/password login. An existing Mewlink link can also be moved, using the email account's permissions and personal settings. A previous account with no remaining login method is deleted as part of the merge, and its sessions, Git credentials, and feature/file permissions are revoked. Accounts with a remaining password or another external identity are retained, and deletion of the last owner is rejected. Previous work records and files are preserved and are not automatically transferred to the target account. Accounts are not automatically linked based on a matching email or device registration account. Unlinking revokes only external login.

- Mewlink device registration and connection settings open in a separate window from **Mewlink** in the owner-only hamburger menu. Account management contains only access approval and revocation for external identities.

### Boundaries and limitations

- There is no public sign-up.
- Guest path permissions apply to ordinary logged-out workspace visitors. Public links separately authorize only the published file or folder, without creating an account or granting workspace access.
- Server control features are not sandboxed by file permissions.

### Public file and folder links

- An owner or manager with the required file permissions opens **Publish** from a file or folder context menu. The compact dialog offers **Not public**, **Public viewing**, and **Allow editing**, with a copyable link when published. An eye at the far right of an explicitly published explorer item indicates viewing; a pencil indicates editing. Unpublished items have no badge. Publishing a folder does not add badges to each child.
- Links use `/share/f/{id}` for a file and `/share/d/{id}` for a directory. The ID is generated from 32 random bytes. Direct links use the current mew origin; Mewlink links append the share path to the validated public device address. They do not contain local workspace paths.
- A file link opens its editor or media view without workspace panels, account controls, terminals, agents, or project navigation. A folder link adds a lazy explorer rooted at that folder. Markdown uses the existing document editor, with a source toggle; code and text use the existing source editor. Public editing saves existing UTF-8 text content up to 10 MiB, without NUL bytes, with serialized revision checks. Conflicts preserve the visitor's draft instead of overwriting a newer file.
- **Not public** deletes the stored record and invalidates its ID. Publishing again generates a new ID. Changing View/Allow editing keeps the existing ID and updates server authorization immediately. Every public request validates the record, target identity, creator account, and current permissions. Open pages recheck on focus and every 15 seconds while visible; revocation hides their editor at the next successful check.
- Public capabilities do not alter the guest feature or path rules. They do not grant creation, deletion, renaming, uploads, comments, database operations, or collaborative editing. File links cannot read sibling attachments. Folder links can resolve local links and media only inside their published root. External image URLs remain external resources. Unsupported binary formats provide a download.
- Server state, secret files, blocked path segments, symbolic links, and worktree internals are excluded. The publishing account must retain its management role and file permissions. The host must remain running and reachable. Mewlink requires the corresponding central launcher changes to be applied separately.

### Detailed contracts

- [Public sharing decision](../../decisions/0097-public-file-folder-links.md) · [Implementation and verification record](../../work/public-file-folder-links.md)
- [Account and appearance settings](../../../../docs/configuration/accounts.md) · [Permissions contract](../../development/access-control.md) · [Security policy](../../../../docs/operations/security.md)
- [Mewlink identity, access request, and account storage contract](../../development/remote-access.md#approved-mewlink-account-login)

<!-- mew:implementation:start -->
## Implementation details

- `server/public-shares.ts` stores capability records in `MEW_DATA_DIR/public-shares.json` with atomic writes and private permissions. Records bind to the publishing account and canonical workspace, project root, and target. `server/public-share-routes.ts` provides owner/manager management routes and the separate anonymous capability API before ordinary file middleware. `shared/public-share.ts` owns wire types; explorer trees carry only explicit `publicShare` mode metadata.
- `src/components/public-share-dialog.tsx` and `FileTree.tsx` manage publication and badges. `src/components/public-share-page.tsx` hosts the constrained editor; its serial save model retains drafts and sends the last confirmed version. Public raw responses retain sandbox headers over HTTP and Mewlink. The dispatcher admits only the exact capability routes without local login; other work APIs and all work WebSockets retain their authentication requirements.

- The photo button in My Account displays a black overlay and pencil icon on hover or keyboard focus. In the shared `ActionMenu`, **Default** resets the draft photo to the default display, while **Choose Photo** and **Paste from Clipboard** update the image draft. The photo and display name are applied together with **Save**. Validation for JPG, PNG, WebP, GIF, and a maximum size of 512KB is retained, and selecting or pasting an image that does not meet these conditions displays an error. Unsupported clipboard reading, denied permission, and no image on the clipboard are also reported as errors.
- The account management dialog uses the shared `DialogFrame` focus trapping/restoration and Esc/back navigation rules. A small title, account count, and add/close icons are grouped in the header, and the Add button expands the email addition form. Short tabs switch between feature and file permissions, repeated guidance is collapsed, and Mewlink access management is placed below. The dialog size is fixed to match Settings: 740px wide and 70vh high on desktop, fullscreen on mobile, with scrolling inside the body.
- The add-account form aligns email, role, and the Add button in one row on desktop. Below 640px, email occupies the first row and role/Add the next, with matching control heights. Inputs and form collapsing are disabled while saving, and failures are announced with `role="alert"`. The issued temporary password is dismissed using an X icon with an accessible name and tooltip.
- The account photo popup groups the profile, a custom role selector, and the delete action. It is portaled into the nearest `DialogFrame`, and the actual fixed-position origin is measured to subtract coordinate offsets caused by background blur. It opens 4px below the photo and chooses the side with more space when there is insufficient room below. It maintains an 8px margin inside the intersection of the modal and visual viewport. Its maximum width is 288px, and it scrolls internally when height is insufficient. It is repositioned when table scrolling, screen size, theme, or content size changes.
- The role list inside the photo popup is portaled separately into the same modal to prevent clipping at the photo popup's scroll boundary. The role field and list use a width of 160px. Esc/back navigation closes the role list, photo popup, and modal one layer at a time, and closing the photo popup returns focus to the triggering photo. Adequate touch targets are provided for the photo and close button, and role-change/delete buttons for the last owner are disabled.
- The owner-only `DELETE /api/admin/users/:accountId` checks whether the account exists, is the current user's account, or is the last owner. It removes passwords, trusted browser sessions, Mewlink links and approval requests, and per-account file rules and feature overrides in all workspaces. Registering the same ID again does not restore previous sessions or permissions. The demo applies the same deletion and protection behaviors to virtual state within the tab.

- Feature and file permission tables fit their content width rather than stretching across the entire dialog. The item column is 128px wide, and account columns for feature permissions are 64px wide. The role row uses icon buttons: a crown for owner, a checked shield for manager, and a person for member. Pressing one opens a selection list showing the same icons alongside role names. Guest is displayed with a group icon and its role cannot be changed. The last owner's role button is disabled. File permission columns widen to fit the selected text. With many accounts or a narrow screen, the table scrolls horizontally internally.

- Feature permissions display roles and individual features as rows; file permissions display settings and currently applied values as rows, sharing profile photo headers. Headers and item names remain fixed during internal table scrolling. The feature table has a minimum visible area of 96px so photo buttons can be pressed even in short windows, and the outer body also scrolls when necessary. Account control popups opened from photos are positioned within the screen and close first on an outside press, Esc, or back navigation. Role and file permission selections use a small shared dropdown, and an icon beside each checkbox restores the feature's default. Role list icons are also shared by account photo popups and the add-account form.

- Provides Mewlink login, access requests, and approval waiting on the login screen, plus immediate approval, rejection, and unlinking in owner account management. In My Account, users logged in with their existing email add or move their own Mewlink link. Moving an already approved link issues a new link ID and revokes previous external access. After merging, a previous account with no login method is atomically deleted from the account directory so duplicate accounts do not remain in account management or permission tables. New users do not create a local password, and the password change form is hidden in settings. Existing email login and temporary password changes are retained.
- Accounts, passwords, external links, and requests are stored separately and atomically in `users.json` v2, preserving existing email IDs and data. Profile changes through external authentication do not clear an existing password-change requirement.

- Account addition, role changes, file path scopes, and file permission selections use a shared custom dropdown while preserving existing storage and permission boundaries.

- Provides personal profile, password, and logout controls, owner management of accounts, roles, and feature/file permissions, and guest path sharing.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- `account-access-ui.test.ts` checks dialog size, 64px account columns, add-form alignment, photo popup modal boundaries and spacing from the triggering photo, role/file permission list positions and actual click targets, and nested Esc dismissal across 9 combinations of light, midnight, and dark themes at 1366px, 390px, and 320px. At 1366×360 and 390×480, it also checks popup screen boundaries during deletion confirmation and theme changes. It also verifies saving role, feature, and file permissions, keyboard input, deletion cancellation, retry after failure, and removal of the account from both permission tables on success. These are isolated Chromium checks; changes in the actual production UI are checked after the user builds the app.
- `admin-users.test.ts` verifies owner authorization, protection of the current user and last owner, deletion of password/external accounts, revocation of all login and workspace permissions, preservation of files and records, and invalidation of previous sessions when the same ID is registered again, in an isolated environment. Demo deletion and re-registration were checked with `src/demo/host.test.ts`.

- `account-access-ui.test.ts` verified person columns and item rows, name/email popups opened by icon clicks or keyboard input, priority dismissal on outside presses, Esc, or back navigation, saving role/feature/file permissions, restoring feature defaults, and retaining state on save failure. Also confirmed that dialogs and popups do not exceed screen width on PC at 1366px and mobile at 320px and 390px in light and dark themes.

- `mewlink-identities.test.ts` and `remote-mewlink-auth.test.ts` verified migration, owner approval, users without passwords, false identities, account switching, and revocation. `mewlink-identity-ui.test.ts` checked approval requests, waiting, immediate approval, rejection, revocation, linking after logging in with one's own email, error retries, and PC/mobile in both themes. `remote-mewlink-auth.test.ts` verifies identity, password-session, and temporary-password boundaries for self-linking, false target input, duplicate/conflicting/delayed requests, and revocation of previous access.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Check profile photo hover and keyboard focus indicators, the three photo menu actions, saving photos and names and retaining drafts after failure, clipboard errors, and the layout of the input and Save button to the right of the photo on narrow screens.
  - Check role defaults, per-account overrides, path inheritance, permission revocation, and protection of the last owner.

<!-- mew:validation:end -->
