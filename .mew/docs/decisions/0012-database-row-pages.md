---
title: "0012 — Primary Columns and Row Subpages in Document Databases"
description: "Decision keeping the required, unique primary column in a document database as text or page type, and sharing fields bidirectionally between the database and the frontmatter of subpages linked to row UUIDs. Defines select types, field names, body preservation, and exceptions for automatic date fields. Subsequent 0026 supersedes UUID filenames with name-based storage."
created: 2026-10-17
updated: 2026-10-20
---

# 0012 — Primary Columns and Row Subpages in Document Databases

Status: Approved. UUID filenames and intermediate-folder storage are superseded by [0026](0026-database-row-page-paths.md).

## Background

Existing document databases allowed text, number, checkbox, and date values to be edited in a table. Writing body content for each person or item required creating a separate document and copying the table fields again. Rows and pages need to be linked so table titles, document titles, and properties such as age do not remain as different values.

## Decision

- Retain the row UUID as the internal primary key. Designate the first data column as the required, unique primary column, allowing only text or page type. Even in page mode, the primary-column value is a title string.
- Store single-select values as strings and multi-select values as string arrays, with options owned by column metadata. Right-click a cell to change the type of the entire column.
- Switching the primary column to page type creates a child Markdown document for each row. Use the row UUID in the file path to preserve the row link even when the title changes.
- Synchronize the primary-column value to the standard frontmatter field `title`, and other column values using their display names as field names. Do not allow `title`, `_mew_database`, `_mew_row`, or `상위파일` as ordinary column names because they conflict with title, row-link, or parent-document fields.
- Synchronize Postgres row data and linked subpage fields bidirectionally, comparing the last shared state to apply changed fields. Preserve body content and unlinked user properties.
- Do not automatically add `created` or `updated` to database row pages, and do not automatically update existing `updated` values when editing the body. If the user creates database columns with the same names, share those fields like other columns.
- Disabling page mode, deleting a row, or deleting the database removes links without automatically deleting subpage bodies. Switching the same row back to page mode reuses an existing document whose row binding matches.

## Rationale and Impact

The row UUID preserves the link when the title is edited or the same page is reopened. The primary column's required and unique constraints provide a basis for distinguishing rows in the table and generating document titles. Preserve YAML number, boolean, and array types so table fields and document properties are treated as the same values.

Markdown bodies with embedded databases continue to store only database reference IDs. Row page frontmatter is not a backup format for database definitions and all row data, so preserve project files and Postgres together. External Postgres references remain read-only.

Usage is maintained in the [Table Database Guide](../../../docs/guides/database.md), feature scope and verification criteria in [Document Databases and Full Listings](../features/document-databases/document-databases-and-catalog.md), and file paths and synchronization contracts in the [Document Page Contract](../development/document-pages.md).
