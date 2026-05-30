<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { RouterView } from 'vue-router'
import BinaryFileModal from './components/BinaryFileModal.vue'
import Toast from './components/Toast.vue'
import TextTrackerModal from './components/TextTrackerModal.vue'
import { useCliDispatcher } from './composables/useCliDispatcher'
import { useTextTrackerStore } from './stores/textTracker'
import { useSettingsStore } from './stores/settings'

// Day 8: CLI 진입점 dispatch 수신 등록
useCliDispatcher()

// Day 9 hotfix: settings 의 snapshotStorage 를 main 에 push (앱 시작 시 1회)
const settings = useSettingsStore()
settings.syncSnapshotStorageToMain().catch(() => { /* silent */ })

// Day 8.5 hotfix: 글로벌 Ctrl+Shift+F → TextTrackerModal
const tracker = useTextTrackerStore()

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    // 모달이 이미 떠있으면 닫지 않음 (사용자가 의도치 않게 검색 결과 잃을 수 있음)
    if (tracker.modalOpen) return
    // 활성 요소에서 선택된 텍스트 prefill (input/textarea/contenteditable/window selection)
    const sel = window.getSelection()?.toString() ?? ''
    tracker.openModal(sel)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="app">
    <RouterView />

    <!-- 글로벌 오버레이 -->
    <BinaryFileModal />
    <Toast />
    <TextTrackerModal />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-ui);
  overflow: hidden;
}
</style>
