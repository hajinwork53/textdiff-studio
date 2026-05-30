<script setup lang="ts">
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
</script>

<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="item in toast.items"
          :key="item.id"
          class="toast"
          :class="`toast-${item.level}`"
          role="alert"
        >
          <div class="toast-content">
            <div class="toast-message">{{ item.message }}</div>
            <div v-if="item.detail" class="toast-detail">{{ item.detail }}</div>
            <div v-if="item.actions && item.actions.length" class="toast-actions">
              <button
                v-for="(action, i) in item.actions"
                :key="i"
                class="action-btn"
                @click="action.onClick()"
              >
                {{ action.label }}
              </button>
            </div>
          </div>
          <button class="toast-close" @click="toast.dismiss(item.id)" aria-label="닫기">
            ✕
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: var(--space-4);
  right: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  z-index: 2000;
  max-width: 420px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  box-shadow: var(--shadow-md);
  font-size: var(--text-sm);
  pointer-events: auto;
}

.toast-info { border-left: 4px solid var(--color-info); }
.toast-success { border-left: 4px solid var(--color-success); }
.toast-warning { border-left: 4px solid var(--color-warning); }
.toast-error { border-left: 4px solid var(--color-danger); }

.toast-content {
  flex: 1;
  min-width: 0;
}

.toast-message {
  font-weight: 500;
}

.toast-detail {
  margin-top: 2px;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  white-space: pre-wrap;
  word-break: break-word;
}

.toast-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.action-btn {
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  font-size: var(--text-xs);
  cursor: pointer;
  color: var(--color-text-link);
  font-weight: 500;
}

.action-btn:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-accent);
}

.toast-close {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 2px 6px;
  font-size: 12px;
}

.toast-close:hover {
  color: var(--color-text);
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
</style>
