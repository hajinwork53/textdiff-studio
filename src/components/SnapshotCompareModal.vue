<script setup lang="ts">
/**
 * Day 9: 두 스냅샷 (또는 스냅샷 vs 현재 상태) 비교 모달
 *
 * 1. Target 선택: 다른 스냅샷 / 현재 상태
 * 2. 변경 파일 목록 (added / removed / both)
 * 3. 파일 선택 → comparison store 로드 → /diff
 *
 * Day 9 범위: `both` (양쪽 존재 — 진짜 diff) 만 선택 가능.
 * added/removed 는 정보 표시만. 향후 v1.1 에서 신규/삭제 비교 지원.
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSnapshotStore, type SnapshotMetaWire } from '../stores/snapshot'
import { useComparisonStore } from '../stores/comparison'
import { useToastStore } from '../stores/toast'

interface Props {
  open: boolean
  /** A 스냅샷 (source) — 부모가 카드에서 [비교 시작] 누른 항목 */
  sourceSnapshotId: string | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const router = useRouter()
const snapshot = useSnapshotStore()
const comparison = useComparisonStore()
const toast = useToastStore()

type TargetMode = 'snapshot' | 'current'
const targetMode = ref<TargetMode>('current')
const targetSnapshotId = ref<string | null>(null)

const loading = ref(false)
const error = ref<string | null>(null)

interface DiffResult {
  added: string[]
  removed: string[]
  both: string[]
}
const diff = ref<DiffResult | null>(null)
const selectedFile = ref<string | null>(null)

const sourceSnap = computed<SnapshotMetaWire | null>(() => {
  if (!props.sourceSnapshotId) return null
  return snapshot.snapshots.find((s) => s.id === props.sourceSnapshotId) ?? null
})

const targetSnap = computed<SnapshotMetaWire | null>(() => {
  if (!targetSnapshotId.value) return null
  return snapshot.snapshots.find((s) => s.id === targetSnapshotId.value) ?? null
})

const otherSnapshots = computed<SnapshotMetaWire[]>(() =>
  snapshot.snapshots.filter((s) => s.id !== props.sourceSnapshotId),
)

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      targetMode.value = 'current'
      targetSnapshotId.value = null
      diff.value = null
      selectedFile.value = null
      error.value = null
      await loadDiff()
    }
  },
)

watch([targetMode, targetSnapshotId], async () => {
  if (props.open) await loadDiff()
})

async function loadDiff() {
  if (!props.sourceSnapshotId || !snapshot.currentProject) return
  if (targetMode.value === 'snapshot' && !targetSnapshotId.value) {
    diff.value = null
    return
  }
  loading.value = true
  error.value = null
  diff.value = null
  selectedFile.value = null
  try {
    const r = await window.textdiff.snapshotDiffFiles(
      snapshot.currentProject,
      props.sourceSnapshotId,
      targetMode.value === 'snapshot' ? targetSnapshotId.value : null,
    )
    if (r.ok && r.diff) {
      diff.value = r.diff
    } else {
      error.value = r.error ?? '변경 파일 목록 조회 실패'
    }
  } finally {
    loading.value = false
  }
}

