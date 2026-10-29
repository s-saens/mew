---
id: "mew-editor-references"
parent: "mew-editor"
title: "Links, file references, and attachments"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-26"
status_hash: "7de6eaf2f2c15edc7c1f36bdcbbfd8639072863ca76586cd4dcc07f7c56c6cc2"
files: ["packages/editor/src/editor/LinkTooltip.tsx", "packages/editor/src/editor/file-link.ts", "packages/editor/src/editor/editor.css", "packages/editor/src/ResizableImage.tsx", "packages/editor/src/MediaNodes.ts", "src/components/EditorPane.tsx", "src/utils/editor-image-url.ts", "packages/editor/src/editor/image-source-context.ts", "packages/editor/src/Editor.tsx", "packages/editor/src/types.ts"]
commits: []
description: "A feature contract covering Markdown link insertion and editing, internal document navigation, querying candidates across all folders and prefix autocomplete for Hotview @ file mentions, passing line ranges, and attachments. Explains internal file link display and selection, path resolution outside Docs and the project, relative image paths and source preservation, attachment permissions, and YouTube playback restrictions."
상위파일:
  - "MOC.md"
  - "_document-code-media-editing.md"
---

## Requirements

- Connect links, project files, images, and attachments to documents.

### Scope

- Provides link insertion and editing, file mentions, file uploads and drops, image pasting, and resizing.
- Hotview `@` file candidates are queried across the current file's entire project scope. For Documents documents, the scope is all of Documents, including folders collapsed in the explorer or not yet queried. Existing file viewing permissions apply, and case-insensitive filename prefix autocomplete displays up to 8 candidates.
- Internal file links are distinguished as inline items with icons and backgrounds. Subdocuments of the current document and other internal documents retain the same border, with leading icons distinguished as a down-and-right arrow and a document icon, respectively. Files outside the configured Docs folder display a diagonal arrow on the right of the existing item. External URLs remain underlined hyperlinks.
- The display text of internal file links in Hotview cannot be edited directly. A regular click on an internal document link, including subdocuments, opens it in the same tab without a tooltip and adds it to that tab's visit history. Ctrl/Cmd+click opens a new tab, which does not inherit the previous tab's visit history. Even if another tab displays the same document, same-tab navigation stays in the originating tab and does not merge document visit histories.
- Use Ctrl+L to pass the selected file path and line range to the target input.

### Boundaries and limitations

- Inserting a YouTube node and allowing actual playback are separate; deployment CSP restrictions remain.
- Viewing an attachment also requires file permissions for the attachment itself.

### Detailed contracts

