<script setup lang="ts">
/**
 * Day 9 hotfix: 스냅샷 저장 위치 설정 모달
 *  - project (기본): <프로젝트>/snapshots
 *  - appdata        : %APPDATA%/TextDiff/snapshots/<해시>
 *  - custom         : 사용자 지정 폴더/<해시>
 *
 * 변경 후 즉시 main 에 push.
 * 기존 스냅샷은 위치 옮기지 않음 — 모드 바꾸면 이전 위치의 스냅샷은 안 보임 (안내 표시).
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useSettingsStore, type SnapshotStorageMode } from '../stores/settings'
import { useSnapshotStore } from '../stores/snapshot'
import { useToastStore } from '../stores/toast'

interface Props {
  open: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const settings = useSettingsStore()
const snapshot = useSnapshotStore()
const toast = useToastStore()

const mode = ref<SnapshotStorageMode>(settings.snapshotStorage.mode)
const customPath = ref<string | null>(settings.snapshotStorage.customPath)

const submitting = ref(false)

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      mode.value = settings.snapshotStorage.mode
      customPath.value = settings.snapshotStorage.customPath
    }
  },
)

async function pickCustom() {
  const r = await window.textdiff.pickSnapshotStorageFolder()
  if (r.canceled || !r.folderPath) return
  customPath.value = r.folderPath
  mode.value = 'custom'
}

const canSave = computed(() => {
  if (mode.value === 'custom') {
    return !!(customPath.value && customPath.value.trim().length > 0)
  }
  return true
})

async function save() {
  if (!canSave.value) {
    toast.warning('저장 불가', 'custom 모드는 폴더 선택이 필요합니다.')
    return
  }
  submitting.value = true
  try {
    await settings.setSnapshotStorage(mode.value, customPath.value)
    // 현재 프로젝트의 스냅샷 목록 다시 로드 (새 위치 기준)
    if (snapshot.currentProject) {
      await snapshot.refresh()
    }
    toast.success('저장 위치 설정 변경됨', describeMode(mode.value, customPath.value))
    emit('close')
  } finally {
    submitting.value = false
  }
}

function describeMode(m: SnapshotStorageMode, c: string | null): string {
  if (m === 'project') return '프로젝트 폴더 안 snapshots/'
  if (m === 'appdata') return '%APPDATA%/TextDiff/snapshots/<프로젝트해시>'
  if (m === 'custom' && c) return `${c}/<프로젝트해시>`
  return '미정'
}

function close() {
  if (submitting.value) return
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape' && !submitting.value) {
    e.preventDefault()
    close()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="settings-backdrop" @click.self="close">
      <div class="settings-modal" role="dialog" aria-labelledby="settings-title">
        <header class="settings-header">
          <h2 id="settings-title" class="settings-title">⚙ 스냅샷 저장 위치 설정</h2>
          <button class="btn-close" :disabled="submitting" @click="close" aria-label="닫기">✕</button>
        </header>

        <div class="settings-body">
          <p class="lead">
            스냅샷 (zip / 폴더) 들을 어디에 저장할지 선택하세요.
            <br />변경 후 만들어지는 스냅샷부터 새 위치에 저장됩니다. 기존 스냅샷은 이동되지 않습니다.
          </p>

          <div class="mode-list">
            <!-- project -->
            <label class="mode-option" :class="{ active: mode === 'project' }">
              <input v-model="mode" type="radio" value="project" />
              <div class="mode-info">
                <div class="mode-name">📁 프로젝트 폴더 (기본)</div>
                <div class="mode-detail">
                  <code>&lt;프로젝트&gt;/snapshots/</code> — 백업 위치가 직관적, 프로젝트 이동 시 같이 따라감
                </div>
                <div class="mode-warn">
                  ⚠ Git 사용 시 <code>.gitignore</code> 에 <code>snapshots/</code> 추가 필요.
                  OneDrive / Dropbox 폴더면 클라우드 동기화 부담.
                </div>
              </div>
            </label>

            <!-- appdata -->
            <label class="mode-option" :class="{ active: mode === 'appdata' }">
              <input v-model="mode" type="radio" value="appdata" />
              <div class="mode-info">
                <div class="mode-name">🗄 사용자 AppData</div>
                <div class="mode-detail">
                  <code>%APPDATA%/TextDiff/snapshots/&lt;프로젝트해시&gt;/</code> —
                  프로젝트 안 더럽힘 X, OneDrive 영향 X
                </div>
                <div class="mode-help">
                  단점: 백업 위치 찾기 어려움 (관리 화면의 [📂 폴더 열기] 로 접근)
                </div>
              </div>
            </label>

            <!-- custom -->
            <label class="mode-option" :class="{ active: mode === 'custom' }">
              <input v-model="mode" type="radio" value="custom" />
              <div class="mode-info">
                <div class="mode-name">📂 사용자 지정 폴더</div>
                <div class="mode-detail">
                  별도 드라이브 등에 저장. 폴더 안에 프로젝트별 해시 폴더가 생성됨.
                </div>
                <div class="custom-row">
                  <code v-if="customPath" class="custom-path" :title="customPath">{{ customPath }}</code>
                  <span v-else class="custom-empty">폴더 미선택</span>
                  <button class="btn btn-default btn-small" type="button" @click="pickCustom">
                    {{ customPath ? '폴더 변경' : '폴더 선택' }}
                  </button>
                </div>
              </div>
            </label>
          </div>

          <div class="preview">
            <strong>새 저장 위치:</strong>
            <code>{{ describeMode(mode, customPath) }}</code>
          </div>
        </div>

        <footer class="settings-actions">
          <button class="btn btn-default" :disabled="submitting" @click="close">취소 (Esc)</button>
          <button class="btn btn-primary" :disabled="!canSave || submitting" @click="save">
            {{ submitting ? '저장 중...' : '저장' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1060;
}
.settings-modal {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  width: min(680px, 96vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}
.settings-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
}
.btn-close {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: var(--text-base);
  cursor: pointer;
  padding: 4px 8px;
}
.btn-close:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.lead {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.5;
}
.mode-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.mode-option {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
}
.mode-option.active {
  border-color: var(--color-source-snapshot);
  background: rgba(207, 126, 10, 0.04);
}
.mode-option input {
  margin-top: 2px;
}
.mode-info {
  flex: 1;
}
.mode-name {
  font-size: var(--text-sm);
  font-weight: 600;
}
.mode-detail {
  margin-top: 4px;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.mode-detail code {
  font-family: var(--font-mono);
  background: var(--color-bg-subtle);
  padding: 1px 4px;
  border-radius: 3px;
}
.mode-warn {
  margin-top: 4px;
  font-size: var(--text-xs);
  color: var(--color-warning, #d97706);
}
.mode-warn code {
  font-family: var(--font-mono);
  background: rgba(217, 119, 6, 0.1);
  padding: 1px 4px;
  border-radius: 3px;
}
.mode-help {
  margin-top: 4px;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-style: italic;
}
.custom-row {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.custom-path {
  flex: 1;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  padding: 4px 8px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.custom-empty {
  flex: 1;
  font-size: var(--text-xs);
  font-style: italic;
  color: var(--color-text-muted);
  padding: 4px 8px;
  background: var(--color-bg);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
}
.preview {
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-subtle);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.preview code {
  font-family: var(--font-mono);
  color: var(--color-source-snapshot);
}
.settings-actions {
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
  background: var(--color-bg);
  font-size: var(--text-sm);
  cursor: pointer;
}
.btn-small {
  padding: 4px 10px;
  font-size: var(--text-xs);
}
.btn-default:hover:not(:disabled) {
  background: var(--color-bg-hover);
}
.btn-primary {
  background: var(--color-source-snapshot);
  border-color: var(--color-source-snapshot);
  color: white;
  font-weight: 500;
}
.btn-primary:hover:not(:disabled) {
  filter: brightness(1.08);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
