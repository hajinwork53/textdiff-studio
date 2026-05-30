#!/usr/bin/env node
/**
 * Day 8: textdiff CLI 진입점
 *
 * 동작:
 *  - --help / --version: stdout 후 즉시 종료 (Electron 안 띄움)
 *  - 그 외: Electron 을 spawn 하고 사용자 인자를 `--` 뒤에 전달
 *
 * dev 모드 호출: `node dist-cli/textdiff.js <args>`
 * (packaged 모드 — Day 10 에서 별도 처리)
 */

import { spawn } from 'child_process'
import * as path from 'path'
import { parseCliArgs, HELP_TEXT, type CliPayload } from './parse'

// package.json 의 version 을 빌드 시점에 inline (esbuild --define)
declare const __TEXTDIFF_VERSION__: string
const VERSION = typeof __TEXTDIFF_VERSION__ !== 'undefined' ? __TEXTDIFF_VERSION__ : '0.0.0-dev'

function main(): number {
  const args = process.argv.slice(2)
  const parsed = parseCliArgs(args)

  if (parsed.command === 'help') {
    process.stdout.write(HELP_TEXT)
    return 0
  }
  if (parsed.command === 'version') {
    process.stdout.write(`TextDiff Studio ${VERSION}\n`)
    return 0
  }

  // command === 'launch' — Electron 실행
  // 파싱 에러가 있어도 일단 Electron 띄움 (앱이 토스트로 알려주기 위해)
  const electronBin = resolveElectronBin()
  if (!electronBin) {
    process.stderr.write(
      'Electron 바이너리를 찾을 수 없습니다. `npm install` 후 다시 시도하세요.\n',
    )
    return 1
  }

  const projectRoot = path.resolve(__dirname, '..')

  // path 위치만 cwd 기준 절대경로로 변환 → ref(브랜치명 등)는 그대로
  const resolvedArgs = resolveArgs(args, parsed.payload)
  const electronArgs = [projectRoot, '--', ...resolvedArgs]

  const child = spawn(electronBin, electronArgs, {
    stdio: 'ignore',
    detached: true,
    windowsHide: false,
  })
  child.unref()
  return 0
}

function resolveElectronBin(): string | null {
  try {
    const electronPath = require('electron') as unknown
    if (typeof electronPath === 'string') return electronPath
    return null
  } catch {
    return null
  }
}

/**
 * payload 의 의미를 알고 path 위치만 cwd 기준 절대경로로 변환.
 * 모르는 케이스 (에러 / launch only) 는 그대로 전달.
 */
function resolveArgs(rawArgs: string[], payload: CliPayload | undefined): string[] {
  if (!payload) return rawArgs

  const cwd = process.cwd()
  const r = (p: string) => path.resolve(cwd, p)

  switch (payload.kind) {
    case 'files':
      // rawArgs 의 위치 인자 2개가 파일
      return rawArgs.map((a) => (a.startsWith('--') ? a : r(a)))
    case 'git-working':
      // --git-working [path]
      // 첫 토큰 --git-working, 그 외 위치 인자 (있다면) 가 path
      return rawArgs.map((a, i) => {
        if (i === 0 || a.startsWith('--')) return a
        return r(a)
      })
    case 'git-commits':
    case 'git-branches': {
      // --git-commits A B path → A, B 는 ref (변환 X), path 만 변환
      // 위치 인자 (플래그 제외) 중 3번째만 r() 적용
      let posIdx = 0
      return rawArgs.map((a) => {
        if (a.startsWith('--')) return a
        posIdx += 1
        return posIdx === 3 ? r(a) : a
      })
    }
  }
}

process.exit(main())
