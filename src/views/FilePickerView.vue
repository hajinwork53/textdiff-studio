<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useComparisonStore } from '../stores/comparison'
import { useToastStore } from '../stores/toast'
import { useSettingsStore } from '../stores/settings'
import { useGitStore } from '../stores/git'
import { useTextTrackerStore } from '../stores/textTracker'
import { usePasteHandler } from '../composables/usePasteHandler'
import FileSlot from '../components/FileSlot.vue'
import EditorSettingsModal from '../components/EditorSettingsModal.vue'
import GitCompareModal from '../components/GitCompareModal.vue'

const router = useRouter()
const comparison = useComparisonStore()
const toast = useToastStore()
const settings = useSettingsStore()
const git = useGitStore()
const tracker = useTextTrackerStore()

const labels = ['A', 'B', 'C', 'D', 'E']
const settingsOpen = ref(false)
const gitModalOpen = ref(false)
const pasteEnabled = ref(true) // FilePicker 진입 시 항상 활성

const canCompare = computed(() => comparison.canCompare)

function startCompare() {
  if (!canCompare.value) {
    toast.warning('비교 시작 불가', '두 슬롯 모두 정상적으로 로드되어야 합니다.')
    return
  }
  // Day 10.5 hotfix: 진입 출처 기록 (back 시 어디로 돌아갈지 결정)
  // 슬롯 source 가 모두 clipboard 면 'clipboard', 아니면 'file'
  const allClipboard = comparison.slots.every((s) => s.source?.kind === 'clipboard')
  comparison.setEntrySource(allClipboard ? 'clipboard' : 'file')
  router.push('/diff')
}

