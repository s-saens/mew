---
title: "Speech input adapters"
description: "Defines the external speech engine boundary, per-account configuration, managed runtime installation, final-transcript review, permissions, audio lifetime, and cancellation contract for editor and agent speech input."
created: "2026-11-11"
updated: "2026-11-11"
---

# Speech input adapters

Mew captures speech in the connecting browser and asks a configured engine to return text. The engine and its model are user-selected dependencies. Mew does not include model weights in its application distribution. [ADR 0166](../decisions/0166-external-speech-engines.md) owns the architectural decision; the [configuration guide](../../../docs/configuration/speech-input.md) explains setup and everyday use.

The [work record](../work/speech-input.md) records local verification separately from real-engine, physical-device, native-client, and running-instance acceptance.

## Engine boundary

The application owns one final-transcription operation: audio plus the saved account configuration produces a text result or an explicit error. Engine-specific wire formats, authentication, and local child processes belong to adapters. Editor and agent components consume the same result and do not import an engine SDK.

| Adapter | User supplies | Execution |
| --- | --- | --- |
| OpenAI-compatible HTTP | API base URL, model ID, optional API key, and language | The Mew host posts multipart audio to the configured base plus `/audio/transcriptions` |
| whisper.cpp HTTP | Server base URL and optional authentication/language settings | The Mew host posts multipart audio to `/inference` |
| Managed faster-whisper | Model choice, language, and explicit download consent | A finite Python process uses a separately installed runtime and model cache on the Mew host |

OpenAI compatibility here means the supported file-transcription request and text response. It does not promise compatibility with every provider extension or a realtime protocol. The OpenAI base includes its API prefix, such as `https://api.openai.com/v1`; it does not include `/audio/transcriptions`. A whisper.cpp base points to the server root, such as `http://127.0.0.1:8080`.

The initial capability is completed-recording transcription with automatic or explicitly selected language where the adapter supports it. A blank language omits the field for OpenAI-compatible services and sends `language=auto` to whisper.cpp; managed inference uses its automatic-detection value. The whisper.cpp server selects its loaded model, so Mew does not pass the account's model field to that endpoint. Streaming partial text, translation, diarization, engine discovery, GPU provisioning, and arbitrary installation scripts are outside this version. New engines can implement the same operation without changing the editor or agent integration. A future streaming capability must be explicit rather than inferred from an engine name.

## Configuration, access, and storage

Speech settings are private to the authenticated account under `DATA_DIR/speech-accounts/<account SHA-256>/settings.json`. API keys are write-only from the browser's perspective: status exposes whether a key exists, never its stored value. Clearing a key is explicit, and an omitted key preserves the saved key only while the adapter and base URL remain unchanged. Changing either clears the old key unless the request supplies a replacement. Configuration responses never include another account's settings or credentials. Deleting an account or revoking the source identity during an account merge removes its speech settings and key, so reusing that identity does not restore the credential. A merge does not copy the source speech key into the destination account. The managed runtime/cache and its generic installation status are shared by the installation and remain when an account is deleted.

The first version requires owner or manager role and the terminal feature permission for setup, connection checks, and transcription. Runtime installation additionally requires owner role because it changes the host. This follows the [server-control boundary](access-control.md): external URLs and local inference run with host authority, so access is not granted merely by document edit permission. Destination file and agent permissions still determine whether a transcript can be inserted.

HTTP adapters accept explicit HTTP or HTTPS endpoints, including loopback and private hosts for user-installed engines. Treat endpoint setup as a privileged connection capability. Validate URLs and reject embedded credentials, query strings, and fragments. Never attach a saved key to a redirected destination. Use fixed adapter paths and argument arrays; configuration is not a shell command or arbitrary executable path.

## Managed installation and models

The installation UI offers `faster-whisper==1.1.1` in `DATA_DIR/speech/faster-whisper/venv`. The host needs Python 3.9 or newer with `venv` and `pip`. It reports bounded progress/failure output. Installation is an explicit owner action; opening settings, loading an editor, server startup, and selecting a model do not install packages. Reopening settings reports the existing operation rather than launching a duplicate installation. The package pin does not lock every transitive dependency or downloaded model revision.

Runtime installation and model acquisition are distinct. The UI links the runtime license and model source/license separately and obtains explicit consent before any model download. The managed adapter accepts the multilingual `tiny`, `base`, `small`, `medium`, `large-v1`, `large-v2`, `large-v3`, `large-v3-turbo`, and `turbo` model identifiers and uses `DATA_DIR/speech/faster-whisper/models` as its cache. A finite CPU/int8 inference process loads the selected model from that cache; it may acquire the selected weights only after the account's recorded `allowModelDownload` consent. Model selection does not certify accuracy, memory suitability, or legal suitability for the user's purpose.

Dependencies and downloaded weights remain host data outside Git, application assets, npm distributions, and runtime archives. An installation failure preserves existing usable data and reports a retryable error. Mew does not run a persistent speech server for the managed adapter.

