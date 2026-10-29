---
title: "Documents Link Graph and Backlink Engine"
created: 2026-10-02
updated: 2026-10-08
description: "Defines the shared Markdown analysis and reverse index for the Documents graph and the backlink and parent-file arrows beside the title, along with cross-project references, parent navigation, permission filtering, and validation contracts."
상위파일:
  - "MOC.md"
  - "../features/projects-files-search/documents-and-document-map-management.md"
---

## Scope and API

Show **View Graph** only once at the Docs root, above **Document Home**. Do not show it in subfolders or regular file views. The graph covers `.md` documents in the currently connected Documents, including documents with no links. Selecting a document highlights its connections; double-clicking or choosing **Open Document** opens it in an editor tab in the existing Docs scope. Documents can also be selected or opened through search and the list. Representative files from [Parent and Child Documents](document-pages.md) are also analyzed as document bodies. Containment follows the disk hierarchy, and graph edges are created only when actual body hyperlinks exist.

`GET /api/docs/graph` applies `filesRead` and the requester's file read permissions and returns `{ nodes, edges, skipped }`. Nodes are `{ path, title, group }`, and directed edges are `[source, target]` indices into the response nodes. Hidden or blocked files and unreadable nodes, titles, and edges are not returned. The graph response uses `no-store`; when permissions change, the client graph is cleared immediately and requested again. If the Documents root changes during analysis, 409 prompts a new request.

Reads Markdown inline and reference-style links with a Markdown parser. Handles relative paths, Docs-root-relative `/path`, URI encoding, and fragments/queries after document paths, and checks for `.md` when the extension is omitted. Resolves `[[문서#제목|표시명]]` in order against the current folder, the Docs root, and a unique filename. Does not guess when the same filename exists in multiple locations and is ambiguous. External URLs, images, code, frontmatter, the document itself, missing targets, and paths outside Docs are excluded from connections, and duplicate links in the same direction are merged into one. HTML links and files outside the document set are out of scope.

If a file exceeds 8 MiB or encounters a read error, the document is excluded and reported through `skipped`. Symlink real paths are also checked to ensure they are inside the Docs root. Full document bodies are not passed to the API or browser.

## Processing and Performance Contract

- `DocumentLinkIndex` in `server/document-link-index.ts` is a per-file cache of title, body link, and parent-file analysis shared by the graph and backlinks. It reparses only changed files based on mtime, ctime, size, and file catalog change signals; permission decisions are not cached. The cache holds up to 50,000 entries; exceeding this only evicts existing entries and does not limit the number of documents in responses. `server/document-graph.ts` uses the existing file catalog and processes up to 12 file I/O operations in parallel.
- `src/utils/document-graph-layout.ts` is a custom deterministic force-directed layout. Quadtree Barnes–Hut repulsion averages `O(n log n)`, and edge springs are `O(e)`. It handles colocated nodes and empty graphs and stops computing after cooling.
- `document-graph-worker.ts` computes the layout in short work batches. It passes Float32 coordinates through a transferable buffer and reheats only when a node is dragged. The Worker is terminated when the graph is closed or replaced with new data.
- `document-graph-canvas.ts` draws edges and nodes on a single Canvas. Drawing is coalesced through `requestAnimationFrame`, and DPR is capped at 2. A spatial grid finds nodes near the pointer, and offscreen elements and overlapping labels are reduced. Labels are limited to 65, prioritizing the selected node and its neighbors.
- Zoom with the wheel, buttons, or two fingers, and pan by dragging an empty area. Dragging a node temporarily pins its position. Keyboard arrow keys pan, +/- zoom in and out, Home fits the entire graph, and Enter opens the selected document. Search and a paginated list provide document access even when Canvas is unavailable.
- The graph view uses the existing `DialogFrame` behavior for focus restoration and closing with Esc or Back. It provides search, refresh, a document list, size/read error states, and a Worker failure state, and follows the existing desktop and mobile themes.

## Backlinks

