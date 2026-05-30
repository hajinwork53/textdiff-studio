import { describe, it, expect } from 'vitest'
import * as iconv from 'iconv-lite'
import { decodeBuffer, SUPPORTED_ENCODINGS } from '../../electron/lib/encoding'

describe('decodeBuffer', () => {
  it('UTF-8 영문', () => {
    const buf = Buffer.from('Hello, World', 'utf-8')
    const result = decodeBuffer(buf)
    expect(result.content).toBe('Hello, World')
    expect(['UTF-8', 'ASCII']).toContain(result.encoding)
    expect(result.hadBom).toBe(false)
  })

  it('UTF-8 한글', () => {
    const buf = Buffer.from('안녕하세요\n한글 테스트입니다', 'utf-8')
    const result = decodeBuffer(buf)
    expect(result.content).toBe('안녕하세요\n한글 테스트입니다')
    expect(result.encoding).toBe('UTF-8')
  })

  it('CP949 한글', () => {
    const original = '안녕하세요\n한글 인코딩 테스트입니다'
    const buf = iconv.encode(original, 'EUC-KR')
    const result = decodeBuffer(buf)
    expect(result.content).toBe(original)
    expect(['EUC-KR', 'CP949']).toContain(result.encoding)
  })

  it('UTF-8 + BOM 자동 제거', () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf])
    const text = Buffer.from('Hello with BOM', 'utf-8')
    const buf = Buffer.concat([bom, text])
    const result = decodeBuffer(buf)
    expect(result.content).toBe('Hello with BOM') // BOM 제거됨
    expect(result.hadBom).toBe(true)
  })

  it('빈 buffer → 빈 string', () => {
    const result = decodeBuffer(Buffer.alloc(0))
    expect(result.content).toBe('')
    expect(result.encoding).toBe('UTF-8')
    expect(result.confidence).toBe(1)
    expect(result.hadBom).toBe(false)
  })

  it('forceEncoding 적용', () => {
    const original = '안녕'
    const buf = iconv.encode(original, 'EUC-KR')
    const result = decodeBuffer(buf, 'EUC-KR')
    expect(result.content).toBe(original)
    expect(result.encoding).toBe('EUC-KR')
    expect(result.confidence).toBe(1)
  })

  it('forceEncoding 잘못된 값 → UTF-8 fallback', () => {
    const buf = Buffer.from('Hello', 'utf-8')
    const result = decodeBuffer(buf, 'INVALID-ENCODING-XYZ')
    // iconv 가 지원 안 하면 UTF-8 fallback
    expect(result.encoding).toBe('UTF-8')
  })

  it('SUPPORTED_ENCODINGS 모두 iconv-lite 지원', () => {
    for (const enc of SUPPORTED_ENCODINGS) {
      expect(iconv.encodingExists(enc)).toBe(true)
    }
  })
})
