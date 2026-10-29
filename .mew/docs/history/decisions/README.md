---
title: "Migrated Previous Decision Records"
description: "Explains the provenance, original-text preservation, and distinction from current contracts of previous Mew ADRs and related documentation policies preserved during the transition to an independent project."
created: 2026-10-14
updated: 2026-10-14
---

# Previous Decision Records

This folder is the owning location for 162 Mew and Mewlink ADRs migrated from Liiiiv's central documentation during the transition to an independent project on 2026-10-14. After comparing the decision bodies, the central Mew-specific copies were removed. Existing numbers are historical numbers and are distinguished from local numbers for new decisions.

Shared documentation policies 0012, 0070, and 0132 referenced by existing decisions are preserved as snapshots of the rationale at the time. Liiiiv owns the original company-wide policies, which are not synchronized with these snapshots.

Preserved the meaning of numbers, dates, bodies, and subsequent decisions, and adjusted document links to locations within the Mew repository. References to company-only documents that were not migrated retain their source paths as text. Records without a description received frontmatter explaining that they are migrated decisions, and old `desc` values were preserved in `legacy_description`.

Do not infer current contracts from adoption status or workspace policies at the time. Current guidance follows the [Independent Project Decision](../../decisions/0001-independent-project.md), [Documentation Rules](../../README.md), and the owning documents for features, development, and operations. Write subsequent decisions in [Mew Decision Records](../../decisions/README.md).

History is excluded from the default description list. When historical rationale is needed, use `node server/document-descriptions.ts --all` to find paths and descriptions, and read only the relevant records.

The previous topic-based classification is preserved in the [ADR map from that time](topics/MOC.md). The Adopted and Current labels in that map reflect the classification at the time and do not guarantee the current implementation status.
