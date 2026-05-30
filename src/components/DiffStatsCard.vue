<script setup lang="ts">
import { computed } from 'vue'
import type { DiffStats } from '../lib/diff-changes'

interface Props {
  stats: DiffStats | null
}
const props = defineProps<Props>()

const percentDisplay = computed(() => {
  if (!props.stats) return '0%'
  const p = props.stats.changePercent
  if (p < 0.1 && p > 0) return '<0.1%'
  return `${p.toFixed(1)}%`
})

const totalDisplay = computed(() => {
  if (!props.stats) return '0'
  return Math.max(props.stats.totalLinesOriginal, props.stats.totalLinesModified).toLocaleString()
})

// 3가지 상태: 분석 중 / 동일 파일 / 변경 있음
const state = computed<'loading' | 'identical' | 'changed'>(() => {
  if (props.stats === null) return 'loading'
  if (props.stats.changedLineCount === 0) return 'identical'
  return 'changed'
})
</script>

<template>
  <section class="stats-card" aria-label="변경 통계">
    <header class="card-header">통계</header>

    <div v-if="state === 'loading'" class="loading-stats">
      <span class="spinner" aria-hidden="true"></span>
      <span>변경 분석 중...</span>
    </div>

    <div v-else-if="state === 'identical'" class="empty-stats">
      <span class="empty-icon">✓</span>
      <span>두 파일이 동일합니다</span>
    </div>

    <template v-else>
      <div class="stat-row">
        <span class="label">변경</span>
        <span class="value">
          {{ stats!.changedLineCount.toLocaleString() }} / {{ totalDisplay }}
          <span class="muted">({{ percentDisplay }})</span>
        </span>
      </div>

      <div class="stat-row counts">
        <span class="count add" :title="`${stats!.addCount}개의 추가 변경`">
          <span class="icon">+</span>{{ stats!.addCount }}
        </span>
        <span class="count del" :title="`${stats!.deleteCount}개의 삭제 변경`">
          <span class="icon">−</span>{{ stats!.deleteCount }}
        </span>
        <span class="count mod" :title="`${stats!.modifyCount}개의 수정 변경`">
          <span class="icon">↻</span>{{ stats!.modifyCount }}
        </span>
      </div>
    </template>
  </section>
</template>

<style scoped>
.stats-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
}

.card-header {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.empty-stats {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  color: var(--color-success);
  font-size: var(--text-sm);
}

.empty-icon {
  font-size: var(--text-lg);
  font-weight: bold;
}

.loading-stats {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: var(--text-sm);
}

.stat-row .label {
  color: var(--color-text-muted);
}

.stat-row .value {
  font-family: var(--font-mono);
  font-weight: 500;
}

.muted {
  color: var(--color-text-muted);
  font-weight: 400;
  margin-left: 2px;
}

.counts {
  display: flex;
  gap: var(--space-3);
  justify-content: flex-start;
}

.count {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: var(--text-sm);
}

.count .icon {
  font-weight: 700;
  margin-right: 1px;
}

.count.add { color: var(--diff-add-text); }
.count.del { color: var(--diff-del-text); }
.count.mod { color: var(--diff-mod-text); }
</style>
