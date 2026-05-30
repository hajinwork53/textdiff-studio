<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { extractChanges, computeStats, type DiffChange } from '../lib/diff-changes'
import { pulseHighlight } from '../lib/highlight-pulse'

interface Props {
  original: string
  modified: string
  language?: string
  originalTitle?: string
  modifiedTitle?: string
}

const props = withDefaults(defineProps<Props>(), {
  language: 'plaintext',
  originalTitle: 'A',
  modifiedTitle: 'B',
})

const emit = defineEmits<{
  (e: 'changesUpdated', changes: DiffChange[]): void
  (e: 'statsUpdated', stats: ReturnType<typeof computeStats>): void
}>()

const containerRef = ref<HTMLElement | null>(null)
let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null

function emitChangesAndStats() {
  if (!diffEditor) return
  const lineChanges = diffEditor.getLineChanges()
  const model = diffEditor.getModel()
  const originalModel = model?.original ?? null
  const modifiedModel = model?.modified ?? null

  const changes = extractChanges(lineChanges, originalModel, modifiedModel)
  emit('changesUpdated', changes)

  const stats = computeStats(
    changes,
    originalModel?.getLineCount() ?? 0,
    modifiedModel?.getLineCount() ?? 0,
  )
  emit('statsUpdated', stats)
}

onMounted(() => {
  if (!containerRef.value) return

  const originalModel = monaco.editor.createModel(props.original, props.language)
  const modifiedModel = monaco.editor.createModel(props.modified, props.language)

  diffEditor = monaco.editor.createDiffEditor(containerRef.value, {
    automaticLayout: true,
    renderSideBySide: true,
    readOnly: true,
    ignoreTrimWhitespace: true,
    originalEditable: false,
    diffWordWrap: 'off',
    fontSize: 13,
    fontFamily: 'JetBrains Mono, Consolas, monospace',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    renderOverviewRuler: true,
  })

  // 핸들러 먼저 등록 (setModel 후 첫 diff 계산 이벤트를 놓치지 않도록)
  diffEditor.onDidUpdateDiff(() => {
    emitChangesAndStats()
  })

  diffEditor.setModel({
    original: originalModel,
    modified: modifiedModel,
  })

  // 안전망: 첫 diff 계산이 핸들러 등록 전에 끝나는 극단 케이스 대비
  // 200ms 후 manual emit 시도. 이미 정상 emit 됐어도 같은 값이라 무해.
  setTimeout(() => {
    if (diffEditor) emitChangesAndStats()
  }, 200)
})

watch([() => props.original, () => props.modified], ([newOrig, newMod]) => {
  if (!diffEditor) return
  const model = diffEditor.getModel()
  if (!model) return
  model.original.setValue(newOrig)
  model.modified.setValue(newMod)
})

onBeforeUnmount(() => {
  if (diffEditor) {
    const model = diffEditor.getModel()
    model?.original.dispose()
    model?.modified.dispose()
    diffEditor.dispose()
    diffEditor = null
  }
})

/**
 * 부모에게 노출하는 점프 메서드
 * side: 'modified' 면 우측 에디터, 'original' 이면 좌측
 */
function jumpToLine(line: number, side: 'original' | 'modified' = 'modified') {
  if (!diffEditor) return
  const editor =
    side === 'original' ? diffEditor.getOriginalEditor() : diffEditor.getModifiedEditor()
  editor.revealLineInCenter(line, monaco.editor.ScrollType.Smooth)
  pulseHighlight(editor, line, 1000)
}

/**
 * Day 8.5: 양쪽 에디터 모두에 컨텍스트 메뉴 액션 등록.
 * 콜백은 현재 선택된 텍스트(있으면) 와 함께 호출됨.
 */
function registerSelectionAction(opts: {
  id: string
  label: string
  contextMenuOrder?: number
  onRun: (selectedText: string) => void
}) {
  if (!diffEditor) return
  const editors = [diffEditor.getOriginalEditor(), diffEditor.getModifiedEditor()]
  for (const ed of editors) {
    ed.addAction({
      id: opts.id,
      label: opts.label,
      contextMenuGroupId: 'navigation',
      contextMenuOrder: opts.contextMenuOrder ?? 1.5,
      precondition: 'editorHasSelection',
      run: (editor) => {
        const model = editor.getModel()
        const sel = editor.getSelection()
        if (!model || !sel) return
        const txt = model.getValueInRange(sel).trim()
        if (txt.length > 0) opts.onRun(txt)
      },
    })
  }
}

/**
 * Day 8.5: 현재 포커스된 에디터의 선택 텍스트 (Ctrl+Shift+F 단축키용)
 */
function getCurrentSelection(): string {
  if (!diffEditor) return ''
  // 좌/우 중 포커스된 쪽
  const o = diffEditor.getOriginalEditor()
  const m = diffEditor.getModifiedEditor()
  const active = m.hasTextFocus() ? m : o.hasTextFocus() ? o : m
  const model = active.getModel()
  const sel = active.getSelection()
  if (!model || !sel) return ''
  return model.getValueInRange(sel).trim()
}

defineExpose({ jumpToLine, registerSelectionAction, getCurrentSelection })
</script>

<template>
  <div class="diff-viewer">
    <div class="diff-header">
      <div class="diff-title diff-title-a">📄 {{ originalTitle }}</div>
      <div class="diff-title diff-title-b">📄 {{ modifiedTitle }}</div>
    </div>
    <div ref="containerRef" class="diff-container"></div>
  </div>
</template>

<style scoped>
.diff-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.diff-header {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
  font-size: var(--text-sm);
  font-weight: 500;
}

.diff-title {
  padding: var(--space-2) var(--space-3);
}

.diff-title-a {
  border-right: 1px solid var(--color-border);
}

.diff-container {
  flex: 1;
  width: 100%;
  min-height: 0;
}
</style>
