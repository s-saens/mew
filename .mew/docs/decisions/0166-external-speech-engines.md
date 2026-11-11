---
title: "0166 — External speech engines through adapters"
description: "Accepts user-selected external speech engines behind a final-transcription adapter, optional managed faster-whisper installation, separate model consent, and reviewed insertion. Records alternatives, host authority, and license boundaries."
created: "2026-11-11"
updated: "2026-11-11"
status: "accepted"
---

## Status

Accepted for implementation. The [work record](../work/speech-input.md) owns actual implementation and verification status. This decision authorizes no deployment or application server lifecycle operation.

## Context

Mew needs speech-to-text input in document editors and the agent composer. Engine choice varies with language, device resources, latency, privacy, cost, and license. A model bundled with Mew would couple application distribution and updates to large artifacts and would make a single model's conditions part of every installation.

The existing editor voice-recording feature stores playable audio. Speech input instead needs temporary audio, a final text result, and a safe insertion target. Remote use adds a device boundary: the microphone belongs to the connecting browser, while a user-installed engine may run on the Mew host.

The user requested an adapter/runtime arrangement and an installation UI similar to agent runtimes, allowing users to install or connect their own preferred engine. Existing agent protocols do not define this speech operation. License conditions also remain applicable when a user downloads a third-party runtime or model separately.

## Decision

Keep model weights out of Mew's application distribution. Define one internal final-transcription adapter operation shared by the editor and agent composer. Begin with an OpenAI-compatible HTTP adapter, a whisper.cpp HTTP adapter, and an optional managed faster-whisper adapter in an isolated Python environment. External HTTP endpoints can represent local user-managed services or remote providers.

Use existing file-transcription wire formats at the engine boundary. Do not require engines to implement a new public Mew speech protocol. Keep engine capabilities explicit so a future streaming adapter can extend the contract without claiming that every engine supports partial results.

Store connection and model preferences per account, keep credentials server-side, and restrict initial speech operations to owner/manager accounts with terminal permission. Only an owner can install the fixed managed runtime. This makes the host authority of endpoint access and local model execution explicit without introducing a general executable or installer plugin system.

Offer runtime installation progress and model source/license links in settings. Install packages only on an explicit action. Require separate consent for downloading model weights; a selected model is not permission to download it. Run managed inference as a finite process rather than supervising another persistent server.

Capture audio in the browser, normalize it to 16 kHz mono WAV, and send it to the Mew host for adapter dispatch. Show where processing happens before upload. Keep audio temporary and bounded. Cancel capture and pending work when the dialog or target closes, and ignore late results.

Show an editable final transcript before insertion. Insertion requires an explicit user action and a still-valid writable target. Agent speech creates a draft and never submits a prompt automatically. The [implementation contract](../development/speech-input.md) owns route, storage, audio, permission, and insertion details.

## Alternatives and rationale

| Alternative | Trade-off |
| --- | --- |
| Bundle a default model | Simplifies first use but adds large artifacts, release coupling, and model redistribution obligations |
| Depend entirely on browser speech recognition | Reduces host setup but varies by browser/device, available languages, processing service, and API support |
| Connect only one CLI/runtime | Has a small integration surface but makes model/runtime replacement an application change |
| Expose arbitrary commands or installer plugins | Maximizes flexibility while expanding privileged command execution and installation complexity |
| Require one speech protocol such as Wyoming | Reuses a streaming-oriented ecosystem but excludes common HTTP servers and adds a protocol translation requirement for the initial final-text workflow |
| Use only OpenAI-compatible HTTP | Covers many providers but leaves users to install a serving layer and does not cover whisper.cpp's native endpoint directly |

A small internal adapter separates product behavior from engine choice while reusing established HTTP formats. The optional managed runtime gives users a direct setup path without making an engine mandatory. Final-transcript review and explicit insertion provide one consistent interaction across engines, including slower CPU installations.

## Consequences

Users can select engines according to their own requirements, and Mew can add adapters without rewriting input components. Separately installed artifacts reduce Mew's distribution size and avoid automatically redistributing weights. They do not exempt Mew or users from runtime, converted-model, upstream-weight, dependency, service, or notice conditions.

The first setup may require Python, network access, disk capacity, and a model download. CPU inference may be slow, and this decision establishes no performance ranking or default-engine accuracy claim. Runtime readiness, model readiness, connection checks, and successful transcription remain distinct.

Privileged HTTP endpoints can access loopback/private services from the host. Local inference uses the server OS account. Initial role and terminal restrictions make this comparable to existing server-control features; document file rules alone do not sandbox it. Broader member access would require a separate policy decision.

Streaming partial text, automatic model selection, performance comparisons, GPU provisioning, arbitrary installation recipes, and model redistribution remain outside this decision. The [configuration guide](../../../docs/configuration/speech-input.md) owns current user instructions, and the work record separates fixture verification from real-device and real-engine acceptance.
