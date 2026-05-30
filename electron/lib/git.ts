/**
 * Git 통합 — simple-git 래퍼
 * 출처: 19 Day7 RSD FR-1
 *
 * 보안 원칙:
 *  - READ-ONLY: commit, push, reset, clone, init, remote add 등 절대 호출 X
 *  - status, log, branch, show, diff 만 사용
 */

import { simpleGit, type SimpleGit } from 'simple-git'
import * as fs from 'fs'
import * as path from 'path'

export interface GitDetectResult {
  installed: boolean
  version?: string
  error?: string
}

export interface CommitInfo {
  hash: string
  hashShort: string
  message: string
  authorName: string
  authorEmail: string
  date: string // ISO
  relativeDate: string // '2 hours ago'
}

export interface BranchInfo {
  name: string
  isCurrent: boolean
  isRemote: boolean
}

export type FileStatus =
  | 'added' // staged add
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'untracked' // git add 한 번도 안 함 (신규 파일)
  | 'unknown'

export interface ChangedFile {
  relpath: string
  status: FileStatus
  /** renamed 의 경우 이전 경로 */
  oldRelpath?: string
}

/**
 * Git CLI 설치 여부 + 버전
 * Windows: where git → PATH 검색
 */
export async function detectGit(): Promise<GitDetectResult> {
  try {
    const git = simpleGit()
    // simple-git 의 raw 명령으로 버전 검사 (작업 폴더 무관)
    const result = await git.raw(['--version'])
    const match = result.match(/git version ([\d.]+)/)
    return {
      installed: true,
      version: match ? match[1] : 'unknown',
    }
  } catch (e) {
    return {
      installed: false,
      error: (e as Error).message,
    }
  }
}

/**
 * 폴더가 git repo 인지 (작업 디렉토리 또는 상위 .git 검색)
 */
export async function isRepoFolder(folderPath: string): Promise<boolean> {
  try {
    if (!fs.existsSync(folderPath)) return false
    const git = simpleGit(folderPath)
    const result = await git.checkIsRepo()
    return result === true
  } catch {
    return false
  }
}

/**
 * 폴더에서 git repo 루트 찾기 (.git 디렉토리 보유한 상위)
 */
