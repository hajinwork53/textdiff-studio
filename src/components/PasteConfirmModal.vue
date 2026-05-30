<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed } from 'vue'

interface Props {
  open: boolean
  preview: string // 페이스트된 텍스트 첫 줄
  byteSize: number
  lineCount: number
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'cancel'): void
  /** 슬롯 B 를 클립보드로 교체 + 재비교 */
  (e: 'replaceB'): void
  /** 좌측 클립보드 패널에만 추가 (슬롯 안 바꿈) */
  (e: 'addOnly'): void
}>()

const previewText = computed(() =>
  props.preview.length > 100 ? props.preview.slice(0, 100) + '…' : props.preview,
)

const sizeDisplay = computed(() => {
  if (props.byteSize < 1024) return `${props.byteSize} B`
  if (props.byteSize < 1024 * 1024) return `${(props.byteSize / 1024).toFixed(1)} KB`
  return `${(props.byteSize / (1024 * 1024)).toFixed(1)} MB`
})

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="emit('cancel')">
      <div class="modal" role="dialog" aria-labelledby="paste-title">
        <header class="modal-header">
          <h2 id="paste-title" class="modal-title">📋 클립보드 페이스트</h2>
        </header>

        <div class="modal-body">
          <p class="hint">
            이미 비교 중입니다. 클립보드 텍스트를 어떻게 사용할까요?
          </p>

          <div class="preview-box">
            <div class="preview-label">미리보기</div>
            <div class="preview-content">{{ previewText }}</div>
            <div class="preview-meta">
              {{ lineCount.toLocaleString() }}줄 · {{ sizeDisplay }}
            </div>
          </div>
        </div>

        <footer class="modal-actions">
          <button class="btn btn-default" @click="emit('cancel')">취소 (Esc)</button>
          <button class="btn btn-secondary" @click="emit('addOnly')" title="좌측 클립보드 패널에만 추가">
            좌측 패널에만 추가
          </button>
          <button class="btn btn-primary" @click="emit('replaceB')" title="슬롯 B 를 교체하고 재비교">
            🔄 슬롯 B 교체 + 재비교
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
}

.modal {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  width: min(520px, 92vw);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.modal-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-source-clipboard);
}

.modal-body {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.preview-box {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-source-clipboard);
  border-radius: var(--radius-md);
  background: var(--color-bg-subtle);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.preview-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.preview-content {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-text);
  word-break: break-all;
}

.preview-meta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
  flex-wrap: wrap;
}

.btn {
  padding: 6px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  cursor: pointer;
}

.btn-default {
  background: var(--color-bg);
}

.btn-default:hover {
  background: var(--color-bg-hover);
}

.btn-secondary {
  background: var(--color-bg);
  border-color: var(--color-source-clipboard);
  color: var(--color-source-clipboard);
}

.btn-secondary:hover {
  background: rgba(9, 105, 218, 0.08);
}

.btn-primary {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

.btn-primary:hover {
  background: var(--color-accent-hover);
}
</style>
