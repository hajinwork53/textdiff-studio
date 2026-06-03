/**
 * Day 8.5: ripgrep 통합 — N1 출력 텍스트 → 코드 위치 역추적
 *
 * 보안 원칙:
 *  - 모든 사용자 입력은 spawn args 배열로만 전달 (셸 인젝션 차단)
 *  - 정규식은 rg 의 Rust regex (ReDoS 안전)
 *  - 결과는 cap (기본 500개) 으로 UI 보호
 */

import { spawn } from 'child_process'
import * as path from 'path'

export interface SearchHit {
  /** 절대경로 */
  path: string
  /** root 기준 상대 (POSIX 슬래시) */
  relpath: string
  /** 1-based */
  line: number
  /** 1-based */
  column: number
  /** 매치된 줄의 텍스트 (앞뒤 trim, 200자 cap) */
  text: string
}

export interface SearchOptions {
  query: string
  root: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  /** 예: ['*.vue', '*.ts'] — rg --glob 으로 전달 */
  fileGlobs?: string[]
  /** 기본 500. cap 도달 시 truncated=true */
  maxResults?: number
}

/** rg stderr 한 줄에서 잡아낸 액세스 실패 파일 1건 */
export interface SkippedFile {
  /** 파싱 가능했으면 절대경로, 아니면 원본 stderr 라인 */
  path: string
  /** "다른 프로세스가 파일을 사용 중..." 같은 OS 메시지 */
  reason: string
}

export interface SearchResult {
  ok: boolean
  hits?: SearchHit[]
  truncated?: boolean
  durationMs?: number
  /** 비치명적 에러로 skip 된 파일들 (잠긴 파일, 권한 없음 등) */
  skippedFiles?: SkippedFile[]
  /** 치명적 에러 (rg 바이너리 누락, 잘못된 정규식 등) — 이게 있으면 ok=false */
  error?: string
}

const DEFAULT_MAX = 500
const TEXT_CAP = 200

/**
 * 플랫폼별 @vscode/ripgrep 서브패키지명 + 바이너리명.
 *
 *   process.platform  process.arch   →  서브패키지                    바이너리
 *   ───────────────────────────────────────────────────────────────────────
 *   win32             x64            →  @vscode/ripgrep-win32-x64     rg.exe
 *   win32             arm64          →  @vscode/ripgrep-win32-arm64   rg.exe
 *   darwin            arm64          →  @vscode/ripgrep-darwin-arm64  rg   ← 타깃
 *   darwin            x64            →  @vscode/ripgrep-darwin-x64    rg
 *
 * @vscode/ripgrep 는 install 시 현재 플랫폼 서브패키지를 optionalDependencies 로 자동 설치.
 * DRY: resolveRgPath 의 1차/2차 경로가 모두 이 결과를 참조한다.
 */
export function rgSubpackage(): { pkg: string; bin: string } {
  const platform = process.platform // 'win32' | 'darwin' | 'linux'
  const arch = process.arch // 'x64' | 'arm64' | 'ia32' ...
  const bin = platform === 'win32' ? 'rg.exe' : 'rg'
  const pkg = `@vscode/ripgrep-${platform}-${arch}`
  return { pkg, bin }
}

/**
 * packed asar 내부 경로인가 (= spawn 불가). app.asar.unpacked 는 실제 파일이라 제외.
 *
 *   app.asar/node_modules/...        → packed (가상, spawn 실패)  → true
 *   app.asar.unpacked/node_modules/… → 실제 파일                 → false
 *   <dev node_modules>/…             → 실제 파일                 → false
 */
function isInsidePackedAsar(p: string): boolean {
  return p.includes(`app.asar${path.sep}`) || p.endsWith(`${path.sep}app.asar`)
}

/**
 * rg 바이너리 절대 경로 (플랫폼 자동 분기).
 *
 * dev 모드: require.resolve 로 node_modules 안(hoisted) 위치
 * packaged 모드 (electron-builder + asarUnpack):
 *   require.resolve 가 packed asar 가상 경로를 줄 수 있음(spawn 불가) → 실파일만 채택.
 *   npm hoisting 결과에 따라 바이너리가 top-level 또는 @vscode/ripgrep 하위(nested)에
 *   풀릴 수 있어, app.asar.unpacked 아래 두 위치를 모두 시도한다. (검증: 맥 .app 은 nested)
 */
