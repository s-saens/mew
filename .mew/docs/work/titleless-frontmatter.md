---
title: "Titleless frontmatter recognition"
description: "Records the November 7, 2026 fix for titleless block YAML frontmatter, local regression and build checks, and remaining runtime and format limits."
---

# Titleless frontmatter recognition

The editor previously treated a frontmatter block without `title` as Markdown body text, so its closing delimiter could turn a description into a heading and a subsequent save could change the source structure. The [editor contract](../development/packages.md#frontmatter-and-project-options) now recognizes supported titleless block mappings and retains the absent title and unchanged property source across body edits. The title control adds a title when a user enters one. Invalid, flow-style, and unrecognized titleless mappings retain the prior body treatment.

On 2026-11-07, the frontmatter unit suite passed, including repeated body edits, YAML values and comments, title entry, missing trailing newline, and non-frontmatter cases. Type checking and lint passed; lint reported existing warnings. The required build passed locally with chunk-size warnings. The documentation check accepted all descriptions but reported 37 missing links in the existing working tree. No server lifecycle or deployment operation was performed; browser behavior in the running instance was not verified. Previously damaged documents require separate repair.
