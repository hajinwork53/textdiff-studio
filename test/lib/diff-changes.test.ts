import { describe, it, expect } from 'vitest'
import {
  extractChanges,
  computeStats,
  getJumpTargetLine,
  type DiffChange,
} from '../../src/lib/diff-changes'

// Monaco ILineChange 와 같은 형식의 모의 객체
function mockLineChange(
  origStart: number,
  origEnd: number,
  modStart: number,
  modEnd: number,
) {
  return {
    originalStartLineNumber: origStart,
    originalEndLineNumber: origEnd,
    modifiedStartLineNumber: modStart,
    modifiedEndLineNumber: modEnd,
    charChanges: undefined,
  }
}

function mockModel(lines: string[]) {
  return {
    getLineCount: () => lines.length,
    getLineContent: (n: number) => lines[n - 1] ?? '',
  } as any
}

describe('extractChanges', () => {
  it('null 또는 빈 배열 → []', () => {
    expect(extractChanges(null, null, null)).toEqual([])
    expect(extractChanges(undefined, null, null)).toEqual([])
    expect(extractChanges([], null, null)).toEqual([])
  })

  it('순수 add (origEnd === 0)', () => {
    const lineChanges = [mockLineChange(5, 0, 5, 7)]
    const modModel = mockModel(['', '', '', '', 'new line 5', 'new line 6', 'new line 7'])
    const result = extractChanges(lineChanges, null, modModel)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('add')
    expect(result[0].originalRange).toBeNull()
    expect(result[0].modifiedRange).toEqual({ start: 5, end: 7 })
    expect(result[0].addedLines).toBe(3)
    expect(result[0].deletedLines).toBe(0)
    expect(result[0].preview).toBe('new line 5')
  })

  it('순수 delete (modEnd === 0)', () => {
    const lineChanges = [mockLineChange(3, 5, 3, 0)]
    const origModel = mockModel(['', '', 'deleted 3', 'deleted 4', 'deleted 5'])
    const result = extractChanges(lineChanges, origModel, null)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('delete')
    expect(result[0].modifiedRange).toBeNull()
    expect(result[0].originalRange).toEqual({ start: 3, end: 5 })
    expect(result[0].addedLines).toBe(0)
    expect(result[0].deletedLines).toBe(3)
    expect(result[0].preview).toBe('deleted 3')
  })

  it('수정 (modify)', () => {
    const lineChanges = [mockLineChange(2, 2, 2, 2)]
    const origModel = mockModel(['a', 'old line', 'c'])
    const modModel = mockModel(['a', 'new line', 'c'])
    const result = extractChanges(lineChanges, origModel, modModel)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('modify')
    expect(result[0].originalRange).toEqual({ start: 2, end: 2 })
    expect(result[0].modifiedRange).toEqual({ start: 2, end: 2 })
    expect(result[0].preview).toBe('new line')
  })

  it('index 순차 증가', () => {
    const lineChanges = [
      mockLineChange(1, 0, 1, 1),
      mockLineChange(5, 5, 5, 0),
      mockLineChange(10, 10, 10, 10),
    ]
    const result = extractChanges(
      lineChanges,
      mockModel(['', '', '', '', 'x', '', '', '', '', 'y']),
      mockModel(['a']),
    )
    expect(result.map((c) => c.index)).toEqual([0, 1, 2])
  })

  it('preview 80자 ellipsis', () => {
    const longLine = 'x'.repeat(150)
    const lineChanges = [mockLineChange(1, 0, 1, 1)]
    const modModel = mockModel([longLine])
    const result = extractChanges(lineChanges, null, modModel)
    expect(result[0].preview.length).toBeLessThanOrEqual(80)
    expect(result[0].preview.endsWith('…')).toBe(true)
  })
})

