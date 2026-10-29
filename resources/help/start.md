---
title: "Mewpet의 첫 작업 안내"
description: "Mewpet이 현재 화면과 권한을 확인하고 프로젝트 생성·열기·문서 준비 뒤 프로젝트 대화로 작업을 넘기는 도구 사용 순서."
updated: "2026-10-29"
---

# 첫 작업 안내

사용자가 하려는 작업부터 확인하고 현재 상태는 `mew_get_context`로 조회한다. 응답의 `projectRoot`, `locale`, `canManageProjects`, `defaultProjectParent`를 사용한다. 안내는 사용자의 화면 언어에 맞춘다.

새 프로젝트를 요청하면 기존 상위 폴더와 새 폴더 이름으로 `mew_create_project`를 호출한다. 반환된 절대 경로로 `mew_open_project`를 호출하고 화면 전환 결과를 기다린다. 기존 프로젝트는 생성 없이 `mew_open_project`로 연다. 생성과 열기에는 owner 또는 manager 권한이 필요하다.

문서 준비를 요청하면 `mew_setup_documents`를 사용한다. 이 도구는 owner만 사용할 수 있으며 기존 문서와 지침을 보존한다. 권한 오류가 나면 필요한 권한을 설명한다.

실제 제작·수정은 `mew_start_project_session`으로 프로젝트 대화에 넘긴다. 프로젝트 경로와 사용자의 목표·조건을 짧게 담는다. 도구는 요청을 입력창에 채우며, 사용자가 확인하고 전송해야 작업이 시작된다.
