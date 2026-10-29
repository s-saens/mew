---
title: "배포"
created: "2026-09-11"
updated: "2026-10-29"
description: "자체 서버 운영자의 소스 설치·HTTPS·업데이트·백업·복구 안내를 연결한다. 프로젝트 발행·중앙 서비스 운영 절차는 별도 유지관리 문서로 구분한다."
상위파일: "../README.md"
---
# 배포

개인 컴퓨터에 처음 설치하려면 [사용자 설치 안내](../guides/getting-started-ko.md)를 따른다. 이 문서는 자체 서버 운영자의 설치·HTTPS·업데이트·복구 안내를 연결한다.

- [네이티브 서버 설치](native.md): 전용 OS 사용자·HTTPS·systemd·백업
- [반영 전후 점검](../operations/deployment.md)
- [접근·보안·복구](../operations/MOC.md)

## 프로젝트 유지관리 절차

Mew 프로젝트 발행 담당자의 [CLI 릴리스](../../.mew/docs/operations/cli-release.md), 중앙 서비스 운영자의 [Mewlink 배포](../../.mew/docs/operations/remote-central.md)·[이메일 로그인 배포](../../.mew/docs/operations/email-login.md)는 프로젝트 문서에서 관리한다. 일반 호스트 설치와 중앙 서비스는 별도 배포 대상이며 각 문서의 실제 발행·적용·검증 상태를 확인한다.
