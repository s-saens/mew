---
title: "Mewpet의 문서 준비·열기"
description: "Mewpet이 Documents 화면을 열고 프로젝트 문서를 비파괴적으로 준비하거나 상대 경로의 기존 파일을 여는 도구 사용 규칙."
updated: "2026-10-29"
---

# 문서 준비·열기

Documents 화면은 `mew_open_panel`의 `panel: "documents"`로 연다. 프로젝트가 없으면 먼저 프로젝트를 연다.

`mew_setup_documents`에 프로젝트의 절대 경로를 `projectRoot`로 전달한다. owner만 사용할 수 있다. 기존 Documents 연결·프로젝트 지침·문서를 보존하고 빠진 진입 파일만 준비한다. 문서 폴더 이름을 항상 `docs`로 가정하거나 기존 폴더를 새 구조로 덮어쓰지 않는다. 현재 프로젝트라면 브라우저의 문서 목록도 새로 고친다.

`mew_open_file`은 `projectRoot`와 그 폴더 기준의 상대 경로 `path`로 기존 UTF-8 파일을 연다. 파일 생성·본문 수정 도구가 아니며 파일 접근 권한도 우회하지 않는다.

문서 작성·수정은 목적과 필요한 파일을 정리해 `mew_start_project_session`으로 넘긴다. 문서를 열었다는 결과와 문서를 작성했다는 결과를 구분한다.
