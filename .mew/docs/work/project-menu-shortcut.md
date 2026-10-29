---
title: "프로젝트 목록 Alt+P 단축키 작업 기록"
description: "2026-10-28 프로젝트 선택 목록을 Alt+P로 여는 구현과 키보드·권한·원격 입력 회귀 검사 결과, 기존 문서 링크 오류와 운영 미적용 상태를 기록한다."
created: "2026-10-28"
updated: "2026-10-28"
---

## 목적과 결과

입력창에서도 Alt+P로 프로젝트 목록을 열고 첫 항목에 포커스를 둘 수 있도록 추가했다. 이미 열린 목록에서는 첫 항목으로 포커스만 옮긴다. 기존 방향키·Enter/Space 선택과 Esc 복귀, Alt+숫자 전환을 유지하며 모달·IME·키 반복·추가 보조키·권한 없음에서는 열지 않는다. 원격 키보드 캡처가 Alt+P보다 우선한다.

현재 사용법은 [프로젝트 안내](../../../docs/guides/projects.md#프로젝트-탭), 기능 계약은 [프로젝트 열기·선택·전환](../features/%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8%C2%B7%ED%8C%8C%EC%9D%BC%C2%B7%EA%B2%80%EC%83%89/%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8%20%EC%97%B4%EA%B8%B0%C2%B7%ED%83%AD%C2%B7%EA%B7%B8%EB%A3%B9.md), 공용 구현은 [헤더 프로젝트 선택기](../development/ui-contracts.md#헤더-프로젝트-선택기)를 따른다.

## 검증과 적용

- `node --test server/project-switcher-ui.test.ts`: 1개 통과. 격리 Chromium의 1100/390px에서 입력창의 Alt+P 열기·첫 항목 포커스·방향키/Enter 선택·재열기·Esc 복귀와 물리 Option 키를 확인했다. 모달·원격 키보드·IME·키 반복·보조키·접근 권한 경계와 기존 선택·정렬·아이콘·터치 동작도 검사했다. 구현 전에는 Alt+P로 메뉴가 열리지 않아 같은 회귀 검사가 실패했다.
- `node --test server/header-menu-switch-ui.test.ts`: 1개 통과. 기존 상단바 메뉴 전환과 닫기·포커스 복귀를 확인했다.
- `npx tsc -b`: 통과.
- `npx oxlint src/components/ProjectSwitcher.tsx server/project-switcher-ui.test.ts`: 오류 없이 통과. 기존 ref 렌더 접근과 effect 내부 상태 갱신 경고 2건이 남아 있다.
- Impeccable의 변경 컴포넌트 검사: 지적 없음.
- `npm run check:docs`: description 검사는 통과. 전체 링크 검사는 작업 전부터 삭제된 기능 MOC·태스크 문서를 가리키는 기존 링크 18건으로 실패했다. 이번 변경 문서의 링크 오류는 없다.

앱 빌드·배포·서버 실행·재시작은 수행하지 않았다. 실행 중인 인스턴스에는 사용자가 빌드 후 적용해야 한다. 실제 모바일 기기의 키보드 입력과 macOS 실기기 입력은 이번 검증 범위에 포함하지 않았다.
