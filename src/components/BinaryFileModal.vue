<script setup lang="ts">
import { useComparisonStore } from '../stores/comparison'
import { useToastStore } from '../stores/toast'
import { computed } from 'vue'

const comparison = useComparisonStore()
const toast = useToastStore()

// 첫 번째 binary-warning 상태인 슬롯 찾음
const targetSlot = computed(() =>
  comparison.slots.find((s) => s.status === 'binary-warning')
)

function cancel() {
  if (!targetSlot.value) return
  comparison.clearSlot(targetSlot.value.index)
}

function forceOpen() {
  if (!targetSlot.value) return
  comparison.confirmBinaryLoad(targetSlot.value.index, 'UTF-8').then(() => {
    toast.warning(
      '바이너리 파일 강제 열기',
      'UTF-8 로 강제 디코딩되었습니다. 깨진 문자가 보일 수 있습니다.',
    )
  })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="targetSlot" class="modal-backdrop" @click.self="cancel">
      <div class="modal" role="alertdialog" aria-labelledby="binary-title">
        <div class="modal-header">
          <span class="modal-icon">⚠️</span>
          <h2 id="binary-title" class="modal-title">바이너리 파일 감지</h2>
        </div>
        <div class="modal-body">
          <p>
            이 파일은 <strong>바이너리</strong>로 보입니다 (PDF, 이미지, 실행 파일 등).
            텍스트 비교에 적합하지 않을 수 있습니다.
          </p>
          <p class="path">{{ targetSlot.pendingBinaryPath }}</p>
          <p class="warning">
            텍스트로 강제 열면 깨진 문자가 표시되거나 앱이 느려질 수 있습니다.
          </p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-default" @click="cancel" autofocus>취소</button>
          <button class="btn btn-warning" @click="forceOpen">텍스트로 강제 열기</button>
        </div>
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
  z-index: 1000;
}

.modal {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  width: min(500px, 90vw);
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.modal-icon {
  font-size: var(--text-xl);
}

.modal-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
}

.modal-body {
  padding: var(--space-4);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

.modal-body p {
  margin: 0 0 var(--space-3) 0;
}

.modal-body p:last-child {
  margin-bottom: 0;
}

.path {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  padding: var(--space-2);
  background: var(--color-bg-subtle);
  border-radius: var(--radius-sm);
  word-break: break-all;
}

.warning {
  color: var(--color-warning);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.btn {
  padding: 6px 16px;
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

.btn-warning {
  background: var(--color-warning);
  border-color: var(--color-warning);
  color: white;
}
</style>
