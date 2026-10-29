---
title: "Placing the security canonical source in docs"
description: "Previous decision: preserves the rationale for moving the security canonical source to the docs root. Subsequent decision 0040 supersedes the content-based classification and location of security operational standards."
created: 2026-10-22
updated: 2026-10-22
---

## Status

Superseded. Retain the principle of keeping security documentation in `docs/`, and replace placement in `docs/SECURITY.md` with the operational document classification in the [subsequent decision 0040](0040-document-gardening.md).

## Background

The security canonical source is a detailed document describing roles, authentication, execution permissions, and data retention, but its location at the repository root excluded it from document browsing in Documents.

## Decision

Place the security canonical source at [docs/SECURITY.md](../../../docs/operations/security.md). Remove SECURITY.md from the root placement exceptions in [Documentation rules](../README.md), and update incoming links, relative links within the document, and the path of the initial demo copy together.

## Rationale and Impact

Give the security canonical source a description so it can be browsed and checked in the same way as other reference documents. Retain the security policy and vulnerability reporting procedure. Preserve descriptions of old paths in history and demo artifacts generated from pinned commits, and update only document links that are actually opened to the new location.
