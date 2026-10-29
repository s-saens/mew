---
title: "저장소 유지관리"
description: "Mew 저장소의 GitHub 소유권 이전·Git 이력 교체·외부 백업과 복구 절차. 일반 설치 폴더 이동과 구분하는 유지관리자 런북."
updated: "2026-10-29"
---

## GitHub 소유자 이전

설치·릴리스 코드와 현재 문서는 `s-saens/mew`를 대상으로 한다. GitHub의 실제 Transfer와 각 설치의 원격 설정 변경은 별도 적용해야 한다. GitHub 소유자만 옮기는 경우 로컬 폴더·작업 공간·계정 데이터·Mewlink 등록은 옮길 필요가 없다. npm 패키지 이름은 `@liiiiv/mew-cli`를 유지한다.

1. 기존 협업자 권한과 이슈 담당자·유형을 기록한다. `s-saens`에 같은 이름의 `mew` 저장소나 같은 fork network의 저장소가 없는지 확인한 뒤, `liiiiv-life/mew`의 **Settings → General → Danger Zone → Transfer**에서 새 소유자로 `s-saens`를 지정한다. 관리자 권한이 필요하며 기존 이력·이슈·PR·릴리스를 유지한다.
2. 이전 후 모든 개발 PC·배포 서버의 기존 clone에서 아래 명령을 실행한다. 같은 Git 저장소를 공유하는 worktree들은 원격 설정도 공유하므로 한 번만 바꾸면 된다.

   ```bash
   git remote set-url origin https://github.com/s-saens/mew.git
   git remote -v
   ```

   SSH를 쓰면 원격 주소를 `git@github.com:s-saens/mew.git`로 설정한다. 위의 `git remote` 명령은 fetch·pull·빌드·서버 재시작을 실행하지 않는다. `./mew update`는 `git pull --ff-only origin main`, 앱 업데이트 확인은 `origin`의 `main`을 fetch한다. 앱 적용은 [기존 배포 절차](../../../docs/deployment/native.md#4-업데이트백업장애-확인)를 따른다.
3. 협업자 접근권한, 브랜치 보호, Actions 설정을 확인한다. 조직에서 개인 계정으로 이전하면 새 소유자 외 이슈 담당자와 이슈 유형이 제거되고 읽기 전용 협업자는 이전되지 않는다. 저장소 secrets·webhook·deploy key는 유지되지만 조직에서 제공하던 권한·secrets·runner와 외부 GitHub App·배포 서비스의 새 저장소 접근은 따로 확인한다.
4. `cli-release`·`npm-publish` environment의 검토자·허용 태그·보호 규칙을 확인한다. npm을 발행할 때는 [CLI 릴리스 절차](cli-release.md)에 따라 Trusted publisher의 GitHub 소유자를 `s-saens`로 등록한다. 이미 등록된 옛 소유자의 설정은 삭제 후 다시 만든다.

이전 Git URL은 리디렉션되지만 `liiiiv-life/mew` 위치에 새 저장소나 fork를 만들면 리디렉션이 영구 삭제된다. 기존 주소에 의존하지 않도록 clone과 외부 연결을 갱신한다. GitHub Pages를 별도로 사용 중이면 사이트 주소는 리디렉션되지 않으므로 URL·DNS도 확인한다. 저장소 이전은 GitHub OAuth 앱의 소유권 이전과 별개다. 앱 소유권까지 분리할 때만 별도 Transfer를 진행한다.

공식 기준: [GitHub 저장소 이전](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository), [배포 환경 관리](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [GitHub OAuth 앱 이전](https://docs.github.com/en/apps/oauth-apps/maintaining-oauth-apps/transferring-ownership-of-an-oauth-app). 이 문서의 절차는 이전 준비 안내이며 GitHub 설정 적용이나 발행 완료를 뜻하지 않는다.

## Git 이력 새 시작

[결정 0056](../decisions/0056-fresh-git-history.md)에 따라 소스 폴더와 실행 데이터의 위치는 바꾸지 않는다.

사용자가 명시적으로 이력 교체를 요청한 경우에만 수행한다. 기존 `.git` 전체와 staged·unstaged 변경을 `~/dev/mew-backups/`의 날짜별 폴더에 보존한다. `.git` 안에 있던 별도 소스·변경 목적·복구 자료도 백업에 포함하며, 로컬 계정·세션·환경 설정과 사용자 파일은 옮기거나 삭제하지 않는다.

현재 추적 파일과 승인된 변경으로 부모 없는 첫 커밋을 만들고 기존 `origin` 주소를 다시 등록한다. 미추적·무시 파일을 일괄 추가하지 않는다. 교체 직전 확인한 원격 `main` SHA를 명시한 `--force-with-lease`로 `main`만 갱신하고, 원격이 바뀌면 중단해 다시 검토한다. 브랜치 보호를 임의로 해제하거나 다른 브랜치·태그를 삭제하지 않는다. push 뒤 원격 SHA·첫 커밋의 부모 없음·파일 스냅샷·작업 상태를 확인한다.

복구에는 외부에 보존한 Git 메타데이터와 변경 사본을 사용한다. 이전 이력을 사용하는 다른 clone은 새로 받아야 하며, 원격 이력 교체는 GitHub의 PR 참조·캐시나 다른 clone에 남은 과거 데이터를 지우는 절차가 아니다.