- [Editing guide](../../../../docs/guides/editor.md) · [Per-tab document navigation contract](../../development/ui-contracts.md#editor-tab-visits-and-document-navigation) · [Attachment permissions](../../development/access-control.md)

<!-- mew:implementation:start -->
## Implementation details

- Provides link insertion and editing, file mentions, file uploads and drops, image pasting, and resizing.
- `fetchFileCandidates(signal)` in `createEditorApi(project)` retrieves permitted file paths from the existing full-tree API. It queries once when the `@` menu opens and filters candidates locally during typing. Closing the menu or changing the document scope cancels pending queries and ignores late responses. If no candidates are available during the query, a loading indicator is shown; on failure, candidates from the tree already loaded by the host are retained. The selected file's title is inserted as the link text, and relative paths containing spaces, parentheses, `#`, or `?` are URL-encoded for storage.
- The default action for internal document and subdocument links switches the document in the current tab. Matching back and forward icon buttons at the far left of the editor's floating file history toolbar navigate document visits in the current tab. A direction is disabled when no entry is available; opening another document after going back clears forward history. A new tab opened with Ctrl/Cmd+click starts with both back and forward disabled. The recent visit order for tab selection and closing, and document navigation history, follow the [shared UI contract](../../development/ui-contracts.md#editor-tab-visits-and-document-navigation).
- Internal file links are displayed at a compact height without vertical padding, preserving text and icon sizes and body line height, and wrapping within the sentence flow. Only the Hotview display changes; the existing Markdown format is preserved.
- Internal file links render as non-editable regions, with the cursor and partial selections snapped to link boundaries. Deleting the entire link and editing surrounding text remain supported. Link names and targets can be edited in source mode.
- Even in a paragraph containing only an internal file link, clicking either side of the link or the blank space to its right on the same line places a visible cursor outside the link for typing. The small cursor positions before and after the link are Hotview decorations; no spaces, hidden characters, or HTML are added to Markdown.
- At an internal file link boundary, pressing the left or right arrow key skips the entire link at once and places the browser caret outside the non-editable link. Shift+arrow selects the entire link.
- Cursor position decorations set `ignoreSelection` so the caret does not return inside the link or disappear after the browser's asynchronous `selectionchange` processing. Actual document selection positions and surrounding input use the existing editing model.
- The host injects the current file's absolute path and configured Docs root. If the target resolved from relative paths, URL encoding, queries, and anchors is outside Docs, an upper-right arrow is displayed. If a Markdown target inside Docs is a subpath of the current document, the leading icon uses Iconoir `LongArrowDownRight`. All internal file links retain the same 1px border, background, and icon size. `_폴더이름.md`, `MOC.md`, and `_MOC.md` use their containing folder as the subpath base; a standalone `name.md` uses `name/`. Links to the document itself, sibling and parent documents, and attachments retain the existing border. This display updates when the link target, document path, or Docs settings change and is not stored in Markdown.
- Internal links have a trailing outer margin of 2px. Wrapped links display left and right borders and rounded corners only at the overall start and end, leaving intermediate boundaries between wrapped lines open.
- Relative link paths are preserved even when `..` traverses outside the project root. Absolute paths and local `file://` links are also resolved, and targets outside the project open through the existing server file API and `@fs:` tabs. Files in other projects, hidden files, and system files readable by the server OS appear in the same editor and media viewer. External Markdown and SVG files start in Hotview, and relative links within external Markdown open relative to the file's actual folder. Server file feature permissions and OS access permissions are still checked.
- Detailed display behavior follows the [editing guide](../../../../docs/guides/editor.md#links-and-attachments).

- Relative `src` values in Markdown images are resolved against the document folder and project scope. `EditorPane` injects `EditorApi.resolveImageUrl`, and the Hotview image node view uses React context to convert only the display URL to `/api/raw` or `/api/fs/raw`. The original `src` and size attributes are preserved in collaboration and Markdown storage, and URLs are recalculated even when only the document path changes while the body stays the same. Existing upload API, HTTP(S), data, and blob URLs are not reinterpreted. The existing raw API owns file access permission checks.

- Images without a specified width calculate their height automatically, with only the maximum height limited to `40vh`. As the editor narrows, the image and container height shrink together according to the original aspect ratio, and subsequent body content and line numbers are laid out to match the new height. Explicitly specified widths are preserved while images scale down proportionally to fit the viewport; resizing the window does not change Markdown or size attributes.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- `server/editor-file-mentions-ui.test.ts` verifies candidate queries for deep folders absent from the explorer on desktop and mobile, one request per menu opening, switching between Documents and regular project scopes and blocking late responses, link storage with titles and special-character paths, and fallback to existing candidates on query failure. File and tree APIs use isolated test doubles.

- 2026-10-22: `editor-tab-navigation-ui.test.ts` verified regular/Control/Meta clicks, subdocuments, relative paths, same-tab back/forward navigation, forward history branching, new-tab initialization, MRU closing, independent histories for duplicate document tabs, single selection, and individual closing at 1280px in dark theme and 390px in light theme. The 11 state checks in `editor-tab-navigation.test.ts` and `editor-tab-navigation-state-ui.test.ts` and regressions for external links, backlinks, tab caching, tab dragging, and docking also passed. Draft preservation on save failure, delayed-response races, document renaming/deletion, tab movement, and restoration boundaries were verified, and type, lint, and documentation checks also passed (including existing lint warnings). APIs, files, and accounts use isolated test doubles; actual macOS key input, builds, and application to the server were not verified.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that references open the correct files and lines, and that image resizing, attachment saving, and permission blocking remain intact.
  - Verify that regular clicks on internal document and subdocument links switch documents in the same tab, while Ctrl/Cmd+click opens a new tab. Verify per-tab back/forward navigation, disabled controls at both ends, empty history in new tabs, and clearing of forward history when navigating to a new document after going back.
- Use `packages/editor/src/editor/markdownBehavior.test.ts` and `server/editor-line-numbers-ui.test.ts` to verify distinctions among subdocuments, regular internal documents, and files outside Docs, along with shared borders, distinct subdocument icons, arrows for files outside Docs, and Markdown preservation in both themes on desktop and mobile.
- Use `packages/editor/src/editor/markdownBehavior.test.ts` to verify that the cursor cannot enter internal links, that entire links can be selected and deleted, that surrounding text can be entered, that external link text can be edited, and that Markdown survives round-trip saving.
- In `server/editor-file-link-caret-ui.test.ts`, navigate back and forth with both arrow keys across standalone links, links within body text, and adjacent links on desktop and mobile, then wait two rendering frames and verify that the caret is on the correct side outside the link and has a height greater than 0. Also verify preservation of link names and Markdown without hidden characters after English and Korean input.
- In `server/editor-line-numbers-ui.test.ts`, verify a visible caret and English and Korean input after clicking either side of a standalone link or the blank space to its right on desktop and mobile, along with preservation of the link name and Markdown.
- `server/editor-line-numbers-ui.test.ts` checks that internal links do not increase list line height, that long names wrap, that nested list line numbers align, and that source text is preserved in both themes on desktop and mobile.
- `server/editor-external-links-ui.test.ts` verifies rendering of Markdown from other projects and subsequent relative links, and opening system text files and `file://` links on desktop and mobile. `fuzzy.test.ts` and `editor-files.test.ts` verify traversal outside the root, absolute paths, encoding, and tab scope.
- Check internal file links' inline backgrounds, wrapping of long names, and light/dark themes, and verify that external link underlines, Markdown round-trip saving, and link editing behavior remain intact.

- `src/utils/editor-image-url.test.ts` checks README, Documents, parent-folder, outside-project, and space-encoded paths, and preservation of existing upload and external URLs. `server/editor-relative-images-ui.test.ts` checks loading of 2 README images and 4 introduction images in actual Hotview, switching between documents with identical body content on desktop and mobile, and edit saves that preserve relative paths.

- `server/editor-relative-images-ui.test.ts` checks original aspect ratios, container heights, alignment of subsequent line numbers, and unchanged Markdown for default images and images with specified widths as the window width changes from 1200px → 390px → 1200px.

<!-- mew:validation:end -->
