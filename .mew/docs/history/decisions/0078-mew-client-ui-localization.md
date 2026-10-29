---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew client UI localization. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0078 — mew client UI localization"
created: 2026-08-25
updated: 2026-08-25
---

- Date: 2026-08-25
- Status: Adopted
- Decision maker: Codex + user request

## Background

mew's client text and some date displays are fixed in Korean, preventing the same UI from being provided to English, Simplified Chinese, and Japanese users. Server data and document content are original text entered by users and are not translation targets.

## Options

1. Add an external runtime such as i18next — it has a mature ecosystem but increases bundle size and dependencies beyond what the currently required features warrant.
2. Use a small type-safe catalog and React context in the client — sufficient for language selection, interpolation, and date formatting, with no external dependencies.
3. Rely on automatic browser translation — accessibility labels, dynamic UI text, and date rules cannot be controlled.

## Decision

Use `src/i18n.tsx` as the single entry point for client UI translation. Supported locales are `ko`, `en`, `zh-CN`, and `ja`, and translation keys use English dot notation describing their meaning in the UI. `I18nProvider` prioritizes the user's selection in `mew:locale`; on the first visit, it negotiates the browser language and uses Korean as the fallback.

Components use only `t()` and `formatDate()` from `useI18n()`. New UI text must be added to all four catalogs together. Existing untranslated text remains in its original Korean during migration, but must not be hardcoded in new features. Do not translate the original text of user documents, filenames, agent output, or server errors.

Language selection is a per-user browser setting and is not synchronized with server accounts or collaboration state. When the selection changes, update `html[lang]` as well.

## Development guidelines

- When adding new on-screen text (UI body text, button and menu names, placeholders, `title`, `aria-label`, empty states, and error messages), update all `ko`, `en`, `zh-CN`, and `ja` catalogs in `src/i18n.tsx` in the same change and render it with `t()`.
- For dates and times, use `formatDate()` from `useI18n()` instead of assembling strings or fixing the locale.
- Expected text in tests, code comments, user-authored file content, and original text received by the server are not UI translation targets.
- Do not add new Korean literals for text missing from the catalogs. The UI change is not complete until the translation key and translations in all four languages are ready.

## Rationale

This approach covers exactly what the current single React client needs and allows incremental migration of 92 UI source files without runtime translation-file loading failures or new external dependencies. Semantic keys separate source-text corrections from translation review more effectively than using the original Korean text as keys.