The official [faster-whisper project](https://github.com/SYSTRAN/faster-whisper) documents runtime requirements and model downloads. Its [runtime license](https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE), the selected converted model's license, upstream model terms, and dependency notices require separate consideration. User installation does not remove these conditions.

## Audio and request lifetime

The browser asks for microphone access only after the user chooses to record. Capture is on the browser's device, including when Mew runs on a different host. Encode mono 16-bit PCM WAV at 16 kHz so adapters receive one consistent format. Display the selected processing destination before upload. The browser sends the completed recording through its authenticated Mew connection; only the host communicates with the configured engine.

Recording stops after 60 seconds. The upload accepts at most 25 MiB and validates the browser's fixed mono 16 kHz PCM16 WAV layout, declared lengths, and a duration of at most 62 seconds to allow capture-stop timing. Inference has a five-minute server timeout, a 310-second client deadline, and a 1 MiB response/subprocess-output bound. Mewlink and the native direct JavaScript bridge apply the same 310-second wait only to this transcription POST; ordinary transport deadlines and explicit cancellation remain in force under the [remote access](remote-access.md) and [iOS bridge](ios-client.md#native-bridge-protocol) contracts. iOS URLSession also uses 310 seconds for that operation and retains its ordinary 60-second request timeout; this native change requires an app update. At most two transcriptions run for the installation; excess requests receive HTTP 429 instead of entering an unbounded process queue. Adapter errors expose useful status without echoing keys, raw provider bodies, audio, or recognized text into logs.

Read the sanitized settings and opaque `revision` before recording and display that processing destination. Submit the revision with the audio. The server compares it with the current account configuration and rejects HTTP 409 if the adapter, address, model, language, key, or download consent changed. A recording must never silently go to a newly configured destination.

Audio remains temporary. HTTP forwarding uses the request bytes; local inference may use a private temporary file and removes it after success, failure, timeout, or cancellation. Speech input does not create an audio attachment or retain an audio recording in the workspace. The existing Hotview `/voice` recording feature remains a separate operation.

Stopping a recording stops all microphone tracks and closes capture resources. Cancelling or closing the dialog, unmounting the owning input, and losing the destination cancel pending capture/upload work. A delayed permission grant must stop its new stream if the dialog has already closed. Discard late engine results after cancellation. Request disconnection aborts external HTTP work and terminates the managed inference child, subject to the transport's ability to report disconnection. Cancellation, timeout, or excessive output requests process-group termination and escalates to force termination after two seconds. Wait for the actual child close before deleting its temporary audio or releasing its transcription slot; an abort notification alone does not prove process exit. A provider may already have processed submitted audio; cancellation cannot recall it.

## Review and insertion

Stopping the recording starts transcription and then shows an editable final transcript. The user chooses **Insert** to apply it or dismisses it. Transcription never submits an agent prompt or sends a message. Empty results leave the destination unchanged and remain recoverable in the dialog.

Capture the intended document/input identity and selection when the user opens speech input. Apply the transcript only while that destination is still writable and the captured insertion target is valid. Edits or navigation that make the target ambiguous must keep the text available for review and require a fresh safe insertion target. Never write into a different open document, replace a newly edited agent draft, or insert a late result after a tab closes. Preserve ordinary undo and draft-saving behavior.

The initial integration covers editable Markdown Hotview, Plain/source/code text, and the active non-CLI agent composer. It adds a toolbar/composer microphone rather than a slash command. `EditorHandle` and `CodePaneHandle` expose a one-shot `prepareTextInsertion()` closure capturing the original document and selection. It rejects intervening content changes, editor replacement, loss of editability, and duplicate application while preserving ordinary undo. Agent insertion compares the original input handle, canonical draft value, selection, and tab/queue-edit scope. Closing after insertion or cancellation returns focus to the still-current input. The reviewed transcript is ordinary text: it does not become an agent command, attachment, or executable action merely because it came from speech.

## HTTP surface

All routes use the existing authenticated API and CSRF/origin protections. The server derives account identity from authentication rather than request parameters.

| Method and path | Purpose |
| --- | --- |
| `GET /api/speech` | Read sanitized account configuration, opaque configuration `revision`, management/install flags, and installation status |
| `PUT /api/speech/config` | Validate and save this account's adapter configuration |
| `POST /api/speech/test` | Check the saved configuration without recording or uploading user speech |
| `POST /api/speech/transcribe` | Accept multipart `audio` and `revision` fields and return `{ text }`; reject a stale revision with HTTP 409 |
| `POST /api/speech/install` | Start the fixed managed runtime installation as owner |

Connection checks prove only the endpoint/runtime condition they inspect. They do not prove model quality, successful paid-provider authorization, a warmed model, or microphone operation. Errors distinguish missing configuration, missing runtime, invalid audio, denied access, timeout, busy state, and engine failure.

## Verification contract

Automated checks cover account separation and secret omission, role/feature rejection, URL and audio validation, exact adapter requests, redirects and timeouts, bounded process output and cancellation, explicit download consent, microphone cleanup, final review, safe insertion, and no automatic agent submission. Use HTTP/process fakes and test-owned browser fixtures rather than installing models or starting an application server. The work record states which checks actually ran.

Real model speed/accuracy, GPU availability, clean-host installation, physical microphones, mobile permission behavior, and real Mewlink audio transport require separate acceptance. Build success and fixture transcription do not establish those results.
