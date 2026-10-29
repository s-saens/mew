---
title: "Full-entry logos and internal three-dot loading for Mew and Mewlink"
description: "Decision to split shared loading indicators into a low-saturation logo highlight exclusively for full entry and three dots that sequentially change size inside panels, editors, and buttons. Explains the change history of the previous circular, orbital, and universal logo implementations and the verification boundaries; restoring circular indicators for attachment tags follows subsequent decision 0075."
created: "2026-10-26"
updated: "2026-10-27"
---

Status: Partially superseded — [ADR 0075](0075-attachment-spinner-indicator.md) replaces the three dots on attachment upload tags with a circular indicator.

## Background

Projects and editors used border rings, comment submission used a rotating refresh icon, and attachment uploads and Mewlink used separate CSS spinners. Rotation speeds, tracks, and highlight directions also differed, making the same waiting state look different.

## Decision

Standardize waiting indicators using `LoadingIndicator` and `loading-indicator.css` from `@mew/ui`. Private Mewlink, which does not use React, also imports the same CSS directly. Usage locations determine size, while shared CSS owns the logo, gradients, rotation speed, and reduced-motion handling. Follow the [shared UI contract](../development/ui-contracts.md#shared-loading-indicators) for specific values and usage scope.

Indicators for connection status and the presence of notifications retain their meanings. Waiting indicators follow the purpose-specific separation decision below.

## Previous comet orbit design

Initially adopted two orbits using gradients and masks on a single span and two pseudo-elements. Replaced this with the logo highlight approach below following a subsequent user request. Retain ownership of the component API and shared CSS.

## Mew logo highlight

Use the square border and inner mark of `public/favicon.svg` as a fixed mask, rotating only the purple, pink, and cyan light layers with transform. The logo itself does not move, and browser tests compare its geometry against the original SVG. Do not add a separate SVG request or JS frame loop. At the time, the same form was used even in small buttons, with the logo enlarged for central waiting indicators to improve legibility. The purpose-specific separation decision below supersedes this usage scope. Retain a system-color logo in forced colors and a static gradient with reduced motion.

Chose a moving highlight over a fixed mask instead of exact path tracing with SVG stroke-dashoffset. This avoids repeated SVG painting while retaining both existing React and plain HTML consumption paths. Performance measurements distinguish isolated Chromium from verification in actual production and on mobile devices.

## Separate full entry from internal waiting

Using the logo for waiting indicators at every size gave panels and buttons excessive visual weight. At the user's request, explicitly select the logo for full entry, restoration, and transitions, and reduce its colors to low-saturation gray-purple and blue-gray. Panels, editors, comments, attachments, Mewlink lists, and recovery use the default three dots. Replace existing agent speech-bubble skeletons with the same three dots.

The three dots vary only each dot's scale and opacity with phase offsets. They follow the current text color, remain stationary, and support reduced motion, pausing, and system high contrast. The [shared UI contract](../development/ui-contracts.md#shared-loading-indicators) owns specific usage locations and sizes.

## Rationale and Impact

Changing one shared style updates circular loading indicators in both Mew and Mewlink. Do not add a React dependency to Mewlink; retain existing status guidance and reduced-motion settings. Keep private central source excluded from Git. Production application requires both a local app build performed by the user and a central frontend deployment.
