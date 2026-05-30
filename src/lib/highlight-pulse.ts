/**
 * Monaco 에디터의 특정 줄에 1초간 펄스 하이라이트
 *
 * 출처: 11 Day3 RSD FR-5
 */

import * as monaco from 'monaco-editor'

const DEFAULT_DURATION_MS = 1000

/**
 * 지정한 에디터의 라인에 임시 background decoration 추가.
 * CSS 의 .diff-pulse-highlight 클래스가 fade-out 애니메이션 담당.
 * durationMs 후 자동 제거.
 */
export function pulseHighlight(
  editor: monaco.editor.ICodeEditor,
  lineNumber: number,
  durationMs: number = DEFAULT_DURATION_MS,
): void {
  if (!editor) return
  const model = editor.getModel()
  if (!model) return

  const total = model.getLineCount()
  const safeLine = Math.max(1, Math.min(lineNumber, total))

  const collection = editor.createDecorationsCollection([
    {
      range: new monaco.Range(safeLine, 1, safeLine, 1),
      options: {
        isWholeLine: true,
        className: 'diff-pulse-highlight',
      },
    },
  ])

  setTimeout(() => {
    try {
      collection.clear()
    } catch {
      /* editor 가 이미 dispose 됐을 수 있음 */
    }
  }, durationMs)
}
