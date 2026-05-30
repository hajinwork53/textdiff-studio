<script setup lang="ts">
import { computed } from 'vue'
import type { DiffChange } from '../lib/diff-changes'

interface Props {
  change: DiffChange
  active: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'click', change: DiffChange): void
}>()

const iconChar = computed(() => {
  switch (props.change.kind) {
    case 'add': return '+'
    case 'delete': return '−'
    case 'modify': return '↻'
  }
})

const rangeLabel = computed(() => {
  const c = props.change
  // modify 는 양쪽 범위, add 는 modified 범위, delete 는 original 범위
  if (c.kind === 'delete' && c.originalRange) {
    const r = c.originalRange
    return r.start === r.end ? `L${r.start}` : `L${r.start}-${r.end}`
  }
  if (c.modifiedRange) {
    const r = c.modifiedRange
    return r.start === r.end ? `L${r.start}` : `L${r.start}-${r.end}`
  }
  return ''
})

const deltaLabel = computed(() => {
  const c = props.change
  if (c.kind === 'add') return `+${c.addedLines}`
  if (c.kind === 'delete') return `−${c.deletedLines}`
  // modify: +N -M (라인 수 다를 수 있음)
  if (c.addedLines === c.deletedLines) return `~${c.addedLines}`
  return `+${c.addedLines} −${c.deletedLines}`
})

function onClick() {
  emit('click', props.change)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    emit('click', props.change)
  }
}

const ariaLabel = computed(() => {
  const c = props.change
  const where = rangeLabel.value
  const what =
    c.kind === 'add' ? `${c.addedLines}줄 추가` :
    c.kind === 'delete' ? `${c.deletedLines}줄 삭제` :
    `${c.addedLines}줄 추가, ${c.deletedLines}줄 삭제`
  return `${where} ${what}. 클릭하여 해당 위치로 이동`
})
</script>

<template>
  <div
    class="toc-item"
    :class="[`kind-${change.kind}`, { active }]"
    role="button"
    tabindex="0"
    :aria-label="ariaLabel"
    :aria-pressed="active"
    @click="onClick"
    @keydown="onKeydown"
  >
    <div class="row-1">
      <span class="icon" aria-hidden="true">{{ iconChar }}</span>
      <span class="range">{{ rangeLabel }}</span>
      <span class="separator" aria-hidden="true">·</span>
      <span class="delta">{{ deltaLabel }}</span>
    </div>
    <div v-if="change.preview" class="row-2" :title="change.preview">
      {{ change.preview }}
    </div>
  </div>
</template>

<style scoped>
.toc-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2) var(--space-3) var(--space-2) calc(var(--space-3) + 4px);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  background: var(--color-bg);
  transition: background 0.1s ease;
  user-select: none;
}

.toc-item:hover {
  background: var(--color-bg-hover);
}

/* 좌측 4px 거터 — 변경 종류 색상 */
.toc-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  transition: width 0.15s ease;
}

.toc-item.kind-add::before { background: var(--diff-add-gutter); }
.toc-item.kind-delete::before { background: var(--diff-del-gutter); }
.toc-item.kind-modify::before { background: var(--diff-mod-gutter); }

/* Active 상태: 좌측 거터가 두꺼워짐 + 배경 살짝 */
.toc-item.active::before {
  width: 8px;
}
.toc-item.active {
  background: var(--color-bg-hover);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.toc-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.row-1 {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.icon {
  font-weight: 700;
  font-size: var(--text-sm);
  min-width: 12px;
  text-align: center;
}

.kind-add .icon { color: var(--diff-add-text); }
.kind-delete .icon { color: var(--diff-del-text); }
.kind-modify .icon { color: var(--diff-mod-text); }

.range {
  font-weight: 500;
  color: var(--color-text);
}

.separator { color: var(--color-text-muted); }

.delta {
  color: var(--color-text-muted);
  font-weight: 500;
}

.row-2 {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.85;
}
</style>
