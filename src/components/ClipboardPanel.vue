<script setup lang="ts">
import { computed } from 'vue'
import { useClipboardStore } from '../stores/clipboard'
import { useComparisonStore } from '../stores/comparison'
import { useToastStore } from '../stores/toast'

const clipboard = useClipboardStore()
const comparison = useComparisonStore()
const toast = useToastStore()

const entries = computed(() => [...clipboard.entries].reverse()) // 최신 위로

// 현재 슬롯 중 하나가 사용 중인 clipboardId 들
const activeIds = computed(() => {
  const ids: number[] = []
  for (const slot of comparison.slots) {
    if (slot.source?.kind === 'clipboard') ids.push(slot.source.clipboardId)
  }
  return ids
})

function isActive(id: number): boolean {
  return activeIds.value.includes(id)
}

function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function getPreview(content: string): string {
  const firstLine = content.split('\n')[0] ?? ''
  if (firstLine.length > 40) return firstLine.slice(0, 40) + '…'
  return firstLine
}

function loadIntoB(id: number) {
  const ok = comparison.loadFromExistingClipboard(1, id)
  if (ok) {
    toast.info(`📋 #${id} → 슬롯 B 로 로드됨`)
  }
}

function remove(id: number) {
  if (isActive(id)) {
    toast.warning('현재 사용 중인 클립보드', '슬롯에서 먼저 비워주세요.')
    return
  }
  clipboard.remove(id)
}

function clearAll() {
  // 활성 항목 보존
  if (activeIds.value.length === 0) {
    clipboard.clear()
    toast.info('클립보드 슬롯 모두 삭제됨')
  } else {
    // 활성 외만 삭제
    const before = clipboard.entries.length
    for (const e of [...clipboard.entries]) {
      if (!activeIds.value.includes(e.id)) clipboard.remove(e.id)
    }
    const after = clipboard.entries.length
    toast.info(`${before - after}개 삭제 (활성 ${after}개 보존)`)
  }
}
</script>

<template>
  <section v-if="entries.length > 0" class="clipboard-panel">
    <header class="section-header">
      <span class="title">📋 클립보드 ({{ entries.length }})</span>
      <button class="btn-clear" @click="clearAll" title="활성 외 전체 삭제">전체 삭제</button>
    </header>

    <div class="entries-list">
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="entry"
        :class="{ active: isActive(entry.id) }"
      >
        <div class="entry-meta">
          <span class="entry-id">#{{ entry.id }}</span>
          <span class="entry-time">{{ formatTime(entry.capturedAt) }}</span>
          <span class="entry-size">{{ entry.lineCount }}줄·{{ formatSize(entry.size) }}</span>
        </div>
        <div class="entry-preview" :title="entry.content.slice(0, 200)">
          {{ getPreview(entry.content) }}
        </div>
        <div class="entry-actions">
          <button class="entry-btn" @click="loadIntoB(entry.id)" :disabled="isActive(entry.id)" title="슬롯 B 로 로드">
            → B
          </button>
          <button class="entry-btn entry-btn-remove" @click="remove(entry.id)" :disabled="isActive(entry.id)" title="삭제">
            🗑
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.clipboard-panel {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  overflow: hidden;
  max-height: 280px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-subtle);
  border-bottom: 1px solid var(--color-border);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-source-clipboard);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.btn-clear {
  font-size: var(--text-xs);
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
}

.btn-clear:hover {
  color: var(--color-danger);
}

.entries-list {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.entry {
  position: relative;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.entry::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: var(--color-source-clipboard);
  opacity: 0.5;
}

.entry.active::before {
  width: 6px;
  opacity: 1;
}

.entry.active {
  background: rgba(9, 105, 218, 0.06);
}

.entry-meta {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--text-xs);
}

.entry-id {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-source-clipboard);
}

.entry-time,
.entry-size {
  color: var(--color-text-muted);
}

.entry-preview {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.85;
}

.entry-actions {
  display: flex;
  gap: var(--space-1);
  margin-top: 2px;
}

.entry-btn {
  padding: 2px 8px;
  font-size: var(--text-xs);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text);
}

.entry-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-source-clipboard);
}

.entry-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.entry-btn-remove:hover:not(:disabled) {
  border-color: var(--color-danger);
  color: var(--color-danger);
}
</style>
