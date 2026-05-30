<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  encoding: string
  confidence: number // 0-1
  hadBom?: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'change', encoding: string): void
}>()

const SUPPORTED = [
  'UTF-8', 'UTF-16LE', 'UTF-16BE',
  'EUC-KR', 'CP949',
  'Shift_JIS', 'GB2312', 'Big5',
  'ISO-8859-1', 'Windows-1252',
]

const isUncertain = computed(() => props.confidence < 0.7)
const label = computed(() => {
  const bom = props.hadBom ? ' + BOM' : ''
  return `${props.encoding}${bom}`
})
</script>

<template>
  <div class="encoding-badge" :class="{ uncertain: isUncertain }" :title="`확신도 ${(confidence * 100).toFixed(0)}%`">
    <span class="label">{{ label }}</span>
    <span v-if="isUncertain" class="warning-mark">⚠</span>
    <select
      class="select"
      :value="encoding"
      @change="emit('change', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="enc in SUPPORTED" :key="enc" :value="enc">{{ enc }}</option>
    </select>
  </div>
</template>

<style scoped>
.encoding-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  position: relative;
  cursor: pointer;
}

.encoding-badge.uncertain {
  background: rgba(255, 212, 0, 0.15);
  border-color: var(--color-warning);
  color: var(--color-warning);
}

.warning-mark {
  font-size: 10px;
}

.select {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
</style>
