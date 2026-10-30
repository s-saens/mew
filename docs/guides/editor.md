---
title: "Document Editing and Storage Formats"
description: "Explains editing Markdown, code, document properties, tables, links, attachments, and PDFs; adding and deleting rows and columns through the body context menu; and the horizontal icon menu with hover labels that stays open while scrolling, browser-menu suppression, and explicit keyboard-button activation and outside-tap dismissal on mobile. Covers Hotview @ file autocomplete across all folders, annotations, internal document navigation, table/DB conversion, inline subpage naming, autosave, split views, panel switching in the mobile dock, tab switching in the body and Plain modifier key bars, and installation controls."
updated: "2026-10-30"
상위파일:
  - "../../.mew/docs/MOC.md"
  - "MOC.md"
---
This guide explains how to open, edit, and save documents. If you are new, start with [First Steps](first-steps.md).

[Markdown, Code, and Document Properties](#basic-editing) · [Image and File Links](#links-and-attachments) · [Table Editing](#editing-and-copying-tables) · [PDFs and Handwriting](#reading-and-annotating-pdfs) · [Autosave, Commits, and Restore](#autosave-commits-and-file-history) · [Mobile and Fullscreen](#mobile-and-fullscreen) · [Split Views and Document Tabs](#editor-panes-document-tabs--split-view) · [Annotations](#annotations) · [Footnotes](#footnotes-alte) · [Diagrams](#diagrams)

## Basic Editing

Click a file once in the file explorer to open it in a preview tab. Double-click the tab or edit its contents to pin it, so it stays open when you open another file. Close it with the tab's `×`. Closing the active tab returns to the previously used tab in the same editor pane. For example, with tabs 1, 2, and 3 open, opening a new tab 4 from tab 1 and then closing it reopens tab 1.

An editor pane with no open file displays a vertical list of shortcuts for opening the file explorer (`Ctrl+B`), searching document contents (`Ctrl+Shift+F`), and searching document filenames (`Ctrl+P`). Changing shortcuts in settings immediately updates the display. Guidance for selecting documents, creating files, and autosave was removed at the user's request and must not be shown again without an explicit follow-up request.

- **Loading Document Body**: While a file is being read, a translucent black overlay and centered loading indicator appear over that editor's body and tools. Editing is blocked during loading even if cached content is visible; tab switching and other panels remain available. The overlay is removed when loading finishes or fails, including for empty documents.
- **Markdown**: `.md` files let you directly edit the body displayed in Hotview. Above the editor, **Plain** switches to Markdown source, and **Hotview** switches to the rendered editing view. Use `# ` for headings, `- `·`1. ` for lists, `- [ ] ` for checkboxes, `> ` for quotes, and three backticks for code blocks, and use Markdown syntax for bold, italics, strikethrough, and inline code. At the start of a line, typing a space after `[]` or `[ ]` turns it into a checkbox line. Click a checkbox to toggle its completion status, and press Enter to create the next checkbox line. Press Enter on an empty checkbox line to return to a regular paragraph. Source line numbers also appear on the first line of an empty document and in empty paragraphs; intermediate empty paragraphs are preserved in Markdown as `<br/>`. The empty input line at the end of a document is preserved as a single trailing newline, and deleting an empty line after a list still preserves the immediately following line number. Use Tab·Shift+Tab to indent or outdent checklists. Saving uses `- [ ]`·`- [x]` Markdown lists.
- **Insert Object menu**: Typing `/` in Hotview opens the insert menu. If there is insufficient space below in the visible viewport excluding the mobile keyboard, and more space above, the menu appears above `/`. If space is limited on both sides, the menu height shrinks and its contents scroll internally. The input position is checked again when the keyboard, viewport size, or scroll position changes.
- **Subpage**: In Hotview, type `/page` and press Enter, or select **Subpage**. Type the name directly in the inline field, then press Enter or click the check icon to create a subpage and stay in the current document. Press Esc or click the cancel icon to return to editing without creating anything. Leaving the document also cancels unfinished entry. Open the new page from the list or its link. As with **+** in Documents, `abc.md` moves to `abc/_abc.md` and the new page is created in `abc/`. If subpages already exist, the page is added to the same folder, with a number appended if the name conflicts. The body being edited and the open parent tab are preserved. This is available for editable Markdown within a project and is not shown to guests or in read-only documents.
- **Document Properties**: Edit the title and frontmatter field names and values in the properties area at the top of Hotview. You can add or delete fields, or reorder them by dragging the handle in the left margin with a mouse or touch. Right-click or tap the handle to change the type to document link (internal or external), single select, multi-select, date, text, or number. Use **Delete Field** at the bottom of the menu to delete the property. For single select and multi-select, click the value to open the picker, then search directly or enter a new name. Press Enter or click the add option to create and select a new option. Single select closes the picker after you select one option; multi-select keeps it open, and clicking a selected option again deselects it. Option lists are shared across fields with the same name within the project, and options can also be added or deleted in the type menu. Deleting a shared option preserves values already saved in other documents. Types and options persist when the document is reopened. The source is saved as YAML frontmatter at the beginning of the file. Source line numbers appear to the left of the title and each field. Field indentation is limited to the handle width (12px including the icon and right margin).
- **Mobile Keyboard**: In an editable document on mobile, tap the translucent circular keyboard icon at the bottom center of the editor to open the keyboard at the current cursor or selection. Tapping the document body only moves the cursor or selects text; it does not open the keyboard. Tap anywhere outside the OS keyboard, including the document body or auxiliary key bar, to dismiss it. The button hides while the keyboard is open and returns when it closes. When the keyboard opens, the Hotview, source, and code editors shrink to fit the actual visible viewport. The tapped cursor line scrolls above the keyboard and auxiliary key bar, and the height is restored when the keyboard closes.
- **Position When Switching Views**: Switching between Hotview and Plain preserves the visible cursor line based on its source line number. If the cursor is offscreen, the currently visible body line is carried over. For example, switching while viewing line 180 in Hotview also shows line 180 in Plain. Positions that Hotview does not display as separate lines, such as blank lines, tables, and code interiors in Plain, move to the corresponding rendered block.
- **Markdown Display Errors**: Hotview initialization and rendering errors are reported in the affected document body. The file explorer and tabs remain usable, and **Open in Source Mode** lets you view and edit the current tab's contents. The recovery button does not download the document again or save it. Moving to another file attempts to open that file in Hotview normally. You can also retry by switching from Plain to Hotview.
- **Table of Contents**: Click the editor's table of contents button and select a heading to jump to it.
- **Code and Text**: Text files other than `.md` open in the Plain code editor. It provides line numbers, syntax highlighting, and matching bracket indicators, and displays diagnostics for supported file types. Diagnostic support varies by language and server tools.
- **Search Within a Document**: Focus the editor and use `Ctrl+F` to open find and replace. To search and replace across multiple files at once, use [Project Search](../configuration/search.md#filename-and-content-search-and-replacement).
- **Undo and Redo**: Use `Ctrl+Z`·`Ctrl+Y`. For footnotes and list indentation, see the sections below; for comments, see [Collaboration Guide](collaboration.md#comments-and-replies).

### Body Context Menu

Right-click the Hotview, Plain, or code body to open the **Add Annotation · Add Comment · Copy · Cut · Paste · Delete · Select All** menu. The menu shows a horizontal row of icons. Hover an icon with a mouse to see its action name. When table actions extend the row beyond the available space, scroll the menu horizontally to reach them. Right-clicking within selected text preserves the selection; right-clicking outside it moves the cursor to that position.

On mobile, long-press or double-tap the body to select text. For selected body text, Mew suppresses the browser's selection menu. Once you lift your finger and the selection stabilizes, the Mew menu opens automatically. The menu stays open while you scroll or drag, including when the touch starts outside the editor. Click or tap outside the menu to close it; starting a scrolling gesture does not close it. Adjusting the range with selection handles closes the menu, which reopens for the new range when adjustment finishes. You can also copy selected text from a read-only body. Body taps and text selection keep the mobile keyboard closed. Use the floating keyboard button to start typing. Browsers without direct keyboard control use an input-suppression hint; actual behavior depends on the browser.

Copy, Cut, and Delete are disabled when no text is selected. Actions that modify the body are unavailable in read-only mode, and Add Annotation is unavailable for files other than Markdown. Add Comment targets the selected text; without a selection, it automatically selects the relevant paragraph in Hotview or line in Plain or code. You cannot comment where there is no text.

If copying, cutting, or pasting fails, follow the guidance to use `Ctrl/Cmd+C`·`Ctrl/Cmd+X`·`Ctrl/Cmd+V`. Cut deletes the selected content only after it has been successfully copied to the clipboard.

## Links and Attachments

Internal document links, including subdocuments, **open in the same tab**. **Ctrl/Cmd+click** opens them in a new tab. Same-tab navigation uses the current tab even if another tab displays the same document, and each tab maintains its own document browsing history.

Use **Back and Forward** at the far left of the floating file history toolbar to navigate documents visited in the current tab. A direction is disabled when there is no document to navigate to. New tabs start at their first visited document, so both buttons are disabled. Opening another document after going back replaces the forward path with the new path. Document browsing history persists when a tab moves to another pane, but refreshing restarts each tab's history at its current document.

Relative paths for Markdown images are resolved from the current document's folder. For example, `README.md` at the repository root uses `docs/assets/screenshots/split.png`, while `docs/guides/overview.md` uses `../assets/screenshots/split.png` to display the same file. Paths are converted to authenticated file API URLs only for display; saved Markdown retains the original relative paths. Files in projects, Documents, and outside projects follow existing file access permissions. `/api/asset` URLs created by uploads and external image URLs are used as is.

- Select text and use `Ctrl+K` to insert or edit a link. In Hotview, type the beginning of a filename after `@` to find matching files across the current project. In Documents documents, the search covers all of Documents and also shows files in collapsed folders. Select a candidate to insert a file link. `@` in the agent input is a [separate mention feature](../../.mew/docs/features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md).
- Internal file links in Hotview appear as small inline items with a file icon, background, and border. Links to subdocuments of the current document show a downward-bending arrow icon; other internal documents show a document icon. Both types retain the same border and background, and file links outside the configured Docs folder also show an arrow pointing diagonally up and right. The border height is reduced without vertical padding, while text and icon sizes remain unchanged. Like inline code, they preserve line height in sentences, lists, and tables, and long names wrap within the body flow. A 2px margin sits outside the right edge of the link, and wrapped fragments do not each repeat a closed border. Vertical borders and rounded corners appear only on the left of the first fragment and the right of the last fragment; intermediate connections continue only the top and bottom borders. List line numbers align with the body's left gutter regardless of nesting depth. External URLs and in-document `#앵커` links retain the existing underlined style. The saved format remains standard Markdown links. The display text of internal file links cannot be edited directly in Hotview, and clicking immediately opens the target file without a tooltip. Pressing the left arrow key immediately to the right of a link moves immediately to its left; pressing the right arrow key to its left moves immediately to its right. Shift+arrow selects the entire link. Entire links can be selected and deleted; edit their names and targets in source mode. Clicking an external link opens a tooltip; `Ctrl`/`Cmd`+click follows it.
- Clicking links to files in other folders outside the project also opens them in the same editor. Relative `../` paths, absolute paths such as `/etc/hosts`, and local `file://` links are supported. System files and hidden files readable by the server OS can also be opened, and permission to use server file features is required. External Markdown opens in Hotview, and its relative links are resolved from the external file's folder.
- Check the destination in the link tooltip. Title and description previews for external sites are currently disabled. Pasting a supported YouTube URL inserts a video node, but playback requires [deployment policy updates](../../.mew/docs/work/deployment-readiness-review.md) because the production CSP does not allow external frames.
- In Hotview, type `/` and select **Upload File**, or drag a file into the body. Pasting images from the clipboard is also supported. Use an inserted image's resize handles to change its display size.
- Body attachments are saved in the project's `.mew/assets/`. Dropping a file in the file explorer saves it in the selected folder under its original name. Conflict handling, shared links, and Git integration follow the [drag-and-drop contract](#dragging-and-dropping-file-explorer-items).

## Editing and Copying Tables

In Hotview, select `/` → **Table** to insert a 3×3 Markdown table. Within a cell, use `Insert` to open the row and column insertion tools, or `Ctrl+Shift+D` to open the removal tools, then apply them with the direction buttons or arrow keys. Drag vertical boundaries to resize columns. Right-clicking a table shows row and column insertion and deletion, DB conversion, and copying as Markdown, CSV, or an image below the standard body menu. **Delete Row**·**Delete Column** delete the row or column containing the right-clicked cell; deleting the only remaining row or column removes the entire table. In read-only mode, insertion and deletion items are hidden. Image clipboard support varies by browser environment.

The body stores the Markdown table, while column widths are remembered separately (see **Table Column Widths** below). Selecting **Convert to Database** from an editable table's context menu imports all columns as text fields. In a DB's context menu, select **Convert to Table**. Conversion in either direction supports undo and redo. See [DB Conversion and Storage Scope](database.md#converting-between-databases-and-regular-tables).

## Viewing Media and Sheets

Click a file in the file tree to open it in the viewer for its format.

| Format | Controls and scope |
| --- | --- |
| Images | Preview PNG·JPEG·GIF·WebP·AVIF·BMP·ICO and download originals |
| SVG | Switch between image viewing and text editing |
| Audio and video | Play, pause, and seek using browser playback controls. Actual playback availability depends on device codec support |
| PDF | Navigate pages, zoom, select text, annotate with a pen or highlighter, and save the PDF itself. [PDF Guide](#reading-and-annotating-pdfs) |
| XLSX·CSV·TSV | View as read-only tables, switch XLSX sheet tabs, and download originals. Cell editing and formula calculation are not provided |
| APK·AAB | Download without a preview |

## Reading and Annotating PDFs

Click a PDF to open the mew viewer. Use the rounded, translucent floating bar at the bottom center to select a page number, **Fit Width**, or zoom level. Use **Text Selection · Scroll** to read the document or copy text. On small screens, swipe the annotation toolbar left or right to see the remaining tools.

Click **Invert Colors**, the semicircle icon at the far left of the toolbar, to turn white backgrounds black and black text white. Images and annotations are also inverted; click again to restore the original colors. This is also available for read-only PDFs. It changes only the display, so saved and downloaded PDFs retain their original colors. The setting persists during fullscreen, zooming, and page navigation; reopening the viewer starts with the default colors.

Click **PDF Fullscreen** on the right of the floating bar to hide tabs, the file explorer, and other app UI, showing only the PDF content and floating bar. Return using **Exit PDF Fullscreen** in the same location or `Esc`. Switching preserves annotations, the selected tool, and the current page. If the browser does not allow element fullscreen, it switches to a mode that fills the browser's content area; the browser's own address bar may remain visible.

- For editable PDFs, use **Pen**·**Highlighter** to annotate with a mouse, touch, or pen. You can choose the pen color and thickness. To move the document by touch, return to the text selection tool.
- **Erase New Annotations** removes entire strokes drawn in the current session. Annotation undo and redo are supported, along with `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`·`Ctrl+Y`.
- Use **Save PDF** or `Ctrl/Cmd+S` with the PDF body focused to save annotations to the original file. PDFs require explicit saving, which does not create a Git commit. Annotations are stored as standard PDF vector annotations, so they are visible and printable in other PDF tools.
- The download button downloads an **annotated PDF copy** if annotations exist, or the original otherwise. If the original changes elsewhere, overwriting stops and annotations are retained. If all bytes of the original have already been read, you can download an annotated copy.
- Unsaved drafts are kept in browser storage per account and document and restored after switching tabs or refreshing. A notice appears if storage fails because space is unavailable or storage is blocked. Drafts do not sync to other browsers or devices. If the original version has changed during restoration, the draft is not automatically applied over it.

Saved annotations reappear as part of the PDF and are excluded from mew's eraser and undo operations. Saving to the original is supported up to 100MiB. Saving is unavailable for read-only files and archives, and saving annotations in encrypted, digitally signed, or certified PDFs is not supported. Full-document search, OCR, form entry, and real-time collaborative annotation are not provided. Implementation and verification criteria follow the [PDF Development Contract](../../.mew/docs/development/pdf-viewer.md).

## Autosave, Commits, and File History

| Task | What is saved | Action |
| --- | --- | --- |
| Edit Markdown or code | Current contents of the server file | Check autosave status and errors |
| Commit the current text file | That file's Git history | `Ctrl+S` or Menu → **Commit** |
| Commit multiple files | Git history for selected files | Dock → **Git**, check files, and commit |
| Save PDF annotations | Apply annotations to the original PDF | PDF **Save** or `Ctrl/Cmd+S` with the body focused |

Edited body content is automatically saved to disk, and the editor displays save status and errors. Autosave does not create Git commits. To record the current file in a Git repository's history, press `Ctrl+S` or select Header Menu → **Commit**. To commit changes across the repository, use the [Git Work Panel](projects.md#git-operations-panel).

Select a commit in **History** above the editor to view the file at that point in read-only mode. With edit permission, you can restore the selected version. File history is available to logged-in users. Files outside projects opened through the server file explorer have no collaboration, comments, or Git history.

## Mobile and Fullscreen

When you access Mew on a phone, **app installation guidance** appears before the fullscreen recommendation. If an **Install App** button is available, tap it to open the browser's installation dialog; otherwise, follow the guidance to use **Install App** or **Add to Home Screen** in the browser menu. On iPhone and iPad, select **Add to Home Screen** from the Share menu. Menu names and support vary by browser, and installation requires an HTTPS address or localhost. Installation is unavailable from a regular HTTP address accessed on another device.

Opening the installed icon launches the browser-supported app view without showing startup guidance. It connects to the existing Mew server, so the host must remain on, and offline work is not supported. When using a Mewlink address, support for new installations requires both a host Mew update and an update to the Mewlink central service.

After you dismiss installation guidance, fullscreen guidance follows in supported environments. Each guide's **Don't Show Again** choice is remembered separately in this browser. Dismissing without checking it shows the guide again on the next refresh. On PCs, browsers that support installation also show manual installation instructions first, regardless of whether an installation dialog is available.

On PCs, a vertical dock appears along the **left edge** of the screen. Hover over an icon to see the tool name. Clicking opens a closed panel, focuses an open but unfocused panel, or closes the panel if its icon is already focused. The editor hides or reappears while preserving its tabs and content. Open panels and the currently focused panel use different levels of emphasis.

On mobile, use the **dock** at the bottom of the screen to switch the foreground panel. Tapping the current panel again does not close it. Only tools appropriate for your permissions and current project appear from among File Explorer, Editor, Agent, Terminal, Git, Browser, Features, Debugger, Notes, and Tasks. Change visibility and order in **Settings → Dock**.

**Long-press an icon for 450ms, then drag along the dock to reorder it**. Move up or down in the PC's vertical dock, or left or right in the mobile horizontal dock. Use the placeholder to identify the drop position, and press Esc or cancel the touch to restore the original order. With the keyboard, focus an icon and use `Alt+↑/↓` on PCs or `Alt+←/→` on mobile. Visibility settings and order are saved in this browser.

On the dock, **swiping left→right** opens the previous panel, and **right→left** opens the next panel. Navigation follows the configured dock order and stops at either end. Each panel retains its last selected tab.

Swipe left or right on a mobile panel's body to move to the current panel's previous or next tab. Tabs wrap around at either end; a single tab stays selected. In the editor, swipe the **Markdown Hotview body** to switch tabs. Because the body in **regular files and Markdown Plain** supports horizontal scrolling, swipe the **auxiliary key bar** to switch tabs instead. Plain's auxiliary key bar appears even when the mobile keyboard is closed. Horizontal scrolling of the tab bar, task row deletion, and Gantt navigation and schedule editing retain their existing controls.

**Features** opens the current project's feature document list. It appears when you have agent permission, and content you are writing persists when you view another panel and return. Close, Esc, and Back check for unsaved content.

Open **Remote Desktop** from the header menu. Use the viewer's Close or Back action to return to the previous workspace; on mobile, you can also select another panel from the bottom dock. This ends the remote connection. For connection and control details, see [Remote Desktop](remote-desktop.md).

Open Chat, Android, Remote Desktop, and Settings from the header menu. When the mobile software keyboard opens, the dock and reserved bottom space are hidden; they return when the keyboard closes. Control panels using the dock and top menu, and switch tabs using the tab bar, keyboard shortcuts, or swipes on the mobile body or Plain auxiliary key bar.

At screen widths of 768px or greater, the top **Menu** button shows both an icon and text, and the header height and spacing increase. Narrow screens use an icon button.

Toggle fullscreen using the header's **fullscreen button** or `Alt+Enter`. On mobile, one foreground work panel is shown; if there are multiple document editing panes, switch panes using the selector above the tab bar. The desktop split layout is preserved.

Press and hold a file or folder without moving for at least 0.5 seconds, then release before 1 second to open its context menu. Continue holding until 1 second to enter move mode, highlighting the item and the filename beside your finger. Then drag and drop it onto the destination folder to move it. Releasing without moving does not move it. A short tap opens a file or expands a folder; moving early scrolls. Slide the tab bar left or right with your finger. Esc closes the topmost popup; mobile Back closes popups first, then returns to the previous workspace. Esc in a terminal receiving input may be passed to the terminal program. In regular web fullscreen, the browser may exit fullscreen first; Back behavior in the installed app also requires verification for each device and browser. Detailed behavior is defined in the [Panel and Focus Contract](../../.mew/docs/development/ui-contracts.md).

Long-pressing app titles, guidance, buttons, or tab names does not select their text. You can select and copy document, code, and PDF body content; agent conversations, chats, and comments; and error messages, commands, and table data. Selection, copying, and editing in input fields remain available.

## Editor Panes (Document Tabs · Split View)

The PC file explorer is fixed at the far left and can be collapsed or expanded using the button at the center of its right edge. In **Settings → Display**, Notes and Tasks can each be shown as a **Tab** or **Popup**. Move a popup using its top handle and resize it using its bottom-right handle. Position, size, and tab layout are remembered in the device's browser and restored separately from layouts on other devices. Mobile uses the existing panel view.

Each editing pane has its own document tab bar and collaboration session. Documents and regular files open together in the same tab bar, and switching files preserves the panel's moved position. Files with identical names are distinguished by their respective locations and contents. Editing panes share the workspace with agents, terminals, and browsers.

- When you drag a document, agent, terminal, or browser tab, its tab shape follows the pointer, and a placeholder in the tab bar shows where it will go. On PCs, drag immediately or long-press before moving; on mobile, long-press for 0.35 seconds before dragging. Swiping left or right immediately on mobile scrolls the tab bar.
- Drag a document tab with the mouse and drop it at an edge to split it into a new pane. Drop it on a tab bar of the same type or in a pane's center to move it into that pane. The drop target appears as a translucent area.
- The top handle moves the pane containing all its tabs. Resize by dragging a boundary or focusing it and pressing the arrow keys.
- On desktop, **double-click the panel move handle** to make that panel's tab bar and body cover the entire workspace, including the file explorer. Only the selected panel's tab bar appears across the full width at the top; other panels' tab bars and the side dock are hidden. Double-click the same handle again or press **Esc** to restore the original layout. If a popup is open, Esc closes it first. Double-clicking a document tab pins its preview, while double-clicking an agent or terminal tab renames it. Git can also be maximized using the shared handle.
- Maximization persists only in the current view and ends when you drag a tab or panel, close the maximized panel or remove its last tab, switch projects, refresh, or switch to the mobile view. Mobile continues to display one foreground panel as before.
- With the keyboard, focus a tab and use `Shift+Enter` to maximize or restore; while maximized, you can navigate only the selected panel's tabs. Selecting a panel from the dock exits maximization and switches to the selected view.
- Drop a file from the file explorer onto an edge of the editor body to open it in a new pane. Dropping in the center of the body inserts path text as before.
- On mobile, if there are multiple editing panes, switch between them using the selector above the tab bar. The desktop split layout is preserved.
- `useTabs` manages the document tab list, and `DockWorkspace` manages the shared workspace layout. Follow the [UI contract](../../.mew/docs/development/ui-contracts.md#workspace-panel-layout) for detailed rules.
- When a pane becomes empty (when its last tab is closed), it **collapses automatically** and the tree shrinks with it (`removeLeaf`·`prunePanes`). The last remaining pane stays open even when empty and displays guidance.
- The \*\*focused pane\*\* is the target for keyboard shortcuts, search, history navigation, and pasting terminal selections. Clicking anywhere in a pane (`onPointerDownCapture`) moves focus to it, and tab bars in unfocused panes are dimmed. The `tabs`/`activePath`/`activeTab` provided by `useTabs` **belong to the focused pane**.
- **Content caching and autosave are keyed by path, not pane**. Opening the same file in two panes shows the same content.
- Local storage for restoring open document tabs is a fallback. Opening files, switching tabs, and syncing tab state with the account server continue even if `localStorage` is full or blocked. In the same file selection flow, failures to remember the file explorer's expanded state or the foreground panel on mobile do not clear the screen or stop the selected file from being passed to the editor. Document content save failures retain the existing save error messages independently of this handling.
- The terminal, agent panel, and system resource buttons are in the **header hamburger menu** (`HeaderMenu`), rather than individual panes — placing them on pane toolbars would create duplicate buttons.
- Collaboration presence reports **only the file in the focused pane** to the server — documents open in other panes do not appear to others as being viewed.

## Ctrl+L references (`경로:줄`)

Pressing Ctrl+L (`insertPathOrSelection`) inside the editor formats the current location as `programs/modoo-2026/사업계획서-0811.md:3` and writes it into **one auxiliary panel input**. If there is a selection, it uses `…:3-15`; otherwise, it uses the single line containing the cursor. A trailing space lets you continue typing immediately.

- **All file types are supported** — Markdown in Hotview (ProseMirror) and code or text (CodeMirror) qualify whenever an editor is attached (only when pressed inside `.ProseMirror, .cm-editor`). Each editor's `getSelectedLineRange` supplies the line numbers, and Hotview converts them to **Markdown source lines** rather than onscreen blocks (including the frontmatter line count).
- **The recipient is the most recently opened auxiliary panel** (terminal, agent panel, or chat). If that panel is closed, it falls back to a currently open panel; if none are open, it does nothing (`utils/refTarget.ts`, covered by tests). App sends `detail.target` with `mew:insert-ref`, and **panels ignore events addressed to a different panel** — previously, every open panel received the text, leaving residue in panels that would not be used.
- Even with multiple tabs, only **one active tab** in the most recently used terminal or agent panel receives it (hidden tabs remain mounted). Only the chat panel receives a file mention token (`[[프로젝트:경로]]`) instead of text — it uses `project` and `path` from the same event.
- Ctrl+L pressed **inside** the terminal does not use this route — `TmuxTerminal` handles it directly and writes the selected editor text (or the active file path if there is no selection) to the shell.

## Dragging and dropping file explorer items

When dragging a file or folder, **the meaning depends on where it is dropped**. To support multiple meanings in a single drag, `pathDrag.ts` in `@mew/ui` includes the path in both a dedicated MIME type (`application/x-mew-path`) and `text/plain`. Folders also include `application/x-mew-dir` so they can be **distinguished from files even during the** `dragover` **phase, when values cannot be read**.

| Drop target | Result |
| --- | --- |
| A folder in the file explorer (empty area = project root) | **Move** to that folder (`POST /api/rename`) |
| The **outer 30%** of an editor pane (files only) | **Split the view in that direction** using the same rules as tab dragging + open the file in the new pane |
| Hotview/Plain editor (center) | Insert **path text** at the drop position |
| Terminal screen | **Type** directly into the shell (Enter is not sent — the user completes the command) |
| Input field at the bottom of the terminal | **Insert the path** at the cursor (replace the selection if present) |

`App.tsx` intercepts edge splits in the pane container's **capture-phase** `dragover`/`drop` handlers (`pathDropTargetAt`) — center drops and folders pass through without `preventDefault` to preserve their original meanings in the table below, while edge drops are stopped with `stopPropagation` so ProseMirror does not subsequently insert the path. `useTabs.splitEmptyPane` creates an empty pane, and `openFile(paneId)` adds the tab.

- **During** `dragover`, `getData()` **always returns an empty string** (DataTransfer protected mode). Determine whether the target can accept the drag with `hasPathDrag` (= checking `types`), and read the value (`pathFromDrag`) only during `drop`. Getting this wrong prevents `preventDefault` from being called, so the drop itself never occurs.
- `effectAllowed` is `copyMove` — allowing only `move` causes editors and terminals that accept drops with `dropEffect='copy'` to reject the drop entirely. Folders in the tree explicitly specify `move` in their own `dragover` handlers to preserve the original meaning.
- The editor intercepts drags **only when the dedicated MIME type is present**. Images and text dragged in from outside are uploaded to the project's `.mew/assets/` and inserted into the content as links. `/api/asset` links containing a UUID filename and project ID also check file viewing permissions. Guest shares also require viewing permission for the attachment path. New assets that Git does not ignore are automatically committed to the project repository, and migration of the existing 22 R2 links to `.mew/assets/` is complete.

**Dragging files from outside (the system file explorer) into the file explorer** **saves the files as-is** in the drop folder (empty area = project root) (`POST /api/upload-into`, multipart `file` and `destDir`). This is detected by checking for `'Files'` in `dataTransfer.types`, and only then is `dropEffect='copy'` set. If a name conflicts, the server uses `이름 copy` to avoid it. Multiple dropped files are uploaded **sequentially** (concurrent uploads would select the same available name). Editor content drops save files under UUID names in `.mew/assets/`, whereas file explorer drops preserve the bytes and original names in the drop folder and commit them to Git.

## Table column widths (.mew/table-layout.json)

Markdown cannot store **column widths** adjusted by dragging table dividers in Hotview (HTML `<table>` can store them, but makes plain mode cluttered). The content therefore remains a pure Markdown table, with only the widths stored by document path in the project's `.mew/table-layout.json`.

```json
{
  "version": 1,
  "docs": {
    "ops/repos.md": [[220, 380, 160], null, [120, 120]]
  }
}
```

- Outer array = **the order in which tables appear in the document**; inner array = column widths (px) for that table. `null` means a table has no saved widths, and `0` means a column has not yet been resized by dragging.
- **Adding, deleting, or moving tables can shift their order and misalign the widths.** Dragging again overwrites them — this is the tradeoff for leaving the Markdown content untouched.
- Widths are restored once after seeding the content, using `addToHistory: false` (`SEED_ORIGIN` for collaboration). Otherwise, the restoration would enter the user's undo stack, and a single Ctrl+Z would revert all widths. **Every place that seeds content programmatically follows this rule** — without a wrapping `SEED_ORIGIN` transaction, seeding enters the user's undo stack, and a single Ctrl+Z removes the entire document (`Editor.tsx`).
- **If loading fails, do not save either.** Treating unread data as "no widths" and overwriting it would erase the saved values.
- Server: `server/tableLayout.ts` + `GET /api/table-layout` (requires file viewing permission for all accounts) and `PUT /api/table-layout` (requires login and file modification permission). Client: `readTableWidths`/`applyTableWidths` in `packages/editor/src/Editor.tsx`; injected through `EditorApi.fetchTableLayout`/`saveTableLayout`.

## Indenting the first list item (`- - b`)

Tab indents a list item by one level. The default `sinkListItem` moves it **inside the immediately preceding sibling item**, so it does nothing for the first item, which has no preceding sibling. mew instead creates a **parent item with no line of its own** and indents into it — `- - b` in Markdown, which Shift+Tab reverses.

- That is why the content of `listItem` is `(paragraph|bulletList|orderedList) block*` rather than the default `paragraph block*` (`IndentableListItem` in `packages/editor/src/editor/listIndent.ts`). If a paragraph is required, the HTML that markdown-it parses as nested `- - b` cannot be placed inside the item and becomes two separate lists, losing the indentation on a round trip.
- **The client** (`Editor.tsx`) **and server** (`serverExtensions.ts`) **must use the same** `IndentableListItem` **implementation**. Changing only one side causes the document to diverge during collaborative merges. The definition therefore lives in a single module.
- It cannot be saved as `- b` without a parent marker — under Markdown rules, it becomes a top-level item when read again.

## Annotations

In Markdown Hotview or Plain, place the cursor where you want an annotation and press `Ctrl+'` or choose **Add Annotation** from the right-click menu. If text is selected, the marker is added after it. Enter content in the small input window that opens; it is saved automatically. Small superscripts such as `1)` and `2)` appear in the Hotview content.

Click a superscript to open the same input window and edit or delete its content. View all annotations in the document with the **Annotations** button, shaped like a closing double quotation mark, immediately beside the floating comments button. Clicking an item in the list opens that annotation's input window.

Annotation content is stored as a numbered list under `# $Annotations$` at the bottom of the file. Hotview hides this storage section; Plain shows both the `^[1]` markers in the content and the storage section. Deleting the last annotation also removes the storage section. `Alt+E` footnotes and `# References` remain separate. See the [annotation feature contract](../../.mew/docs/features/document-code-media-editing/footnotes-and-references.md#annotation-storage-and-display) for the detailed format.

## Footnotes (Alt+E)

Insert a marker at the cursor (or **after** selected text) and match its number with the `# References` section at the bottom of the document. Calculations: `utils/footnotes.ts` (pure functions, tested); application: `editor/footnoteSync.ts` (tiptap extension).

**The stored format is the integration contract:**

- Markers are **literal Unicode subscript characters** — `22만명₁₎`. There are no custom nodes or serializers, so they remain readable in other editors, GitHub, and git diff. The matching regular expression is `[₀-₉]+₎`.
- References are an **ordered list** under `# References`. Do not write `1) 내용` in a paragraph — `1)` is a CommonMark list marker, so saving and reopening reparses it as a list and misaligns the entire section (the round-trip test in `footnoteSync.test.ts` catches this). The onscreen `1)` appearance comes from CSS (`.mew-references`).
- **Position determines the number.** The nth marker ↔ the nth list item. Numbers therefore do not need to be written as text, and the list renumbers itself when items are inserted or removed in the middle. We **only insert and remove items** — we do not rewrite their content, so links in references survive.
- Matching uses the **old numbers** (`planFootnotes`). New markers are inserted with an unused number (maximum + 1) so they do not take over another marker's content; `appendTransaction` assigns the positional numbers.
- **If there are no markers, do nothing** — this safeguard prevents deletion of manually written References. Deleting the last footnote leaves the last item behind (preferable to automatically deleting someone else's writing).
- Click a marker to show its numbered content in a popup, and click a reference item to jump to its marker. The popup is not added to the overlay stack (for the same reason as link and table tooltips).

## Diagrams

Hotview's `/diagram` inserts a basic Mermaid flowchart. `mermaid` blocks display code by default; pressing the **View Diagram** button with the image icon at the upper right displays the diagram in a popup. Existing Mermaid blocks and read-only documents provide the same view button. The popup closes with the close button, Esc, Back, or an outside press, and restores focus to the invoking button. Source and collaborative saves retain standard code fences. Syntax errors appear in the popup, while the code remains intact for editing. The renderer loads when the popup opens and restricts HTML and click actions in strict mode. Large diagrams scroll inside the popup.

## Cache and save status

Regenerable caches such as file content and folder listings follow a shared budget and a 7-day retention period, with automatic cleanup at startup, periodically, and on page navigation. Drafts, settings, and open tabs are not automatically deleted. The [browser storage contract](../../.mew/docs/development/browser-storage.md) defines the rules.
