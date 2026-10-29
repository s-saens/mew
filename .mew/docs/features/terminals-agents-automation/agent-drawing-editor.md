---
id: "mew-agent-drawing"
parent: "mew-agents"
title: "Agent Drawing Board"
status: "implemented"
created: "2026-10-16"
updated: "2026-10-23"
description: "Defines the origin and infinite workspace of the vector drawing board opened from agent input, grid, shape, curve, text, and image editing, and selection, transformation, grouping, layers, and shortcuts. Describes Google Fonts embedding, SVG history and PNG attachments under `.mew/temp`, preservation of read access to existing drawings and exclusion from Git, save APIs, permissions, module boundaries, and verification criteria."
files: ["src/components/drawing/DrawingEditor.tsx", "src/components/drawing/model.ts", "src/components/drawing/geometry.ts", "src/components/drawing/svg.ts", "server/agent-drawings.ts", "src/components/AgentPanel.tsx"]
상위파일: "_terminals-agents-automation.md"
---

A vector editor for explaining context to an agent with shapes, text, and annotations on screenshots. Open it with the **Open Drawing Board** icon at the lower right inside the input or with `Ctrl/Cmd+Alt+D` in the input. **Save** retains an SVG history entry for re-editing and adds the same drawing to the current input as a PNG attachment. Send the message using the existing Send button.

## Scope and Entry Points

The drawing board supports individual editing inside a popup. It does not provide real-time collaborative editing or editing-state synchronization across devices. The same drawing board is used for new messages and editing queued messages, and the saved PNG is attached to the input from which the drawing board was opened. The drawing board cannot be opened in CLI command mode or while attachments are uploading.

If there are unsaved changes, choose **Continue Editing / Close** before closing. Duplicate saves and closing are blocked while saving. Switching root projects or hiding the panel closes the drawing board, and saves or uploads that finish late are not attached to another project or another queued message. Previewing, deleting, and sending regular attachments follow the [Input and Attachment Contract](agent-input-mentions-skills-and-attachments.md).

## Workspace and Grid

Draw while panning the workspace without setting a canvas width or height in advance. The origin `(0, 0)` is marked with a crosshair and axes. Positive X points right and positive Y points down, with units in workspace-coordinate px. Zooming the view does not change these coordinate values.

**Go to Origin** or `0` centers the origin on the screen at the current zoom level. `Ctrl/Cmd+0` returns to a centered origin at 100%. `1` fits all objects in the view, and `2` fits the selected objects. The zoom range is 5–1600%. The wheel pans the view, and `Ctrl/Cmd/Alt+휠` zooms around the pointer. The pan tool, Space+drag, middle-button drag, two-finger panning, and pinching are also supported.

The grid defaults to 20px, with visibility and snapping toggled independently. Change the spacing to 2–1000px in **Grid Settings**. Object creation, movement, resizing, and new pen points snap to the grid; holding Alt disables snapping. If grid dots become too dense when zooming out, only the display spacing increases. Saved images exclude the grid, origin, and selection indicators.

## Drawing and Images

| Tool | Operation |
| --- | --- |
| Rectangle `R` | Drag to set two corners. Hold Shift to make a square. |
| Ellipse `O` | Drag to set the bounding rectangle. Hold Shift to make a circle. |
| Line `L` | Drag from the start point to the end point. Hold Shift to snap the direction to 45° increments. |
| Curve pen `P` | Click to add points, and click and drag to create curve direction handles. Finish with Enter, a double-click, or **Finish Curve**. With at least three points, click the first point to finish as a closed path. |
| Text `T` | Click the desired position and enter multiple lines. Finish by clicking outside, pressing Esc, or pressing Ctrl/Cmd+Enter. Double-click the text to edit it again. |

