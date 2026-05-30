/**
 * Day 9: N2 스냅샷 제외 패턴 (DEFAULT + .textdiffignore)
 *
 * gitignore 문법 사용 (negation `!`, 디렉토리 매칭 등) — `ignore` 패키지 활용
 */
import * as fs from 'fs'
import * as path from 'path'
import ignore, { type Ignore } from 'ignore'

/**
 * 출처: RSD 25 FR-4 (엔지니어링 검토 v2 § 5.3)
 *  - .git: Git 메타데이터
 *  - node_modules / vendor / target / .gradle: 의존성 (재생성 가능)
 *  - dist / build / out / .next / .nuxt: 빌드 산출물 (재생성 가능)
 *  - __pycache__ / *.pyc: Python 캐시
 *  - *.log / *.tmp / .DS_Store / Thumbs.db: 환경별 임시 파일
 *  - .textdiff-snapshots: 자기 자신 (혹시 사용자가 프로젝트 안에 둔 경우)
 */
export const DEFAULT_EXCLUDES: string[] = [
  '.git/',
  'node_modules/',
  'dist/',
  'build/',
  'out/',
  '.next/',
  '.nuxt/',
  '__pycache__/',
  '*.pyc',
  'vendor/',
  'target/',
  '.gradle/',
  'gradle/',
  '*.log',
  '*.tmp',
  '.DS_Store',
  'Thumbs.db',
  '.textdiff-snapshots/',
  // Day 9 hotfix: project 모드의 기본 폴더명 — 자기 자신 제외
  'snapshots/',
]

const USER_IGNORE_FILENAME = '.textdiffignore'

export interface ExcludeMatcher {
  /** relpath (POSIX 슬래시) 가 제외 대상이면 true */
  shouldExclude(relpath: string): boolean
  /** 적용된 규칙 패턴 (디버그 / UI 표시용) */
  patterns: string[]
}

/**
 * 프로젝트 루트에서 매처 생성.
 * DEFAULT + `.textdiffignore` 파일 (있으면) 합쳐서 적용.
 */
export function createExcludeMatcher(projectRoot: string): ExcludeMatcher {
  const patterns = [...DEFAULT_EXCLUDES]

  const userIgnorePath = path.join(projectRoot, USER_IGNORE_FILENAME)
  if (fs.existsSync(userIgnorePath)) {
    try {
      const content = fs.readFileSync(userIgnorePath, 'utf8')
      const lines = parseIgnoreFile(content)
      patterns.push(...lines)
    } catch {
      // 읽기 실패 — 무시 (default 만 사용)
    }
  }

  const ig: Ignore = ignore().add(patterns)
  return {
    shouldExclude(relpath: string): boolean {
      // ignore 패키지는 빈 문자열 / 루트 자체를 거부함 → 직접 가드
      if (!relpath || relpath === '.' || relpath === '/') return false
      // 항상 POSIX 슬래시 + 앞 슬래시 없이
      const normalized = toRelposix(relpath)
      if (!normalized) return false
      return ig.ignores(normalized)
    },
    patterns,
  }
}

/**
 * .textdiffignore 한 줄씩 파싱:
 *  - 빈 줄 제거
 *  - `#` 으로 시작하는 주석 제거
 *  - 양쪽 공백 trim
 */
export function parseIgnoreFile(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
}

/**
 * Windows 백슬래시 + 선행 슬래시 정규화 → POSIX 형식.
 * `ignore` 패키지는 POSIX 만 받음.
 */
export function toRelposix(relpath: string): string {
  return relpath.replace(/\\/g, '/').replace(/^\/+/, '')
}
