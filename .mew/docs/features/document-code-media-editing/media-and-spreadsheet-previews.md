---
id: "mew-editor-media"
parent: "mew-editor"
title: "Media and sheet previews"
status: "implemented"
created: "2026-09-18"
updated: "2026-11-05"
status_hash: "bdb38320bd1b155b6c70730984096658dfbe53317f093e520d9f2717b842fa1d"
files: ["src/components/EditorPane.tsx", "src/components/MediaViewer.tsx", "src/components/SheetViewer.tsx", "src/components/DownloadLink.tsx"]
commits: []
description: "A feature contract covering image, audio, video, SVG, XLSX, CSV, and TSV previews, opening HTML files in new browser tabs, and downloading unsupported files. Distinguishes security policies for raw HTML file responses, permission-checked download-only tabs and AI references for unsupported formats without reading binary contents, and the editing scope for sheets and PDFs."
상위파일:
  - "MOC.md"
  - "_document-code-media-editing.md"
---

## Requirements

- View images, audio, video, and spreadsheets according to their file formats.

### Scope

- Provides image, audio, and video viewing, SVG image/text switching, and XLSX, CSV, and TSV viewing.
- `.html` and `.htm` files open in the code editor, and the **Open in New Browser Tab** icon at the upper right opens the HTML saved on the server in a separate browser tab. Supports uppercase and lowercase extensions and project and external file paths.
- Executable files (EXE, APK, AAB, etc.), archives, databases, and other unsupported formats open read-only download tabs with the shared [Agent action](../terminals-agents-automation/agent-sets-and-tab-creation.md#scope). Check access through a HEAD request to the existing raw-file endpoint before enabling the file action. Do not read or decode binary contents. Existing tab restoration retains order, layout, and active selection.

### Boundaries and limitations

- Sheet viewing does not mean a full spreadsheet editor.
- PDF reading and annotation are a separate subfeature.
- New HTML tabs apply the access permissions, sandbox, and CSP of existing raw file responses. Scripts do not execute, and the file saved on the server is displayed instead of unsaved editor content.
- Format-specific renderers remain limited to supported types. Unknown formats expose download and AI references without a text editor. Supported documents, code, and media open as before, with no separate confirmation dialog for files of 5MB or larger.

### Detailed contracts

- [Editing guide](../../../../docs/guides/editor.md)

<!-- mew:implementation:start -->
## Implementation details

- `src/utils/editor-open-policy.ts` identifies supported renderers, not whether a file may have a tab. `useTabs` creates empty read-only buffers for unsupported files and validates access through the existing project or external raw-file endpoint. `EditorPane` reuses the download viewer so the shared toolbar and Agent button are available. The same behavior applies to cross-project links and external files.
- When restoring tabs saved to the account or locally, unsupported tabs retain their order, layout, and active selection. Permission validation uses a loading state; failures use the existing file-load error display and disable the Agent button. Unsupported tabs do not start body cache lookups, content or rule requests, editing, or collaboration. Binary bytes are never loaded as UTF-8. [ADR 0145](../../decisions/0145-titled-agent-file-references.md) records why all files need a reference entry point.

- Provides image, audio, and video viewing, SVG image/text switching, and XLSX, CSV, and TSV viewing.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- `src/utils/editor-open-policy.test.ts` checks renderer selection for supported documents, code, and media, and identifies executables, archives, and unknown formats for download-only tabs across project and external paths.
- `server/editor-tabs-sync-ui.test.ts` checks read-only fallback buffers, HEAD-only access validation, failure handling, live permission revocation, tab restoration, and absence of body reads or saves. `server/editor-pane-ui.test.ts` covers restored and newly opened EXE/ZIP/BIN fallback views alongside supported text and HTML behavior. See the [work record](../../work/task-agent-integration.md#all-files-and-titled-reference-only-drafts-2026-11-05) for checks actually run.
- The same browser checks verify opening HTML and uppercase HTM files in new tabs while preserving paths and projects, button visibility on desktop and mobile, opener isolation and continued script blocking in new tabs, and hiding the button for plain text.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that viewers and downloads open for each supported format and that originals are not changed unintentionally.

<!-- mew:validation:end -->