Paste a screenshot or image from the clipboard, or drop a file onto the canvas to create an image object. PNG, JPEG, WebP, GIF, and AVIF are supported, with a limit of 20 MiB per file. On initial placement, the displayed longer side is limited to 1600px, and the original bytes are preserved as a data URL. Images support moving, transforming, rotating, grouping, and layer operations alongside other objects. Clipboard support depends on the image clipboard data provided by the OS and browser.

## Selection, Transforms, and Layers

Click an object with the selection tool `V`. Shift+click adds or removes objects from the selection. Drag an empty area to select all objects fully enclosed by the box. Selecting an object in a group selects the entire group.

A selection displays a bounding box, eight resize handles, and a rotation handle above it. Corner handles adjust both axes; edge midpoint handles adjust one axis. Shift+resize preserves proportions, and Shift+rotate snaps to 15° increments. A single rotated object is resized along its own axes. Multiple objects transform together relative to a shared bounding box.

Horizontal and vertical text stretching is preserved as scale factors independent of font size. Characters and line spacing stretch together, and the size does not revert when saving or editing again.

Use `Ctrl/Cmd+G` to group and `Ctrl/Cmd+Shift+G` to ungroup. A group acts as a single unit for selection, movement, and layering. The current document format represents groups through each object's `groupId` and does not create a nested group tree. `Ctrl/Cmd+[` and `]` send objects backward or forward one step; adding Shift sends them to the back or front. Relative order within the selection is preserved.

## Right-Click Properties and Colors

Right-click an object to enter position, width, height, rotation, and stroke width directly in the shared `ActionMenu`, and to copy, paste, duplicate, group, change layers, or delete. You can also open it with `Shift+F10` or the keyboard Menu key. The X/Y fields are pixel values from the origin to the **center of the selection bounding box**. Width and height are the unrotated dimensions for a single object and the shared bounding box dimensions for multiple objects. Numeric input is applied on Enter or focus change; Esc cancels the value being entered.

Fill is represented by a colored circle, and stroke by a colored line icon. Open the palette using an icon or `F` or `X`. The eight default colors are dark gray, white, red, orange, green, teal, blue, and purple, in that order. While the palette is open, use `1~8` to select a color, `0` for transparency, and `9` to open the existing shared `ColorPicker`. Colors changed with no objects selected become the defaults for new objects.

Property and color changes for multiple objects apply to the entire selection. When text and shapes are selected together, the properties menu shows only colors. When only text is selected, you can also edit the font, font size, and regular/bold weight. Selection, movement, and transform handles are also available for mixed selections.

Choose a font from the shared `SelectField` options or enter a Google Fonts font name directly. System fonts are used locally. For Google fonts, the name, weight, and characters used are included in the Google Fonts request to download only the required glyphs. Downloaded fonts are embedded as data URLs in the `@font-face` of the preview and saved SVG, so displaying the finished SVG or PNG requires no external requests. Downloads are required when selecting a new Google font, adding characters, or saving again in a new browser session. If a font cannot be downloaded, an error is displayed and saving does not complete.

## Keyboard Shortcuts

The keys below apply when the drawing editor has focus and no text or numeric field is being edited. When the color palette is open, number keys prioritize color selection.

