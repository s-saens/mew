---
id: "mew-editor-media"
parent: "mew-editor"
title: "Media and sheet previews"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-23"
status_hash: "bdb38320bd1b155b6c70730984096658dfbe53317f093e520d9f2717b842fa1d"
files: ["src/components/EditorPane.tsx", "src/components/MediaViewer.tsx", "src/components/SheetViewer.tsx", "src/components/DownloadLink.tsx"]
commits: []
description: "A feature contract covering image, audio, video, SVG, XLSX, CSV, and TSV previews, opening HTML files in new browser tabs, and downloading unsupported files. Distinguishes security policies for raw HTML file responses, restrictions on new editor tabs for unsupported formats and preservation of existing tab restoration, and the editing scope for sheets and PDFs."
상위파일:
  - "MOC.md"
  - "_document-code-media-editing.md"
---

## Requirements

- View images, audio, video, and spreadsheets according to their file formats.

### Scope

- Provides image, audio, and video viewing, SVG image/text switching, and XLSX, CSV, and TSV viewing.
- `.html` and `.htm` files open in the code editor, and the **Open in New Browser Tab** icon at the upper right opens the HTML saved on the server in a separate browser tab. Supports uppercase and lowercase extensions and project and external file paths.
- Executable files (EXE, APK, AAB, etc.), archives, databases, and other unsupported formats do not create new editor tabs or have their contents read. Already open tabs are retained after refresh with their order and active selection, and display a preview-unavailable message. Use Download in the file menu.

### Boundaries and limitations

- Sheet viewing does not mean a full spreadsheet editor.
- PDF reading and annotation are a separate subfeature.
- New HTML tabs apply the access permissions, sandbox, and CSP of existing raw file responses. Scripts do not execute, and the file saved on the server is displayed instead of unsaved editor content.
- Format-specific opening restrictions apply instead of file size confirmation dialogs. Supported documents, code, and media open as before, with no separate confirmation dialog for files of 5MB or larger.

### Detailed contracts

- [Editing guide](../../../../docs/guides/editor.md)

<!-- mew:implementation:start -->
## Implementation details

- `src/utils/editor-open-policy.ts` identifies supported text extensions, configuration filenames, and media viewer formats. Selecting an unsupported format that is not already open only displays a message and keeps the current editor. Existing unsupported tabs can be selected again and display a message instead of file content. The same criteria apply to cross-project links and external files.
- When restoring tabs saved to the account or locally, unsupported tabs also retain their order, layout, and active selection. Unsupported tabs do not start cache lookups, content or rule requests, editing, or collaboration, and do not show loading indicators. Opening binary files as UTF-8, which causes loading delays, is not reintroduced.

- Provides image, audio, and video viewing, SVG image/text switching, and XLSX, CSV, and TSV viewing.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- `src/utils/editor-open-policy.test.ts` checks that documents, code, and media are allowed; executables, archives, and unknown formats are blocked; and project and external file paths are handled.
- `server/editor-pane-ui.test.ts` checks preservation of existing EXE and ZIP tabs and active selection during restoration, reselection of existing EXE tabs, preservation of the current editor when selecting new EXE or BIN files, and the absence of content requests for unsupported files.
- The same browser checks verify opening HTML and uppercase HTM files in new tabs while preserving paths and projects, button visibility on desktop and mobile, opener isolation and continued script blocking in new tabs, and hiding the button for plain text.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that viewers and downloads open for each supported format and that originals are not changed unintentionally.

<!-- mew:validation:end -->
