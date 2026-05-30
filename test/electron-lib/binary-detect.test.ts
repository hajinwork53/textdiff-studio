import { describe, it, expect } from 'vitest'
import { isBinary, isBinaryByExtension } from '../../electron/lib/binary-detect'

describe('isBinary', () => {
  it('영문 텍스트 → false', () => {
    const buf = Buffer.from('Hello, World!\nThis is a text file.', 'utf-8')
    expect(isBinary(buf)).toBe(false)
  })

  it('한글 UTF-8 → false (null byte 없음)', () => {
    const buf = Buffer.from('안녕하세요\n한글 테스트', 'utf-8')
    expect(isBinary(buf)).toBe(false)
  })

  it('빈 buffer → false (텍스트로 간주)', () => {
    expect(isBinary(Buffer.alloc(0))).toBe(false)
  })

  it('null byte 5% 초과 → true', () => {
    // 100 bytes 중 10 개 null (10%)
    const buf = Buffer.alloc(100, 0x41) // 'A' 로 채움
    for (let i = 0; i < 10; i++) buf[i * 10] = 0
    expect(isBinary(buf)).toBe(true)
  })

  it('null byte 5% 정확히 → true', () => {
    // 100 bytes 중 5 개 null (5%) — 임계값과 같음 (>= 5%)
    const buf = Buffer.alloc(100, 0x41)
    for (let i = 0; i < 5; i++) buf[i * 20] = 0
    expect(isBinary(buf)).toBe(true)
  })

  it('null byte 5% 미만 → false', () => {
    // 100 bytes 중 4 개 null (4%)
    const buf = Buffer.alloc(100, 0x41)
    for (let i = 0; i < 4; i++) buf[i * 25] = 0
    expect(isBinary(buf)).toBe(false)
  })

  it('UTF-16LE 표준 텍스트 → true (null byte 많음)', () => {
    // 영문은 UTF-16LE 에서 짝수 바이트가 0 → 50% null
    const buf = Buffer.from('Hello, World', 'utf16le')
    expect(isBinary(buf)).toBe(true) // UTF-16 는 의도적으로 바이너리로 잡힘
  })

  it('PNG signature 시뮬 (null byte 많음) → true', () => {
    // PNG 시작은 \x89PNG\r\n\x1a\n + 데이터 — null byte 자주 포함
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0, 0, 0, 0])
    expect(isBinary(buf)).toBe(true)
  })
})

describe('isBinaryByExtension', () => {
  it('확장자 기반 바이너리 인식', () => {
    expect(isBinaryByExtension('D:\\test\\image.png')).toBe(true)
    expect(isBinaryByExtension('test.pdf')).toBe(true)
    expect(isBinaryByExtension('app.exe')).toBe(true)
    expect(isBinaryByExtension('archive.zip')).toBe(true)
    expect(isBinaryByExtension('font.woff2')).toBe(true)
  })

  it('텍스트 확장자 → false', () => {
    expect(isBinaryByExtension('test.txt')).toBe(false)
    expect(isBinaryByExtension('app.js')).toBe(false)
    expect(isBinaryByExtension('main.py')).toBe(false)
    expect(isBinaryByExtension('config.yaml')).toBe(false)
  })

  it('확장자 없음 → false', () => {
    expect(isBinaryByExtension('Makefile')).toBe(false)
    expect(isBinaryByExtension('LICENSE')).toBe(false)
  })

  it('대소문자 무시', () => {
    expect(isBinaryByExtension('IMAGE.PNG')).toBe(true)
    expect(isBinaryByExtension('App.EXE')).toBe(true)
  })

  it('경로 포함', () => {
    expect(isBinaryByExtension('C:\\Users\\test\\file.pdf')).toBe(true)
    expect(isBinaryByExtension('/home/user/script.py')).toBe(false)
  })
})