Clicking the diagonal arrow to the right of the frontmatter `title` opens a list of documents referencing the current document. Each item shows its title and absolute path; selecting it opens the document through the existing file-opening flow. Documents outside the current project can also be opened. Navigation is available in read-only mode, with states for loading, an empty list, failure and retry, and partial document exclusions. Esc, Back, clicking outside, or clicking the arrow again closes the popup and restores focus. Requests are canceled when switching documents or closing the popup.

The frontmatter `상위파일` is hidden from regular property rows and navigated through the ↑ button beside the title. It uses the same parent paths and titles resolved by backlink analysis. If one parent can be opened, it opens immediately; if there are multiple, the same popup lets the user choose. If none exist or access is denied, an empty state is shown. YAML values remain in the file and are edited in source mode. Parents remain excluded from the backlink list as before.

`GET /api/docs/backlinks?project=...&path=...` returns `{ documents: [{ path, title }], parents: [{ path, title }], skipped }` with `no-store`. A relative `path` is project-relative, and absolute paths require `serverFiles` permission. Reference source discovery covers the current workspace and its connected Documents. Accounts with `serverFiles` permission also include registered root projects and their respective connected Documents. Opening an external target document does not add its parent directory as a new discovery scope.

Only Markdown inline, reference-style, and wiki links in the body count as references. Relative paths, absolute local paths, `file://`, URI encoding, fragments/queries, and omitted `.md` extensions are resolved, and each source document is shown only once. Ambiguous wiki filenames across projects are not guessed. Images, code, external web URLs, and frontmatter do not create references. Documents listed in the current document's `상위파일` string/array are excluded from the backlink list even if their bodies link to the current document. Feature `parent` IDs are separate from this exclusion rule.

`server/document-backlinks.ts` checks the Markdown file list within the discovery scope and analyzes it using the shared cache. It does not traverse dependency, build, Git, or internal data directories, or symlinks below them. It processes up to 12 file I/O operations in parallel and reports files exceeding 8 MiB and read errors through `skipped`. The per-scope reverse index updates only edges from changed source documents, and recalculates paths and wiki ambiguity when file additions, deletions, or permission changes alter the visible file set. Indexes for the most recent 4 scopes are retained.

The API checks `filesRead` and target read permissions and applies file read permissions in each source document's workspace context. It does not return titles or paths of unauthorized source documents and reevaluates permissions on every request. Regular users can see only permitted documents in the current scope. Parent files use the same read permissions; parent paths and titles outside registered scopes are returned only with `serverFiles` permission. Absolute targets outside registered scopes can also be queried with `serverFiles` permission, but the reference source scope remains as defined above.

## Verification

`server/document-backlinks.test.ts` verifies shared cache reuse, actual links and cross-project paths, parent-file exclusion, changes, deletion, renaming, permission filtering, and size limits. `server/document-backlinks-access.test.ts` checks per-account discovery scopes, file permissions, absolute-path permissions, and invalid requests through the actual API. `server/document-backlinks-ui.test.ts` verifies arrow placement, popup boundaries, keyboard navigation, closing, empty lists, retry, request cancellation during switching, external document tab opening, parent-file property hiding, direct opening of a single parent, multiple-parent selection, empty states, and failures on PC and mobile in both themes.

`server/document-graph.test.ts` checks link parsing, path boundaries, duplicate/ambiguous links, permission projection, file changes/deletions, and root replacement; `server/document-graph-access.test.ts` checks actual API permission enforcement. `src/utils/document-graph-layout.test.ts` verifies layout convergence, overlapping coordinates, drag pinning, and large-scale computation. `server/document-graph-ui.test.ts` checks actual Worker/Canvas behavior on desktop and mobile, and `server/workspace-switch-ui.test.ts` checks Docs root button placement.

On 2026-10-02, 20 layout iterations on synthetic data with 3,000 nodes and 2,999 edges took approximately 90ms, and the final step visited 256,122 cells (versus 9,000,000 all-pairs comparisons). These measurements cover only the layout engine in this development environment and exclude initial document reading, network, and drawing time.
