import { describe, it, expect } from 'vitest'
import { resolveSearchRoot } from '../../src/lib/search-root'
import type { FileSlot } from '../../src/stores/comparison'

function makeFileSlot(idx: number, path: string): FileSlot {
  return {
    index: idx,
    path,
    source: { kind: 'file', path },
    status: 'ready',
    data: null,
    error: null,
    pendingBinaryPath: null,
  }
}

function makeEmptySlot(idx: number): FileSlot {
  return {
    index: idx,
    path: null,
    source: null,
    status: 'empty',
    data: null,
    error: null,
    pendingBinaryPath: null,
  }
}

function makeClipboardSlot(idx: number): FileSlot {
  return {
    index: idx,
    path: 'clipboard:1',
    source: { kind: 'clipboard', clipboardId: 1, capturedAt: new Date() },
    status: 'ready',
    data: null,
    error: null,
    pendingBinaryPath: null,
  }
}

describe('resolveSearchRoot', () => {
  it('override 가 있으면 최우선', () => {
    const r = resolveSearchRoot({
      override: 'D:/picked',
      lastGitRepoPath: 'D:/git',
      slots: [makeFileSlot(0, 'D:/proj/file.ts')],
    })
    expect(r).toEqual({ path: 'D:/picked', reason: '사용자 선택' })
  })

  it('override 없고 git repo 있으면 git', () => {
    const r = resolveSearchRoot({
      lastGitRepoPath: 'D:/git-repo',
      slots: [makeFileSlot(0, 'D:/proj/file.ts')],
    })
    expect(r).toEqual({ path: 'D:/git-repo', reason: '마지막 git repo' })
  })

  it('override + git 둘 다 없으면 file 슬롯의 부모 폴더', () => {
    const r = resolveSearchRoot({
      slots: [makeFileSlot(0, 'D:\\proj\\src\\App.vue')],
    })
    expect(r).toEqual({ path: 'D:\\proj\\src', reason: '비교 파일 폴더' })
  })

  it('POSIX 슬래시도 처리', () => {
    const r = resolveSearchRoot({
      slots: [makeFileSlot(0, '/home/u/proj/file.ts')],
    })
    expect(r).toEqual({ path: '/home/u/proj', reason: '비교 파일 폴더' })
  })

  it('clipboard / empty 슬롯은 skip 하고 file 슬롯 찾기', () => {
    const r = resolveSearchRoot({
      slots: [
        makeClipboardSlot(0),
        makeFileSlot(1, 'D:\\proj\\file.ts'),
      ],
    })
    expect(r).toEqual({ path: 'D:\\proj', reason: '비교 파일 폴더' })
  })

  it('모두 없으면 null', () => {
    const r = resolveSearchRoot({
      slots: [makeEmptySlot(0), makeClipboardSlot(1)],
    })
    expect(r).toBeNull()
  })

  it('slots 자체가 없어도 안전', () => {
    expect(resolveSearchRoot({})).toBeNull()
  })
})
