import { describe, it, expect } from 'vitest'
import { buildRgArgs, parseRgJsonLine, parseRgStderrLine } from '../../electron/lib/ripgrep'

describe('buildRgArgs', () => {
  it('기본 옵션 (fixed-string, case-insensitive)', () => {
    const args = buildRgArgs({
      query: '회원가입',
      root: 'D:/proj',
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    })
    expect(args).toContain('--json')
    expect(args).toContain('--line-number')
    expect(args).toContain('--column')
    expect(args).toContain('-i')
    expect(args).toContain('-F') // fixed string
    expect(args).not.toContain('-w')
    // 마지막: pattern + root
    expect(args[args.length - 2]).toBe('회원가입')
    expect(args[args.length - 1]).toBe('D:/proj')
    expect(args[args.length - 3]).toBe('--')
  })

  it('대소문자 구분 + whole word + 정규식', () => {
    const args = buildRgArgs({
      query: 'foo.*bar',
      root: '/r',
      caseSensitive: true,
      wholeWord: true,
      regex: true,
    })
    expect(args).not.toContain('-i')
    expect(args).toContain('-w')
    expect(args).not.toContain('-F') // 정규식이면 fixed-string 제거
  })

  it('파일 글로브 다중', () => {
    const args = buildRgArgs({
      query: 'x',
      root: '/r',
      caseSensitive: false,
      wholeWord: false,
      regex: false,
      fileGlobs: ['*.vue', '*.ts'],
    })
    // --glob *.vue --glob *.ts 둘 다 있어야
    const globIdxs = args
      .map((a, i) => (a === '--glob' ? i : -1))
      .filter((i) => i >= 0)
    expect(globIdxs.length).toBe(2)
    expect(args[globIdxs[0] + 1]).toBe('*.vue')
    expect(args[globIdxs[1] + 1]).toBe('*.ts')
  })

  it('maxResults → --max-count', () => {
    const args = buildRgArgs({
      query: 'x',
      root: '/r',
      caseSensitive: false,
      wholeWord: false,
      regex: false,
      maxResults: 123,
    })
    const idx = args.indexOf('--max-count')
    expect(idx).toBeGreaterThan(-1)
    expect(args[idx + 1]).toBe('123')
  })
})

describe('parseRgJsonLine', () => {
  const root = 'D:\\proj'

  it('빈 줄 / 빈 문자열 → null', () => {
    expect(parseRgJsonLine('', root)).toBeNull()
    expect(parseRgJsonLine('   ', root)).toBeNull()
  })

  it('JSON 파싱 실패 → null', () => {
    expect(parseRgJsonLine('not json', root)).toBeNull()
  })

  it('begin/end/summary type → null', () => {
    expect(parseRgJsonLine(JSON.stringify({ type: 'begin', data: {} }), root)).toBeNull()
    expect(parseRgJsonLine(JSON.stringify({ type: 'end', data: {} }), root)).toBeNull()
    expect(parseRgJsonLine(JSON.stringify({ type: 'summary', data: {} }), root)).toBeNull()
  })

  it('match 정상 파싱 — text 형식', () => {
    const line = JSON.stringify({
      type: 'match',
      data: {
        path: { text: 'D:\\proj\\src\\App.vue' },
        lines: { text: '  const msg = "회원가입 완료"\n' },
        line_number: 42,
        submatches: [{ start: 18, end: 22, match: { text: '회원' } }],
      },
    })
    const hit = parseRgJsonLine(line, root)
    expect(hit).not.toBeNull()
    expect(hit!.path).toBe('D:\\proj\\src\\App.vue')
    expect(hit!.relpath).toBe('src/App.vue') // POSIX 슬래시
    expect(hit!.line).toBe(42)
    expect(hit!.column).toBe(19) // 18 + 1 (1-based)
    expect(hit!.text).toBe('  const msg = "회원가입 완료"') // trailing \n 제거
  })

  it('text 너무 길면 200자 + … 로 cap', () => {
    const longText = 'a'.repeat(300)
    const line = JSON.stringify({
      type: 'match',
      data: {
        path: { text: 'D:\\proj\\a.ts' },
        lines: { text: longText },
        line_number: 1,
        submatches: [{ start: 0, end: 1, match: { text: 'a' } }],
      },
    })
    const hit = parseRgJsonLine(line, root)
    expect(hit!.text.endsWith('…')).toBe(true)
    expect(hit!.text.length).toBe(201)
  })

  it('bytes (base64) 형식도 지원', () => {
    const pathBytes = Buffer.from('D:\\proj\\a.ts', 'utf8').toString('base64')
    const linesBytes = Buffer.from('hello world', 'utf8').toString('base64')
    const line = JSON.stringify({
      type: 'match',
      data: {
        path: { bytes: pathBytes },
        lines: { bytes: linesBytes },
        line_number: 1,
        submatches: [{ start: 0, end: 5, match: { text: 'hello' } }],
      },
    })
    const hit = parseRgJsonLine(line, root)
    expect(hit!.path).toBe('D:\\proj\\a.ts')
    expect(hit!.text).toBe('hello world')
  })

  it('submatches 없으면 column=1 fallback', () => {
    const line = JSON.stringify({
      type: 'match',
      data: {
        path: { text: 'D:\\proj\\a.ts' },
        lines: { text: 'x' },
        line_number: 5,
      },
    })
    const hit = parseRgJsonLine(line, root)
    expect(hit!.column).toBe(1)
  })

  it('line_number 0 → null (잘못된 매치)', () => {
    const line = JSON.stringify({
      type: 'match',
      data: {
        path: { text: 'D:\\proj\\a.ts' },
        lines: { text: 'x' },
        line_number: 0,
      },
    })
    expect(parseRgJsonLine(line, root)).toBeNull()
  })
})

describe('parseRgStderrLine', () => {
  it('잠긴 파일 (os error 32) — 한국어 메시지', () => {
    const line =
      'rg: D:\\work\\app\\data\\locked.db: 다른 프로세스가 파일을 사용 중이기 때문에 프로세스가 액세스 할 수 없습니다. (os error 32)'
    const r = parseRgStderrLine(line)
    expect(r).not.toBeNull()
    expect(r!.path).toBe('D:\\work\\app\\data\\locked.db')
    expect(r!.reason).toContain('다른 프로세스')
    expect(r!.reason).toContain('os error 32')
  })

  it('Permission denied (영문)', () => {
    const r = parseRgStderrLine('rg: /root/secret.txt: Permission denied (os error 13)')
    expect(r).not.toBeNull()
    expect(r!.path).toBe('/root/secret.txt')
    expect(r!.reason).toBe('Permission denied (os error 13)')
  })

  it('rg: 로 시작하지만 path: 형식 아니면 path 빈 + reason 전체', () => {
    const r = parseRgStderrLine('rg: invalid regex pattern')
    expect(r).not.toBeNull()
    expect(r!.path).toBe('')
    expect(r!.reason).toBe('invalid regex pattern')
  })

  it('rg: 로 시작 안 하면 null (관심 없는 출력)', () => {
    expect(parseRgStderrLine('some random output')).toBeNull()
    expect(parseRgStderrLine('')).toBeNull()
    expect(parseRgStderrLine('   ')).toBeNull()
  })

  it('앞뒤 공백 무시', () => {
    const r = parseRgStderrLine('  rg: /a/b: error msg  ')
    expect(r!.path).toBe('/a/b')
    expect(r!.reason).toBe('error msg')
  })
})
