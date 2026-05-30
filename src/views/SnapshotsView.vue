<script setup lang="ts">
/**
 * Day 9: 스냅샷 관리 화면 (/snapshots)
 * - 프로젝트 선택 (있으면 자동)
 * - 스냅샷 목록 (최신순, 핀 표시, 자동 배지)
 * - 액션: 비교 / 복원 / 삭제 / 핀
 *   - 복원은 Day 9.5 에서 활성. 지금은 [⤴ 복원] = disabled + tooltip
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSnapshotStore } from '../stores/snapshot'
import { useToastStore } from '../stores/toast'
import SnapshotCreateModal from '../components/SnapshotCreateModal.vue'
import SnapshotCompareModal from '../components/SnapshotCompareModal.vue'
import SnapshotStorageSettingsModal from '../components/SnapshotStorageSettingsModal.vue'
import SnapshotRestoreModal from '../components/SnapshotRestoreModal.vue'
import type { SnapshotMetaWire } from '../stores/snapshot'

const router = useRouter()
const snapshot = useSnapshotStore()
const toast = useToastStore()

const createOpen = ref(false)
const compareOpen = ref(false)
const compareSourceId = ref<string | null>(null)
const settingsOpen = ref(false)
const restoreOpen = ref(false)
const restoreTarget = ref<SnapshotMetaWire | null>(null)

function openRestore(snap: SnapshotMetaWire) {
  restoreTarget.value = snap
  restoreOpen.value = true
}

async function onRestored(autoBackupId: string | null) {
  if (autoBackupId) {
    // 자동 백업이 목록에 추가됨 — 사용자가 알도록
    toast.info('📦 자동 백업 생성됨 — 복원 전 상태', autoBackupId)
  }
  // 목록 refresh 은 store.restore 안에서 이미 됨
}

// 저장 루트 (헤더 표시 + [폴더 열기] 액션용)
const storageRoot = ref<string | null>(null)

async function refreshStorageRoot() {
  if (!snapshot.currentProject) {
    storageRoot.value = null
    return
  }
  const r = await window.textdiff.snapshotGetPaths(snapshot.currentProject)
  if (r.ok && r.rootDir) {
    storageRoot.value = r.rootDir
  }
}

watch(() => snapshot.currentProject, refreshStorageRoot)

function openSettings() {
  settingsOpen.value = true
}

async function onSettingsClosed() {
  settingsOpen.value = false
  // 모드가 바뀌었을 수 있음 → 저장 루트 표시 갱신
  await refreshStorageRoot()
}

async function openStorageRoot() {
  if (!storageRoot.value) return
  await window.textdiff.showInFolder(storageRoot.value)
}

async function revealSnapshotInFolder(id: string) {
  if (!snapshot.currentProject) return
  const r = await window.textdiff.snapshotGetPaths(snapshot.currentProject, id)
  if (r.ok && r.snapshotPath) {
    await window.textdiff.showInFolder(r.snapshotPath)
  } else {
    toast.error('위치 열기 실패', r.error ?? '알 수 없음')
  }
}

const sorted = computed(() => snapshot.sortedSnapshots)

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function pickProject() {
  const r = await window.textdiff.snapshotPickProjectFolder()
  if (r.canceled || !r.folderPath) return
  snapshot.setCurrentProject(r.folderPath)
  await snapshot.refresh()
}

function openCreate() {
  createOpen.value = true
}

async function onCreated(_id: string) {
  // 모달 안에서 refresh 이미 호출함 — 여기선 close 만
  createOpen.value = false
}

function openCompare(sourceId: string) {
  compareSourceId.value = sourceId
  compareOpen.value = true
}

async function togglePin(id: string) {
  await snapshot.togglePin(id)
}

async function remove(id: string) {
  const snap = snapshot.snapshots.find((s) => s.id === id)
  if (!snap) return
  const sure = confirm(
    `스냅샷 "${snap.id}" 을(를) 삭제할까요?\n` +
    `메모: ${snap.memo || '(없음)'}\n` +
    `${snap.fileCount}개 파일 / ${formatBytes(snap.sizeBytes)}\n\n` +
    `이 작업은 되돌릴 수 없습니다.`,
  )
  if (!sure) return
  const ok = await snapshot.remove(id)
  if (ok) {
    toast.info('스냅샷 삭제됨', snap.id)
  } else {
    toast.error('삭제 실패', snapshot.error ?? '알 수 없음')
  }
}

function back() {
  router.push('/')
}

onMounted(async () => {
  if (snapshot.currentProject) {
    await snapshot.refresh()
  } else if (snapshot.lastProjectPath) {
    snapshot.setCurrentProject(snapshot.lastProjectPath)
    await snapshot.refresh()
  }
  await refreshStorageRoot()
})
</script>

<template>
  <div class="snap-view">
    <header class="snap-header-bar">
      <button class="btn-back" @click="back">← 돌아가기</button>
      <div class="proj-info">
        <span v-if="snapshot.currentProject" class="proj-label">
          프로젝트:
          <code class="proj-path" :title="snapshot.currentProject">
            {{ snapshot.currentProject }}
          </code>
        </span>
        <span v-else class="proj-empty">프로젝트 미선택</span>
        <button class="btn btn-default btn-small" @click="pickProject">
          {{ snapshot.currentProject ? '폴더 변경' : '폴더 선택' }}
        </button>
      </div>
      <button
        class="btn btn-primary"
        :disabled="!snapshot.currentProject"
        @click="openCreate"
      >
        + 새 스냅샷
      </button>
    </header>

    <div v-if="snapshot.currentProject" class="info-row">
      <span>스냅샷: <strong>{{ sorted.length }}</strong>개</span>
      <span>총 크기: <strong>{{ formatBytes(snapshot.totalSize) }}</strong></span>
      <span>보관 정책: 최근 20개 + 핀 고정 무제한</span>
      <span class="auto-toggle" title="자동 모드는 추후 추가 예정">
        자동 모드: <span class="badge-soon">OFF — 추후 추가</span>
      </span>
    </div>
    <div v-if="storageRoot" class="storage-row">
      <span class="storage-label">저장 위치:</span>
      <code class="storage-path" :title="storageRoot">{{ storageRoot }}</code>
      <button class="btn btn-default btn-small" @click="openStorageRoot" title="탐색기에서 열기">
        📂 폴더 열기
      </button>
      <button class="btn btn-default btn-small" @click="openSettings" title="저장 위치 변경">
        ⚙ 저장 설정
      </button>
    </div>

    <main class="snap-main">
      <div v-if="!snapshot.currentProject" class="empty">
        프로젝트 폴더를 선택하세요.
      </div>
      <div v-else-if="snapshot.loading" class="empty">스냅샷 목록 로드 중...</div>
      <div v-else-if="snapshot.error" class="empty error">{{ snapshot.error }}</div>
      <div v-else-if="sorted.length === 0" class="empty">
        스냅샷이 아직 없습니다. [+ 새 스냅샷] 으로 첫 백업을 만드세요.
      </div>
      <ul v-else class="snap-list">
        <li
          v-for="snap in sorted"
          :key="snap.id"
          class="snap-card"
          :class="{ pinned: snap.pinned, auto: snap.auto }"
        >
          <div class="snap-card-head">
            <span class="snap-id">📦 {{ snap.id }}</span>
            <span v-if="snap.pinned" class="badge badge-pin">📌 핀</span>
            <span v-if="snap.auto" class="badge badge-auto">자동</span>
            <span class="snap-date">{{ formatDate(snap.createdAt) }}</span>
            <span class="snap-size">{{ formatBytes(snap.sizeBytes) }}</span>
          </div>
          <div v-if="snap.memo" class="snap-memo">{{ snap.memo }}</div>
          <div class="snap-meta">
            {{ snap.fileCount.toLocaleString() }} 파일
            <span class="snap-format">({{ snap.format === 'zip' ? '압축' : '폴더' }})</span>
          </div>
          <div class="snap-actions">
            <button class="action-btn" @click="openCompare(snap.id)">📊 비교 시작</button>
            <button
              class="action-btn danger-outline"
              @click="openRestore(snap)"
              title="이 스냅샷으로 폴더 복원 (위험 — 안전장치 3중)"
            >
              ⤴ 복원
            </button>
            <button
              class="action-btn"
              @click="revealSnapshotInFolder(snap.id)"
              title="탐색기에서 zip / 폴더 위치 열기"
            >
              📂 위치
            </button>
            <button class="action-btn" @click="togglePin(snap.id)">
              {{ snap.pinned ? '📌 핀 해제' : '📌 핀 고정' }}
            </button>
            <button class="action-btn danger" @click="remove(snap.id)">🗑 삭제</button>
          </div>
        </li>
      </ul>
    </main>

    <SnapshotCreateModal
      :open="createOpen"
      :initial-folder="snapshot.currentProject"
      @close="createOpen = false"
      @created="onCreated"
    />

    <SnapshotCompareModal
      :open="compareOpen"
      :source-snapshot-id="compareSourceId"
      @close="compareOpen = false"
    />

    <SnapshotStorageSettingsModal
      :open="settingsOpen"
      @close="onSettingsClosed"
    />

    <SnapshotRestoreModal
      :open="restoreOpen"
      :snapshot="restoreTarget"
      @close="restoreOpen = false"
      @restored="onRestored"
    />
  </div>
</template>

<style scoped>
.snap-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.snap-header-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.btn-back {
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  cursor: pointer;
  font-size: var(--text-sm);
}
.btn-back:hover {
  background: var(--color-bg-hover);
}

.proj-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: var(--space-2);
}
.proj-label {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.proj-path {
  font-family: var(--font-mono);
  color: var(--color-text);
  background: var(--color-bg);
  padding: 2px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  max-width: 460px;
  display: inline-block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}
.proj-empty {
  flex: 1;
  color: var(--color-text-muted);
  font-style: italic;
  font-size: var(--text-sm);
}

.btn {
  padding: 6px 14px;
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
.btn-default:hover {
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

.info-row {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  align-items: center;
}
.auto-toggle {
  margin-left: auto;
}

.storage-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 4px var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.storage-label {
  font-weight: 600;
  flex-shrink: 0;
}
.storage-path {
  flex: 1;
  font-family: var(--font-mono);
  color: var(--color-text);
  background: var(--color-bg);
  padding: 2px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge-soon {
  font-size: 10px;
  padding: 1px 6px;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-weight: 400;
}

.snap-main {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}

.empty {
  padding: var(--space-5);
  text-align: center;
  color: var(--color-text-muted);
  font-style: italic;
}
.empty.error {
  color: var(--color-danger);
}

.snap-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.snap-card {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
}
.snap-card.pinned {
  background: var(--color-bg-subtle);
  border-color: var(--color-source-snapshot);
}
.snap-card.auto {
  border-left: 4px solid var(--color-source-snapshot);
}

.snap-card-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  flex-wrap: wrap;
}
.snap-id {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-source-snapshot);
}
.badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-weight: 600;
}
.badge-pin {
  background: rgba(207, 126, 10, 0.1);
  color: var(--color-source-snapshot);
  border: 1px solid var(--color-source-snapshot);
}
.badge-auto {
  background: var(--color-source-snapshot);
  color: white;
}
.snap-date,
.snap-size {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}
.snap-size {
  margin-left: var(--space-2);
}
.snap-memo {
  margin-top: 6px;
  font-size: var(--text-sm);
  color: var(--color-text);
}
.snap-meta {
  margin-top: 4px;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.snap-format {
  margin-left: 4px;
  opacity: 0.7;
}
.snap-actions {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.action-btn {
  padding: 3px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  font-size: var(--text-xs);
  cursor: pointer;
}
.action-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
}
.action-btn.disabled,
.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.action-btn.danger {
  color: var(--color-danger);
  border-color: var(--color-danger);
}
.action-btn.danger:hover {
  background: var(--color-danger-bg);
}
.action-btn.danger-outline {
  color: var(--color-danger);
  border-color: var(--color-danger);
  font-weight: 600;
}
.action-btn.danger-outline:hover {
  background: var(--color-danger-bg);
}
</style>
