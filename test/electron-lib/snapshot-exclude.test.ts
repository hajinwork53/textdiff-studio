import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  DEFAULT_EXCLUDES,
  createExcludeMatcher,
  parseIgnoreFile,
  toRelposix,
} from '../../electron/lib/snapshot-exclude'

describe('parseIgnoreFile', () => {
  it('빈 줄 + 주석 제외', () => {
    const r = parseIgnoreFile([
      '# 주석',
      '',
      'foo.log',
      '   ',
      '# 또 다른 주석',
      'dist/',
    ].join('\n'))
    expect(r).toEqual(['foo.log', 'dist/'])
  })

  it('CRLF 와 LF 모두 처리', () => {
    expect(parseIgnoreFile('a\r\nb\nc\r\n')).toEqual(['a', 'b', 'c'])
  })

  it('빈 입력 → 빈 배열', () => {
    expect(parseIgnoreFile('')).toEqual([])
  })
})

describe('toRelposix', () => {
  it('백슬래시 → 슬래시', () => {
    expect(toRelposix('src\\App.vue')).toBe('src/App.vue')
  })

  it('선행 슬래시 제거', () => {
    expect(toRelposix('/foo/bar')).toBe('foo/bar')
    expect(toRelposix('\\\\foo')).toBe('foo')
  })

  it('이미 정규화된 경로는 그대로', () => {
    expect(toRelposix('a/b/c')).toBe('a/b/c')
  })
})

describe('createExcludeMatcher — DEFAULT_EXCLUDES', () => {
  // 임시 폴더 (textdiffignore 없는 케이스)
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-exclude-'))

  it('.git 폴더 안 파일 제외', () => {
    const m = createExcludeMatcher(tmpRoot)
    expect(m.shouldExclude('.git/HEAD')).toBe(true)
    expect(m.shouldExclude('.git/objects/abc/def')).toBe(true)
  })

  it('node_modules 안 파일 제외', () => {
    const m = createExcludeMatcher(tmpRoot)
    expect(m.shouldExclude('node_modules/vue/package.json')).toBe(true)
    expect(m.shouldExclude('src/node_modules/x')).toBe(true) // nested 도 제외
  })

  it('dist / build / out 제외', () => {
    const m = createExcludeMatcher(tmpRoot)
    expect(m.shouldExclude('dist/index.html')).toBe(true)
    expect(m.shouldExclude('build/main.js')).toBe(true)
    expect(m.shouldExclude('out/x')).toBe(true)
  })

  it('Python __pycache__ + *.pyc 제외', () => {
    const m = createExcludeMatcher(tmpRoot)
    expect(m.shouldExclude('app/__pycache__/main.cpython.pyc')).toBe(true)
    expect(m.shouldExclude('foo.pyc')).toBe(true)
  })

  it('*.log / *.tmp 제외', () => {
    const m = createExcludeMatcher(tmpRoot)
    expect(m.shouldExclude('debug.log')).toBe(true)
    expect(m.shouldExclude('temp/x.tmp')).toBe(true)
  })

  it('.DS_Store / Thumbs.db 제외 (어디든)', () => {
    const m = createExcludeMatcher(tmpRoot)
    expect(m.shouldExclude('.DS_Store')).toBe(true)
    expect(m.shouldExclude('src/.DS_Store')).toBe(true)
    expect(m.shouldExclude('Thumbs.db')).toBe(true)
  })

  it('자기 자신 (snapshots / .textdiff-snapshots) 제외', () => {
    const m = createExcludeMatcher(tmpRoot)
    expect(m.shouldExclude('.textdiff-snapshots/foo.zip')).toBe(true)
    expect(m.shouldExclude('snapshots/2026-05-25.zip')).toBe(true)
    expect(m.shouldExclude('snapshots/manifest.json')).toBe(true)
  })

  it('정상 소스 파일은 통과', () => {
    const m = createExcludeMatcher(tmpRoot)
    expect(m.shouldExclude('src/App.vue')).toBe(false)
    expect(m.shouldExclude('package.json')).toBe(false)
    expect(m.shouldExclude('README.md')).toBe(false)
    expect(m.shouldExclude('docs/guide.md')).toBe(false)
  })

  it('Windows 백슬래시 경로도 정상 매칭', () => {
    const m = createExcludeMatcher(tmpRoot)
    expect(m.shouldExclude('node_modules\\vue\\index.js')).toBe(true)
    expect(m.shouldExclude('src\\App.vue')).toBe(false)
  })

  it('빈 / 루트 경로는 제외 안 함 (safe)', () => {
    const m = createExcludeMatcher(tmpRoot)
    expect(m.shouldExclude('')).toBe(false)
    expect(m.shouldExclude('.')).toBe(false)
    expect(m.shouldExclude('/')).toBe(false)
  })
})

describe('createExcludeMatcher — .textdiffignore 사용자 패턴', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-exclude-user-'))

  it('사용자 패턴 추가됨', () => {
    fs.writeFileSync(
      path.join(tmpRoot, '.textdiffignore'),
      ['# 비밀 파일', 'secrets/', '*.env'].join('\n'),
      'utf8',
    )
    const m = createExcludeMatcher(tmpRoot)
    expect(m.shouldExclude('secrets/api-key.txt')).toBe(true)
    expect(m.shouldExclude('.env')).toBe(true)
    expect(m.shouldExclude('production.env')).toBe(true)
    // DEFAULT 도 여전히 동작
    expect(m.shouldExclude('node_modules/x')).toBe(true)
    // 일반 파일 통과
    expect(m.shouldExclude('src/App.vue')).toBe(false)
  })

  it('사용자 패턴 — negation `!` (gitignore 호환)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-exclude-neg-'))
    fs.writeFileSync(
      path.join(dir, '.textdiffignore'),
      [
        '*.log',          // 모든 .log 제외
        '!important.log', // 단 important.log 는 다시 포함
      ].join('\n'),
      'utf8',
    )
    const m = createExcludeMatcher(dir)
    expect(m.shouldExclude('debug.log')).toBe(true)
    expect(m.shouldExclude('important.log')).toBe(false)
  })
})

describe('DEFAULT_EXCLUDES', () => {
  it('자기 자신 (snapshots / .textdiff-snapshots) 포함', () => {
    expect(DEFAULT_EXCLUDES).toContain('.textdiff-snapshots/')
    expect(DEFAULT_EXCLUDES).toContain('snapshots/')
  })

  it('주요 폴더 포함', () => {
    expect(DEFAULT_EXCLUDES).toContain('.git/')
    expect(DEFAULT_EXCLUDES).toContain('node_modules/')
    expect(DEFAULT_EXCLUDES).toContain('dist/')
  })
})
