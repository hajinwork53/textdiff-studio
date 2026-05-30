<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useComparisonStore } from '../stores/comparison'
import type { DiffChange } from '../lib/diff-changes'
import DiffStatsCard from './DiffStatsCard.vue'
import DiffTocItem from './DiffTocItem.vue'

const emit = defineEmits<{
  (e: 'jump', change: DiffChange): void
}>()

const comparison = useComparisonStore()

const changes = computed(() => comparison.changes)
const stats = computed(() => comparison.stats)
const activeIndex = computed(() => comparison.activeChangeIndex)

const listRef = ref<HTMLElement | null>(null)
const itemRefs = ref<HTMLElement[]>([])

function onItemClick(change: DiffChange) {
  comparison.setActiveChange(change.index)
  emit('jump', change)
}

// 키보드 네비게이션 (↑/↓)
function onListKeydown(e: KeyboardEvent) {
  if (changes.value.length === 0) return
  const cur = activeIndex.value ?? -1
  let next = cur

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    next = Math.min(cur + 1, changes.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    next = Math.max(cur - 1, 0)
  } else if (e.key === 'Home') {
    e.preventDefault()
    next = 0
  } else if (e.key === 'End') {
    e.preventDefault()
    next = changes.value.length - 1
  } else {
    return
  }

  if (next !== cur && next >= 0) {
    comparison.setActiveChange(next)
    emit('jump', changes.value[next])
  }
}

// activeIndex 가 바뀌면 해당 항목으로 자동 스크롤
watch(activeIndex, async (idx) => {
  if (idx === null) return
  await nextTick()
  const el = itemRefs.value[idx]
  if (el && listRef.value) {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
})

function setItemRef(el: any, index: number) {
  if (el) itemRefs.value[index] = el as HTMLElement
}
</script>

<template>
  <aside class="toc-panel" role="navigation" aria-label="변경 목록">
    <div class="panel-content">
      <DiffStatsCard :stats="stats" />

      <section class="changes-section">
        <header class="section-header">
          <span class="title">변경 목록</span>
          <span class="count">{{ changes.length.toLocaleString() }}</span>
        </header>

        <div
          v-if="changes.length === 0"
          class="empty"
        >
          {{ stats === null ? '분석 중...' : '변경 없음' }}
        </div>

        <div
          v-else
          ref="listRef"
          class="changes-list"
          tabindex="0"
          @keydown="onListKeydown"
        >
          <DiffTocItem
            v-for="change in changes"
            :key="change.index"
            :ref="(el) => setItemRef(el, change.index)"
            :change="change"
            :active="change.index === activeIndex"
            @click="onItemClick"
          />
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.toc-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-subtle);
  border-right: 1px solid var(--color-border);
  overflow: hidden;
}

.panel-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--space-3);
  gap: var(--space-3);
  min-height: 0;
}

.changes-section {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  overflow: hidden;
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
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.section-header .count {
  font-family: var(--font-mono);
  background: var(--color-bg);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  text-transform: none;
  letter-spacing: 0;
}

.empty {
  padding: var(--space-4);
  text-align: center;
  color: var(--color-text-muted);
  font-style: italic;
  font-size: var(--text-sm);
}

.changes-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.changes-list:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
</style>
