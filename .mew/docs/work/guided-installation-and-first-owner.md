---
title: "Guided Windows installation and first administrator"
description: "Records the November 5 Windows wizard and browser-first owner implementation, isolated verification, and data-preservation review. Separates local checks from pending signed EXE publication, clean-Windows installation, UAC, reboot, and operational application."
updated: "2026-11-05"
---

# Guided Windows installation and first administrator

## Purpose and result

The user requested one Windows installer that handles environment preparation without terminal or build-tool setup, followed by a browser UI for creating the administrator on a fresh installation.

The implementation adds a native x64 wizard around an owned WSL 2 environment and the existing prebuilt CLI. Runtime files and user data have separate ownership and locations. Preparation, resume, repeat launch, and repair preserve existing accounts, projects, and unrelated distributions. The former Mewnager management application remains retired. Current behavior belongs to the [Windows installer contract](../development/windows-installer.md); [ADR 0143](../decisions/0143-windows-installation-wizard.md) records the delivery choice.

Browser-first owner creation replaces default terminal email/temporary-password setup in the source and prebuilt launchers. A local one-time capability, durable closure marker, and shared account transaction prevent public enrollment, duplicate owners, or enrollment after account loss. The user chooses a permanent password and enters the workspace signed in. Existing accounts and explicit local administration remain available. Current behavior belongs to the [first-administrator contract](../development/first-owner-setup.md) and [ADR 0142](../decisions/0142-browser-first-owner-setup.md).

## Review findings addressed

Independent UI/backend review found that reopening the shortcut would otherwise collide with a running CLI lock. The controller now requests a refreshed local address through private process control. Reopen failure uses a fixed safe response, without stopping the live host or exposing a token in logs.

Installer review also rejected using only a completion marker to recognize a healthy version. Version-area hashes and essential executable checks now detect missing or truncated files before accepting or repairing a version. The separate user home remains intact. Last-good active metadata preserves launch availability after failed upgrades. Initial import quarantine and atomic ownership-marker creation address interrupted fresh installation, while separate feature/package checkpoints allow Windows preparation to continue after a feature restart. Disconnected reopen requests are contained so they cannot terminate the existing host through pipe-cleanup exceptions.

## Local verification

Checks used temporary state and injected or test-owned dependencies. No application launcher or actual installer was executed, and no application server or host WSL distribution was started, stopped, imported, or changed.

| Check | Observed result |
| --- | --- |
| `node --test server/first-owner-setup.test.ts server/cli-host.test.ts server/auth.test.ts server/remote-local-auth.test.ts server/remote-mewlink-auth.test.ts server/remote-trusted-device.test.ts server/access-policy.test.ts server/instance-lock.test.ts` | 59 passed. Covers one-time claims, shared account locking, closure, API status/session behavior, private reopen transport, and existing authentication/access. |
| `npm run test:cli` | 26 passed, including installer stream separation, explicit reopen requests, safe failure response, and input-close shutdown. |
| `node --test server/release-runtime.test.ts` | 8 passed, preserving runtime source transformation and distribution boundaries. |
| `node --test server/source-onboarding.test.ts server/mew-update-command.test.ts server/mew-browser-dependencies.test.ts server/remote-desktop-permissions.test.ts` | 23 passed. Only extracted source-shell functions with injected commands are exercised; the source launcher is not run. |
| `node --test server/first-owner-setup-ui.test.ts` | 11 passed with isolated browser fixtures. Covers successful enrollment, validation, fragment cleanup, missing/rejected tokens, race completion, network failures, throttling, and existing local login/guest behavior. |
| `node --test src/workspace-loading.browser.test.ts src/app-bootstrap.browser.test.ts` | 9 passed, preserving deferred workspace import and existing remote/preview authentication gates. |
| `node --test apps/windows-installer/installer.test.mjs` | 10 passed, zero skipped. Includes actual Windows PowerShell 5.1 parsing, injected setup/reboot/upgrade paths, private-protocol and disconnected-request fixtures, Linux temporary integrity and ownership-marker regressions, and isolated packaging with a mock compiler. No actual WSL setup or EXE compilation is performed. |
| `npx tsc -b --pretty false` | Passed. |
| Focused lint and diff checks | No new errors; UI lint retained its existing bootstrap effect warning. Installer build/test scripts passed oxlint; workflow YAML parsed without errors. |
| `npm run build` | Passed; Vite retained large-chunk warnings. |
| `bash -n mew` | Passed without executing the launcher. |
| `npm run check:docs` | Metadata passed: 727 descriptions, zero errors at this check. The link phase failed on 41 existing missing references, including the removed `.mew/docs/MOC.md` and decision entrypoints. Comparing the changed documents with their pre-task text produced the same 41 errors and zero added errors. |

The first-owner UI was inspected at 1100px in the light theme and 390px in Midnight with example data. Screenshots are temporary verification artifacts, not a public screenshot update. Browser fixtures were closed after use.

## Remaining gates

No signed installer or prebuilt runtime was published in this task. Installer compilation with the pinned Inno compiler, Authenticode signing, and Windows end-to-end acceptance remain incomplete. Validate WSL absence/WSL 1/WSL 2, virtualization restrictions, UAC cancellation, deferred reboot and resume, interrupted downloads/imports, same-version repair, relaunch, upgrade, and data-preserving uninstall on clean machines. The [release procedure](../operations/cli-release.md#windows-installation-wizard) owns the complete matrix.

Actual application operation, provider authentication, Windows browser forwarding, controller crash cleanup, remote desktop connection, and performance measurements are separate from these isolated checks. The initial helper-package release and clean-Windows remote-desktop acceptance remain under the [existing Windows helper gates](../development/remote-desktop-windows-setup.md). Deployment and server lifecycle operations remain user-owned.
