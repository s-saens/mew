---
id: "mew-settings-mewcat"
parent: "mew-settings"
title: "Mewpet mascot, notifications, and breaks"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-27"
status_hash: "8b1758c7281118da18b267a2c001213bb7c463d4dbd018bb221e192d83f43ec3"
files: ["server/mewpet-skins.ts", "server/mewpet-skin-routes.ts", "shared/mewpet-skins.ts", "src/components/header-notifications.tsx", "src/components/header-resources.tsx", "src/utils/mewcat-notifications.ts", "src/components/Mewcat.tsx", "src/components/mewcat-skin-settings.tsx", "src/components/mewcat-size-settings.tsx", "src/utils/mewcat-size-preferences.ts", "src/utils/mewcat-sprites.ts", "src/utils/mewcat-sprite-storage.ts", "src/components/mewcat-fullscreen-guide.tsx", "src/hooks/use-startup-guide.ts", "src/utils/app-install.ts", "src/components/mewcat-resources.tsx", "src/components/SettingsModal.tsx", "src/components/mewcat-notifications.tsx", "src/hooks/use-mewcat-notifications.ts", "src/utils/mewcat-notification-rules.ts", "src/components/mewcat-break.tsx", "src/hooks/use-mewcat-break.ts", "src/utils/mewcat-break-rules.ts"]
commits: []
description: "Defines the small rounded vertical C·R·G gauges in the top bar, centered labels, theme-colored usage fills rising from the bottom, tooltip values, and accessibility descriptions, along with the notification button to the right of fullscreen and the connections to system resource permissions, queries, and detail dialogs. Defines notification settings without a monitoring-scope explanatory paragraph; default automatic tab switching for approval requests, its settings, and toast notifications; the capybara-only built-in skin, brightness adjustments for the custom black capybara skin, the blank-faced black cat with only eyes and a thin white outline, restoration of removed built-in choices, and cleanup of local Git image history; global file skin registration, storage limits and distinct errors for 16 motion images, WebP compression, browser migration, updates without a build, and optional connection to an external generation MCP separate from Mew deployment. Also explains hiding Mewpet while skins load and displaying independent toasts; placement at the screen bottom, mobile settings dialogs, and default size; frame counts, playback durations, and enablement for required Idle, walking, and Struggle motions and optional motions and transitions, per-skin movement speeds, stride synchronization, a shared floor anchor, and transitions at cycle boundaries; basic frame playback retained even with reduced motion, narrow tilt cycling during falls, and an 83% display scale; movement, dragging, throwing, installation-first getting-started guidance, and individually permanent dismissal of fullscreen guidance; recent notification lists and toasts; and storage and input contracts for optional giant breaks."
상위파일:
  - "MOC.md"
  - "_appearance-accounts-operations.md"
---

## Requirements

- Collect notifications even when no Mewpet skin is available or the cat is hidden. When in-app notifications are enabled and there are unacknowledged notifications, show a bell icon and count to the right of the top fullscreen button and to the left of the hamburger button. Clicking it opens the same notification list with actions to navigate to the relevant screen, dismiss individual notifications, and mark all as read.
- Move notification channels, resource monitoring, and tests to a separate **Notifications** tab in settings. When a Mewpet skin is enabled, add an **Also show notifications through Mewpet** option; turning it off preserves header notifications, OS notifications, and sounds. The Mewpet tab owns skin, default size, hiding in the remote viewer, and break settings.

- Interact with the cat at the bottom of the screen, and receive visual notifications and optional PC desktop notifications and sounds for agent tasks, errors, and server overload.
- Optionally, after a period of use, Mewpet itself grows enormous, covering the work screen to encourage a break.

### Scope

- The default and only built-in skin for the signature character **Mewpet** is **Capybara**. User-registered file skins are also retained.
- Provide walking, running, clicking, dragging, and throwing for the sprite cat, along with hiding and skin selection in settings.
- In Settings → Mewpet, register sprite images, frame counts, playback durations, enablement, and movement speed for idle, walking, running, airborne ascent, airborne descent, petting, and scruff-grabbing motions, and save, edit, or delete them by name. Set each motion's total playback duration independently of its frame count. Airborne ascent and descent use separate images, and landing reuses the later frames of the descent image.
- Notify users of task completion, errors, approvals, and sustained server resource overload through toasts, and navigate to the relevant screen from the notification list.
- Omit task completion notifications for the agent tab currently being viewed. Retain completion notifications when the user is in another tab, panel, or browser window, as well as error and approval request notifications.
- Text and accessible names in the clickable list and toasts follow the interface language setting and reflect language changes immediately, even while open.
- Configure notification channels and resource monitoring, and test OS notifications and sounds for an inactive PC window. Show permission status and test guidance at the bottom of settings, without a persistent explanatory paragraph describing the project, browser, and terminal monitoring scope.
- Provide enforced breaks, disabled by default.
- Set usage and break durations in hours/minutes. When the usage duration is reached, a large Mewpet covers the work screen until the break ends.
- Show only a timer; the large Mewpet still roams as usual and can be grabbed, dragged, or thrown.
- Preserve screen interactions outside the image and keyboard operation.

### Boundaries and limitations

- Monitor only connected ACP chat tabs in the current project.
- Exclude terminal-only agents and push notifications when the browser is closed.
- OS notifications require browser permission and a supported environment.
- In normal display mode, movement is restricted to the floor.
- On both desktop and mobile, the bottom of the current visual viewport serves as the floor, regardless of the dock. On mobile, the cat overlaps the bottom dock; dock height, visibility, and safe area do not raise the cat. Recalculate the floor and movement bounds on fullscreen transitions, window resizing, keyboard changes, zooming, and scrolling.
- Forced breaks use a giant cat to obstruct the view and pointer interaction; they do not use a fullscreen overlay, lock input, or actually detect gaze.
- External mascot assets with unclear redistribution rights are not reintroduced. The current default skin is internally created.

### Related documents

- [Mewpet Assistant](mewpet-assistant-conversations-and-controls.md) owns the popup's conversation functionality.

## Detailed behavior

Display descending sprites at 83% of their original scale to reduce the difference that makes the diagonal body length look larger than during ascent. Keep the bottom-center anchor and apply the same scale to the actual Mewpet, settings preview, and image hit testing. Also apply this scale to descending frames reused when no separate landing image exists. Keep the original images, movement, gravity, and playback durations.

### App installation and fullscreen guides at startup

When mew opens or reloads, show the app installation guide before the fullscreen guide. If a browser installation event has been received over HTTPS or localhost, the **Install app** button opens the browser's installation dialog. On mobile, provide manual installation instructions even if the event has not arrived or the installation dialog cannot be opened directly. For iPhone and iPad, direct users to **Add to Home Screen** in the share menu; for other mobile browsers, direct them to **Install app** or **Add to Home Screen** in the menu. Actual menu names and support depend on the browser. In desktop browsers that support installation, provide a manual installation path even without an event; in other environments, show the guide when an installation event is available.

After the installation guide is closed, if fullscreen is inactive and the API is available, show **mew keyboard shortcuts work reliably in fullscreen.** and a **Switch to fullscreen (Alt+Enter)** button. Accepting installation hides both guides; canceling or failing displays manual installation instructions. If the client is a Mac, display `Option+Enter` regardless of the server OS. If the user reassigns the fullscreen shortcut, the button also displays the actual binding. The text follows the app's four language settings and updates even while open.

Both guides provide a **Don't show again** checkbox. Selecting or clearing it immediately saves the setting for that guide in the browser; installation and fullscreen preferences are independent. Closing without checking it hides the guide only for the current app lifetime and shows it again on the next load. Checking the box alone does not immediately close an open guide. Follow [Storage keys and scope](../../development/browser-storage.md#dont-show-again-for-startup-guidance).

