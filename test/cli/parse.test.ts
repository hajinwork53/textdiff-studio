import { describe, it, expect } from 'vitest'
import { parseCliArgs } from '../../cli/parse'

describe('parseCliArgs', () => {
  it('인자 없음 → launch (payload 없음)', () => {
    const r = parseCliArgs([])
    expect(r.command).toBe('launch')
    expect(r.payload).toBeUndefined()
    expect(r.errors).toEqual([])
  })

  it('--help → help', () => {
    expect(parseCliArgs(['--help']).command).toBe('help')
    expect(parseCliArgs(['-h']).command).toBe('help')
  })

  it('--version → version', () => {
    expect(parseCliArgs(['--version']).command).toBe('version')
    expect(parseCliArgs(['-v']).command).toBe('version')
  })

  it('두 파일 → files payload', () => {
    const r = parseCliArgs(['a.txt', 'b.txt'])
    expect(r.command).toBe('launch')
    expect(r.payload).toEqual({ kind: 'files', fileA: 'a.txt', fileB: 'b.txt' })
    expect(r.errors).toEqual([])
  })

  it('파일 1개 → 에러', () => {
    const r = parseCliArgs(['a.txt'])
    expect(r.command).toBe('launch')
    expect(r.payload).toBeUndefined()
    expect(r.errors.length).toBe(1)
    expect(r.errors[0]).toContain('파일 2개')
  })

  it('파일 3개 → 에러', () => {
    const r = parseCliArgs(['a.txt', 'b.txt', 'c.txt'])
    expect(r.errors[0]).toContain('정확히 2개')
  })

  it('--git-working (path 없음)', () => {
    const r = parseCliArgs(['--git-working'])
    expect(r.payload).toEqual({ kind: 'git-working', relpath: undefined })
    expect(r.errors).toEqual([])
  })

  it('--git-working <path>', () => {
    const r = parseCliArgs(['--git-working', 'src/main.py'])
    expect(r.payload).toEqual({ kind: 'git-working', relpath: 'src/main.py' })
  })

  it('--git-working path1 path2 → 에러', () => {
    const r = parseCliArgs(['--git-working', 'a', 'b'])
    expect(r.errors[0]).toContain('--git-working')
  })

  it('--git-commits <A> <B> <path>', () => {
    const r = parseCliArgs(['--git-commits', 'HEAD~3', 'HEAD', 'src/main.py'])
    expect(r.payload).toEqual({
      kind: 'git-commits',
      refA: 'HEAD~3',
      refB: 'HEAD',
      relpath: 'src/main.py',
    })
  })

  it('--git-commits 인자 부족 → 에러', () => {
    const r = parseCliArgs(['--git-commits', 'HEAD~3', 'HEAD'])
    expect(r.errors[0]).toContain('--git-commits')
  })

  it('--git-branches <A> <B> <path>', () => {
    const r = parseCliArgs(['--git-branches', 'main', 'feature/login', 'src/auth.ts'])
    expect(r.payload).toEqual({
      kind: 'git-branches',
      refA: 'main',
      refB: 'feature/login',
      relpath: 'src/auth.ts',
    })
  })

  it('알 수 없는 플래그 → 에러', () => {
    const r = parseCliArgs(['--unknown-flag', 'foo'])
    expect(r.errors[0]).toContain('알 수 없는')
  })

  it('git-branches 의 ref 가 슬래시 포함해도 정상', () => {
    const r = parseCliArgs(['--git-branches', 'origin/main', 'feature/x', 'src/a.ts'])
    expect(r.payload).toMatchObject({
      kind: 'git-branches',
      refA: 'origin/main',
      refB: 'feature/x',
    })
  })
})
