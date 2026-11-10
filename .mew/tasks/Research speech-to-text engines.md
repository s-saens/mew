---
title: "Research speech-to-text engines"
description: "Open task comparing local speech-to-text models for Mew's editor and agent composer, including Korean, language selection, CPU and streaming trade-offs, licenses, and evaluation gates."
done: false
tags:
  - feature
---

## Goal and status

Research dated 2026-11-10. Evaluate selectable speech-to-text engines for dictation into the editor and agent composer. This is a shortlist, not an implementation or a technology decision; UI design is deferred. The existing [editor voice recording](../docs/features/document-code-media-editing/markdown-hotview-source-and-properties.md#voice-recording) inserts an audio attachment and is a separate feature.

Model size below is a download or parameter count, not peak RAM. Actual CPU speed, latency, accuracy, and memory depend on hardware, runtime, quantization, language, and audio. No models were run or benchmarked for this task; published results from different datasets or hardware are not a common ranking.

## Candidates

| Candidate | Best fit | Korean / language | Streaming / license |
| --- | --- | --- | --- |
| [SenseVoiceSmall](https://github.com/k2-fsa/sherpa/blob/master/docs/source/onnx/sense-voice/pretrained.rst) | Fast CPU candidate; INT8 | Yes; auto or manual | VAD segments; [license review](https://huggingface.co/FunAudioLLM/SenseVoiceSmall) needed |
| [Whisper + whisper.cpp](https://github.com/ggml-org/whisper.cpp) | CPU baseline; [75 MiB–1.5 GiB](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md) across selected sizes | Yes; auto or manual | Segmented; MIT |
| [Qwen3-ASR 0.6B / 1.7B](https://github.com/QwenLM/Qwen3-ASR) | Balance / quality candidates | Yes; auto or manual | vLLM streaming; Apache-2.0 |
| [Nemotron 3.5 0.6B](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b) | Live transcription | Yes; auto or manual | Native streaming; custom license |
| [Moonshine Korean Tiny](https://github.com/moonshine-ai/moonshine/blob/main/docs/models/available-models.md) | Very small, 26M parameters | Korean model; auto detection unconfirmed | Non-streaming; [non-commercial](https://github.com/moonshine-ai/moonshine/blob/main/docs/license.md) |
| [Parakeet TDT v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) | Fast English / European languages | **No Korean**; auto detection | Segmented; CC BY 4.0 |

CPU speed, quality, memory and license compatibility require verification for the exact model and runtime. Whisper sizes are disk sizes, not RAM; use multilingual models for Korean. Qwen's official streaming requires vLLM. Nemotron has locales requiring adaptation. Parakeet's manual language selection depends on the runtime. [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) is a runtime, not an ASR model. It supports multiple model architectures, offline CPU operation, Node.js and several platforms. Its actual model, quantization and streaming support must be checked per version. Compare it with whisper.cpp and other runtimes rather than treating their names as competing model scores.

## Suggested evaluation order

1. Compare SenseVoice INT8 and Whisper multilingual small/turbo on the same Korean and mixed Korean/English samples. Use explicit Korean and auto detection; include short utterances where detection may be unreliable.
2. Test Nemotron 3.5 for continuous partial results and Qwen3-ASR 0.6B/1.7B for recognition quality, using CPU and available GPU separately. Compare English/European-only Parakeet and Moonshine only when their language and license boundaries fit.
3. Choose candidates only after measuring actual deployment targets and reviewing model, runtime, and distribution licenses. There is no approved default engine or architecture yet.

## Follow-up acceptance criteria

- [ ] Define comparable Korean, English, mixed-language, technical vocabulary, names, noise, silence and short-utterance samples with permission to use them. Measure Korean CER and appropriate WER, plus hallucinations on silence and punctuation; inspect errors as well as aggregates.
- [ ] Record model revision, runtime, precision, hardware, threads, warm/cold state and audio duration. Measure disk, peak RAM, CPU/GPU use, cold load, first partial text, final text after speech stops, and real-time factor. Separate native streaming from VAD chunking and report per-device results.
- [ ] Evaluate automatic language detection, manual language selection, switching and mixed speech per engine; never promise identical controls for engines that lack them.
- [ ] Design a shared engine capability interface for the editor and composer, including local browser versus host execution, remote microphone/audio transport, consent, privacy, cancellation, concurrent sessions, download/storage, availability and failures. Support multiple selectable engines; UI remains undecided.
- [ ] Review exact code, weights and converted-model licenses and notices for Mew's intended distribution and use. Record any consequential technology decision separately before implementation.
- [ ] Validate eventual insertion at the intended editor selection and composer draft without accidental submission, lost text, stale destinations or microphone leaks; cover mobile and remote connections.