| Action | Key |
| --- | --- |
| Open drawing editor | `Ctrl/Cmd+Alt+D` in the agent input field |
| Select / Pan | `V` / `H`, drag while holding Space |
| Rectangle / Ellipse / Line / Pen / Text | `R` / `O` / `L` / `P` / `T` |
| Select all / Add to selection | `Ctrl/Cmd+A` / Shift+click |
| Copy / Cut / Paste | `Ctrl/Cmd+C` / `X` / `V` |
| Duplicate / Delete | `Ctrl/Cmd+D` / Delete·Backspace |
| Undo / Redo | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z`·`Ctrl/Cmd+Y` |
| Group / Ungroup | `Ctrl/Cmd+G` / `Ctrl/Cmd+Shift+G` |
| Send backward / Bring forward | `Ctrl/Cmd+[` / `Ctrl/Cmd+]` |
| Send to back / Bring to front | `Ctrl/Cmd+Shift+[` / `Ctrl/Cmd+Shift+]` |
| Move 1px / Move 10px | Arrow keys / Shift+arrow keys |
| Constrain proportions or direction / Temporarily disable snapping | Shift+drag / Alt+drag |
| Fill / Stroke palette | `F` / `X` |
| Default palette colors / Transparent / Custom color | `1~8` / `0` / `9` |
| Toggle grid display / Toggle snapping | Apostrophe / Shift+apostrophe |
| Origin / Fit all / Fit selection | `0` / `1` / `2` |
| Origin at 100% / Zoom in or out | `Ctrl/Cmd+0` / `+`·`-` |
| Finish curve | Enter·double-click |
| Object menu / Shortcut list | Shift+F10·Menu key / `?` |
| Save | `Ctrl/Cmd+S` |

Esc closes open menus, property editing, palettes, or auxiliary panels, finishes text entry, or cancels a curve in progress. If a selection remains, it is cleared first; closing the popup is handled at the final stage. Text copy and paste within the editor retain normal input behavior.

## Saving, History, and Attachments

**Save** creates an SVG by adding 24px of padding and a white background around the outer bounds of all objects, including stroke widths. It does not crop to the visible area or origin position. The SVG's `<metadata id="mew-drawing">` contains the version, objects, and grid settings as XML-escaped JSON, and images and downloaded fonts are embedded as well. View position, selection, and undo history are not saved.

The browser converts the same SVG to PNG and uploads the PNG through the existing attachment flow after the SVG is saved successfully. The PNG defaults to 2× resolution, scaled down based on limits of 8192px per side and approximately 16.8 megapixels. If saving, conversion, or attachment fails, the drawing and error remain available for retry. If only attachment fails after the SVG is saved, retrying with the same drawing and name reuses the existing export to reduce duplicate history entries.

| Data | Location and lifetime |
| --- | --- |
| Editable original | `.mew/temp/drawings/<uuid>.svg` in the current root project |
| History entry name, save time, and byte count | `<uuid>.json` in the same folder |
| PNG for agent input | `.mew/temp/assets/` in the current root project; existing attachment lifetime applies |
| Unsaved document, selection, view position, undo/redo | Memory of the open drawing editor |

New SVG, JSON, and PNG files are saved only under `.mew/temp/`. Existing history in `.mew/drawings/` and attachments in `.mew/assets/` continue to be read without being moved or deleted. To exclude them from Git, add `.mew/temp` to the project's `.gitignore`.

The Mew repository also excludes existing untracked user drawings in `.mew/drawings/` from Git, preserving them at their original paths. It does not delete tracked drawings or attachments or change their storage locations in bulk.

Each save adds a new UUID history entry. Select an entry by name and time from **Drawing History** at the top to restore the SVG's editing metadata and edit it again. The list reads only small JSON files, so it does not parse entire SVGs containing screenshots each time. Even when editing Documents, files are saved at the `.workspace` root; no nested `.mew` is created under Documents. Removing an attachment tag does not delete the original SVG or PNG from disk.

## APIs and Access Boundaries

| Request | Input | Response |
| --- | --- | --- |
| `GET /api/agent/drawings` | Optional `projectRoot` query parameter | `{ drawings, projectRoot }` |
| `GET /api/agent/drawings/:id` | UUID, optional `projectRoot` query parameter | History entry properties, `svg`, and `projectRoot` |
| `POST /api/agent/drawings` | `{ svg, name, projectRoot? }` | HTTP 201, record attributes and `projectRoot` |

History entry properties are `id`, `name`, `createdAt`, project-relative `path`, and `bytes`. The server uses the requesting account's active root and rejects the request with 409 if the supplied `projectRoot` differs. The existing `POST /api/upload-into` for PNGs also checks the optional `projectRoot`.

All drawing APIs require login, agent feature permission, and file permissions for `.mew/drawings`. Listing and retrieval require read permission; saving requires edit permission. Read restrictions on individual SVGs are also checked. SVGs are accepted up to 32 MiB and names up to 120 characters. Symbolic links for the storage folder, symbolic or hard links for files, invalid UUIDs, and path traversal are rejected.

The server allows only editor-generated SVG tags and attributes, raster image data URLs, and data fonts. It does not save scripts, event attributes, external references, external CSS, or arbitrary HTML. Re-editing reads only Mew's editing metadata and does not execute arbitrary external SVGs as editable documents. [Access Control](../../development/access-control.md) owns the shared permission policy.

## Implementation Modules

| Module | Responsibility |
| --- | --- |
| `model.ts` | Versioned documents, objects, and grid; normalization, grouping, and layer order; undo history of up to 80 states |
| `geometry.ts` | Coordinate conversion, selection bounds, actual shape hit testing, movement, resizing, rotation, and curve calculations |
| `DrawingObjectView.tsx` | Per-object SVG rendering and memoization |
| `DrawingEditor.tsx` | Tools, selection, pointer gestures, panning, keyboard handling, and popup lifecycle |
| `DrawingInspector.tsx` | Property editing using shared menus, select fields, and color pickers |
| `svg.ts` | SVG serialization, editing metadata restoration, and PNG conversion |
| `fonts.ts` | Google Fonts subset downloads, caching, and font embedding |
| `storage.ts` / `server/agent-drawings.ts` | Authenticated transport / Per-project validation, history storage, and retrieval |
| `AgentPanel.tsx` | Lazy-loaded entry point and integration with existing input and queue attachments |

Drag previews are applied once per frame using `requestAnimationFrame`, and a single document snapshot is committed when the gesture ends. Intermediate pointer movement states are not added to undo history. Document object coordinates are separate from the viewport; internal object X/Y coordinates indicate the top-left corner before rotation. Center coordinates in the properties menu are calculated from the selection bounds. New object types require corresponding implementations in the document model, geometry calculations, renderer, and SVG conversion. The rationale for technical choices is documented in [ADR 0008](../../decisions/0008-agent-vector-drawing.md).

Undo during a drag cancels the change in progress first and does not remove the previously committed object. Normalization during document restoration and export is capped at 5,000 objects and 10,000 path points per object. Actual editing latency for large documents has not been measured separately.

## Acceptance Criteria and Verification

The following are user acceptance criteria; this list itself does not establish that verification is complete.

- Edit shapes, lines, curves, multiline text, and screenshots in one drawing, and change grid visibility, spacing, and snapping.
- Object pixel coordinates remain unchanged after returning to the origin, zooming, or panning, and resizing, rotation, grouping, and layer order remain consistent for rotated objects and multiple selections.
- Palette number keys, transparency, custom colors, and Google fonts apply to the entire selection, and mixed-selection menus show only colors.
- Undo, redo, copy, and paste preserve objects, images, and groups, and a single drag is undone in one step.
- Saved SVGs can be re-edited from history, PNGs can be attached to new input and queue edits, and they do not get mixed into other input after project switches or upload failures.
- On desktop and mobile, popups, properties menus, shared selects, and palettes stay within the screen and do not obscure text input.

2026-10-16: Drawing model, font, save API, and actual AgentPanel browser checks were run serially alongside existing agent input, queue attachment, and shared translation checks; 32 passed. `npx tsc -b`, linting of changed files, document description/link checks, and diff checks also passed.

Tools, actual Bézier curves, snapping, multiple selection, grouping, layers, rotation, numeric sizing, text scaling, palettes, panning, and zooming were checked in isolated Chromium at 1100/390px screen sizes. Checks also covered font embedding with mocked Google Fonts responses, synthetic screenshot pasting, SVG re-editing, retries after PNG attachment failures, duplicate history prevention, and isolation across project switches. Actual Google Fonts service access, mobile OS clipboards and keyboards, and application to the production server were not verified. No build or server restart was performed.
