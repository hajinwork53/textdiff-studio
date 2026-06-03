# 설치 가이드 — TextDiff Studio

비개발자도 따라할 수 있는 설치 방법입니다. **Node.js 설치 없이** 바로 쓰려면 아래 "1. 설치 파일로 설치"를 따르세요.

- 📥 **다운로드:** https://github.com/hajinwork53/textdiff-studio/releases/latest
- 📖 **사용법:** [USAGE.md](./USAGE.md) (설치 후 기능별 사용 설명)

---

## 1. 설치 파일로 설치 (일반 사용자 추천)

[Releases 페이지](https://github.com/hajinwork53/textdiff-studio/releases/latest)에서 본인 OS 파일을 받으세요.

| OS | 파일 | 설명 |
|----|------|------|
| **macOS** (Apple Silicon) | `TextDiff.Studio-...-arm64.dmg` | 설치형 (권장) |
| **macOS** (Apple Silicon) | `TextDiff.Studio-...-arm64.zip` | 무설치 (압축 풀어 실행) |
| **Windows** | `TextDiff.Studio-Setup-...exe` | 설치형 (권장) |
| **Windows** | `TextDiff.Studio-...-portable.exe` | 무설치 (더블클릭 실행) |

### 🍎 macOS 설치 (Apple Silicon / M칩)

1. `...-arm64.dmg` 다운로드 → 더블클릭.
2. 창이 열리면 **TextDiff Studio 아이콘을 Applications 폴더로 드래그**.
3. Launchpad 또는 응용 프로그램에서 **TextDiff Studio** 실행.
4. **첫 실행 시 경고** ("확인되지 않은 개발자" / "Apple이 악성 소프트웨어가 없는지 확인할 수 없습니다"):
   - **방법 1 (권장):** 경고창 **[완료]** → **시스템 설정 → 개인정보 보호 및 보안** → 아래로 스크롤 → "TextDiff Studio을(를) 열도록 허용" 옆 **[그래도 열기]** → **[열기]**.
   - **방법 2 (터미널):** 아래 한 줄 실행 후 더블클릭:
     ```bash
     xattr -dr com.apple.quarantine "/Applications/TextDiff Studio.app"
     ```
5. 한 번만 거치면 다음부터 경고 없이 바로 열립니다.

> ℹ️ 현재 Apple 공증(notarization)을 적용하지 않아 첫 실행 경고가 1회 뜹니다. Intel 맥은 아직 미지원입니다.

### 🪟 Windows 설치

**설치형 (`...-Setup-...exe`):**
1. 다운로드 → 더블클릭.
2. **SmartScreen 경고** ("Windows에서 PC를 보호했습니다" 파란 창):
   - **[추가 정보]** 클릭 → **[실행]** 버튼 클릭.
3. 설치 마법사: 설치 위치 / 바탕화면 바로가기 / 시작메뉴 등록 선택 → 설치.
4. 시작메뉴에서 "TextDiff Studio" 검색 → 실행. (제거: 제어판 → 프로그램 제거)

**무설치 (`...-portable.exe`):**
1. 다운로드 → 더블클릭 (위와 같은 SmartScreen 1회 우회).
2. 설치 없이 바로 실행. USB에 넣어 다녀도 됩니다.

> ℹ️ 코드 서명을 안 해서 SmartScreen 경고가 1회 뜹니다. [추가 정보] → [실행] 로 우회.
> 영구 해제: 파일 우클릭 → 속성 → 하단 "차단 해제" 체크.

---

## 2. 소스에서 빌드 (개발자)

Node.js 22+ 와 Git 이 필요합니다.

```bash
git clone https://github.com/hajinwork53/textdiff-studio.git
cd textdiff-studio
npm install          # 첫 1회 (3~5분)

# 개발 모드 실행
npm run dev
```

> ⚠️ **AI 코딩 환경(Claude Code 등)에서 dev 실행 시:** 셸에 `ELECTRON_RUN_AS_NODE=1`이 설정돼 있으면 부팅이 멈춥니다.
> `env -u ELECTRON_RUN_AS_NODE npm run dev` 로 실행하세요. (일반 터미널·Finder 실행은 무관)

### 설치 파일 직접 빌드

```bash
# macOS (.dmg / .zip, arm64)
npm run package:mac

# Windows (.exe — Windows 에서 실행)
npm run package
```
산출물은 `release/` 폴더에 생성됩니다.

### CLI 설치 (터미널에서 `textdiff a b`)

```bash
npm run install:cli      # textdiff 명령 전역 등록 (npm link)
textdiff --version
textdiff a.txt b.txt
```

---

## 3. 새 버전 배포 (관리자)

이 저장소는 **단일 코드베이스로 Windows + macOS 를 동시 관리**합니다.
버전 태그를 push 하면 GitHub Actions 가 **양 플랫폼 설치 파일을 자동 빌드**해 Release 에 첨부합니다.

```bash
# package.json 의 version 수정 후
git tag v0.1.1
git push origin v0.1.1     # → CI 가 .dmg + .exe 자동 빌드 → Release 첨부
```

→ 진행 상황: https://github.com/hajinwork53/textdiff-studio/actions
→ 결과물: https://github.com/hajinwork53/textdiff-studio/releases

> Windows 노트북 없이도 맥에서 태그 push 한 번으로 윈도우 .exe 까지 만들어집니다.

---

## 문제 해결

| 증상 | 해결 |
|------|------|
| 맥 "확인되지 않은 개발자" | 위 §macOS 4번 — 시스템 설정 "그래도 열기" 또는 `xattr` |
| 윈도우 SmartScreen 파란 창 | [추가 정보] → [실행] |
| dev 실행 시 즉시 멈춤(맥) | `env -u ELECTRON_RUN_AS_NODE npm run dev` |
| 검색(ripgrep) 안 됨 | `npm install` 재실행 (플랫폼 바이너리 자동 설치) |

자세한 기능 사용법은 [USAGE.md](./USAGE.md) 를 보세요.
