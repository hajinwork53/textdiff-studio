<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'

interface Props {
  initialWidth: number
  minWidth: number
  maxWidth: number
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'resize', width: number): void
  (e: 'resizeEnd', width: number): void
}>()

const dragging = ref(false)
let startX = 0
let startWidth = 0

function onPointerDown(e: PointerEvent) {
  e.preventDefault()
  dragging.value = true
  startX = e.clientX
  startWidth = props.initialWidth

  // 드래그 중 텍스트 선택 방지 + 커서 유지
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  ;(e.target as Element).setPointerCapture?.(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  const delta = e.clientX - startX
  const newWidth = Math.max(props.minWidth, Math.min(props.maxWidth, startWidth + delta))
  emit('resize', newWidth)
}

function onPointerUp(e: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  emit('resizeEnd', Math.max(props.minWidth, Math.min(props.maxWidth, startWidth + (e.clientX - startX))))
}

onBeforeUnmount(() => {
  if (dragging.value) {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }
})
</script>

<template>
  <div
    class="resize-handle"
    :class="{ dragging }"
    role="separator"
    aria-orientation="vertical"
    aria-label="패널 폭 조절"
    @pointerdown="onPointerDown"
  >
    <div class="grip"></div>
  </div>
</template>

<style scoped>
.resize-handle {
  position: relative;
  width: 5px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  transition: background 0.1s ease;
}

.resize-handle:hover,
.resize-handle.dragging {
  background: var(--color-accent);
}

.grip {
  position: absolute;
  left: -2px;
  right: -2px;
  top: 0;
  bottom: 0;
  /* hit area 확장 (보기엔 5px, 잡기엔 9px) */
}
</style>
