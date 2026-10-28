---
title: "데스크톱 프로젝트 사이드바 작업 기록"
description: "2026-10-28 데스크톱 프로젝트 드롭다운을 파일 탐색기 왼쪽의 독립 패널로 바꾸고 프로젝트별 명령 버튼을 추가한 구현·검증 기록. 모바일 드롭다운 유지, 명령 대상 고정·루트 세션 격리와 이전 실행 세션·운영 미적용 범위를 구분한다."
created: "2026-10-28"
updated: "2026-10-28"
---

## 목적과 결과

헤더의 프로젝트 선택기를 데스크톱에서는 파일 탐색기 왼쪽의 **프로젝트 사이드바**로 열도록 바꿨다. 목록을 열어 둔 채 프로젝트를 전환하고 각 프로젝트 행의 ▶로 명령을 실행할 수 있다. 다른 프로젝트 명령의 조회·편집·실행은 요청 대상만 고정하며 현재 프로젝트·문서·배치를 바꾸지 않는다.

기존 핸들·아이콘·오른쪽 번호·현재 행 전체 강조와 재정렬·우클릭 편집·삭제를 유지한다. 파일 탐색기와 독립적으로 닫고 폭을 조절하며 브라우저의 계정별 열림 상태·폭을 복원한다. 선택·바깥 누름·Esc·뒤로가기는 패널을 닫지 않는다. 닫기 버튼·헤더 선택기로 닫으면 기존 아이콘·이름·명령 버튼 표시로 돌아간다. 모바일은 기존 드롭다운을 사용한다.

Alt+P는 패널을 열고 첫 항목에 포커스를 두며 작업 패널 최대화 중에는 확대를 해제한다. Alt+R·Ctrl+E는 패널이 열려 있으면 현재 프로젝트 행, 닫혀 있거나 모바일이면 헤더의 명령 메뉴를 연다. 각 루트 프로젝트의 같은 이름 명령은 실제 폴더 경로를 포함한 세션 식별자로 격리한다.

현재 사용법은 [프로젝트 안내](../guides/projects.md#프로젝트-탭)·[명령 안내](../guides/commands.md), 기능 계약은 [프로젝트 열기·선택·전환](../features/프로젝트·파일·검색/프로젝트%20열기·탭·그룹.md)·[프로젝트 명령 버튼](../features/터미널·에이전트·자동화/프로젝트%20명령%20버튼.md), 공용 구현은 [UI 계약](../development/ui-contracts.md#헤더-프로젝트-선택기), 기존 결정 변경은 [ADR 0082](../decisions/0082-desktop-project-sidebar.md)를 따른다.

## 검증과 적용

- `node --test server/workspace-switch-ui.test.ts server/project-sidebar-ui.test.ts server/project-switcher-ui.test.ts`: 9개 통과. 실제 App에서 두 탐색 패널의 순서·토글 위치, 프로젝트 전환 후 패널 유지, 최대화 중 Alt+P 복귀·포커스, 새로고침 후 열림·닫힘·폭 복원을 확인했다. 격리 패널에서는 핸들·키보드 정렬·리사이즈, 프로젝트별 명령·작업 루트, 모바일 드롭다운 전환과 기존 입력 경계를 검사했다. 다크·라이트 데스크톱과 모바일 캡처도 검토했다.
- `node --test server/cmd-button-workspace.test.ts server/cmd-button-workspace-ui.test.ts server/cmdButtons.test.ts server/cmd-button-ports.test.ts server/subprojects.test.ts server/command-button-menu-ui.test.ts server/header-menu-switch-ui.test.ts server/action-menu-ui.test.ts`: 18개 통과. 프로젝트에 고정한 명령 요청·루트 세션 격리와 기존 명령 메뉴 동작을 검사했다.
- `npx tsc -b`: 통과.
- 변경 TS·TSX 11개 파일의 oxlint: 오류 없이 통과. 기존·상태 effect 관련 경고는 남아 있다.
- 변경 UI 4개의 Impeccable 검사와 별도 디자인 검토: 차단 결함 없음.
- `npm run check:docs`: description 검사 오류 없음. 전체 링크 검사는 기존 기능 MOC·태스크의 삭제된 대상을 가리키는 18건으로 실패했다. 이번 변경 문서의 링크 오류는 없다.

앱 빌드·배포·서버 실행·재시작은 수행하지 않았다. 실행 중인 인스턴스에는 사용자가 빌드 후 적용해야 한다. 이전 식별자로 이미 실행 중인 루트 명령 세션은 자동 종료하지 않으며 새 메뉴가 해당 세션의 실행 상태를 이어서 표시하지 않는다. 기존 터미널에서 확인·종료할 수 있고 새 실행부터 폴더별 식별자를 사용한다.
