---
title: "SVG Documents and PNG Attachments for the Agent Drawing Editor"
description: "Decision to implement the agent drawing editor with browser SVG and a pure document model, without an external drawing editor dependency, and to separate per-project SVG records containing editing metadata, images, and fonts from the existing PNG attachment path. Explains the implications of single-user editing, feature-specific modules, and memory and storage limits; the storage location is superseded by subsequent decision 0055."
created: "2026-10-16"
updated: "2026-10-23"
---

# SVG Documents and PNG Attachments for the Agent Drawing Editor

Status: Approved. The storage location is superseded by [0055 — Unifying Attachments and Drawings Under the Project Temporary Path](0055-project-temp-attachments.md).

## Background

Users need to be able to draw shapes, text, and annotations over screenshots together when providing context to an agent. The editor must support a grid, an infinite workspace, object transformations, groups, and layers while opening quickly, allowing saved drawings to be edited again, and using the existing image attachment and pending queue flows unchanged. Real-time collaborative editing is outside the current scope.

## Decision

- Use browser SVG as the rendering surface without adding an external drawing editor library. Separate the versioned pure TypeScript document model, geometry calculations, object renderers, SVG conversion, fonts, storage transport, and pointer-centered UI. Lazy-load the editor when requested from the input field.
- Separate object coordinates in px from screen position and zoom level. Edit relative to the origin without a fixed artboard, and calculate export bounds from the outer bounds of the actual objects.
- Save the reeditable source as an SVG with a new UUID in the current project's `.mew/drawings/`. Store the document and grid settings in SVG metadata, and embed images and fonts downloaded from Google Fonts. Keep the name, timestamp, and size in a separate small JSON file so the history list does not read large SVG files.
- Generate the PNG from the same SVG in the browser and pass it through the existing `.mew/assets/` attachment path. Saving in the drawing editor adds an image to the input and does not send the message automatically. Apply current-project checks and existing authentication and file permissions to saving, retrieval, and attachment.
- Use document snapshot history during editing. Separate drag previews from completion so that each gesture becomes one undo unit; panning and zooming do not change the document.

## Rationale and Impact

SVG represents shapes, curves, text, and images through the same object model and applies the same transformation rules to display and source storage. The browser's image and Canvas APIs can generate PNGs, so no image rendering runtime is added to the server. Reusing existing menus, color pickers, selection fields, and attachment flows also preserves Mew's theme, keyboard, and queue behavior.

An external editor engine could provide tools and transformation features, but its document format, UI, bundle, and lifecycle would need to be integrated with the existing input. For the current scope of single-user explanatory drawings, Mew directly owns the required object model and interactions. As a result, Mew also handles regression verification for geometry calculations, curves, keyboard behavior, accessibility, and export.

Embedding the entire drawing in the SVG makes the source independently viewable, but images and fonts increase storage size. Set separate limits for documents, history, images, SVGs, and PNGs, and do not reencode image strings in document history. Downloading new Google fonts requires an external browser connection, and download failures are reported as save failures. Real-time synchronization, editing arbitrary external SVGs, and nested group trees are outside the scope provided by this decision.

[Agent Drawing Editor](../features/terminals-agents-automation/agent-drawing-editor.md) owns the specific interactions, shortcuts, storage locations, limits, APIs, and verification criteria; [Input and Attachment Contract](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md) owns the shared attachment lifecycle.