function labelOf(snap: SnapshotMetaWire): string {
  const memo = snap.memo ? ` — "${snap.memo}"` : ''
  return `${formatDate(snap.createdAt)}${memo}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const canStart = computed(() => !!selectedFile.value && !!sourceSnap.value)

async function startCompare() {
  if (!canStart.value || !sourceSnap.value || !selectedFile.value) return
  if (!snapshot.currentProject) return
  const relpath = selectedFile.value
  const sourceLabel = labelOf(sourceSnap.value)

  // 슬롯 초기화
  comparison.resetForNewComparison()
  comparison.clearSlot(0)
  comparison.clearSlot(1)

  // A = source snapshot
  await comparison.loadFromSnapshot(
    0,
    snapshot.currentProject,
    sourceSnap.value.id,
    sourceLabel,
    relpath,
  )

  // B = target snapshot OR current file
  if (targetMode.value === 'snapshot' && targetSnap.value) {
    const targetLabel = labelOf(targetSnap.value)
    await comparison.loadFromSnapshot(
      1,
      snapshot.currentProject,
      targetSnap.value.id,
      targetLabel,
      relpath,
    )
  } else {
    // 현재 상태 = 실제 폴더 안의 파일 (점프 가능)
    const sep = snapshot.currentProject.endsWith('/') || snapshot.currentProject.endsWith('\\')
      ? ''
      : '\\'
    const absPath = snapshot.currentProject + sep + relpath.replace(/\//g, '\\')
    await comparison.loadFile(1, absPath)
  }

  const sa = comparison.slots[0]
  const sb = comparison.slots[1]
  if (sa.status === 'ready' && sb.status === 'ready') {
    comparison.setEntrySource('snapshot')
    emit('close')
    router.push('/diff')
  } else {
    toast.error('비교 로드 실패', sa.error ?? sb.error ?? '알 수 없음')
  }
}

function close() {
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="snap-backdrop" @click.self="close">
      <div class="snap-modal" role="dialog" aria-labelledby="snap-compare-title">
        <header class="snap-header">
          <h2 id="snap-compare-title" class="snap-title">📦 스냅샷 비교</h2>
          <button class="btn-close" @click="close" aria-label="닫기">✕</button>
        </header>

        <div class="snap-body">
          <!-- Source (A) -->
          <section class="form-row">
            <div class="row-label">A · 원본 스냅샷</div>
            <div v-if="sourceSnap" class="snap-info">
              <code class="snap-id">{{ sourceSnap.id }}</code>
              <span v-if="sourceSnap.memo" class="snap-memo">"{{ sourceSnap.memo }}"</span>
            </div>
            <div v-else class="state-msg">스냅샷이 지정되지 않음</div>
          </section>

          <!-- Target mode -->
          <section class="form-row">
            <div class="row-label">B · 비교 대상</div>
            <div class="mode-list">
              <label class="mode-option" :class="{ active: targetMode === 'current' }">
                <input v-model="targetMode" type="radio" value="current" />
                <div>
                  <div class="mode-name">현재 작업 폴더 상태</div>
                  <div class="mode-detail">스냅샷 만든 후 변경된 파일을 봄</div>
                </div>
              </label>
              <label class="mode-option" :class="{ active: targetMode === 'snapshot' }">
                <input v-model="targetMode" type="radio" value="snapshot" />
                <div>
                  <div class="mode-name">다른 스냅샷</div>
                  <div class="mode-detail">두 시점 사이의 변경을 봄</div>
                </div>
              </label>
            </div>
            <select
              v-if="targetMode === 'snapshot'"
              v-model="targetSnapshotId"
              class="snap-select"
            >
              <option :value="null">— 스냅샷 선택 —</option>
              <option v-for="s in otherSnapshots" :key="s.id" :value="s.id">
                {{ labelOf(s) }}
              </option>
            </select>
          </section>

          <!-- 변경 파일 -->
          <section class="files-section">
            <div class="row-label">
              변경 파일
              <span v-if="diff" class="files-count">
                ({{ diff.both.length }} 수정 / {{ diff.added.length }} 신규 / {{ diff.removed.length }} 삭제)
              </span>
            </div>
            <div v-if="loading" class="state-msg">파일 목록 로드 중...</div>
            <div v-else-if="error" class="state-msg error">{{ error }}</div>
            <template v-else-if="diff">
              <!-- 양쪽 존재 — 내용 비교 가능 -->
              <div v-if="diff.both.length > 0" class="files-block">
                <div class="block-head">⟳ 양쪽 존재 — 클릭하여 비교</div>
                <div class="files-list">
                  <label
                    v-for="f in diff.both"
                    :key="f"
                    class="file-row"
                    :class="{ active: selectedFile === f }"
                  >
                    <input v-model="selectedFile" type="radio" :value="f" />
                    <span class="file-path" :title="f">{{ f }}</span>
                  </label>
                </div>
              </div>
              <!-- 신규 (B 에만) — Day 9 에선 비교 X, 정보만 -->
              <div v-if="diff.added.length > 0" class="files-block info">
                <div class="block-head">⊕ B 에만 존재 ({{ diff.added.length }}개 — 내용 비교는 v1.1 예정)</div>
                <div class="files-list dim">
                  <div v-for="f in diff.added.slice(0, 30)" :key="f" class="file-row info">
                    <span class="file-path" :title="f">{{ f }}</span>
                  </div>
                  <div v-if="diff.added.length > 30" class="more">
                    ... +{{ diff.added.length - 30 }} 더
                  </div>
                </div>
              </div>
              <!-- 삭제 (A 에만) -->
              <div v-if="diff.removed.length > 0" class="files-block info">
                <div class="block-head">⊖ A 에만 존재 ({{ diff.removed.length }}개 — 내용 비교는 v1.1 예정)</div>
                <div class="files-list dim">
                  <div v-for="f in diff.removed.slice(0, 30)" :key="f" class="file-row info">
                    <span class="file-path" :title="f">{{ f }}</span>
                  </div>
                  <div v-if="diff.removed.length > 30" class="more">
                    ... +{{ diff.removed.length - 30 }} 더
                  </div>
                </div>
              </div>
              <div
                v-if="diff.both.length === 0 && diff.added.length === 0 && diff.removed.length === 0"
                class="state-msg"
              >
                변경된 파일 없음
              </div>
            </template>
            <div v-else class="state-msg dim">대상 선택 후 비교 가능</div>
          </section>
        </div>

        <footer class="snap-actions">
          <button class="btn btn-default" @click="close">취소 (Esc)</button>
          <button class="btn btn-primary" :disabled="!canStart" @click="startCompare">
            비교 시작 →
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.snap-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
}
.snap-modal {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  width: min(820px, 96vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.snap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}
.snap-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-source-snapshot);
}
.btn-close {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: var(--text-base);
  cursor: pointer;
  padding: 4px 8px;
}
.btn-close:hover {
  color: var(--color-text);
}
.snap-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.files-count {
  font-weight: 400;
  text-transform: none;
  color: var(--color-text);
  font-family: var(--font-mono);
}
.snap-info {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding: 8px 12px;
  background: var(--color-bg-subtle);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}
.snap-id {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-source-snapshot);
}
.snap-memo {
  color: var(--color-text-muted);
}

.mode-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.mode-option {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  align-items: flex-start;
}
.mode-option.active {
  border-color: var(--color-source-snapshot);
  background: rgba(207, 126, 10, 0.04);
}
.mode-name {
  font-size: var(--text-sm);
  font-weight: 500;
}
.mode-detail {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-top: 2px;
}

.snap-select {
  margin-top: 6px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-size: var(--text-sm);
}

.files-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.files-block {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
}
.files-block.info {
  background: var(--color-bg-subtle);
}

.block-head {
  padding: 6px 10px;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
  font-weight: 600;
}

.files-list {
  max-height: 260px;
  overflow-y: auto;
}
.files-list.dim {
  max-height: 160px;
  opacity: 0.7;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  font-size: var(--text-sm);
}
.file-row:last-child {
  border-bottom: none;
}
.file-row:hover:not(.info) {
  background: var(--color-bg-hover);
}
.file-row.active {
  background: rgba(207, 126, 10, 0.06);
}
.file-row.info {
  cursor: default;
}
.file-path {
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.more {
  padding: 6px 10px;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-style: italic;
}

.state-msg {
  padding: var(--space-3);
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-style: italic;
}
.state-msg.error {
  color: var(--color-danger);
}
.state-msg.dim {
  color: var(--color-text-muted);
}

.snap-actions {
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
