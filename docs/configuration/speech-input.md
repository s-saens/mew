---
title: "Configure speech input"
description: "Explains connecting an OpenAI-compatible or whisper.cpp speech server, installing the optional faster-whisper runtime, model-download consent, and reviewing dictated text before insertion. Identifies host processing, permissions, and acceptance limits."
created: "2026-11-11"
updated: "2026-11-11"
---

# Configure speech input

Speech input turns a recording into editable text for a document or agent draft. You choose the engine. Mew does not include a speech model, and it sends no agent message when transcription finishes.

The [work record](../../.mew/docs/work/speech-input.md) records local checks and the remaining real-engine, device, and native-client acceptance gates.

## Before you start

The initial version is available to owner and manager accounts with terminal permission. An owner must perform managed runtime installation. Your permission to edit the destination document or use the agent still applies.

Use a browser that supports microphone capture in a secure context, normally HTTPS or localhost. Allow microphone access when asked. The microphone is on the device running your browser; the engine runs on the Mew host or at the configured service address. Connecting from a phone does not install a model on that phone.

Open **Settings → Speech recognition** and choose one of the following setup paths. Settings belong to your signed-in Mew account.

## Connect an existing speech server

1. Choose **OpenAI-compatible** or **whisper.cpp**.
2. Enter the base URL reachable from the computer running Mew. For OpenAI-compatible services, include the API prefix, for example `http://127.0.0.1:8000/v1`. For whisper.cpp, use the server root, for example `http://127.0.0.1:8080`.
3. For an OpenAI-compatible service, enter the model ID accepted by that service. Enter an API key only if required. Choose automatic language detection or a supported language.
4. Save the settings and run the connection check.

The OpenAI-compatible adapter adds `/audio/transcriptions`; the whisper.cpp adapter adds `/inference`. Do not enter those final paths again. Do not put passwords or API keys in the URL. A saved API key is not displayed again; leave it unchanged to retain it or explicitly clear it.

The service must support the selected adapter's file-transcription API. A successful connection check does not measure speech accuracy or guarantee that a paid provider will accept every model/request. Check the provider's API access, pricing, privacy, and retention terms.

You install and run external servers yourself. Mew does not start or stop them. Consult the official [whisper.cpp server instructions](https://github.com/ggml-org/whisper.cpp/blob/master/examples/server/README.md) or your chosen OpenAI-compatible provider.

## Install the optional local runtime

1. Sign in as an owner and choose **faster-whisper** in speech settings.
2. Check that the host has Python 3.9 or newer with `venv` and `pip`, and open the runtime license/source links.
3. Choose the installation action and follow its progress. If installation fails, correct the reported prerequisite or network problem and retry.
4. Choose a model and language. Review the model's separate source/license and explicitly allow its download before first use.
5. Save the settings. The selected model is acquired on the host when needed after consent.

The runtime installs faster-whisper 1.1.1 in a private Python environment and uses a dedicated model cache on the Mew host. It runs CPU inference with int8 computation and does not require a separate speech server. Available multilingual model IDs are `tiny`, `base`, `small`, `medium`, `large-v1`, `large-v2`, `large-v3`, `large-v3-turbo`, and `turbo`. Larger models can need substantially more disk space, memory, and processing time; choose a model suitable for that computer. Automatic language detection and quality depend on the selected model and recording. Leave Language blank for automatic detection or enter the engine's supported language code, such as `ko` or `en`.

Runtime installation and model download are separate. Installing faster-whisper does not mean every model is available. Read the official [runtime documentation](https://github.com/SYSTRAN/faster-whisper) and [runtime license](https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE), and follow the model link shown for your selection. The runtime, converted weights, upstream model, and dependencies can have different conditions. Installing them yourself does not remove those conditions.

## Dictate and insert text

1. Open an editable text/Markdown document or an agent composer and place the cursor where the text should go.
2. Choose the speech input microphone action. Confirm the processing destination shown in the recording dialog.
3. Start recording and grant microphone permission if asked. Stop when finished and wait for the final transcript. Recording stops automatically after 60 seconds.
4. Review or edit the text, then choose **Insert**.

The transcript becomes ordinary editor text or an agent draft. Send an agent message separately when ready. Cancelling or closing the dialog discards that recording/result and releases the microphone.

Keep the intended document or draft open while transcribing. If it closes, becomes read-only, or changes so the insertion position is no longer safe, Mew must not write into another destination. Return to the intended input and choose a safe target before inserting.

Speech input keeps audio temporary and does not add a recording to the document. To retain playable audio instead, use the editor's existing `/voice` recording feature.

## Recover from a problem

| Problem | Check |
| --- | --- |
| Speech settings or recording are unavailable | Account role, terminal permission, and destination edit/agent permissions |
| The browser cannot open the microphone | Browser permission, HTTPS/localhost, device microphone access, and another application using the device |
| A loopback server cannot be reached | The URL is relative to the Mew host; `127.0.0.1` is not the phone or another connecting computer |
| The runtime is installed but the model is unavailable | Model selection, download consent, host disk space, and download connectivity |
| Transcription is slow | Host resources, model size, recording length, and engine load |
| The transcript is empty or inaccurate | Language selection, silence/noise, microphone input, and the selected model |
| The request times out or reports busy | Wait for current work to finish, shorten the next recording, or choose an appropriate engine/model |
| Speech settings changed while recording | Reopen speech input, review the current processing destination, and record again |

Cancelling prevents Mew from applying a late result. A remote service may already have received or processed audio sent before cancellation. Use a trusted endpoint and its retention policy when recording private information.

Local fixture checks do not establish real-engine speed, model accuracy, mobile microphone behavior, or successful host installation. See the work record for the checks actually performed and remaining acceptance gates.
