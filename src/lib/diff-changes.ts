/**
 * Monaco ILineChange[] → 본 앱의 DiffChange[] 변환
 * + 통계 계산
 *
 * 출처: 11 Day3 RSD FR-2, FR-3
 */

import type * as monaco from 'monaco-editor'

export type ChangeKind = 'add' | 'delete' | 'modify'

export interface DiffChange {
  index: number
  kind: ChangeKind
  originalRange: { start: number; end: number } | null
  modifiedRange: { start: number; end: number } | null
  preview: string // 변경 첫 줄 (max ~80자 ellipsis)
  addedLines: number
  deletedLines: number
}

export interface DiffStats {
  totalLinesOriginal: number
  totalLinesModified: number
  changedLineCount: number
  changePercent: number
  addCount: number
  deleteCount: number
  modifyCount: number
}

const PREVIEW_MAX_LEN = 80

function truncate(s: string, max = PREVIEW_MAX_LEN): string {
  const stripped = s.replace(/\t/g, '  ').trimEnd()
  if (stripped.length <= max) return stripped
  return stripped.substring(0, max - 1) + '…'
}

function safeGetLine(model: monaco.editor.ITextModel | null, lineNumber: number): string {
  if (!model) return ''
  const total = model.getLineCount()
  if (lineNumber < 1 || lineNumber > total) return ''
  try {
    return model.getLineContent(lineNumber)
  } catch {
    return ''
  }
}

/**
 * ILineChange 의 의미:
 *   - originalEndLineNumber === 0 → 순수 추가 (modifiedStart..modifiedEnd 만 의미있음)
 *   - modifiedEndLineNumber === 0 → 순수 삭제
 *   - 둘 다 0 아님 → 수정 (양쪽 모두 있음)
 */
function classifyKind(lc: monaco.editor.ILineChange): ChangeKind {
  if (lc.originalEndLineNumber === 0) return 'add'
  if (lc.modifiedEndLineNumber === 0) return 'delete'
  return 'modify'
}

function countLines(start: number, end: number): number {
  // end === 0 이면 라인 0
  if (end === 0) return 0
  return Math.max(0, end - start + 1)
}

export function extractChanges(
  lineChanges: ReadonlyArray<monaco.editor.ILineChange> | null | undefined,
  originalModel: monaco.editor.ITextModel | null,
  modifiedModel: monaco.editor.ITextModel | null,
): DiffChange[] {
  if (!lineChanges || lineChanges.length === 0) return []

  return lineChanges.map((lc, index) => {
    const kind = classifyKind(lc)

    const addedLines = countLines(lc.modifiedStartLineNumber, lc.modifiedEndLineNumber)
    const deletedLines = countLines(lc.originalStartLineNumber, lc.originalEndLineNumber)

    // preview: modified 우선, 없으면 original
    let previewRaw = ''
    if (kind === 'delete') {
      previewRaw = safeGetLine(originalModel, lc.originalStartLineNumber)
    } else {
      // add / modify
      previewRaw = safeGetLine(modifiedModel, lc.modifiedStartLineNumber)
      if (!previewRaw && kind === 'modify') {
        previewRaw = safeGetLine(originalModel, lc.originalStartLineNumber)
      }
    }

    return {
      index,
      kind,
      originalRange:
        lc.originalEndLineNumber === 0
          ? null
          : { start: lc.originalStartLineNumber, end: lc.originalEndLineNumber },
      modifiedRange:
        lc.modifiedEndLineNumber === 0
          ? null
          : { start: lc.modifiedStartLineNumber, end: lc.modifiedEndLineNumber },
      preview: truncate(previewRaw),
      addedLines,
      deletedLines,
    }
  })
}

export function computeStats(
  changes: ReadonlyArray<DiffChange>,
  originalLineCount: number,
  modifiedLineCount: number,
): DiffStats {
  let addCount = 0
  let deleteCount = 0
  let modifyCount = 0
  // 라인 합을 종류별로 분리해서 계산 — Monaco 가 modify 를 add+delete 두 항목으로
  // 쪼개는 경우 200% 같은 비현실적 비율이 나오는 것을 방지.
  let totalAdded = 0
  let totalDeleted = 0
  let totalModified = 0

  for (const c of changes) {
    if (c.kind === 'add') {
      addCount++
      totalAdded += c.addedLines
    } else if (c.kind === 'delete') {
      deleteCount++
      totalDeleted += c.deletedLines
    } else {
      modifyCount++
      // modify 는 양쪽 중 큰 라인 수 (수정된 라인의 실제 영향)
      totalModified += Math.max(c.addedLines, c.deletedLines)
    }
  }

  // "차이 라인 수" 의미: max(추가 총합, 삭제 총합) + 수정 총합
  // 100줄 vs 100줄 완전 다른 두 파일의 경우, Monaco 가
  // "100줄 add + 100줄 delete" 로 쪼개도 max(100,100)+0 = 100 → 100%
  // "100줄 modify" 로 합쳐도 0+0+100 = 100 → 100%
  // 결과 일관성 보장.
  const rawChanged = Math.max(totalAdded, totalDeleted) + totalModified
  const denom = Math.max(originalLineCount, modifiedLineCount, 1)
  // 절대 100% 초과 안 되게 cap (안전망)
  const changedLineCount = Math.min(rawChanged, denom)
  const changePercent = (changedLineCount / denom) * 100

  return {
    totalLinesOriginal: originalLineCount,
    totalLinesModified: modifiedLineCount,
    changedLineCount,
    changePercent,
    addCount,
    deleteCount,
    modifyCount,
  }
}

/**
 * 점프 대상 라인 결정
 * - add / modify: modified 의 첫 줄 (사용자가 보는 게 수정본)
 * - delete: original 의 첫 줄 (modified 에는 그 줄이 없음)
 */
export function getJumpTargetLine(change: DiffChange): { side: 'original' | 'modified'; line: number } {
  if (change.kind === 'delete' && change.originalRange) {
    return { side: 'original', line: change.originalRange.start }
  }
  if (change.modifiedRange) {
    return { side: 'modified', line: change.modifiedRange.start }
  }
  if (change.originalRange) {
    return { side: 'original', line: change.originalRange.start }
  }
  return { side: 'modified', line: 1 }
}