describe('computeStats', () => {
  it('변경 0개 → 0%', () => {
    const stats = computeStats([], 100, 100)
    expect(stats.changePercent).toBe(0)
    expect(stats.changedLineCount).toBe(0)
    expect(stats.addCount).toBe(0)
    expect(stats.deleteCount).toBe(0)
    expect(stats.modifyCount).toBe(0)
  })

  it('add 1개, modify 0, delete 0', () => {
    const changes: DiffChange[] = [
      {
        index: 0, kind: 'add',
        originalRange: null,
        modifiedRange: { start: 1, end: 3 },
        preview: '', addedLines: 3, deletedLines: 0,
      },
    ]
    const stats = computeStats(changes, 10, 13)
    expect(stats.addCount).toBe(1)
    expect(stats.changedLineCount).toBe(3)
    expect(stats.changePercent).toBeCloseTo((3 / 13) * 100, 1)
  })

  it('100% cap — modify 가 add+delete 로 쪼개진 경우 (버그 회귀 방지)', () => {
    // 100줄 vs 100줄 완전 다른 두 파일을 Monaco 가
    // "100줄 delete + 100줄 add" 로 반환하는 케이스
    const changes: DiffChange[] = [
      {
        index: 0, kind: 'delete',
        originalRange: { start: 1, end: 100 },
        modifiedRange: null,
        preview: '', addedLines: 0, deletedLines: 100,
      },
      {
        index: 1, kind: 'add',
        originalRange: null,
        modifiedRange: { start: 1, end: 100 },
        preview: '', addedLines: 100, deletedLines: 0,
      },
    ]
    const stats = computeStats(changes, 100, 100)
    // 잘못된 구현: 100 + 100 = 200줄 → 200%
    // 올바른 구현: max(100, 100) + 0 = 100줄 → 100%
    expect(stats.changedLineCount).toBe(100)
    expect(stats.changePercent).toBe(100)
  })

  it('modify 단일 — max(added, deleted)', () => {
    const changes: DiffChange[] = [
      {
        index: 0, kind: 'modify',
        originalRange: { start: 1, end: 5 },
        modifiedRange: { start: 1, end: 10 },
        preview: '', addedLines: 10, deletedLines: 5,
      },
    ]
    const stats = computeStats(changes, 5, 10)
    // max(0, 0) + max(10, 5) = 10
    expect(stats.changedLineCount).toBe(10)
    expect(stats.changePercent).toBe(100)
  })

  it('denom 0 보호 (둘 다 빈 파일)', () => {
    const stats = computeStats([], 0, 0)
    expect(stats.changePercent).toBe(0)
    expect(Number.isFinite(stats.changePercent)).toBe(true)
  })

  it('add/delete/modify 카운트 정확', () => {
    const make = (kind: 'add' | 'delete' | 'modify'): DiffChange => ({
      index: 0, kind,
      originalRange: kind === 'add' ? null : { start: 1, end: 1 },
      modifiedRange: kind === 'delete' ? null : { start: 1, end: 1 },
      preview: '', addedLines: kind === 'delete' ? 0 : 1, deletedLines: kind === 'add' ? 0 : 1,
    })
    const changes = [make('add'), make('add'), make('delete'), make('modify')]
    const stats = computeStats(changes, 10, 10)
    expect(stats.addCount).toBe(2)
    expect(stats.deleteCount).toBe(1)
    expect(stats.modifyCount).toBe(1)
  })
})

describe('getJumpTargetLine', () => {
  it('add → modified', () => {
    const c: DiffChange = {
      index: 0, kind: 'add',
      originalRange: null,
      modifiedRange: { start: 42, end: 50 },
      preview: '', addedLines: 9, deletedLines: 0,
    }
    expect(getJumpTargetLine(c)).toEqual({ side: 'modified', line: 42 })
  })

  it('modify → modified', () => {
    const c: DiffChange = {
      index: 0, kind: 'modify',
      originalRange: { start: 10, end: 12 },
      modifiedRange: { start: 10, end: 15 },
      preview: '', addedLines: 6, deletedLines: 3,
    }
    expect(getJumpTargetLine(c)).toEqual({ side: 'modified', line: 10 })
  })

  it('delete → original', () => {
    const c: DiffChange = {
      index: 0, kind: 'delete',
      originalRange: { start: 7, end: 9 },
      modifiedRange: null,
      preview: '', addedLines: 0, deletedLines: 3,
    }
    expect(getJumpTargetLine(c)).toEqual({ side: 'original', line: 7 })
  })
})