export function resolveRgPath(): string {
  const { pkg, bin } = rgSubpackage()
  const pkgDir = pkg.replace('@vscode/', '') // 'ripgrep-darwin-arm64'
  const fs = require('fs')

  // 1차: require.resolve (dev + packaged 정상 케이스).
  // packed asar 가상 경로(spawn 불가)는 거르고, 실제 파일만 채택.
  try {
    const pkgJson = require.resolve(`${pkg}/package.json`)
    const candidate = path.join(path.dirname(pkgJson), 'bin', bin)
    if (fs.existsSync(candidate) && !isInsidePackedAsar(candidate)) return candidate
  } catch {
    // continue to fallback
  }

  // 2차: process.resourcesPath 기반 수동 fallback (packaged).
  // hoisted / nested 두 레이아웃을 모두 시도 → npm 호이스팅 차이에 강건.
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    const base = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', '@vscode')
    const candidates = [
      path.join(base, pkgDir, 'bin', bin), // hoisted: @vscode/ripgrep-<plat>-<arch>/bin/<bin>
      path.join(base, 'ripgrep', 'node_modules', '@vscode', pkgDir, 'bin', bin), // nested
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) return c
    }
  }

  throw new Error(
    `${bin} 위치를 찾을 수 없습니다. ripgrep 바이너리(${pkg})가 누락되었거나 ` +
      'asarUnpack 설정이 잘못되었습니다.',
  )
}

/**
 * rg --json 한 줄의 JSON 객체.
 * type: 'begin' | 'match' | 'end' | 'summary' (관심 있는 건 'match')
 */
interface RgJsonLine {
  type: string
  data?: {
    path?: { text: string } | { bytes: string }
    lines?: { text: string } | { bytes: string }
    line_number?: number
    submatches?: Array<{ start: number; end: number; match: { text?: string } }>
  }
}

/**
 * rg --json stream 한 줄을 파싱하여 SearchHit 변환 (match 가 아니면 null).
 * 픽스처 기반 unit 테스트 가능.
 */
export function parseRgJsonLine(line: string, root: string): SearchHit | null {
  if (!line || line.trim().length === 0) return null
  let obj: RgJsonLine
  try {
    obj = JSON.parse(line) as RgJsonLine
  } catch {
    return null
  }
  if (obj.type !== 'match' || !obj.data) return null

  const d = obj.data
  const absPath = pickText(d.path)
  const text = pickText(d.lines)
  const lineNum = d.line_number ?? 0
  if (!absPath || lineNum < 1) return null

  // 첫 submatch 의 start 를 컬럼으로 (1-based)
  const col = d.submatches && d.submatches[0] ? d.submatches[0].start + 1 : 1

  const relpath = toRelpathPosix(absPath, root)
  const trimmed = trimAndCap(text, TEXT_CAP)

  return {
    path: absPath,
    relpath,
    line: lineNum,
    column: col,
    text: trimmed,
  }
}

function pickText(field: { text: string } | { bytes: string } | undefined): string {
  if (!field) return ''
  if ('text' in field) return field.text
  if ('bytes' in field) {
    try {
      return Buffer.from(field.bytes, 'base64').toString('utf8')
    } catch {
      return ''
    }
  }
  return ''
}

function toRelpathPosix(absPath: string, root: string): string {
  const rel = path.relative(root, absPath)
  return rel.split(path.sep).join('/')
}

function trimAndCap(s: string, cap: number): string {
  const t = s.replace(/\r?\n$/, '')
  if (t.length <= cap) return t
  return t.substring(0, cap) + '…'
}

/**
 * rg stderr 라인을 SkippedFile 로 파싱. 인식 안 되는 줄은 null.
 *
 * 인식 패턴 (rg 의 표준 에러 출력):
 *   "rg: <path>: <message>"
 *   "rg: <path>: <message> (os error N)"
 *
 * 예:
 *   rg: D:\work\app\data.db: 다른 프로세스가 파일을 사용 중... (os error 32)
 *   rg: /root/secret: Permission denied (os error 13)
 */
export function parseRgStderrLine(line: string): SkippedFile | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('rg:')) return null
  // rg: <path>: <message>
  const m = trimmed.match(/^rg:\s+(.+?):\s+(.+)$/)
  if (!m) {
    return { path: '', reason: trimmed.replace(/^rg:\s*/, '') }
  }
  return { path: m[1], reason: m[2] }
}

