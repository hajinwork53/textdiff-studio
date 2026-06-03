# TextDiff Studio

> **AI 코딩 검증 워크벤치** — 크로스플랫폼(Windows / macOS) 데스크탑 텍스트 비교 도구

AI 에게 코드 수정을 시킨 뒤 "정말 이렇게 바뀐 게 맞나?" 확인하기 위한 도구입니다. 단순 diff 뷰어가 아니라 **AI 코딩 흐름에 특화된 7가지 기능**을 모았습니다.

![Tests](https://img.shields.io/badge/tests-205%20passed-success)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey)
![Electron](https://img.shields.io/badge/Electron-33-47848f)
![Vue](https://img.shields.io/badge/Vue-3-42b883)

---

## ✨ 핵심 차별화 7가지

| # | 기능 | 어디서도 못 하던 것 |
|---|------|--------------------|
| 1 | **TOC + 라인 점프** | 변경 목록 클릭 → Monaco 해당 라인 하이라이트 펄스 |
| 2 | **MD 리포트 + `vscode://` 점프** | 비교 결과를 마크다운 파일로 저장 → 링크 클릭 시 VS Code 가 정확한 라인 열기 |
| 3 | **클립보드 직접 비교** | Ctrl+V 하면 AI 응답 텍스트가 즉시 슬롯으로. 임시 파일 저장 X |
| 4 | **Git 3-모드 비교** | "현재 변경 / 두 커밋 / 두 브랜치" 모두 READ-ONLY 안전 |
| 5 | **CLI 진입점** | 터미널에서 `textdiff a.txt b.txt` 로 즉시 비교 |
| 6 | **출력 텍스트 → 코드 위치 역추적** | diff 에서 본 "회원가입 완료" 라는 텍스트가 코드 어디 있는지 ripgrep 으로 즉시 검색 |
| 7 | **수동 스냅샷 백업** | Git commit 안 해도 "AI 시키기 전 폴더 백업" 한 줄 클릭. 3중 안전장치로 복원 |

---

## 🎯 어떤 사람한테 좋은가

- **AI 와 코드 작업하는 사람** (Claude Code / Cursor / Copilot 등)
- **Git commit 매번 안 하는 사람** — 스냅샷이 "Git 안 쓰는 사람의 버전 관리"
- **비개발자 / 디자이너 / 기획자** — VS Code 없이도 AI 가 바꾼 텍스트 시각화 가능
- **회사에서 정보보안상 클라우드 diff 도구 못 쓰는 사람** — 100% 로컬

---

## 🚀 빠른 시작

### 사전 요구사항

- **Windows 10/11** 또는 **macOS (Apple Silicon / arm64)**
- **Node.js 22+** (https://nodejs.org/en/download — LTS 권장)
- **Git** (소스 클론 + 본 도구의 Git 비교 기능 사용 시)

> **macOS 사용자 메모**
> - `npm install` 시 darwin-arm64 ripgrep 바이너리가 자동 설치됩니다.
> - 클립보드 비교는 **Cmd+V**, CLI 설치는 `npm run install:cli` 후 `textdiff a b`.
> - `.dmg` 빌드는 `npm run package:mac`. 서명 안 한 빌드라 첫 실행은 우클릭→열기 또는
>   `xattr -dr com.apple.quarantine "/Applications/TextDiff Studio.app"` 로 Gatekeeper 1회 우회.

### 설치 + 실행

```powershell
# 소스 받기
git clone https://github.com/hajinwork53/textdiff-studio.git
cd textdiff-studio

# 의존성 설치 (첫 1회만, 약 3-5분)
npm install

# 개발 모드 실행
npm run dev
```

→ Vite 서버 + Electron 앱이 같이 뜸. `FilePicker` 화면이 보이면 성공.

### Windows `.exe` 빌드 (배포용)

```powershell
# 폴더 산출물 (Developer Mode 안 켜도 가능)
npm run package:simple
# → release/TextDiff Studio-win32-x64/TextDiff Studio.exe 더블 클릭
```

NSIS installer / portable `.exe` 단일파일이 필요하면 Windows 설정 → 개발자용 → 개발자 모드 ON 후:

```powershell
npm run package
# → release/TextDiff Studio-Setup-0.1.0.exe + ...-portable.exe
```

자세한 사용법은 **[USAGE.md](USAGE.md)** 참고.

---

## 🛠 기술 스택

| 영역 | 사용 |
|------|------|
| 데스크탑 | Electron 33 |
| 렌더러 | Vue 3 + TypeScript + Vite + Pinia + vue-router |
| diff 엔진 | Monaco Editor (VS Code 와 동일) |
| 인코딩 자동 감지 | jschardet + iconv-lite (CP949/EUC-KR 한글 안전) |
| Git 통합 | simple-git (READ-ONLY 보장 — commit/push/reset 호출 X) |
| 코드 검색 | `@vscode/ripgrep` (native rg.exe 바이너리 내장) |
| 스냅샷 zip | JSZip + check-disk-space |
| 테스트 | Vitest (200 케이스) |
| 빌드 | electron-builder / @electron/packager |

---

## 📁 프로젝트 구조

```
src/                  Vue 3 renderer (UI)
  views/              화면 (FilePicker / DiffViewer / Snapshots)
  components/         컴포넌트 (Monaco wrapper / 모달 / 패널)
  stores/             Pinia (comparison / clipboard / git / snapshot / settings / textTracker / toast)
  lib/                순수 로직 (diff 계산 / MD 직렬화 / 슬롯 추상화 / 검색 루트)
  composables/        composable hooks (paste / cliDispatcher)

electron/             Main process (Node.js)
  main.ts             진입점 (single-instance lock / dev-vs-packaged 분기)
  preload.ts          IPC API 노출
  ipc/                IPC 핸들러 (dialog / file / git / snapshot / tracker / ...)
  lib/                main-only 로직 (인코딩 디코더 / Git 래퍼 / ripgrep / 스냅샷)

cli/                  CLI 진입점 (textdiff a.txt b.txt)
test/                 Vitest unit (200 케이스)
build/                packaging 스크립트
```

---

## 🤖 AI 코딩 검증 워크플로우 예시

1. AI 한테 코드 수정 요청 전 → **스냅샷 만들기** (1초)
2. AI 가 코드 변경
3. **Git 비교** → 변경된 파일 클릭 → DiffViewer 진입
4. 의심스러운 문자열 드래그 → 우클릭 → **"이 텍스트의 출력 위치 찾기"** → 다른 파일 영향 확인
5. **MD 리포트 저장** → AI 한테 "이 변경 분석해줘" 첨부
6. AI 결과 망가졌으면 → **스냅샷 복원** (3중 안전장치)

한 도구 안에서 마우스 이동 최소화.

---

## 🔒 보안 / 프라이버시

- **100% 로컬 동작** — 인터넷 전송 X (telemetry / analytics / auto-update 모두 없음)
- **Git operations READ-ONLY** — commit / push / reset / clone 등 절대 호출 X
- **클립보드 메모리만 보관** — 디스크 영구 저장 X (앱 종료 시 삭제)
- **스냅샷 복원 3중 안전장치** — 자동 백업 / 자동 롤백 / 디스크 공간 사전 검사
- **path traversal 차단** — 스냅샷 압축 풀기 시 `..` / 절대경로 / null byte 거부

---

## 🧪 테스트

```powershell
npx vitest run     # 200 케이스 (snapshot/restore/ripgrep/CLI/serializer/encoding 등 모두 커버)
npm run type-check # vue-tsc 타입 검사
```

---

## 📜 라이선스

MIT License — 자유롭게 사용/수정/배포 가능. 단 제작자 보증 없음.

---

## 🙏 만든 사람

비개발자가 **vibe coding** (Claude Code 와 협업) 으로 5일 동안 만든 도구.
실제 본인 워크플로우에 필요해서 만들었고, 비슷한 니즈 있는 분들과 공유합니다.

이슈/PR 환영. README/USAGE 보강 가능한 부분이 보이면 알려주세요.