// Ctrl+V → 첫 빈 슬롯에 페이스트
function onPaste(text: string) {
  if (!text) {
    toast.warning('클립보드 비어있음', '복사한 텍스트가 없습니다.')
    return
  }
  const idx = comparison.firstEmptySlotIndex
  if (idx < 0) {
    toast.warning('빈 슬롯 없음', '슬롯을 먼저 비우거나 슬롯 개수를 늘리세요.')
    return
  }
  const entry = comparison.loadFromClipboard(idx, text)
  if (entry) {
    toast.info(
      `📋 클립보드 #${entry.id} → 슬롯 ${labels[idx]}`,
      `${entry.lineCount}줄 · ${formatBytes(entry.size)}`,
    )
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

// 클립보드 페이스트 빠른 액션 (버튼)
async function pasteToFirstEmpty() {
  const result = await window.textdiff.readClipboard()
  if (result.isEmpty) {
    toast.warning('클립보드 비어있음', '복사한 텍스트가 없습니다.')
    return
  }
  onPaste(result.text)
}

usePasteHandler({ enabled: pasteEnabled, onPaste })

function openGitModal() {
  if (!git.available) {
    toast.warning('Git 미설치', '시스템에 Git CLI 가 설치되어 있지 않습니다.')
    return
  }
  gitModalOpen.value = true
}

function openGitInstallGuide() {
  window.textdiff.openInEditor('https://git-scm.com/download/win')
}

// Day 8.5 hotfix: 비교 시작 안 해도 텍스트 추적 가능
function openTracker() {
  tracker.openModal()
}

// Day 9: 스냅샷 관리 화면으로
function openSnapshots() {
  router.push('/snapshots')
}

// Day 8: CLI 가 --git-working 만 지정 (relpath 없음) 으로 들어오면 모달 자동 오픈
function consumePendingGitOpen() {
  const mode = git.consumePendingOpenModal()
  if (mode && git.available) {
    gitModalOpen.value = true
  }
}

onMounted(consumePendingGitOpen)
watch(() => git.pendingOpenModal, consumePendingGitOpen)
</script>

<template>
  <div class="picker-view">
    <header class="picker-header">
      <h1>TextDiff Studio</h1>
      <div class="header-meta">
        <button
          class="settings-btn"
          :title="`외부 에디터: ${settings.editor.scheme}`"
          @click="settingsOpen = true"
        >
          ⚙ {{ settings.editor.scheme }}
        </button>
        <span class="badge">Day 6 — 클립보드 비교</span>
      </div>
    </header>

    <main class="picker-main">
      <section class="section">
        <div class="section-title">
          비교할 파일
          <span class="section-meta">파일 개수: {{ comparison.slotCount }}</span>
        </div>

        <div class="slot-grid" :style="{ gridTemplateColumns: `repeat(${comparison.slotCount}, 1fr)` }">
          <FileSlot
            v-for="(slot, idx) in comparison.slots"
            :key="idx"
            :slot="slot"
            :label="labels[idx]"
          />
        </div>
      </section>

      <section class="section">
        <div class="section-title">빠른 비교</div>
        <div class="quick-actions">
          <button class="quick-btn quick-btn-active" @click="pasteToFirstEmpty" title="Ctrl+V 와 동일">
            📋 클립보드 붙여넣기 (Ctrl+V)
          </button>
          <button
            class="quick-btn"
            :class="{ 'quick-btn-git-active': git.available }"
            :disabled="!git.available"
            @click="openGitModal"
            :title="git.available ? `Git ${git.version} — HEAD/커밋/브랜치 비교` : 'Git 미설치'"
          >
            ⎇ Git 비교 <span v-if="!git.available" class="git-soon">(Git 미설치)</span>
          </button>
          <button
            class="quick-btn quick-btn-tracker-active"
            @click="openTracker"
            title="비교 시작 안 해도 코드 검색 가능 (Ctrl+Shift+F)"
          >
            🔍 텍스트 추적
          </button>
          <button
            class="quick-btn quick-btn-snapshot-active"
            @click="openSnapshots"
            title="폴더 백업 + 두 시점 비교 + (Day 9.5) 복원"
          >
            📦 스냅샷 관리
          </button>
        </div>
        <p class="hint">
          💡 AI 응답을 복사한 후 <kbd>Ctrl+V</kbd> 누르면 자동으로 빈 슬롯에 추가됩니다.
          어디서든 <kbd>Ctrl+Shift+F</kbd> 로 코드 위치 검색.
          <span v-if="!git.available">
            Git 비교를 사용하려면
            <a href="#" @click.prevent="openGitInstallGuide">Git 설치</a> 필요.
          </span>
        </p>
      </section>

      <section class="section">
        <div class="section-title">최근 비교 <span class="coming-soon">(Day 6+ 예정 — electron-store)</span></div>
        <div class="recent-placeholder">
          기록된 비교가 없습니다.
        </div>
      </section>
    </main>

    <footer class="picker-footer">
      <div class="footer-info">
        {{ canCompare ? '두 파일 모두 준비됨' : '두 파일 슬롯을 채우세요' }}
      </div>
      <button
        class="btn-compare"
        :disabled="!canCompare"
        @click="startCompare"
      >
        비교 시작 →
      </button>
    </footer>

    <EditorSettingsModal
      :open="settingsOpen"
      @close="settingsOpen = false"
    />

    <GitCompareModal
      :open="gitModalOpen"
      @close="gitModalOpen = false"
    />
  </div>
</template>

<style scoped>
.picker-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.picker-header h1 {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.settings-btn {
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-size: var(--text-xs);
  cursor: pointer;
}

.settings-btn:hover {
  background: var(--color-bg-hover);
}

.badge {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
}

.picker-main {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text);
}

.section-meta {
  font-weight: 400;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.coming-soon {
  font-weight: 400;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-style: italic;
}

.slot-grid {
  display: grid;
  gap: var(--space-3);
}

.quick-actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.quick-btn {
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  cursor: not-allowed;
  opacity: 0.6;
}

.quick-btn-active {
  cursor: pointer;
  opacity: 1;
  color: var(--color-source-clipboard);
  border-color: var(--color-source-clipboard);
  font-weight: 500;
}

.quick-btn-active:hover {
  background: rgba(9, 105, 218, 0.08);
}

.quick-btn-git-active {
  cursor: pointer;
  opacity: 1;
  color: var(--color-source-git);
  border-color: var(--color-source-git);
  font-weight: 500;
}

.quick-btn-git-active:hover {
  background: rgba(111, 66, 193, 0.08);
}

.quick-btn-tracker-active {
  cursor: pointer;
  opacity: 1;
  color: var(--color-accent);
  border-color: var(--color-accent);
  font-weight: 500;
}

.quick-btn-tracker-active:hover {
  background: rgba(9, 105, 218, 0.08);
}

.quick-btn-snapshot-active {
  cursor: pointer;
  opacity: 1;
  color: var(--color-source-snapshot);
  border-color: var(--color-source-snapshot);
  font-weight: 500;
}

.quick-btn-snapshot-active:hover {
  background: rgba(207, 126, 10, 0.08);
}

.git-soon {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-style: italic;
}

.hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.hint kbd {
  display: inline-block;
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
}

.recent-placeholder {
  padding: var(--space-4);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-style: italic;
  text-align: center;
  font-size: var(--text-sm);
}

.picker-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.footer-info {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.btn-compare {
  padding: 8px 20px;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: white;
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-compare:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.btn-compare:disabled {
  background: var(--color-border);
  border-color: var(--color-border);
  cursor: not-allowed;
}
</style>