/**
 * 사용자 옵션을 rg CLI 인자로 변환. 픽스처 테스트 가능.
 * pattern + root 는 마지막에 따로 push.
 */
export function buildRgArgs(opts: SearchOptions): string[] {
  const args = ['--json', '--no-heading', '--line-number', '--column']
  // 인코딩 — utf-8 강제 (한글 안전)
  args.push('--encoding=utf-8')
  if (!opts.caseSensitive) args.push('-i')
  if (opts.wholeWord) args.push('-w')
  if (!opts.regex) args.push('-F') // fixed-string mode
  if (opts.fileGlobs && opts.fileGlobs.length > 0) {
    for (const g of opts.fileGlobs) {
      args.push('--glob', g)
    }
  }
  // 결과 cap 보조 — UI 측에서도 자르지만 rg 도 일찍 끊기
  const max = opts.maxResults ?? DEFAULT_MAX
  args.push('--max-count', String(Math.max(1, max)))
  // pattern + root
  args.push('--', opts.query, opts.root)
  return args
}

/**
 * 검색 실행. rg --json stream 을 라인 단위 파싱 (메모리 안전).
 */
export async function searchText(opts: SearchOptions): Promise<SearchResult> {
  const start = Date.now()
  const maxResults = opts.maxResults ?? DEFAULT_MAX
  const rgPath = resolveRgPath()

  return new Promise((resolve) => {
    const args = buildRgArgs(opts)
    const child = spawn(rgPath, args, { windowsHide: true })

    const hits: SearchHit[] = []
    const skippedFiles: SkippedFile[] = []
    const skippedSeen = new Set<string>() // path dedup
    let truncated = false
    let buf = ''
    let errBuf = ''

    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      let nl: number
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.substring(0, nl)
        buf = buf.substring(nl + 1)
        if (hits.length >= maxResults) {
          truncated = true
          continue
        }
        const hit = parseRgJsonLine(line, opts.root)
        if (hit) {
          if (hits.length < maxResults) hits.push(hit)
          else truncated = true
        }
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      errBuf += chunk.toString('utf8')
      let nl: number
      while ((nl = errBuf.indexOf('\n')) !== -1) {
        const line = errBuf.substring(0, nl)
        errBuf = errBuf.substring(nl + 1)
        const skip = parseRgStderrLine(line)
        if (skip) {
          // 같은 파일 여러 번 보고되는 경우 한 번만
          const key = skip.path || skip.reason
          if (!skippedSeen.has(key)) {
            skippedSeen.add(key)
            skippedFiles.push(skip)
          }
        }
      }
    })

    child.on('error', (err) => {
      // spawn 자체가 실패 — rg 바이너리 없음
      resolve({ ok: false, error: `rg 실행 실패: ${err.message}` })
    })

    child.on('close', (code) => {
      // 마지막 버퍼 잔여 stderr 라인 처리 (개행 없이 끝난 경우)
      if (errBuf.trim().length > 0) {
        const skip = parseRgStderrLine(errBuf)
        if (skip) {
          const key = skip.path || skip.reason
          if (!skippedSeen.has(key)) skippedFiles.push(skip)
        }
      }
      // rg exit code:
      //   0 = 매치 있음, 1 = 매치 없음, 2 = 에러 (단, 일부 파일 매치는 stdout 에 있을 수 있음)
      // 우리 정책: hits 가 있거나 잠긴 파일만의 문제라면 success
      // 치명적 (잘못된 정규식 등) 은 error 메시지로 식별 — skip 으로 안 잡힌 stderr 라인이 있으면 그것을 에러로
      const isFatal = code === 2 && hits.length === 0 && skippedFiles.length === 0
      if (isFatal) {
        // 치명적: rg 가 결과 0건 + skip 0건 + 비정상 종료 → 진짜 에러
        resolve({
          ok: false,
          error: `rg exit code ${code}`,
          skippedFiles: skippedFiles.length > 0 ? skippedFiles : undefined,
        })
      } else {
        resolve({
          ok: true,
          hits,
          truncated,
          skippedFiles: skippedFiles.length > 0 ? skippedFiles : undefined,
          durationMs: Date.now() - start,
        })
      }
    })

    if (truncated) {
      // 이미 cap 도달 — kill 로 빨리 끝냄
      child.kill()
    }
  })
}
