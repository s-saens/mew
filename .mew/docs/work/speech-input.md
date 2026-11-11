---
title: "Speech input implementation"
description: "Records the implemented user-selected speech adapters, managed runtime setup, reviewed editor/agent insertion, and local verification. Separates existing regression/link failures and pending native/real-engine/device checks from runtime application."
created: "2026-11-11"
updated: "2026-11-11"
---

# Speech input implementation

## Purpose and design

On November 11, 2026, the user authorized designing, documenting, and implementing speech input through user-installed or externally configured engines. The design avoids bundled model weights and shares one final-transcription boundary between document editors and the agent composer.

The accepted [decision](../decisions/0166-external-speech-engines.md) records alternatives and rationale. The [development contract](../development/speech-input.md) owns behavior and implementation boundaries; the [configuration guide](../../../docs/configuration/speech-input.md) owns user instructions. The earlier engine investigation remains evidence and does not establish benchmark results or an engine-quality ranking.

The first version implements OpenAI-compatible and whisper.cpp HTTP adapters, a fixed managed faster-whisper installation in a private Python environment, per-account settings, explicit model-download consent, temporary browser-recorded WAV audio, an editable final transcript, and explicit insertion into a still-valid target. It separates recording from the editor's existing persistent audio-attachment feature.

## Implementation status

The design is recorded in the ADR. The resulting source includes engine adapters and settings, owner-only runtime installation, model license/source links, recording destination/revision checks, bounded audio/inference, managed temporary-file cleanup, and captured editor/composer insertion targets. Account deletion and merge-source revocation remove the saved speech credential without copying it into the destination identity. Mewlink and native direct transports allow the bounded transcription wait without changing ordinary request deadlines or cancellation.

The implementation does not establish a successful real model download, physical microphone operation, measured transcription quality/speed, native iOS compilation, or deployment result.

## Verification

The final focused suite passed all 50 tests:

```bash
node --test server/speech.test.ts server/speech-process.test.ts \
  server/speech-account-lifecycle.test.ts \
  packages/editor/src/editor/textInsertion.test.ts \
  src/utils/code-text-insertion.test.ts src/utils/draft-text-insertion.test.ts \
  src/utils/remote-speech-timeout.test.ts src/runtime/native-runtime.test.ts \
  src/speech/audio.test.ts src/speech/labels.test.ts \
  src/speech/SpeechInputButton.test.ts src/speech/SpeechInputButton.browser.test.ts \
  packages/ui/src/i18n.test.ts
```

Coverage includes adapter requests and automatic whisper.cpp language, settings and audio validation, account deletion/merge-source credential cleanup, literal editor/composer insertion and undo, stale-target rejection, recording/review/cancellation, labels, and remote/native deadlines. Process tests use mock children and clocks: cancellation, timeout, and output overflow request process-group termination, escalate after two seconds, and retain temporary audio and the concurrency slot until child close. Chromium checks use mocked audio and APIs. They establish no real-engine or physical-microphone result.

- `npm run build` passed after final integration; Vite completed in 2.22 seconds and reported chunk-size warnings. The build's TypeScript stage also passed.
- `npm run lint` completed with existing warnings and no new speech or transport warnings.
- `npm run check:docs` read 798 descriptions with no metadata errors, then failed on 39 existing repository links, including missing documentation/decision entrypoints and a task's absolute asset link. New speech links were valid. A direct check of the changed documents found only the existing `docs/guides/terminal-agents.md` parent link to `.mew/docs/MOC.md`.
- `git diff --check` passed for the changed documentation.

The existing voice-recording, agent attachment, and composer clipboard regression run passed 59 checks and failed one existing voice-recording insertion-order assertion. The same assertion failed against the unmodified editor baseline in an isolated temporary fixture, which was removed after comparison. The broad `src/ui-localization.test.ts` literal scan also failed on existing global entries; its rerun included no new speech labels or timeout-helper entries. Focused speech/shared-locale tests passed. This implementation does not claim to fix those prior behaviors or entries.

## Remaining acceptance

Real-model accuracy and speed, actual clean-host runtime installation, model acquisition, physical desktop/mobile microphone behavior, and real Mewlink audio transport remain separate acceptance gates. No model or runtime was installed for these checks. The iOS URLSession timeout change has four added Swift deadline-policy assertions, but `xcodebuild` is unavailable in this Linux environment, so native compilation and XCTest were not run. It additionally needs macOS/Xcode verification, a separate native build/app update, and physical-device acceptance.

Agents must not deploy, run the launcher, or start, stop, or restart application servers in this repository. Local verification does not apply server changes to an already-running instance; the user owns that operation.
