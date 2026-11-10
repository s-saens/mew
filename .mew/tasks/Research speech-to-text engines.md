---
title: "음성 인식 엔진 조사"
description: "Mew 에디터와 에이전트 입력창에 사용할 음성 인식 모델의 한국어 지원, 언어 선택, CPU 및 스트리밍 특성,
  라이선스와 평가 기준을 비교하는 미완료 태스크."
done: false
tags:
  - feature
---

## 목표와 현황

2026-11-10 조사. 에디터와 에이전트 입력창에 음성으로 텍스트를 입력할 수 있도록 선택 가능한 음성 인식 엔진을 평가한다. 이 문서는 후보 목록이며, 구현이나 기술 선택을 확정하지 않았다. UI 설계는 나중에 진행한다. 기존 [에디터 음성 녹음](../docs/features/document-code-media-editing/markdown-hotview-source-and-properties.md#voice-recording)은 오디오 첨부 파일을 삽입하는 별도 기능이다.

아래 모델 크기는 다운로드 용량 또는 파라미터 수이며 최대 RAM 사용량이 아니다. 실제 CPU 속도, 지연, 정확도와 메모리 사용량은 하드웨어, 런타임, 양자화, 언어와 음성에 따라 달라진다. 이번 조사에서 모델을 실행하거나 성능을 측정하지 않았으며, 서로 다른 데이터셋과 하드웨어로 발표된 결과를 공통 순위로 볼 수 없다.

## 후보

| 후보 | 적합한 용도 | 한국어 / 언어 선택 | 실시간 처리 / 라이선스 |
| --- | --- | --- | --- |
| [SenseVoiceSmall](https://github.com/k2-fsa/sherpa/blob/master/docs/source/onnx/sense-voice/pretrained.rst) | 빠른 CPU 후보; INT8 | 지원; 자동 또는 수동 | 음성 구간별 처리; [라이선스 검토](https://huggingface.co/FunAudioLLM/SenseVoiceSmall) 필요 |
| [Whisper + whisper.cpp](https://github.com/ggml-org/whisper.cpp) | CPU 비교 기준; 선택 모델 기준 [75 MiB\~1.5 GiB](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md) | 지원; 자동 또는 수동 | 구간별 처리; MIT |
| [Qwen3-ASR 0.6B / 1.7B](https://github.com/QwenLM/Qwen3-ASR) | 균형형 / 정확도 중심 후보 | 지원; 자동 또는 수동 | vLLM 스트리밍; Apache-2.0 |
| [Nemotron 3.5 0.6B](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b) | 말하는 중 실시간 전사 | 지원; 자동 또는 수동 | 자체 스트리밍; 별도 라이선스 |
| [Moonshine Korean Tiny](https://github.com/moonshine-ai/moonshine/blob/main/docs/models/available-models.md) | 매우 작음; 2,600만 파라미터 | 한국어 전용 모델; 자동 감지 미확인 | 스트리밍 미지원; [비상업용](https://github.com/moonshine-ai/moonshine/blob/main/docs/license.md) |
| [Parakeet TDT v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) | 빠른 영어 / 유럽 언어 처리 | **한국어 미지원**; 자동 감지 | 구간별 처리; CC BY 4.0 |

CPU 속도, 정확도, 메모리와 라이선스 적합성은 사용할 모델과 런타임을 정해 검증해야 한다. Whisper의 크기는 RAM이 아닌 디스크 용량이며, 한국어에는 다국어 모델을 사용한다. Qwen의 공식 스트리밍에는 vLLM이 필요하다. Nemotron의 일부 언어 지역은 추가 학습이 필요하다. Parakeet의 수동 언어 선택은 런타임에 따라 확인해야 한다. [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)는 음성 인식 모델이 아니라 여러 모델을 실행하는 런타임이다. 오프라인 CPU, Node.js와 여러 플랫폼을 지원하며, 실제 모델·양자화·스트리밍 지원은 버전별로 확인해야 한다. 모델 점수와 혼동하지 말고 whisper.cpp 등 다른 런타임과 비교한다.

## 권장 평가 순서

1. SenseVoice INT8과 Whisper 다국어 small/turbo를 같은 한국어 및 한영 혼용 음성으로 비교한다. 한국어 직접 지정과 자동 감지를 모두 사용하고, 감지가 불안정할 수 있는 짧은 발화도 포함한다.
2. Nemotron 3.5는 연속적인 중간 결과를, Qwen3-ASR 0.6B/1.7B는 인식 정확도를 평가한다. CPU와 사용 가능한 GPU를 각각 측정한다. 영어·유럽 언어 전용 Parakeet과 Moonshine은 언어와 라이선스 조건이 맞을 때 비교한다.
3. 실제 사용 대상 장비에서 측정하고 모델·런타임·배포 라이선스를 검토한 뒤 후보를 선택한다. 기본 엔진이나 구조는 아직 확정하지 않았다.

## 후속 완료 기준
- [ ] 사용 허가를 받은 한국어, 영어, 혼용 음성, 전문 용어, 이름, 소음, 무음과 짧은 발화 샘플을 준비한다. 한국어 CER과 적절한 WER, 무음 환각과 문장부호를 측정하고 전체 점수와 개별 오류를 함께 살펴본다.
- [ ] 모델 버전, 런타임, 정밀도, 하드웨어, 스레드 수, 초기·재사용 상태와 음성 길이를 기록한다. 디스크, 최대 RAM, CPU/GPU 사용량, 초기 로딩 시간, 첫 중간 결과와 발화 종료 후 최종 결과까지의 시간, 실시간 처리 비율을 측정한다. 자체 스트리밍과 VAD 구간 처리를 구분하고 장비별 결과를 기록한다.
- [ ] 엔진별 자동 언어 감지, 수동 언어 선택, 언어 전환과 혼용 음성을 평가한다. 지원하지 않는 기능을 모든 엔진이 제공한다고 가정하지 않는다.
- [ ] 에디터와 에이전트 입력창이 공유할 엔진 기능 인터페이스를 설계한다. 브라우저 또는 호스트 실행, 원격 마이크·음성 전송, 동의, 개인정보, 취소, 동시 세션, 다운로드·저장, 사용 가능 여부와 오류를 포함한다. 여러 엔진을 선택할 수 있게 하되 UI는 정하지 않는다.
- [ ] Mew의 사용과 배포에 적용되는 코드, 가중치, 변환 모델별 라이선스와 고지 사항을 검토한다. 중요한 기술 선택은 구현 전에 별도로 기록한다.
- [ ] 추후 원하는 에디터 선택 위치와 에이전트 초안에 텍스트가 삽입되는지 확인한다. 실수로 전송되거나 텍스트가 유실되거나 잘못된 위치에 삽입되거나 마이크가 해제되지 않는 경우를 검증하고, 모바일과 원격 연결도 포함한다.
