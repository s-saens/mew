---
title: "Classification by Document Ownership and Separation of Current Documents from Records"
description: "A documentation cleanup decision that separates ownership of security operations, personal settings, and server settings, separates work records from tasks, and distinguishes past experiments and research from current contracts. Placing the security canonical source at the docs root supersedes decision 0037."
created: 2026-10-22
updated: "2026-10-29"
---

## Status

Adopted. [Follow-up Decision 0087](0087-documentation-role-boundaries.md) extends storage paths by role. Supersedes the security canonical source location in [Decision 0037](0037-security-document-location.md).

## Background

Moving security documents directly under `docs/` did not resolve the existing subject-based classification and duplicate ownership. The environment variable document mixed in display and account operations, and the Mewlink task owned lengthy design and verification records. In some places, constraints and statuses from past experiments and research read as current contracts.

## Decision

- Keep precautions before sharing, roles, guests, browser access revocation, and data retention in [Security Operations Standards](../../../docs/operations/security.md), and authorization, storage, and protocol implementation in the existing `development/` owning documents.
- Separate personal [Display Settings](../../../docs/configuration/appearance.md) and [Account Settings](../../../docs/configuration/accounts.md) from [Server Environment Variables](../../../docs/configuration/environment.md).
- The Mewlink task retains status, dates, tags, and assignees; detailed design, implementation, and verification records belong in the [Work Record](../work/remote-access.md). Do not create new copies of current contracts or deployment status in work records.
- Preserve the original text of the superseded DOM browser experiment in `history/`, and distinguish research dates, the scope incorporated in follow-up work, and conditions unverified on actual systems.

## Rationale and Impact

Keep the existing folders and description-based navigation while providing one canonical source for each reader purpose. When moving or splitting documents, fix incoming relative links and anchors in use. Preserve task properties and the original text, figures, code, and unverified conditions of experiments and research; do not archive files based solely on age.

This work does not establish new operational policies or features, and does not imply an app build, deployment, or application to the server. Cleanup principles and verification follow the [Documentation Rules](../README.md).
