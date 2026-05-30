<script setup lang="ts">
import { computed } from 'vue'
import { useComparisonStore, type FileSlot as SlotType } from '../stores/comparison'
import { useToastStore } from '../stores/toast'
import { formatBytes, truncateMiddle } from '../lib/format-bytes'
import { getDisplayName, getSourceIcon } from '../lib/slot-source'
import EncodingBadge from './EncodingBadge.vue'

interface Props {
  slot: SlotType
  label: string // "A", "B" ...
}
const props = defineProps<Props>()

const comparison = useComparisonStore()
const toast = useToastStore()

// 슬롯 종류 (file vs clipboard) 에 따른 색상
const sourceColor = computed(() => {
  if (!props.slot.source) return 'var(--color-text)'
  if (props.slot.source.kind === 'clipboard') return 'var(--color-source-clipboard)'
  return 'var(--color-source-file)'
})

const isClipboard = computed(() => props.slot.source?.kind === 'clipboard')
const sourceIcon = computed(() => (props.slot.source ? getSourceIcon(props.slot.source) : ''))
const displayName = computed(() => (props.slot.source ? getDisplayName(props.slot.source) : ''))

async function pickFile() {
  const result = await window.textdiff.openFileDialog()
  if (result.canceled || result.paths.length === 0) return
  const path = result.paths[0]

  await comparison.loadFile(props.slot.index, path)

  const after = comparison.slots[props.slot.index]
  if (after.status === 'error' && after.error) {
    toast.error('파일 읽기 실패', `${path}\n${after.error}`)
  } else if (after.status === 'ready' && after.data) {
    if (after.data.size > 20 * 1024 * 1024) {
      toast.warning('큰 파일 로드됨', `${formatBytes(after.data.size)} — 비교가 느릴 수 있습니다.`)
    }
  }
}

async function pasteFromClipboard() {
  const result = await window.textdiff.readClipboard()
  if (result.isEmpty) {
    toast.warning('클립보드 비어있음', '복사한 텍스트가 없습니다.')
    return
  }
  const entry = comparison.loadFromClipboard(props.slot.index, result.text)
  if (entry) {
    toast.info(`📋 클립보드 #${entry.id} 슬롯 ${props.label} 에 추가`)
  }
}

function clearSlot() {
  comparison.clearSlot(props.slot.index)
}

function onEncodingChange(encoding: string) {
  comparison.changeEncoding(props.slot.index, encoding).then(() => {
    toast.info(`인코딩 변경: ${encoding}`)
  })
}

// 파일 슬롯일 때만 path 분해
const filePath = computed(() => {
  if (props.slot.source?.kind === 'file') return props.slot.source.path
  return null
})

const folderPath = computed(() => {
  if (!filePath.value) return ''
  const parts = filePath.value.split(/[/\\]/)
  return truncateMiddle(parts.slice(0, -1).join('\\'), 60)
})

const statusText = computed(() => {
  switch (props.slot.status) {
    case 'empty': return '파일 선택 또는 Ctrl+V'
    case 'loading': return '읽는 중...'
    case 'ready': return '준비됨'
    case 'binary-warning': return '⚠ 바이너리 파일'
    case 'error': return '❌ 오류'
  }
})
</script>

<template>
  <div class="file-slot" :class="[`status-${slot.status}`, { 'is-clipboard': isClipboard }]">
    <div class="slot-header">
      <span class="slot-label" :style="{ color: sourceColor }">{{ label }}:</span>
      <span class="slot-status">{{ statusText }}</span>
    </div>

    <div class="slot-body">
      <template v-if="slot.source">
        <div class="file-name" :style="{ color: sourceColor }">
          {{ sourceIcon }} {{ displayName }}
        </div>
        <div v-if="filePath" class="file-path" :title="filePath">{{ folderPath }}</div>
        <div v-if="slot.data" class="file-meta">
          <span>{{ slot.data.lineCount.toLocaleString() }} 줄</span>
          <span>·</span>
          <span>{{ formatBytes(slot.data.size) }}</span>
          <template v-if="!isClipboard">
            <span>·</span>
            <EncodingBadge
              :encoding="slot.data.encoding"
              :confidence="slot.data.confidence"
              :had-bom="slot.data.hadBom"
              @change="onEncodingChange"
            />
          </template>
          <template v-else>
            <span>·</span>
            <span class="clipboard-tag">UTF-8</span>
          </template>
        </div>
        <div v-if="isClipboard && slot.data" class="clipboard-preview" :title="slot.data.content.slice(0, 200)">
          {{ slot.data.content.split('\n')[0].slice(0, 80) }}{{ slot.data.content.length > 80 ? '…' : '' }}
        </div>
        <div v-if="slot.status === 'error'" class="error-msg">
          {{ slot.error }}
        </div>
      </template>
      <template v-else>
        <div class="empty-hint">
          [📁 파일 찾기] 또는 [📋 클립보드] 또는 Ctrl+V
        </div>
      </template>
    </div>

    <div class="slot-actions">
      <button class="btn btn-primary" @click="pickFile">
        📁 파일 찾기
      </button>
      <button class="btn btn-secondary" @click="pasteFromClipboard" title="클립보드 텍스트 붙여넣기">
        📋 클립보드
      </button>
      <button v-if="slot.source" class="btn btn-icon" @click="clearSlot" title="슬롯 비우기">
        🗑
      </button>
    </div>
  </div>
</template>

<style scoped>
.file-slot {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.file-slot.is-clipboard {
  background: rgba(9, 105, 218, 0.04);
}

.file-slot.status-loading {
  border-color: var(--color-accent);
}

.file-slot.status-ready {
  border-color: var(--color-success);
}

.file-slot.status-ready.is-clipboard {
  border-color: var(--color-source-clipboard);
}

.file-slot.status-error,
.file-slot.status-binary-warning {
  border-color: var(--color-danger);
  background: var(--color-danger-bg);
}

.slot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--text-sm);
}

.slot-label {
  font-weight: 600;
  font-size: var(--text-lg);
}

.slot-status {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.slot-body {
  min-height: 60px;
  font-size: var(--text-sm);
}

.file-name {
  font-weight: 500;
  word-break: break-all;
}

.file-path {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-top: 2px;
  word-break: break-all;
}

.file-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.clipboard-tag {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  padding: 1px 6px;
  background: rgba(9, 105, 218, 0.1);
  color: var(--color-source-clipboard);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-source-clipboard);
}

.clipboard-preview {
  margin-top: var(--space-2);
  padding: var(--space-2);
  background: var(--color-bg-subtle);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-left: 3px solid var(--color-source-clipboard);
}

.empty-hint {
  color: var(--color-text-muted);
  font-style: italic;
  padding: var(--space-2) 0;
  font-size: var(--text-xs);
}

.error-msg {
  color: var(--color-danger);
  font-size: var(--text-xs);
  margin-top: var(--space-2);
  padding: var(--space-2);
  background: var(--color-bg);
  border-radius: var(--radius-sm);
}

.slot-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
  flex-wrap: wrap;
}

.btn {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: background 0.15s ease;
  white-space: nowrap;
}

.btn:hover {
  background: var(--color-bg-hover);
}

.btn-primary {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

.btn-primary:hover {
  background: var(--color-accent-hover);
}

.btn-secondary {
  border-color: var(--color-source-clipboard);
  color: var(--color-source-clipboard);
}

.btn-secondary:hover {
  background: rgba(9, 105, 218, 0.08);
}

.btn-icon {
  padding: 6px 10px;
}
</style>
