import { describe, it, expect } from 'vitest'
import {
  makeVirtualPath,
  isRealFilePath,
  getDisplayName,
  getSourceIcon,
  getSourceColorVar,
  type SlotSource,
} from '../../src/lib/slot-source'

describe('makeVirtualPath', () => {
  it('file source → 실제 경로', () => {
    expect(makeVirtualPath({ kind: 'file', path: 'D:\\proj\\a.html' })).toBe('D:\\proj\\a.html')
  })

  it('clipboard source → "clipboard:N"', () => {
    const source: SlotSource = {
      kind: 'clipboard',
      clipboardId: 7,
      capturedAt: new Date(),
    }
    expect(makeVirtualPath(source)).toBe('clipboard:7')
  })

  it('null → 빈 문자열', () => {
    expect(makeVirtualPath(null)).toBe('')
  })
})

describe('isRealFilePath', () => {
  it('일반 Windows 경로 → true', () => {
    expect(isRealFilePath('D:\\proj\\a.html')).toBe(true)
  })

  it('Unix 경로 → true', () => {
    expect(isRealFilePath('/home/user/a.py')).toBe(true)
  })

  it('clipboard: 식별자 → false', () => {
    expect(isRealFilePath('clipboard:1')).toBe(false)
    expect(isRealFilePath('clipboard:99')).toBe(false)
  })

  it('git: 식별자 → false (미래 호환)', () => {
    expect(isRealFilePath('git:HEAD:file.py')).toBe(false)
  })

  it('snapshot: 식별자 → false (미래 호환)', () => {
    expect(isRealFilePath('snapshot:abc123:file.py')).toBe(false)
  })
})

describe('getDisplayName', () => {
  it('file → basename', () => {
    expect(getDisplayName({ kind: 'file', path: 'D:\\proj\\a.html' })).toBe('a.html')
    expect(getDisplayName({ kind: 'file', path: '/home/user/main.py' })).toBe('main.py')
  })

  it('clipboard → "클립보드 #N (HH:MM)"', () => {
    const date = new Date(2026, 4, 23, 14, 32, 0)
    expect(
      getDisplayName({ kind: 'clipboard', clipboardId: 3, capturedAt: date }),
    ).toBe('클립보드 #3 (14:32)')
  })

  it('clipboard 시각 0 padding', () => {
    const date = new Date(2026, 4, 23, 9, 5, 0)
    expect(
      getDisplayName({ kind: 'clipboard', clipboardId: 1, capturedAt: date }),
    ).toBe('클립보드 #1 (09:05)')
  })

  it('null → 빈 문자열', () => {
    expect(getDisplayName(null as any)).toBe('')
  })
})

describe('getSourceIcon', () => {
  it('file → 📄', () => {
    expect(getSourceIcon({ kind: 'file', path: 'x' })).toBe('📄')
  })

  it('clipboard → 📋', () => {
    expect(getSourceIcon({ kind: 'clipboard', clipboardId: 1, capturedAt: new Date() })).toBe('📋')
  })
})

describe('getSourceColorVar', () => {
  it('file → --color-source-file', () => {
    expect(getSourceColorVar({ kind: 'file', path: 'x' })).toBe('--color-source-file')
  })

  it('clipboard → --color-source-clipboard', () => {
    expect(
      getSourceColorVar({ kind: 'clipboard', clipboardId: 1, capturedAt: new Date() }),
    ).toBe('--color-source-clipboard')
  })

  it('null → --color-text', () => {
    expect(getSourceColorVar(null as any)).toBe('--color-text')
  })
})
