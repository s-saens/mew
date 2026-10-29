---
title: "Horizontal scrolling inside Hotview code blocks"
description: "Records the change from automatic line wrapping to internal horizontal scrolling in Hotview code blocks on 2026-10-29, regression verification on desktop and mobile, in both themes, and in read-only mode, existing documentation check errors, and the scope not applied to production."
created: "2026-10-29"
updated: "2026-10-29"
---

Fixed long commands in code blocks wrapping onto multiple lines on mobile. Current behavior is owned by the [Markdown Hotview feature contract](../features/document-code-media-editing/markdown-hotview-source-and-properties.md).

`white-space: pre-wrap` on `.ProseMirror pre`, injected later by Tiptap, caused wrapping to take precedence over the existing horizontal scrolling styles. Increased the code block selector specificity and set `white-space: pre` and `overflow-wrap: normal`. Original line breaks, indentation, and the copy button outside the block are preserved.

`node --test server/editor-code-block-scroll-ui.test.ts` failed with `pre-wrap` before the fix and passed afterward. In isolated Chromium at 1100px and 390px, in dark and light themes, verified that a long command with spaces and a long identifier without spaces remained on two lines, spaces and tabs were preserved, the internal scroll position actually changed, the editor did not overflow horizontally, the copy button stayed in place, normal paragraphs wrapped, and read-only behavior worked. Tests used an in-memory bundle and request interception without an app server.

`npx tsc -b` and `npx oxlint server/editor-code-block-scroll-ui.test.ts` passed. Desktop and mobile captures confirmed the code block displayed two lines and normal body text wrapped. `git diff --check` also passed for the work scope.

`npm run check:docs` failed with 1 missing-frontmatter issue in `docs/지원서.md`, which was already being modified before this work. A separate run of `node server/document-links.ts --all` failed with 19 issues involving existing README attachment URLs and links to deleted feature MOC and task documents. Descriptions and internal links in the 2 changed documents were checked separately with the existing validation functions and had no errors.

No app build, deployment, server launch, or restart was performed. Touch scrolling on physical devices and application to the production instance require user verification.
