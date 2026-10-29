---
title: "서버 설정 초기화 계약"
description: "서버 설정 모듈의 초기 import 순서와 동적 작업 공간·데이터 경로를 보존하는 구현 계약. 환경변수 사용법은 공개 가이드에 둔다."
updated: "2026-10-29"
---

읽는 순서와 기본 경로는 `server/config.ts` 한 곳이 정한다. **서버 진입점에서 다른 서버 모듈보다 먼저 import해야 한다.** 뒤로 밀리면 `MEW_DATA_DIR` 같은 값을 다른 모듈이 먼저 읽어 설정 파일의 값이 반영되지 않을 수 있다.

`MEW_WORKSPACE`를 고정 경로로 되돌리지 않는다. 호스트 환경변수·기본값·운영자 선택은 [서버 설정](../../../docs/configuration/environment.md)에서 관리한다.