export async function findRepoRoot(startPath: string): Promise<string | null> {
  try {
    if (!fs.existsSync(startPath)) return null
    const git = simpleGit(startPath)
    const isRepo = await git.checkIsRepo()
    if (!isRepo) return null
    const root = await git.revparse(['--show-toplevel'])
    return root.trim().replace(/\//g, path.sep)
  } catch {
    return null
  }
}

/**
 * 한국어 시간 (X분 전, X시간 전, X일 전, X달 전, X년 전)
 */
function toRelativeDate(isoDate: string): string {
  const date = new Date(isoDate)
  const diffMs = Date.now() - date.getTime()
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}초 전`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}일 전`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}달 전`
  const years = Math.floor(days / 365)
  return `${years}년 전`
}

/**
 * 커밋 목록 (페이지네이션)
 */
export async function listCommits(
  repoPath: string,
  options: { branch?: string; limit?: number; offset?: number } = {},
): Promise<CommitInfo[]> {
  const limit = options.limit ?? 100
  const offset = options.offset ?? 0
  const git = simpleGit(repoPath).env({ LANG: 'C.UTF-8' })

  const args: string[] = []
  if (options.branch) args.push(options.branch)
  args.push(`--max-count=${limit}`, `--skip=${offset}`)

  const log = await git.log(args)
  return log.all.map((c) => ({
    hash: c.hash,
    hashShort: c.hash.substring(0, 7),
    message: c.message,
    authorName: c.author_name,
    authorEmail: c.author_email,
    date: c.date,
    relativeDate: toRelativeDate(c.date),
  }))
}

/**
 * 브랜치 목록 (현재 브랜치 표시)
 */
export async function listBranches(repoPath: string): Promise<{
  branches: BranchInfo[]
  current: string | null
  isDetached: boolean
}> {
  const git = simpleGit(repoPath).env({ LANG: 'C.UTF-8' })
  const summary = await git.branch(['-a'])

  const isDetached = summary.detached
  const current = isDetached ? null : summary.current

  const branches: BranchInfo[] = Object.keys(summary.branches).map((name) => {
    const isRemote = name.startsWith('remotes/')
    const cleanName = isRemote ? name.replace(/^remotes\//, '') : name
    return {
      name: cleanName,
      isCurrent: name === summary.current,
      isRemote,
    }
  })

  return { branches, current, isDetached }
}

/**
 * 특정 ref 의 파일 내용
 * ref 가 'WORKING' 이면 작업 디렉토리의 실제 파일 읽기 (이 함수가 호출되지 않도록 main 에서 분기 권장)
 */
export async function readFileAtRef(
  repoPath: string,
  ref: string,
  relpath: string,
): Promise<string> {
  const git = simpleGit(repoPath).env({ LANG: 'C.UTF-8' })
  // git show ref:path
  // simple-git 은 show() 사용
  const normalizedPath = relpath.replace(/\\/g, '/')
  const content = await git.show([`${ref}:${normalizedPath}`])
  return content
}

/**
 * 두 ref 간 변경된 파일 목록 (또는 HEAD vs Working Dir)
 *
 * refA = null, refB = null: HEAD vs working dir
 *   → git status --porcelain 사용 (tracked + untracked 모두 포함)
 * refA, refB: 두 커밋/브랜치 비교
 *   → git diff --name-status 사용 (tracked 만, untracked 는 그 ref 안에 없음)
 */
export async function diffFiles(
  repoPath: string,
  refA: string | null,
  refB: string | null,
): Promise<ChangedFile[]> {
  const git = simpleGit(repoPath).env({ LANG: 'C.UTF-8' })

  if (refA === null && refB === null) {
    // HEAD vs working dir — status --porcelain 으로 untracked 포함
    const output = await git.raw(['status', '--porcelain'])
    return parsePorcelain(output)
  }
  if (refA && refB) {
    const output = await git.diff(['--name-status', refA, refB])
    return parseNameStatus(output)
  }
  throw new Error('refA 와 refB 모두 지정하거나 모두 null 이어야 합니다.')
}

/**
 * git diff --name-status 출력 파싱
 *   A   path/to/added.txt
 *   M   path/to/modified.txt
 *   D   path/to/deleted.txt
 *   R100  old/path	new/path
 */
/**
 * git status --porcelain 출력 파싱
 *   ' M  path'    → tracked modified (worktree)
 *   'M   path'    → tracked modified (staged)
 *   'A   path'    → staged add
 *   ' D  path'    → deleted (worktree)
 *   '?? path'     → untracked
 *   'R  old -> new' → renamed
 *
 * 한 파일이 staged + worktree 양쪽 표시될 수 있음 — 한 번만 카운트.
 */
function parsePorcelain(output: string): ChangedFile[] {
  const seen = new Set<string>()
  const result: ChangedFile[] = []
  const lines = output.split('\n').filter((l) => l.length > 0)

  for (const rawLine of lines) {
    // 형식: XY␣path   (X=staged, Y=worktree, ␣=space, path=경로)
    if (rawLine.length < 3) continue
    const x = rawLine[0]
    const y = rawLine[1]
    const rest = rawLine.substring(3)

    if (x === '?' && y === '?') {
      // untracked
      if (seen.has(rest)) continue
      seen.add(rest)
      result.push({ status: 'untracked', relpath: rest })
      continue
    }

    if (x === 'R' || y === 'R') {
      // renamed: 'old -> new'
      const arrowIdx = rest.indexOf(' -> ')
      if (arrowIdx > 0) {
        const oldPath = rest.substring(0, arrowIdx)
        const newPath = rest.substring(arrowIdx + 4)
        if (!seen.has(newPath)) {
          seen.add(newPath)
          result.push({ status: 'renamed', relpath: newPath, oldRelpath: oldPath })
        }
        continue
      }
    }

    // 일반 케이스: x 또는 y 중 우선순위
    let status: FileStatus = 'unknown'
    const code = (x !== ' ' && x !== '?') ? x : y
    switch (code) {
      case 'A': status = 'added'; break
      case 'M': status = 'modified'; break
      case 'D': status = 'deleted'; break
      case 'C': status = 'added'; break // copied
      case 'T': status = 'modified'; break // type changed
      default: status = 'unknown'
    }
    if (seen.has(rest)) continue
    seen.add(rest)
    result.push({ status, relpath: rest })
  }

  // 가독성: untracked 를 뒤로
  result.sort((a, b) => {
    if (a.status === 'untracked' && b.status !== 'untracked') return 1
    if (a.status !== 'untracked' && b.status === 'untracked') return -1
    return a.relpath.localeCompare(b.relpath)
  })

  return result
}

function parseNameStatus(output: string): ChangedFile[] {
  const result: ChangedFile[] = []
  const lines = output.split('\n').filter((l) => l.trim().length > 0)
  for (const line of lines) {
    const parts = line.split('\t').filter((p) => p.length > 0)
    if (parts.length < 2) continue
    const code = parts[0][0]
    let status: FileStatus
    switch (code) {
      case 'A': status = 'added'; break
      case 'M': status = 'modified'; break
      case 'D': status = 'deleted'; break
      case 'R': status = 'renamed'; break
      default: status = 'unknown'
    }
    if (status === 'renamed' && parts.length >= 3) {
      result.push({ status, oldRelpath: parts[1], relpath: parts[2] })
    } else {
      result.push({ status, relpath: parts[1] })
    }
  }
  return result
}