Hide both guides upon receiving the `appinstalled` event indicating installation completion or detecting an app launch mode on initial load (`standalone`, `fullscreen`, `minimal-ui`, or `navigator.standalone` on iOS). Subsequent entry through the Fullscreen API is not treated as app installation, and the installation guide is not shown during ordinary web fullscreen when the app is not installed. The [Installable web app contract](../../development/ui-contracts.md#installable-web-app-and-startup-guidance) owns the installation manifest and applicability conditions for direct access and Mewlink.

The fullscreen button calls the Fullscreen API on the app root within the click gesture. Entering through the existing fullscreen shortcut or a button on another screen also closes the guide. On failure, keep the guide open and provide an error and retry option. After entering fullscreen, do not show it again during the same app lifetime, and do not enter fullscreen automatically. Do not show the fullscreen guide on clients that do not support the Fullscreen API or prohibit fullscreen use for the document.

Reuse the existing Mewpet speech bubble position and theme, and stop the cat while a guide is displayed. Show the same guide at the bottom even when no skin is available or Mewpet is turned off. Approval request notifications appear before startup guides. Startup guides are independent of general notification channel settings; retain the remote viewer contracts for hiding Mewpet and displaying breaks.

`server/mewcat-fullscreen-guide-ui.test.ts` verifies speech bubble screen boundaries and overflow, client OS labels and language changes, retry after failure, closing, reloading, no recurrence after exiting fullscreen, missing skins, and unsupported states in isolated Chromium with desktop dark and mobile light themes. Tests using substitutes for the Fullscreen API and browser installation events do not guarantee actual app installation, OS key interception, or mobile fullscreen and back navigation behavior.

`server/app-install-ui.test.ts` checks installation guide priority, display without Mewpet, independent storage and restoration after reload for each checkbox, the iOS manual path and language switching, desktop installation events, and guide hiding on installation acceptance, cancellation, and app launch modes. `server/app-install-manifest.test.ts` checks direct-access metadata, the manifest, and actual PNG dimensions.

Enabling **Hide Mewpet in remote desktop** under Settings → Mewpet hides the cat, speech bubbles, and break display while the remote viewer is open and restores them when it closes. It is off by default and saved per browser in `mew:mewcat-hide-desktop`. Notification collection, OS notifications, and break timers continue running.

Mewpet and speech bubbles displayed in remote desktop are portaled into a host inside the viewer, so background `inert` does not affect them. Mewpet handles clicks, dragging, and keyboard interactions without forwarding them as remote input.

When settings open on mobile (below 768px), move Mewpet and its speech bubble to a dedicated host inside settings and display them above the settings window. Users can immediately view the actual Mewpet while changing its skin or default size, and can click, drag, and release it. Settings inputs and scrolling outside the image remain available, and interacting with Mewpet does not close settings. If a speech bubble is open, Esc or back navigation closes it first; the next input closes settings. When settings close or the viewport switches to desktop width, return to the original workspace or remote viewer host, and continue applying the remote viewer hide setting. On desktop, settings appear in front of the normal Mewpet.

Feature entry: [Mewpet](mewpet-mascot-notifications-and-breaks.md). This document owns the feature's detailed behavior and display contracts.

In normal display mode, Mewpet moves using the **very bottom** of the screen as the floor and does not climb walls or ceilings. On desktop, mobile, and fullscreen, the bottom of the current visual viewport serves as the floor. The floor stays the same regardless of the dock's position, height, or visibility, and Mewpet appears over the dock on mobile. Default behavior randomly selects idle, walk, run, or an occasional automatic jump. When the system's reduced motion setting is enabled, automatic jumps and optional transition playback are skipped, but basic frames representing walking, running, rising, falling, petting, and being held continue to play. Use action-specific sprite frames and horizontal flipping rather than forcing the sprite to stay on frame 0. Display the capybara within a default
48 px square while preserving its aspect ratio. The capybara uses small dot eyes and thick, rough brown lines and fills. Keep the artwork's colors independent of the theme and accent color, and apply the same skin to the settings preview, the large cat for breaks, and the remote viewer. Use the bottom
transparent padding of the Idle sprite as the skin's shared floor anchor. Do not recalculate the floor from individual padding in airborne, preparation, or landing motions, so the body does not jump when actions change.

The **Default size** slider under Settings → Mewpet adjusts the size from 24–144px in 1px increments and displays the current size. The reset button restores 48px. Changes apply immediately to built-in and custom skins and the remote viewer while preserving the current position, action, and held state. Adjust the floor, wall boundaries, transparent padding correction, and image pointer path to the new size as well. Skin previews retain their existing size, and the giant break Mewpet's size is calculated from the visual viewport.

The normal size is saved per browser in scoped localStorage `mew:mewcat-size`, following P2P's central-account and per-instance scopes. Apply changes made in another window within the same scope and restore the value after reload. If no saved value exists or it is not a number, use 48px; if a valid number is outside the range, use the nearest boundary value. If saving fails, apply the value to the current screen and show an error in settings. As a user preference, it is excluded from automatic cache cleanup.

A short click stops movement, plays the love motion once, and opens the recent notification bubble. System resource utilization is displayed in the top bar. Pressing the cat and immediately moving lets users drag it with
a mouse or touch, while the struggle motion loops. On release, it inherits the horizontal
and vertical velocity of the last pointer movement as momentum and flies along a gravity-driven trajectory. Both normal and break
Mewpets face the direction of their actual horizontal momentum at release. Regardless of which way they faced before being grabbed, they face left when thrown left and right when thrown right. Without horizontal momentum, they retain their previous facing direction. If released more than 120 ms after the last movement or if pointer input is canceled, they fall without momentum and retain their previous facing direction. They
can be grabbed again while airborne, which stops their existing momentum. For both mouse and touch, preserve the offset between
the pointer and character at the moment of grabbing, and keep the character at the grabbed position even when the pointer does
not move. Frames while the pointer is held reflect only the last pointer coordinates and skip movement, gravity, and
floor correction. Loop jump while rising with negative vertical velocity and fall while descending with velocity of 0 or greater; on contact with either wall, reverse direction and
reduce speed to 50%. Switch to the falling motion at the apex or on ceiling collision. On reaching the floor, play the optional landing motion once. If no landing image is available, use the later frames of the existing fall motion, then randomly select another default behavior.

Both normal and break Mewpets receive pointer input only on the visible artwork. They use a 48×48 pointer path extracted from each frame's alpha. Pressing outside the artwork or on transparent areas within
the rectangular bounds passes input through to buttons and editors behind it. Release pointer capture immediately after throwing
or releasing, and do not use an overlay that blocks background interactions during falling. For `touchstart` that starts on the artwork,
cancel the default behavior in a non-passive listener so browser touch gestures do not swallow the click from the first background
tap after a throw. Apply touch cancellation only to the cat element, and handle tapping, dragging, and throwing with the existing pointer events. To grab it again in midair, press the artwork directly.

Do not include original or modified external mascot assets in the public repository. Do not reintroduce Oreo Cat assets whose redistribution
rights are unclear.

### Per-skin motion settings

In the skin editor, set the **Playback duration (seconds)** for each basic motion and transition to 0.05–60 seconds (stored as integer ms). Keep the cycle length unchanged when the frame count changes. Transitions play once over the configured duration, and previews loop over the same duration. Action selection intervals for Idle, walking, and other actions, and actual flight durations for jumping and falling, are independent of frame playback duration.

**Movement speed (multiplier)** ranges from 0.1–5× and defaults to 1×. Apply the multiplier to walking at 48px/s, running at 115px/s, and automatic jump horizontal speed at 90px/s. Use the same setting for speed interpolation during transitions and for normal, giant, and remote viewer Mewpet. Keep the existing input physics for manual throw speed and gravity.

Display Idle, walking, and Struggle as checked, disabled controls; the server also rejects disabling them. Toggle the others with enable checkboxes. Exclude disabled basic actions from automatic selection and do not play their associated transitions. Disabling jumping prevents automatic jumps and takeoff and apex transitions. If airborne ascent or descent is disabled, dragging and releasing or throwing still preserves physical movement, but displays Idle for the corresponding image. Disabling petting still allows clicks to open the speech bubble.

If `motion.stride` exists, store the stride length per cycle for `walk` and `run` in original-frame px. Both values must be finite numbers greater than 0 and no greater than 4096. Movement speed is calculated from the displayed size/original cell width, stride length, and playback duration, so the planted foot stays on the same floor at the default size and during giant breaks. These skins also adjust walking, running, and the six ground transition playback durations to match the movement multiplier. For example, at 0.5×, those playback durations become 2×. Existing skins without stride lengths retain the default speeds and playback behavior above. Preserve existing stride metadata even when names, durations, or other settings are edited.

`motion` in `skin.json` and the upload manifest stores `durations` (ms per motion), `enabled` (boolean per motion), and `movementSpeed` (multiplier). Preserve them in list responses, reloads, edits, and built-in overwrites. Existing skins without settings default to the existing durations, 1×, and enabled motions. Before saving, reject missing required/enabled basic images, invalid durations or multipliers, and attempts to disable required motions, preserving the previous valid skin.

Uploads allow up to 16 motion images together with one manifest. Set the parts limit to 18 to account for the multipart parser raising an error as soon as it reaches the limit, while retaining the limits of 16 files and 1 regular field. Show file limit errors only for exceeded file sizes or counts; distinguish other upload format errors as skin input errors.

### Optional transition motions and automatic jumps

The three motions `idle`, `walk`, and `struggle` are required and always enabled. `run`, `jump`, `fall`, `love`, and transition motions can each be disabled, and images for disabled motions can be omitted. Each of the nine transition motions below is optional, and existing skins that omit some or all of them remain usable. In settings, expand **Transition Motions (Optional)** below **Basic Motions** to use images, frame counts, previews, and example downloads; only registered transitions can be removed. The default frame count for new inputs is 8 for basic motions and 2 for transition motions; frame counts in previously saved skins are preserved. Required image validation and image and frame limits remain the same.

| Transition | Image key | Default single-play duration |
| --- | --- | --- |
| Running → Walking | `run-walk` | 220ms |
| Walking → Running | `walk-run` | 180ms |
| Running → Idle | `run-idle` | 260ms |
| Idle → Running | `idle-run` | 220ms |
| Walking → Idle | `walk-idle` | 240ms |
| Idle → Walking | `idle-walk` | 240ms |
| Floor → Jump | `takeoff` | 240ms |
| Falling → Landing | `landing` | 240ms |
| Airborne ascent → Descent | `apex` | 180ms |

Voluntary changes between Idle, walking, and running start transitions at the end of the current loop cycle. A transition plays once, then starts a new cycle from frame 0 of the next basic motion; time spent on the transition is not added to the next motion's elapsed time. Landing restores the Idle pose. Pressing, dragging, and attention notifications do not wait for a cycle boundary. Use each motion's configured duration regardless of frame count (the table shows defaults); only looping previews cycle repeatedly. Between walking, running, and Idle, interpolate horizontal speed from the previous speed to the next over the transition duration. Pressing or dragging immediately cancels transitions, and position, gravity, and automatic actions stop while the pointer is captured.

When choosing a free action again, select an automatic jump with a 10% probability. Do not start automatic jumps during attention states such as notifications, fullscreen guides, or open speech bubbles, or when reduced motion is enabled. If an automatic jump is selected while walking or running and a stopping transition exists, first stop in Idle. If `takeoff` exists, play the preparation motion on the floor, then take off in the current direction; otherwise, use the existing `jump`. Immediately before execution, recheck attention notifications and whether jumping is enabled. After takeoff, apply the existing gravity, wall, ceiling, and floor rules starting at a horizontal speed of 90px/s and a vertical speed of −640px/s. Play `apex` when vertical velocity changes from negative to 0 or greater, while flight physics continue. For skins with stride metadata, shorten the apex duration to match the remaining descent time and actual gravity integration interval, showing the descent preparation pose before landing. Skip the apex for flights shorter than two frames. This timing adjustment applies only to that transition; preserve the configured duration for the next jump. Play `landing` on actual floor contact. Manual throws start ascent or descent immediately without a floor preparation motion. Normal-sized and giant break pets share these rules.

Each of the six built-in skins provides all nine transitions as **2-frame, 256×128** transparent PNGs and lossless WebPs. Basic motions remain **8-frame, 1024×128**. The two transition frames are distinct key poses connecting the starting pose to the next state. Using the built-in image_gen with the character as a reference, two consecutive cells in a 6-column × 3-row atlas were generated as one transition, then aligned to the same 128px cells and 127px sole baseline. The capybara's previous 8-frame transition generation record is preserved in `previousSources` of `transitions-source.json`. Prompts, actual references, original atlases, and alignment specifications are preserved in each skin folder.

`src/utils/mewcat-sprites.ts` owns optional motion types, state mappings, configurable playback durations, and single playback; `src/components/Mewcat.tsx` owns transition lifecycles, automatic jumps, and physics; skin storage and settings own image registration, removal, and restoration. `server/mewcat-transitions-ui.test.ts` checks actual progression through the two transition frames across the six built-in skins on desktop and mobile, the six directional transitions, takeoff, apex, landing, grabbing during preparation, preserving throw direction, and fallbacks for skins without images and reduced motion. Settings regression tests check saving with only the seven basic motions, registering optional transitions, rejecting invalid frame counts, removing transitions, and restoring after saving.

### Click to view recent notifications

Clicking or tapping the normal Mewpet opens a small bubble 260 px wide at its current position. The body shows recent notifications in reverse
chronological order, with titles and body text at 12 px and sources at 11 px. Each item's × button deletes only
that notification. The list uses up to 30 notifications already held in page memory and does not retrieve items already acknowledged or
deleted. Show an empty state message when there are no notifications. If the list is long, scroll only the body. Set horizontal padding for
the header and list to 12 px. Use 8 px of vertical padding for the header and 12 px for notification rows and the empty state, without duplicating inner body padding. The gap between body text and source is 2 px, and the gaps between the 16 px status icon, body text, and close button are 8 px. Vertically center the row's body text and close button, and align the status icon with the first line.

- Titles, empty states, all notification types, buttons, accessible names, and resource tooltips follow the display language setting (Korean, English, Japanese, or Simplified Chinese). Retranslate open speech bubbles and existing notifications immediately when the language changes. Preserve CPU and GPU abbreviations and custom agent names, but translate the Mewpet name in test notifications.
- Notification bodies with a destination open the existing conversation, system resources, or update screen and mark the notification as read.
- If system resource permission is available, show a small resource button in the topmost bar. The button is 36×36px on both mobile and desktop, with vertical gauges of equal width and 24px height displayed side by side with 2px gaps. Round each gauge's corners to 4px and center `C`, `R`, and `G`, representing CPU, RAM, and GPU, horizontally and vertically in the Mono font. Provide values in the tooltip and screen reader description. Fill gauges from bottom to top with the theme's primary color (the `accent` token), clamping fill height to 0–100%. Use the theme text color (`ink`) for labels on the empty background and the text color for the primary color (`ink-on-accent`) over the fill to keep them readable in light and dark themes. Empty the gauge when no value is available. Exclude gauge graphics from the accessibility tree and associate the button's translated name with a separate numeric description. Do not add update animations. Keep abbreviations in all languages; tooltip titles and accessible names follow the display language.
- CPU is server-wide utilization, RAM is used/total memory, and GPU is the maximum compute utilization across multiple GPUs. Show unsupported values as `—` in tooltips and accessible descriptions. On query failure or while loading, empty the bars, show a status tooltip, and replace the values in the accessible description with `—`. These are resources of the **mew server machine**, rather than the browser device.
- Query immediately when the header appears and refresh every 500ms. Skip a cycle if the previous request is still in progress, and use a 10-second timeout. On failure, clear the previous values and retry on the next cycle.
- Pressing the resource button opens the existing system resources popup. Display and refresh it independently of Mewpet skin, speech bubble, and notification settings. Clean up requests and timers when permission is revoked, the account changes, or the header is removed. Do not add a resource row or separate query to Mewpet's recent notifications list.
- Close the list on Close, clicking Mewpet again, Esc, back navigation, starting a drag, hiding the skin, or entering a forced break. It can also be opened with Enter or Space. The large break cat retains only its existing interactions.
- The manually opened list is independent of toast and resource monitoring settings. New notifications appear as toasts even while the list is open. Simply opening or closing the list does not delete notifications.
- The body that displayed resource utilization in large horizontal cards was replaced with a notification list. Do not reintroduce it unless the user requests it.

`src/components/header-resources.tsx` owns the top resource display and lookup lifecycle, `src/components/mewcat-resources.tsx` owns the list opened by clicking, and `Mewcat.tsx` owns click/drag distinction and visibility state. `App` shows the header resource
button only when system resource permission is available and passes through the existing popup callback.

`src/hooks/use-mewcat-bubble.ts` positions the speech bubble to follow the cat's current position and the visual viewport. By default, it is centered above the cat; at either edge of the screen, the bubble
body is adjusted to stay on screen and its bottom tail moves toward the cat's center. It follows the cat even when dragged
or thrown during a notification, and if there is insufficient space above, it appears below with the tail pointing up. Its
width and height also adjust to window resizing, the keyboard, zooming/scrolling, and list expansion. The behavior that moved
the cat to the right edge on clicks or incoming notifications has been removed and must not be reintroduced. The notification
panel with the cat hidden retains its existing bottom-right position.

### Skin Selection

Choose a skin for each screen in the **Mewpet** category in Settings. The first card is **None**;
selecting it prevents Mewpet from rendering. Select the only built-in skin, **Capybara**, or a user-registered skin using static previews of the actual artwork. List and editor previews share the `surface-hover` background. Capybara (`capybara`) is the default. Selections of the removed built-in skins `mew`, `oreo`, `kitten`, `russian-blue`, `black-cat`, `korean-shorthair`, `siamese`, and `penguin` revert to Capybara. None and other file-based skin selections are retained. The selected ID is stored in `mew:mewcat-skin` in scoped localStorage. If no scoped selection exists yet, None, Capybara, or a removed built-in selection is inherited from the existing origin-wide setting; custom IDs are not migrated to other instances.

Capybara (`capybara`) retains a broad, blunt snout, round ears, a large brown body, small horizontal dot eyes, and a blank expression. All seven actions use a roughly drawn style with thick, slightly crooked lines and simple brown shapes, without eye sparkles, gloss, or detailed fur. It supports seven actions, separate ascent and descent, horizontal flipping, dragging, rest, and remote display.

Russian Blue, Black Cat, Korean Shorthair, Siamese, and Penguin were removed from the built-in offerings based on the user's design judgment. Capybara's images, frames, and playback durations are retained. Do not regenerate or register these five built-in skins again without an explicit follow-up request.

The previous default SVG cat and its dedicated fur color picker, HEX input, and reset control were removed at the user's request. Existing `mew:mewcat-fur-color` values are not used, and the previous character and fur color settings must not be reintroduced unless the user requests them. Built-in and uploaded skins display the colors in their images.

In **Add Skin**, enter a name, provide images for the enabled basic actions, and enter frame counts and playback durations. Saving immediately applies the new skin. Editing and deletion are available by name; deleting the active skin reverts to Capybara. Action previews play during input, and the Download Example button downloads images for the currently selected skin. When None is selected, the default Mewpet example is provided. The skin list is shared server-wide, and only the owner can register, edit, or delete skins. Editing a built-in skin saves a user version with the same ID in the global folder; deleting it restores the built-in original.

| Action | Image key | Forward playback duration |
| --- | --- | --- |
| Idle | `idle` | 880ms |
| Walk · one direction | `walk` | 880ms |
| Run · one direction | `run` | 340ms |
| Airborne ascent | `jump` | 560ms |
| Airborne descent | `fall` | 560ms |
| Petting | `love` | 560ms |
| Scruff grab | `struggle` | 600ms |

- Accepts PNG and WebP images with equally sized frames arranged in **a single horizontal row**. Limits are 4MiB per image, 24MiB per skin in total, and 16 megapixels, with a maximum width of 32768px and height of 4096px. The frame count must be an integer from 1 to 256 and must divide the image width evenly. A transparent background is recommended. Corrupt or fully transparent images are not saved, and an error is displayed.
- If walking has 10 frames, each frame is displayed for 88ms to play all frames. With 5 frames, each lasts 176ms, completing a cycle in the same 880ms. Walking and running retain their existing movement speeds of 48px/s and 115px/s, and the opposite direction is horizontally flipped.
- Falling loops forward over each full playback duration. The built-in Capybara's 8 frames play poses near 45, 44, 42.5, 41, 40, 41, 42.5, and 44 degrees over 560ms, maintaining tilt continuity from the last frame to the first. This applies equally to the actual pet and the Settings preview. The source atlas and generation/normalization information are stored in `public/mewcat/capybara/fall-source-atlas.png` and `fall-source.json`. Landing plays the existing final 240ms of descent or a separately registered landing transition once.
- Register separate airborne ascent and descent images. Ascent and descent play all frames in order during the first 560ms, and descent then repeats in the same order. Landing plays the latter frames of the descent image over 240ms. Images with 1 frame are also supported. Custom skins that stored only the previous five actions remain usable by supplementing them with separate 1-frame images made by tilting the first scruff-grab frame upward and downward. These can be replaced with dedicated images in Settings, and all seven actions are stored the next time edits are saved.
- Sprites are displayed within a 48px square while preserving their aspect ratio. Bottom transparent padding shared by all frames is compensated for at the ground position, and pointer input outside the artwork passes through to the background. The same selection applies to the giant resting Mewpet and the remote viewer. Basic action frames continue playing even with the system's reduced motion setting. Skin list cards are static, and action previews in the editor loop through all registered frames regardless of system settings.
- Images, frame counts, and names are saved in files under `DATA_DIR/mewpet/skins/<스킨 폴더>/`. The list is shared across all projects, workspaces, accounts, and devices on the same Mew instance, and P2P uses the same API. Selected IDs, sizes, and visibility preferences retain their existing browser scope. If saving fails, the input and previous skin are retained. Follows the [Browser Storage Contract](../../development/browser-storage.md).

`src/utils/mewcat-sprites.ts` owns the frame and playback cycle contract, `mewcat-sprite-storage.ts` owns image validation, the global API, legacy IndexedDB migration, and pointer alpha paths, and `mewcat-skin-settings.tsx` owns the registration and editing UI. State-specific frames advance within the existing physics and pointer handling in `Mewcat.tsx`.

`mewcat-sprite.tsx` loops editor previews with `playing` enabled and keeps list cards with it disabled on the first frame. For the actual pet, `Mewcat.tsx` uses `mewcat-sprite-render.ts` to update both the image's horizontal position and the corresponding frame's pointer path according to the action timing. `server/mewcat-animation-ui.test.ts` verifies Capybara's required and transition preview progression, actual displayed pixel changes during WebP walking, walking frames of the pet at the bottom of the screen while cards remain static, and reverse progression after the last frame during long falls and fall previews, on desktop and mobile with normal and reduced motion settings.

Built-in images are stored in `public/mewcat/capybara/`. The capybara's seven required actions each have 8 frames at 1024×128, and its nine optional transitions have 2 frames at 256×128; ascent and descent also have separate images. Generation records are preserved in `source.json` and `transitions-source.json`, and earlier records in each file's `previousSources`. `skin.json` owns IDs, translated names, order, images, and frame counts so that previews, actual rendering, and example downloads use the same skin. External Oreo Cat assets are not used.

On 2026-10-09, at the user's request, 238 image paths for Silhouette, Kitten, Russian Blue, Black Cat, Korean Shorthair, Siamese, and Penguin were removed from the history of all local Git refs. This includes required and transition strips and generation, redrawing, and reference atlases; past and current Capybara images are retained. The 437 deleted image objects were confirmed unreadable after reflog cleanup and GC. Generation metadata and historical documentation records are preserved, but their source and reference image paths can no longer be recovered from local Git. Existing hashes such as `d26c585`, `ee8790b`, and `previousSources.archivedAtCommit` are historical identifiers from before the rewrite and do not guarantee current local commit lookup. These materials document previous generation work and are not part of the current built-in offerings.

History cleanup excluded only image paths in a separate mirror, then applied the result to the existing `main` and local `origin/main`. The current HEAD tree, index, uncommitted and untracked files, and remote configuration are preserved. A separate search feature commit that remained only in the old reflog was preserved as `refs/mew/recovery/pre-image-cleanup-4ff49c8`. GitHub remote history was not changed; completing image removal from the remote requires a separate explicit push request.

On 2026-10-09, at the user's request, the built-in images, manifests, and generation records for Silhouette, Kitten, Russian Blue, and Korean Shorthair were removed to reorganize and rework the character lineup. Those assets were preserved in earlier Git commits at the time, but a follow-up history cleanup request that same day removed the images themselves from local Git. That cleanup retained Capybara's images and frame counts. Later that day, an explicit follow-up request led to creating five new characters in Capybara's art style and standardizing transitions for six built-in skins to 2 frames. This did not restore the previous glossy cat artwork or previous silhouette; do not reintroduce the previous art style without an explicit request. The registration, editing, and deletion contract for global user file-based skins is retained.

```bash
node --test src/utils/mewcat-sprites.test.ts src/utils/mewcatSkin.test.ts server/mewcat-skins-ui.test.ts server/mewcat-grab-ui.test.ts
```

Unit tests verify fixed cycles and full frame progression for 1, 2, 5, 8, 10, and 256 frames; separate ascent and descent; landing using the latter part of descent; image specifications; storage of Capybara and user skin IDs; and restoration of removed built-in selections. The Chromium fixture verifies previews, selection, and restoration of six built-in skins; Capybara as the default; per-action example downloads; the default transition input of 2 frames; removal of the previous default and fur color settings; and, in the actual Settings window on desktop and mobile, registration of seven images, rejection of corrupt images and invalid frame counts, previews, application, 10-frame walking, click-through in transparent areas, scruff grabbing, transition from ascent to descent after the apex, return to the ground, supplementation of legacy five-action skins, editing, deletion, global file storage, and preservation of browser selection scope. Actual production builds, deployment, and file selection on physical devices are steps for the user to apply.


### Initial Display and Asynchronous Loading

Immediately after a refresh, Mewpet stays hidden until the selected skin is ready. No fallback artwork, loading text, focus target, or pointer input area is displayed. New notifications still appear as toasts, and the fullscreen startup guide appears at the bottom of the screen without being attached to the pet. The None skin and screen visibility preferences are still honored. Once the actual images are ready, the pet appears at ground level and begins normal movement and interaction. Selecting the same action again does not interrupt the frame playback cycle.

After receiving the skin list, the configured ID is fetched first, followed by the default `capybara`. Images for each pet are fetched asynchronously, up to four at a time; each pet is published as soon as all its images are ready, then the next pet is fetched. Displaying the selected pet does not wait for other pets, previews, or legacy IndexedDB migration to finish. Already displayed artwork is retained while the rest loads, and the final list order is restored to the server's order. If replacing files for the selected ID fails, the previous working artwork remains in use. Another default pet is not briefly displayed while the selected ID is still loading.

The 96 required and transition images for the six built-in skins are served as lossless WebP at 1024×128 for required actions and 256×128 for transitions, with filenames in `skin.json` pointing to the corresponding `.webp` files. Original generated PNGs and prompts are preserved. The existing conversion used FFmpeg's `libwebp`, `lossless=1`, `quality=100`, and `compression_level=6`. The API, frame validation, example downloads, and user PNG/WebP upload rules are retained.

`server/mewpet-loading-ui.test.ts` delays list responses in desktop dark mode and mobile light mode to verify that Mewpet, fallback artwork, and loading text stay hidden while independent toasts appear and dismiss automatically. It also tests dragging after the selected pet appears, whether the selected pet appears first even when responses for four other pets are blocked, the limit of four concurrent image requests, final list order, and retention of previous artwork when replacement fails.

### Black Cat Jointed Skin

`mew-silhouette-cat-v2`, created at the user's request, is a separate global file-based skin that does not replace built-in skins. The editable rig, horizontal PNG strips, and playback preview in the same folder as the [Revised Motion Specification](../../../../assets/cat-motions-20261023/refined/manifest.json) are stored within the project. The 16 motions use 128px transparent cells, a shared ground level of 110px, and fixed joint lengths; screen direction is handled by flipping a single right-facing original in code. Stride lengths are 40.96px per walking cycle and 49.0666667px per running cycle.

Global file registration appears in the list without a build, but playback code changes that use cycle boundaries, a shared ground level, and stride lengths take effect after the user applies the code. The installation scale is set to 0.5 to match ground contact speed even at the existing executable's default 48px display size. The new executable also extends ground playback durations to match this scale, so the preview displays the effective playback duration as well. Select the active skin for the current browser in Settings → Mewpet; do not arbitrarily overwrite other skins or selection preferences.

### Registering Skins from Files

When creating sprites from character descriptions or reference images in agent chat, optionally connect a separately installed [External Generation MCP](../../../../docs/configuration/local-sprites.md). Generation tools, models, and Python dependencies are not included in Mew distributions. Set the tool's output path to the global folder below and add only results the user has requested to register; select skins in Settings.

Create a skin folder under `DATA_DIR/mewpet/skins/`, which is unique to each installation. The current installation uses the existing `.data/` as DATA_DIR; default locations and `MEW_DATA_DIR` for other installations follow the [Server State Contract](../../development/architecture.md#server-state-files-data). Do not store skins in the project's Documents or working folder.

On 2026-10-26, the body color of the current installation's user skin `black-capybara` (Black Capybara) was lightened slightly to dark gray. Its 16 motions, 74 frames, and action settings are retained, and previous image versions are also preserved in the skin folder.

On 2026-10-26, the mouth and nose were removed from all frames of the current installation's `dopey-black-cat` (Dopey Black Cat), leaving only two eyes, and a thin white outline was added around the body, ears, feet, and tail. Its 16 motions, 74 frames, and action settings are retained, and previous image versions are preserved.

Place PNG or WebP images for the seven actions and the following `skin.json` in the folder. `id` is an ID of 1–80 characters that starts with an English letter or digit and accepts English letters, digits, underscores, and hyphens. The legacy `custom:<id>` format is also supported. `name` is 1–40 characters long, and `frames` is the actual frame count for each image. File paths must be relative to the skin folder.

```json
{
  "id": "my-pet",
  "name": "내 동물",
  "sprites": {
    "idle": { "file": "idle.png", "frames": 8 },
    "walk": { "file": "walk.png", "frames": 8 },
    "run": { "file": "run.png", "frames": 8 },
    "jump": { "file": "jump.png", "frames": 8 },
    "fall": { "file": "fall.png", "frames": 8 },
    "love": { "file": "love.png", "frames": 8 },
    "struggle": { "file": "struggle.png", "frames": 8 }
  }
}
```

Add optional transition motions to the same `sprites` object. Built-in and global folders are read on every list request, and a global skin with the same ID overrides the built-in skin. Invalid folders, duplicate IDs, symbolic links, and paths outside the folder are not registered and are reported as partial loading errors. After adding all files, save `skin.json` last. API uploads write all images for the new version first, then atomically replace the manifest to preserve the previous working skin. Previous image versions are retained until the skin is deleted and can be used for file recovery.

The list is reread when Settings opens, the Refresh button is clicked, window focus returns, and every 30 seconds while the window is active. If files for the selected ID change, the artwork updates as well. Subsequent skin additions and replacements require no app build or server restart. The user applies the initial code update introducing this storage feature according to the existing execution rules.

Custom skins remaining in the legacy scoped IndexedDB `mewcat-sprite-skins` are migrated to global files when the owner opens them. Ascent and descent are supplemented for skins that lacked seven actions, and only successfully migrated items are marked as migrated. Original Blobs are preserved. If migration fails or the account is not the owner, existing local skins continue to appear with a migration notice. Deleting a skin that has already been migrated does not resurrect it from the old browser copy. `mewcat` in existing code filenames, storage keys, and MCP identifiers is retained for compatibility.

`server/mewpet-skins.ts` owns file listing, validation, and atomic saving; `server/mewpet-skin-routes.ts` owns the project-independent `/api/mewpet/skins` and the owner-only write boundary. List and image responses use `private, no-store`, and new artwork is not looked up in build artifacts.

### Task, Error, and Resource Notifications

Task completion, error, approval, server resource, and update notifications appear at the bottom of the screen through the shared `Toast`. The title and source appear on one line, with long content truncated with an ellipsis. Toasts disappear after 2.6 seconds; if a new notification arrives during that time, it replaces the current one and restarts the timer. They do not move focus or intercept pointer input or back navigation, and provide polite status announcements to screen readers. They appear the same way while skins are loading.

Toast dismissal does not mark a notification as read. Unread items remain in the header's bell button and the Mewpet click list, where users can navigate to the corresponding conversation, system resources, or update screen, or mark individual items as read. If the target agent tab is already closed, it is not recreated. Approval requests remain in the list even after navigation until they are processed or the user marks them as read. A new approval request closes the open Mewpet helper or recent list and appears as a toast before the fullscreen startup guide. The startup guide is restored after the request is processed.

Mewpet stops at its current position when there are unread notifications with additional notification display enabled or when the click list is open. It resumes roaming once all notifications are marked as read. For a new notification, the artwork plays a single 420ms animation that tilts 3 degrees and returns; this is skipped with reduced motion. Dragging and throwing remain available. With the None skin, toasts are not displayed; notifications can be checked using the top bell button.

The manually opened recent list, helper, and fullscreen startup guide retain their existing speech bubble positions and themes. The body and tail use the `drop-shadow(0 4px 10px rgb(0 0 0 / 24%))` shadow. The cat artwork retains its colors, and styles that fixed the speech bubble to cream and brown must not be reintroduced.

- **Task complete**: When `meta` is received after a live `turn_end(end_turn)` indicating that the pending queue is empty and execution has stopped. Intermediate turns in the queue,
  user cancellations, playback of past records, and history restoration do not send completion notifications.
- **Errors and approvals**: Reports agent errors, authentication failures, failed exits, approval requests, and abnormal interruptions such as token limits. The error/turn_end
  events for the same failure trigger only one notification, and the corresponding notification is removed once approval processing is complete.
- **Disconnection**: Does not send Mewpet speech bubble, list, sound, or desktop notifications. Repetitive disconnection notifications were removed at the user's request and must not be reintroduced unless requested. Disconnection is indicated only by a translucent dark overlay and loading indicator within the affected agent panel ([Panel Connection Indicator](../terminals-agents-automation/agent-conversations-queue-and-restoration.md#waiting-for-connection-and-reconnecting)).
- **Updates**: When an account with system permission accesses the app, relevant installed items are checked, and available updates are reported with a count and representative items. **View Updates** opens the unified update screen. A failed check is not reported as up to date. Detailed targets and execution restrictions follow [Unified Updates](../../../../docs/deployment/native.md#unified-updates-for-installed-dependencies-and-agents).
- **Overload**: Only accounts with system resource permissions monitor the **server machine** through the existing `/api/system-stats`. This does not monitor the
  memory or JS heap of the PC running the browser. Queries run without overlap at 15-second intervals after each request completes, with
  a 10-second timeout. A notification is sent after 3 consecutive high readings and is not repeated until normal levels are restored.
  Query failures and unknown values do not count as high samples.

| Resource | Notification threshold | Recovery threshold for allowing another notification |
| --- | --- | --- |
| CPU utilization | At least 90% | Below 75% |
| Memory (`total - available`) | At least 90% | Below 80% |
| GPU memory (highest utilization among GPUs) | At least 95% | Below 85% |
| Highest CPU or GPU temperature | At least 90°C | Below 80°C |

These thresholds are general caution notification criteria, not assessments of hardware-specific safety limits or forced task termination. Up to the
latest 30 notifications are retained in the current page's memory and cleared on refresh or a change of logged-in account. Events
with the same identifier are suppressed from being sent again for 30 seconds, even after acknowledgment. Notifications are not consolidated
or deduplicated across multiple mew browser tabs.

### Notification Settings and PC Desktop Notifications

**Settings → Notifications** has **Open agent tab on approval request** at the top, enabled by default. When a new live approval request arrives, it brings the corresponding project and agent tab to the foreground, even while you are doing other work. Automatic navigation is independent of the in-app and Mewpet notification display settings; disabling only this option keeps the current screen while allowing other notifications to continue. Duplicate events for the same request and replayed past conversations do not trigger repeated navigation. If existing saved preferences lack `autoOpenApproval`, it is read as enabled. Detailed navigation and bubble expansion follow the [Agent approval waiting contract](../terminals-agents-automation/agent-conversations-queue-and-restoration.md#awaiting-approval-status).

In-app notifications, desktop notifications, sound, and server resource monitoring can each be toggled
independently. In-app notifications and resource monitoring are on by default; desktop notifications and sound are off by default. When a Mewpet skin is active, **Toast notifications** is an additional setting and is on
by default. Settings are stored in this browser's `mew:notification-preferences`; if storage is unavailable, they apply only to the current page. The **None** skin hides the
cat and toasts while retaining collection and delivery for header notifications, OS notifications, and sound. The header bell appears only when in-app notifications (`visual`) are enabled and the queue contains items. Existing stored values are inherited unchanged; if the additional `mewcat` field is absent, it is read as enabled by default. Turning off in-app notifications does not delete the queue, so it can be viewed when they are turned back on.

1. Click **Allow desktop notifications** to grant browser permission. This also enables the desktop option.
2. Enable **Notification sound** if needed. Enabling it plays a preview and activates browser audio.
3. Click **Send test notification**, then switch to another PC window within 3 seconds to verify it.

OS notifications are delivered through the Web Notifications API when the page is hidden or the window lacks focus. On Windows, they appear
as Windows notifications from supported browsers; clicking one focuses mew and opens the corresponding screen. Notification permission
is requested only when the user presses a button in a supported browser on HTTPS or localhost. Blocked and unsupported states are explained in
Settings. OS notifications show only the task type and do not include project names, conversations, or original error text. The system
default sound is disabled in favor of mew's sound setting; mew sound applies in both the foreground and background, and consecutive
notifications within 3 seconds sound only once. After a refresh, sound may require a click or keypress on the page before it can
resume. OS Do Not Disturb, browser muting, and power-saving policies may prevent delivery or sound playback.

#### Supported Features

Monitors live events from **ACP chat tabs that have been opened and connected at least once** in the current project. Notifications continue while
the connection remains alive, even if the agent panel is collapsed or the user switches to another agent tab or PC window. It does not monitor
previous projects disconnected by switching root projects, terminal-only agents, standalone shells, or cron jobs. It provides neither push notifications
nor a persistent notification inbox for events that occur while the browser tab is closed, suspended, or disconnected from the
network. This does not change the task survival contract of the server supervisor process; global server notifications may be added separately later.

When a task completes, no completion notification is created if the browser document is visible, the window has focus, and the current work panel and selected agent tab are the tab that completed. In split view, this applies only to the selected tab in the focused agent group. If the panel is closed or you are viewing another tab, panel, or browser window, existing completion notifications are retained. Suppressed completions are not announced later when you leave the tab; error, approval request, and abnormal interruption notifications are still provided.

#### Implementation and verification

`src/utils/mewcat-notification-rules.ts` handles agent and resource decisions, `src/utils/mewcat-notifications.ts` handles a single page's queue, settings, and sound, and `src/hooks/use-mewcat-notifications.ts` handles
resource queries and OS delivery. `AgentPanel.tsx` connects only live events, while `src/components/mewcat-notifications.tsx` handles the UI and
settings. `src/components/header-notifications.tsx` displays the same queue independently of Mewpet and shares its danger-warning-completion
priority and newest-first sorting. The list closes with Esc, Back, or Close, and the bell is cleared when navigating to the corresponding screen or acknowledging the last item. Register the four-language copy from `mewcat-notification-copy.ts` in `i18n.tsx` under `mewcat.*` keys; clicks, automatic speech bubbles, settings, and OS notifications all use the shared `t()`.

```bash
node --test src/utils/mewcat-notifications.test.ts src/components/mewcat-notifications.test.ts server/header-notifications-ui.test.ts server/mewcat-ui.test.ts
node --test server/mewcat-grab-ui.test.ts
npx tsc -b
npm run lint
```

`server/mewcat-ui.test.ts` is checked using the Node TypeScript configuration. When calling browser fixtures in Playwright callbacks, narrow `globalThis` to an explicit fixture type; do not add DOM global types to server checks.

Tests check queue completion, cancellation, error deduplication, overload recovery, permission/disabled conditions, settings, list interactions,
Chromium desktop/mobile layouts in light and dark themes, and resumption of movement after acknowledgment. They also switch the open empty list, all notification types, and automatic speech bubbles among four languages to check immediate updates and preservation of user provenance. Tests of the click-opened list also cover entry by click, touch, and keyboard; newest-first ordering, per-item deletion, and the empty state; the top C/R/G gauges' small size, equal width, rounded corners, centered labels, bottom-up fill, theme colors, numeric values in tooltips and accessibility descriptions, and 0.5-second refresh; clearing when GPU information is unavailable or queries fail; integration with the existing resource popup; continued header queries after closing the Mewpet list; and stopping queries
when permission is revoked. Actual Windows Notification Center behavior, OS Do Not Disturb, and speaker output are
checked on supported PCs using the test notifications above. `mewcat-grab-ui.test.ts` throws a normal-sized cat in Chromium with time frozen and repeatedly catches it using mouse and real
touch input, checking coordinates at the moment of pressing and while held still, as well as the grab offset after movement. It also checks whether
the capybara faces the direction of flight from the moment of release when thrown left or right with mouse or touch in normal and remote portals, and whether releasing it after a long hold makes it fall facing its previous direction with no horizontal momentum.
It also checks clicks/touches on background buttons outside the cat or in transparent areas during a fall, along with catching it again
by its artwork. In a 390px mobile viewport with real touch input, it resumes time, throws the cat quickly, and checks the regression condition that
the first background tap immediately activates the button while the cat is airborne.


### Forced breaks — disabled by default

In **Settings → Mewpet → Rest with Mewpet**, select **Enable enforced breaks**, set the usage and break durations using their respective **Hours /
Minutes** inputs, and press **Save break settings**. The defaults are **Off**, usage of **0 hours 50 minutes**, and a break of **0
hours 10 minutes**. Each duration ranges from 1 minute to 23 hours 59 minutes; hours and minutes accept only integers from 0 to 23 and 0 to
59, respectively. If the two inputs total 0, the settings are not saved and a message is shown. These default durations are product defaults
and do not represent medically recommended intervals.

Usage time accumulates **while this mew browser tab is visible and focused**. This includes time spent reading without moving
the mouse. Accumulation pauses when switching to another tab or window and resumes upon return. It does not detect actual
gaze or whether the user is away, and requests no camera, eye-tracking, or PC-wide usage-time permissions. Timer gaps exceeding
5 seconds due to sleep or tab suspension do not count as evidence of usage.

When the specified usage duration is reached, **the existing SVG Mewpet itself expands to a giant size over the work screen**. There
is no full-screen background or dimming. The SVG width is the smaller of 118% of the viewport width and 108% of its height. The large cat walks
or runs left and right along the floor and pauses briefly, just as usual. Up to 18% of its body width can extend beyond either
screen edge so it can move back and forth even on narrow screens. The large cat obscures work content to encourage a break, while the original
work screen remains visible around it. Only the remaining time appears at the bottom in minutes:seconds (hours:minutes:seconds for 1 hour or more);
when the break ends, it returns to its normal size and display settings. The break guidance text was removed at the user's request and
must not be added back to the current mode.

- Only the actually drawn SVG body intercepts pointer input. It does not block the entire rectangular area; the underlying screen can be
  clicked between the ears, in transparent areas outside the artwork, and behind the timer. Keyboard input, shortcuts, and existing focus are retained.
- The large cat can also be grabbed with a mouse or touch and dragged in any direction. It preserves the grab position and stops moving or falling
  while held. Dragging quickly and releasing throws it; releasing after holding it still, or canceling pointer input, makes it
  fall in place. Wall bounces, gravity, catching it again in midair, and resuming movement after landing use the same behavior as the normal cat.
- It appears above panels and portals in the top layer of a manual popover, but does not use a modal dialog, inert, focus movement, or an overlay
  back-navigation guard. Esc does not close the large cat, and the app's original Esc behavior is retained. The per-second
  countdown is not announced by screen readers on every update.
- The opaque full-screen view and app-wide input lock were removed because they differed from the user's request for **obstruction by the artwork itself**.
  They must not be reintroduced into the current break mode. A separate behavior that locks the entire screen requires a new explicit request.
- Breaks progress in real elapsed time even when the window is inactive or the user does something else. When a break ends, accumulated
  usage is cleared to 0 and the next cycle begins. Background time during usage only pauses accumulation; it does not reset it.
- This is independent of the **None** skin or disabling speech bubble notifications. If enforced breaks are enabled, the large Mewpet appears during
  breaks. The small cat and speech bubbles are hidden during breaks, while running agents, autosave, and notification collection continue.
- Korean, English, Japanese, Chinese, and light/dark themes are supported. Reduced-motion settings disable the entrance enlargement animation.

Settings are stored in `mew:break-preferences` in browser localStorage, while accumulated usage in progress and the break end time are stored in `mew:break-progress`
in per-tab sessionStorage. **Refreshing or switching projects does not reset a break in progress.** Saving actual
changes to the settings starts a new cycle. Settings also apply to other tabs on the same site, but accumulated
usage is per tab; there is no account/device synchronization or unified timer spanning new tabs or browser
restarts. If storage access is restricted, it operates only in the current page's memory.

Implementation ownership is divided among `src/utils/mewcat-break-rules.ts` for state transitions and restoration, `src/utils/mewcat-break-preferences.ts` for preferences,
`src/hooks/use-mewcat-break.ts` for focus and timers, and `src/components/mewcat-break.tsx` for settings and the giant Mewpet display. Movement, grabbing,
and throwing for normal and giant Mewpets use the same interaction implementation
in `src/components/Mewcat.tsx`.

```bash
node --test src/utils/mewcat-break-rules.test.ts server/mewcat-break-ui.test.ts
```

Unit tests verify the default off state, duration validation, accumulation only during active time, exclusion of sleep time, break completion, setting
changes, and restoration from storage. An independent browser fixture in actual Chromium verifies initial inactivity, saving settings, pausing in the background, displaying only the timer, giant Mewpet movement/dragging/releasing/catching in midair, click interception by the artwork, click-through
in transparent areas, preservation of keyboard input/focus, refresh, automatic return, and desktop/mobile light and dark themes. Do not build or restart
the running mew instance.


### Mew assistant

Questions and answers below recent notifications, agent connections, and automatic MCP operations follow the [Mewpet assistant contract](mewpet-assistant-conversations-and-controls.md). This document continues to own existing notification, resource, and break behavior.

<!-- mew:implementation:start -->
## Implementation details

- `HeaderNotifications` to the left of active sessions in the header displays the unacknowledged queue regardless of whether a skin is present. A Notifications tab was added to settings, and existing notification settings were moved there. The optional `mewcat` channel controls only the cat's automatic bubbles and attention behaviors; it does not change the header, OS delivery, or sound. Acknowledgment of the same queue is shared across all displays.

- Automatic notification bodies, including updates, display their full content without a height limit or internal scrolling. If space around the cat is insufficient, the bubble position is adjusted to remain within the screen. Scrolling in the expanded notification list is retained.

- Mewpet and speech bubbles displayed in remote desktop are portaled into a host inside the viewer, so background `inert` does not affect them. Mewpet handles clicks, dragging, and keyboard interactions without forwarding them as remote input.

- Enabling **Hide Mewpet in remote desktop** under Settings → Mewpet hides the cat, speech bubbles, and break display while the remote viewer is open and restores them when it closes. It is off by default and saved per browser in `mew:mewcat-hide-desktop`. Notification collection, OS notifications, and break timers continue running.

- Previously, a silhouette with only a black body and white eyes became the default, and the default SVG and fur-color settings were removed. Following the final follow-up request on 2026-10-09, only the capybara remains as a built-in skin; Russian Blue, black cat, Korean Shorthair, Siamese, and penguin were removed. Selections of removed built-in skins are restored as the capybara. Previews, the large break Mewpet, and remote viewers use the same sprite.
- Disconnection notifications were removed at the user's request to reduce repeated interruptions and will not be reintroduced unless requested.
- They are replaced by a waiting-for-connection indicator inside the corresponding agent panel.

- On mobile and in full-screen mode, its feet remain at the very bottom of the screen, overlapping the bottom dock. Changes to dock height or visibility do not affect the floor position.
- Default browser gestures for touches that start on Mewpet are canceled, allowing other elements to respond to the first tap immediately after a throw.

- The automatic bubble width was reduced to 300px, and horizontal padding in the body and list was standardized to 12px.
- The body and source are grouped with 2px between them, and nested padding and negative margins are removed. Recent notifications and the expanded list share row spacing and alignment; the header uses 8px of vertical padding, and notification rows and empty states use 12px.
- Touch button sizes are retained.
- Automatic notifications compensate for empty space inside buttons to set padding on all four sides to the minimum 12px measured from the actual content edges, and align the starting edges of the title, source, and navigation button.
- Open conversation and Open system resources appear as small text and arrows without a background. Desktop height is reduced to 28px, while the mobile touch target remains 44px. Notification count, expand, and close are distinguished as secondary controls on the right.
- Status and close icons are set to 16px, and row bodies and close buttons are vertically centered. Automatic notifications have 8px between the body and control row.
- Detailed spacing and touch sizes follow the linked specification.

- Bubbles, notification settings, and OS notifications were connected through a shared translation function; memory labels and Mewpet accessibility names were also localized.
- Clicking the normal Mewpet displays a small recent-notification list in newest-first order; each item can be deleted with its ×.
- CPU, RAM, and GPU appear side by side as small, rounded C/R/G vertical gauges inside a 36×36px button in the topmost bar, with centered labels and bottom-up fill in the theme's primary color. Values are provided in tooltips and accessibility descriptions, refreshed every 0.5 seconds only when permission is granted; clicking opens the existing system resource popup.
- Header resource queries remain active even when the Mewpet list is closed and are cleaned up when permission is revoked, the account changes, or the header is unmounted.
- Connected priority bubbles, a list of 30 notifications, and navigation to existing SVG interactions.
- Uses real-time ACP events and authorized server resource queries, and provides settings, OS notifications, synthesized notification sounds, and a test button.
- Resource and notification bubbles appear at the cat's current position. Near screen edges, the bubble body is repositioned and its tail moves to point at the cat.
- Clicks and notifications do not teleport the cat to the right.
- The bubble body, tail, text, and buttons follow the app's light and dark themes, and the cat nods once for each new notification.
- Added tracking of the tab's active usage time, a break timer that persists across refreshes, and a giant Mewpet with a transparent background.
- During breaks, only the timer is displayed, and the large cat uses the same movement, dragging, and throwing behaviors.
- Off by default; enable it by setting and saving the time.
- Detailed conditions and limitations follow the linked specification.

- When users access the app, it provides update notifications for relevant installed items and links to the unified update screen ([update contract](../../../../docs/deployment/native.md#unified-updates-for-installed-dependencies-and-agents)).

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- 2026-10-26: Reduced the descending display to 83% and aligned the SVG display area, hit detection, and frame clipping. Reviewed Chromium comparison views of ascent, the previous descent, and the adjusted descent; 3 browser tests for animation, skin settings, and recatching passed, along with type checking. Targeted lint left only existing React warnings, and the description check passed. The full document link check failed due to 17 missing targets outside this work's scope. No app build or server restart was performed.

- 2026-10-26: 1 installation manifest/PNG check and 14 new installation guidance UI checks passed. `tsc -b` and document checks passed, and lint left only existing warnings. Actual Android/iOS installation and back navigation/fullscreen in installed mode are unverified. No host app build, server restart, or central Mewlink deployment was performed.

- 2026-10-02: Confirmed that the entire update notification body is displayed without internal scrolling and that navigation to the update screen works on PC and mobile in both themes. Notification UI regression tests, targeted lint, and document link checks passed. Additional helper UI checks failed because an existing conversation bubble obscured the agent selection menu. No build or server restart was performed.

- Automatically checks notification decisions, settings, browser delivery conditions, and 2 themes on Chromium desktop/mobile (using the verification commands in the specification).
- Actual Windows notifications and voice output are checked using the test button on the user's PC.
- Unit and real-browser tests check enforced breaks for defaults, hour/minute input, pausing while inactive, timer-only display, giant Mewpet movement/dragging/releasing/catching in midair, pointer interception by the artwork, pass-through in transparent areas, keyboard preservation, restoration after refresh, and break completion.
- Existing interaction verification criteria: Check that clicking, dragging, throwing, screen boundaries, and hide settings work on desktop and touch devices.
- `server/mewcat-size-ui.test.ts` checks keyboard/touch adjustment of the normal size on PC dark and mobile light themes, immediate updates, floor and visual viewport boundaries, preservation of the held state, skin changes, the remote viewer, refresh, synchronization across windows in the same scope, isolation across different scopes, invalid saved values, save failures, language switching, and reset. `server/mewcat-break-ui.test.ts` checks that the size and position of a held giant Mewpet remain unchanged when the normal size changes from 144px to 24px.
- In the mobile settings dialog, the same size UI tests check that Mewpet and bubbles are actually in front for pointer interaction, dragging and resizing while held with settings kept open, closing bubbles first, and returning to the work area. They also check transitions between widths of 320px, 390px, and 844px and the remote viewer's background `inert` state. PC settings dialog layering, skin registration UI regression tests, type checking, targeted lint, and document checks passed. No app build or restart was performed.

- Checks that switching among the four languages immediately updates empty states, all notification text, accessible names, and memory displays while preserving user-provided source information.

- Checks that the current position is retained after clicks and notifications, and checks bubble boundaries and tail alignment at left, center, and right positions on desktop and mobile in both themes.

- Chromium regression tests check that, when a normal-size cat is thrown and repeatedly caught again with mouse or touch, its position is retained at the moment of pressing and while the cursor is stationary, and that it follows at the same offset when movement resumes.
- Also checks that, during a fall, input outside the cat and in transparent parts of the artwork passes through to background buttons, and that the cat is caught again only when the actual artwork is pressed.
- Also confirms that, after a fast throw on mobile without pausing animation time, the click from the first background tap passes through.

- 2026-09-26: 11 notification-related tests passed. Confirmed task completion notifications, wrapping of long source text, navigation buttons in four languages, 44px touch targets, and actual navigation to conversations on Chromium desktop and mobile in both themes. Type checking and document boundary/link checks also passed.


- 2026-10-08: Applied the Mewpet name and global file-based skin storage. On an isolated server, checked project-independent listing, file addition/replacement, built-in skin overwrite/restoration, owner writes, and preservation of previous valid files on invalid uploads and manifest write failures. On PC/mobile Chromium, confirmed PNG/WebP uploads, migration of browser skins for the existing five actions, preservation of selection preferences, direct file registration/replacement, and image requests, edits, and deletions over remote transport. Also checked regressions in settings size, breaks, notifications, fullscreen guidance, dragging, and the helper. The running app was not built or restarted.
- 2026-10-09: Kept only the capybara as a built-in skin and aligned defaults, examples, restoration after deletion, and restoration of removed cat selections. 20 related tests covering units, file storage, PC/mobile settings, size, dragging, transitions, and asynchronous loading passed, along with type checking, targeted lint, and document checks. Capybara images were retained; no app build or server restart was performed.
- 2026-10-09: In response to a follow-up request, added Russian Blue, black cat, Korean Shorthair, Siamese, and penguin skins in a simple doodle style and redrew transitions for all six skins, including the capybara, with 2 frames each. Verified 96 PNG/WebP pairs and the actual dimensions of 444 frames, 8/2 frame counts, no empty frames, differences between the two transition poses, transparent margins, no clipping at cell boundaries, matching alpha, and generation source and reference paths. 20 related tests covering units, global file storage, PC/mobile settings, size, catching/throwing, transitions, and asynchronous loading passed, along with type checking, targeted lint, and description checks. Also reviewed PC dark and mobile light screens with all six cards loaded; no app build or server restart was performed.
- 2026-10-09: Used an isolated Chromium debugger to reproduce an issue under the system reduced-motion setting where the walking position changed but the actual pet and motion previews remained fixed at frame 0. Removed this frame lock from basic frame playback and editor previews while retaining reduced-motion handling for automatic jumps, selection transitions, and notification shakes. 9 animation, settings, transition UI, and frame unit tests passed, including the regression that failed before the fix, along with type checking, targeted lint, and description checks. On PC and mobile under both motion settings, confirmed progression of previews for 16 motions across six skins, changes in actual displayed pixels for WebP walking, walking of the pet at the bottom of the screen, and cards remaining static. No app build or server restart was performed.
- 2026-10-09: Redrew 296 frames for the four cat breeds with cute, sleek bodies and distinct eyes, and adjusted the common scale across all transitions. Verified 96 PNG/WebP pairs across six skins, 8/2 specifications for 444 frames, no empty frames, differences between the two transition poses, transparent margins, no boundary clipping, matching alpha, and actual source and reference paths. Also confirmed preservation of the four cats' manifests and all prior generation records, preservation of visible RGB including Siamese transparency, and retention of capybara/penguin assets. An isolated Chromium debugger confirmed that the existing fixed grab coordinates pressed the background outside the slimmer bodies, so regression checks were adjusted to select points inside the actual artwork. 10 related file storage, settings, animation, transition, and catching/throwing tests passed, along with type checking and targeted lint. Motion playback was verified on PC and mobile under both motion settings; catching/throwing was verified for all six skins on regular and remote hosts with mouse and touch. No app build or server restart was performed.
- 2026-10-09: In response to the final follow-up request, removed 189 image, manifest, and generation record files for Russian Blue, black cat, Korean Shorthair, Siamese, and penguin, leaving only the capybara as a built-in skin. 13 tests passed covering fallback for selections of the eight removed built-in IDs, preservation of user file skins and the None selection, file storage, settings, animation, transitions, and catching/throwing, along with type checking and targeted lint. Confirmed in PC/mobile settings that the removed cards were absent and existing black cat/penguin selections reverted to capybara. Also confirmed that all capybara assets were unchanged and that 8/2 frame counts were retained for 16 motions; no app build or server restart was performed.
- 2026-10-09: Cleaned up local Git history for images of seven deleted skins. Confirmed that 238 image paths were absent across all refs and that 437 image objects could not be read with `git cat-file`. Confirmed no changes to the HEAD tree, index, SHA-256 hashes of 1,418 existing working files, or remote configuration, and that `git fsck --full` passed. The total size of Git object files decreased from 79.59MiB to 13.16MiB; no push, app build, or server restart was performed.
- 2026-10-09: Fixed the angle jump from the last frame to the first by playing the falling strip back and forth in forward and reverse order. Retained the existing 8 frames, 70ms per frame, and image files. 9 tests passed, including frame unit tests, long falls on PC/mobile with normal and reduced motion, falling previews, and existing landing transitions, along with type checking, targeted lint, and description checks. No app build or server restart was performed.
- 2026-10-10: Added per-skin motion duration, movement multiplier, and selection enablement. 20 related tests passed, including disabling the three required motions, rejecting invalid values, preserving previous valid files, omitting optional images, server reloading, saving/restoring PC/mobile settings, actual 1.6-second walking with 2× movement, and exclusion of automatic jumps, along with type checking, targeted lint, and document checks. Reviewed editor screens on PC dark and mobile light themes and adjusted the two-line name/input layout on mobile. No app build or server restart was performed.
- 2026-10-10: A regression test reproduced an error where editing a built-in skin sent 16 images plus a manifest, reaching the multipart parts limit and being rejected with `SKIN_FILE_LIMIT`. Changed the parts limit to an inclusive 18 and distinguished file size/count errors from format errors. 8 file/API and PC/mobile settings tests passed, along with type checking, targeted lint, description checks, and document checks. Also confirmed rejection of uploads over 4MB and extra fields, and preservation of previous valid files. No app build or server restart was performed.
- 2026-10-23: Created a black cat user skin with 16 motions using a fixed-joint rig. Across 2,001 pose checks per motion, checked joint lengths, torso spacing, ground contact, reachable ranges, loop speed, and matching transition endpoints, and reviewed margins in rendered 128px frames and connected previews on PC/mobile. Regression checks covered cycle-boundary transitions, target frame 0, a common floor, stride lengths by display size and multiplier, apex timing for short throws, and stride preservation after settings edits. Generation and review records are stored in `assets/cat-motions-20261023/refined/`. Skin file registration, selection in the user's browser, and building/restarting the server for playback code are separate steps; the agent did not build or restart the running server.
<!-- mew:validation:end -->

Built-in skin verification criteria: On PC/mobile, check that only capybara appears as a built-in skin and that defaults, previews, selection restoration, fallback to capybara for eight removed built-in selections, removal of previous default and fur-color settings, and example downloads for seven actions work. Frame count, storage, and interaction checks follow the skin selection contract above.

- 2026-10-14: Displayed approval requests with an orange circle and a dedicated navigation button, and added automatic tab switching enabled by default with a setting to disable it. On PC/mobile in both themes, confirmed that approval notifications take priority over open resource popups and fullscreen guidance, persist after navigation, disappear after a response, and that settings are saved. 35 related tests passed, along with frontend type checking, targeted lint, and document checks. Full type checking failed due to server platform and memory module errors outside this work's scope; no app build or server restart was performed.
