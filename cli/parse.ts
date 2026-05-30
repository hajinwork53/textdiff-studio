/**
 * Day 8: CLI 인자 파서 (pure 함수 — 테스트 가능)
 *
 * 지원 명령:
 *   textdiff                                       → launch (FilePicker)
 *   textdiff <fileA> <fileB>                       → 두 파일 비교
 *   textdiff --git-working [path]                  → 현재 변경 (path 생략 시 모달)
 *   textdiff --git-commits <refA> <refB> <path>    → 두 커밋 + 파일
 *   textdiff --git-branches <refA> <refB> <path>   → 두 브랜치 + 파일
 *   textdiff --help                                → 도움말 (stdout 후 종료)
 *   textdiff --version                             → 버전 (stdout 후 종료)
 */

export type CliCommand = 'help' | 'version' | 'launch'

export interface FilesPayload {
  kind: 'files'
  fileA: string
  fileB: string
}

export interface GitWorkingPayload {
  kind: 'git-working'
  /** 작업 디렉토리 (생략 시 process.cwd()) */
  repoPath?: string
  /** 비교할 단일 파일 (생략 시 모달에서 선택) */
  relpath?: string
}

export interface GitRefsPayload {
  kind: 'git-commits' | 'git-branches'
  refA: string
  refB: string
  relpath: string
  /** 생략 시 process.cwd() */
  repoPath?: string
}

export type CliPayload = FilesPayload | GitWorkingPayload | GitRefsPayload

export interface CliArgs {
  command: CliCommand
  payload?: CliPayload
  errors: string[]
}

/**
 * 인자 파싱. 호출자는 `argv.slice(2)` (Node 표준) 또는 Electron 의 user-arg 만 넘김.
 */
export function parseCliArgs(args: string[]): CliArgs {
  const errors: string[] = []

  if (args.length === 0) {
    return { command: 'launch', errors }
  }

  if (args[0] === '--help' || args[0] === '-h') {
    return { command: 'help', errors }
  }
  if (args[0] === '--version' || args[0] === '-v') {
    return { command: 'version', errors }
  }

  if (args[0] === '--git-working') {
    // path 0 또는 1개 허용
    const rest = args.slice(1).filter((a) => !a.startsWith('--'))
    if (rest.length > 1) {
      errors.push(`--git-working 는 path 인자 0 또는 1개 (받음: ${rest.length})`)
      return { command: 'launch', errors }
    }
    return {
      command: 'launch',
      payload: { kind: 'git-working', relpath: rest[0] },
      errors,
    }
  }

  if (args[0] === '--git-commits' || args[0] === '--git-branches') {
    const flag = args[0]
    const rest = args.slice(1).filter((a) => !a.startsWith('--'))
    if (rest.length !== 3) {
      errors.push(`${flag} 는 <refA> <refB> <path> 정확히 3 인자 (받음: ${rest.length})`)
      return { command: 'launch', errors }
    }
    return {
      command: 'launch',
      payload: {
        kind: flag === '--git-commits' ? 'git-commits' : 'git-branches',
        refA: rest[0],
        refB: rest[1],
        relpath: rest[2],
      },
      errors,
    }
  }

  // 위치 인자만 있는 케이스 → 파일 비교
  const positional = args.filter((a) => !a.startsWith('--'))
  const unknownFlags = args.filter((a) => a.startsWith('--'))
  if (unknownFlags.length > 0) {
    errors.push(`알 수 없는 플래그: ${unknownFlags.join(', ')}`)
    return { command: 'launch', errors }
  }

  if (positional.length === 2) {
    return {
      command: 'launch',
      payload: { kind: 'files', fileA: positional[0], fileB: positional[1] },
      errors,
    }
  }

  errors.push(
    positional.length < 2
      ? `파일 2개가 필요합니다 (받음: ${positional.length}). --help 참고.`
      : `파일은 정확히 2개여야 합니다 (받음: ${positional.length}). --help 참고.`,
  )
  return { command: 'launch', errors }
}

export const HELP_TEXT = `TextDiff Studio — AI 코딩 검증 워크벤치

사용법:
  textdiff                          GUI 실행 (FilePicker)
  textdiff <fileA> <fileB>          두 파일 즉시 비교
  textdiff --git-working [path]     현재 변경 사항 (path 생략 시 모달)
  textdiff --git-commits <A> <B> <path>
  textdiff --git-branches <A> <B> <path>
  textdiff --help                   이 도움말
  textdiff --version                버전 출력

예시:
  textdiff old.py new.py
  textdiff --git-working src/main.py
  textdiff --git-commits HEAD~3 HEAD src/main.py
  textdiff --git-branches main feature/login src/auth.ts
`
