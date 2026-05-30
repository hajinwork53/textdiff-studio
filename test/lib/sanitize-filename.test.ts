import { describe, it, expect } from 'vitest'
import { sanitizeFilename, basenameWithoutExt } from '../../src/lib/sanitize-filename'

describe('sanitizeFilename', () => {
  it('정상 파일명 유지', () => {
    expect(sanitizeFilename('hello.md')).toBe('hello.md')
  })

  it('Windows 금지 문자 치환', () => {
    expect(sanitizeFilename('a<b>c:d"e/f\\g|h?i*j.md')).toBe('a_b_c_d_e_f_g_h_i_j.md')
  })

  it('연속 underscore 합침', () => {
    expect(sanitizeFilename('hello////world.md')).toBe('hello_world.md')
  })

  it('한글 유지', () => {
    expect(sanitizeFilename('한글파일.md')).toBe('한글파일.md')
  })

  it('한글 + 금지문자 치환', () => {
    expect(sanitizeFilename('한글:파일/v2.md')).toBe('한글_파일_v2.md')
  })

  it('빈 문자열 → fallback', () => {
    expect(sanitizeFilename('')).toBe('untitled')
    expect(sanitizeFilename('', 'custom')).toBe('custom')
  })

  it('금지문자만 → fallback', () => {
    expect(sanitizeFilename('///')).toBe('untitled')
  })

  it('Windows 예약어 회피', () => {
    expect(sanitizeFilename('CON.md')).toBe('_CON.md')
    expect(sanitizeFilename('NUL.txt')).toBe('_NUL.txt')
    expect(sanitizeFilename('aux.log')).toBe('_aux.log')
  })

  it('양끝 공백/점 제거', () => {
    expect(sanitizeFilename('  hello.md  ')).toBe('hello.md')
    expect(sanitizeFilename('...hello...')).toBe('hello')
  })

  it('255자 초과 시 잘림 (확장자 보존)', () => {
    const long = 'a'.repeat(300) + '.md'
    const result = sanitizeFilename(long)
    expect(result.length).toBeLessThanOrEqual(255)
    expect(result.endsWith('.md')).toBe(true)
  })
})

describe('basenameWithoutExt', () => {
  it('Windows 경로', () => {
    expect(basenameWithoutExt('D:\\proj\\file.html')).toBe('file')
  })

  it('Unix 경로', () => {
    expect(basenameWithoutExt('/home/user/file.py')).toBe('file')
  })

  it('확장자 여러 개 — 마지막만 제거', () => {
    expect(basenameWithoutExt('D:\\file.tar.gz')).toBe('file.tar')
  })

  it('확장자 없음', () => {
    expect(basenameWithoutExt('D:\\Makefile')).toBe('Makefile')
  })

  it('한글 파일명', () => {
    expect(basenameWithoutExt('D:\\한글.md')).toBe('한글')
  })
})
