---
title: "설치용 앱 아이콘 사각 테두리 제거"
description: "2026-10-28 설치용 PNG 아이콘 세 크기의 사각 테두리 제거와 기본 미드나이트 그라데이션 배경 적용을 기록한다. 마크 보존, 회귀 검사 결과와 미배포 범위를 설명한다."
created: "2026-10-28"
updated: "2026-10-28"
---

## 목적과 결과

홈 화면에 설치한 앱 아이콘의 바깥 사각 테두리를 제거했다. 180·192·512px PNG에 기존 배경과 내부 마크의 색·크기·위치·획 두께를 유지했다. 파비콘과 전체 로딩 로고는 변경하지 않았다. 현재 기준은 [설치형 웹앱 UI 계약](../development/ui-contracts.md#설치형-웹앱과-시작-안내)이 소유한다.

기존 `public/favicon.svg`의 path에 캔버스 크기의 20%만큼 평행 이동하고 `크기 × 0.6 / 64` 비율로 확대·축소하는 변환을 적용했다. CairoSVG로 기존 테두리를 포함한 PNG를 먼저 재현해 세 크기 모두 원본과 픽셀이 일치함을 확인한 뒤, 같은 SVG에서 테두리만 제외하고 PNG를 생성했다.

## 검증과 적용

- `node --test server/app-install-manifest.test.ts`: 5개 검사 통과. 세 크기의 바깥 여백이 불투명 배경색으로만 채워지고 내부 마크의 크기·위치가 보존되는지 확인한다. 기존 manifest·Apple touch 연결과 PNG 크기도 검사한다. 변경 전 PNG에서는 세 크기 모두 테두리 검사에 실패함을 확인했다.
- 변경한 512px PNG를 직접 열어 테두리가 제거된 모습을 확인했다.
- Git 원본과 세 크기의 픽셀을 비교해 내부 마크가 동일하고 바뀐 픽셀은 모두 배경색임을 확인했다.
- `npx tsc -b`와 `npx oxlint server/app-install-manifest.test.ts`: 통과.
- `npm run check:docs`: description 506개는 오류 없이 통과했다. 전체 링크 검사는 이번 작업과 무관한 기존 누락 문서 링크 18건 때문에 실패했다. 변경한 두 문서의 링크 오류는 없다.

앱 빌드·배포·서버 시작·종료·재시작은 수행하지 않았다. 실행 중인 앱에는 사용자의 빌드·적용이 필요하며 Mewlink 중앙 자원은 별도 배포 대상이다. 기존 설치 아이콘의 갱신 시점과 실제 Android·iOS 홈 화면 표시는 실기 검증하지 않았다.

## 후속 변경: 미드나이트 배경

2026-10-28 후속 요청으로 단색 배경을 기본 미드나이트의 정적인 그라데이션으로 바꿨다. `shared/theme.ts`의 기본 팔레트와 `themeBackgroundImage()`를 사용해 남색 바탕에 보라색·청록색을 135° 방향으로 섞었다. 앱 배경과 같은 `inset: -8%` 영역을 사용하고 애니메이션 없이 격리 Chromium에서 세 크기의 PNG를 생성했다. 내부 마크의 원본 path·색·변환과 테두리 없는 형태는 유지한다. 위의 단색 배경 픽셀 비교는 이전 변경의 검증 기록이다. 아이콘 검사와 앱이 같은 배경 계산을 사용하도록 순수 함수 `themeBackgroundImage()`를 `shared/theme.ts`로 옮기고 기존 프런트엔드 진입점에서 다시 내보낸다.

- `node --test server/app-install-manifest.test.ts`: 5개 검사 통과. 세 크기 모두 바깥 여백이 기본 미드나이트 그라데이션과 일치하고 불투명하며, 마크의 크기·위치와 설치 메타데이터가 유지되는지 확인했다. 기존 단색 PNG에서는 세 크기 모두 새 배경 검사에 실패했다.
- `node --test server/app-install-manifest.test.ts src/utils/theme-color.test.ts`: 22개 검사 통과. 공유 배경 함수의 이동 후 기존 테마 계산·적용 회귀 검사도 통과했다.
- 변경한 512px PNG를 직접 열어 남색·보라색·청록색의 정적인 배경과 내부 마크를 확인했다.
- `npx tsc -b`와 `npx oxlint shared/theme.ts src/utils/theme-color.ts server/app-install-manifest.test.ts`: 통과.
- `npm run check:docs`: description 506개 통과. 기존 누락 문서 링크 18건으로 전체 검사는 실패했으며 이번 변경 문서의 링크 검사는 통과했다.

빌드·배포와 실제 설치 기기의 아이콘 갱신은 수행하지 않았다.
