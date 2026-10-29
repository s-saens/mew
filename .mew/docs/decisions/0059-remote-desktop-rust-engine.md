---
title: "원격 데스크톱 영상 처리·송신의 Rust 스레드 통합"
description: "기존 GPU C ABI를 재사용하면서 압축 프레임 IPC·JS RTP 생성·타이머를 Rust 전용 스레드로 옮기는 결정. Node 인증·협상·입력과 기존 전송 정책을 유지하고 설치 도구·의존성 소스 보존·합성 검증 및 실기 미검증 범위를 기록한다."
created: 2026-10-24
updated: 2026-10-24
---

## 상태

채택. 코드·격리 합성 검증의 결정이며 운영 적용·실제 GPU 성능 우위를 확인한 결정은 아니다.

## 배경

기존 캡처·하드웨어 인코딩은 이미 C++/Objective-C와 GPU에서 실행하지만 압축 출력은 JS worker에서 Node로 전달하고, RTP 생성과 pacing은 JS 이벤트 루프에서 처리했다. [ADR 0024](0024-remote-desktop-fhd-pipeline.md)의 두 프레임 처리 중첩은 유지하되 프레임 전달·스케줄링에서 JS 이벤트 루프 의존성을 줄일 필요가 있다. Rust로 언어만 바꾸면 GPU·회선·디코딩도 빨라진다고 가정하지 않는다.

## 결정

Node 호스트와 같은 프로세스의 Rust cdylib 전용 스레드가 GPU ABI 호출·압축 출력·Annex-B 검사·RTP 생성·pacing·직접 WebRTC 송신을 소유한다. 비압축 픽셀·압축 프레임·RTP 패킷을 JS로 전달하지 않는다. 기존 GPU 표면·하드웨어 인코더와 OS ABI는 유지한다.

Node는 인증·세션·SDP 협상·STUN 재시도·NAT 준비·혼잡 정책과 입력 권한 검사를 소유한다. 입력 전체를 Rust로 옮기지 않으며 Windows 커서는 별도 JS worker에서 계속 조회한다. 최대 두 프레임·원래 deadline·IDR 복구·RTT 적응 정책을 유지하고 generation 변경·독립 lease 검사를 Rust에서도 강제한다.

기본값은 Rust이고 `MEW_DESKTOP_ENGINE=legacy`로 기존 경로를 명시적으로 선택할 수 있다. 자동 실패 폴백은 하지 않는다. 이 결정은 ADR 0024의 기본 경로에 있던 JS 프레임 IPC·ACK·pacing 위치를 대체하며 품질·프레임 수명 정책을 바꾸지 않는다. 현재 세부 계약은 [Rust 엔진](../development/remote-desktop-rust.md)과 [공통 전송](../development/remote-desktop.md)이 소유한다.

## 근거와 영향

Linux 합성 GPU ABI·실제 libdatachannel·Chromium에서 FHD 영상을 수신하고 Node를 400ms 멈춰도 영상이 진행하는 것을 확인했다. 정지 후 재접속과 lease 미갱신 시 독립 종료를 검사했다. Rust RTP·큐·승인 단위 검사와 Clippy도 통과했다. 실제 GPU·Windows/MSVC·Mac·외부망의 성능·실행은 미검증이며 언어 전환만으로 지연 개선 배수를 주장하지 않는다.

설치 환경에 Rust·CMake·libclang·C++·Perl이 추가로 필요하고 최초 컴파일 시간이 늘어난다. 잠금 의존성의 소스·라이선스와 Windows의 제한적 빌드 경로 보정을 설치 폴더에 보존한다. 기존 npm 전송 라이브러리와 Rust가 정적으로 연결한 라이브러리의 버전·고지는 구분한다. OS 캡처를 전면 재작성하는 비용을 피하면서 영상 경계부터 먼저 검증하며, 실제 표시 지연은 같은 화면·품질·회선에서 후속 측정한다.
