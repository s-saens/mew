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

| Model and runtime candidate | Use and resource profile | Korean and language choice | Streaming | License and caution |
| --- | --- | --- | --- | --- |
| [SenseVoiceSmall + sherpa-onnx](https://github.com/k2-fsa/sherpa/blob/master/docs/source/onnx/sense-voice/pretrained.rst) | First CPU-focused test: non-autoregressive model with INT8 builds. The listed 2025 Cantonese fine-tune is 226 MB INT8; do not assume that size or quality for other revisions. | Korean, English, Mandarin, Japanese, Cantonese; `auto` or explicit language. | Offline inference with VAD-based simulated streaming; measure end-of-utterance delay. | Original [model card](https://huggingface.co/FunAudioLLM/SenseVoiceSmall) says `model-license`; review the exact weights and conversion before distribution or commercial use. |
| [Whisper + whisper.cpp](https://github.com/ggml-org/whisper.cpp) | CPU/quantized baseline with many sizes. Multilingual [disk sizes](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md): tiny 75 MiB, base 142 MiB, small 466 MiB, large-v3-turbo 1.5 GiB; quantized variants differ. Compare small for CPU and turbo or large-v3 for quality. | Korean and many languages; automatic detection or specified language. Avoid English-only `.en` models for Korean. | Windowed or VAD-segmented inference; not inherently a native streaming model. | [Whisper](https://github.com/openai/whisper) and whisper.cpp are MIT; check each distributed model and conversion. Smaller variants trade quality for speed. |
| [Qwen3-ASR 0.6B / 1.7B](https://github.com/QwenLM/Qwen3-ASR) | 0.6B is a balance candidate; 1.7B is a quality-oriented candidate. CPU feasibility and quantized runtime need measurement; parameter count alone does not predict latency. | Korean included among 30 languages; automatic detection or explicit language. | Official package supports streaming through its vLLM backend; CPU alternatives and their streaming support must be verified separately. | [Model card](https://huggingface.co/Qwen/Qwen3-ASR-0.6B): Apache-2.0. Higher resource use and deployment complexity are possible. |
| [Nemotron 3.5 ASR Streaming 0.6B](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b) | New multilingual native-streaming candidate, 600M parameters. CPU runtime and real device performance need measurement. | Korean is transcription-ready; auto detection or explicit locale. Some of its 40 locales require adaptation before transcription. | Native streaming, configurable chunk/right-context sizes; chunk duration is not end-to-end latency. | Open Model Distribution and Modification License 1.1; review exact terms and dependencies before adoption. |
| [Moonshine Korean Tiny](https://github.com/moonshine-ai/moonshine/blob/main/docs/models/available-models.md) | Very small 26M-parameter Korean-specific model; useful as a lightweight research comparison. | Korean-specific model selection; automatic multilingual detection is not established. | Korean model is non-streaming; no Korean streaming checkpoint in the cited model list. | Korean legacy model is under the non-commercial [Moonshine Community License](https://github.com/moonshine-ai/moonshine/blob/main/docs/license.md). Do not assume the MIT license of English or streaming models applies. |
| [Parakeet TDT 0.6B v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) | Fast 600M multilingual candidate for English and European languages; compare a CPU-capable runtime separately. | 25 European languages with automatic language detection; **Korean is unsupported**. Per-language forcing support depends on runtime and needs verification. | TDT offline model; segmenting audio is not native streaming. | CC BY 4.0 model card; review attribution and bundled runtime terms. Optional language-specific engine only. |

[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) is a runtime, not an ASR model. It supports multiple model architectures, offline CPU operation, Node.js and several platforms. Its actual model, quantization and streaming support must be checked per version. Compare it with whisper.cpp and other runtimes rather than treating their names as competing model scores.

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
