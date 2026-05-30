<script setup lang="ts">
/**
 * Day 9: 스냅샷 생성 모달
 * - 폴더 선택 / 변경
 * - scan 프리뷰 (파일 수 + 크기 + 예상 format)
 * - 메모 + 핀 고정 + 압축 강제 옵션
 * - 진행률 (큰 폴더 대비)
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useSnapshotStore } from '../stores/snapshot'
import { useToastStore } from '../stores/toast'

interface Props {
  open: boolean
  /** 초기 폴더 (있으면 자동 scan) */
  initialFolder?: string | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', snapshotId: string): void
}>()

const snapshot = useSnapshotStore()
const toast = useToastStore()

const folder = ref<string | null>(null)
const memo = ref('')
const pinned = ref(false)
const forceFolderFormat = ref(false)

const scanLoading = ref(false)
const scanError = ref<string | null>(null)
const fileCount = ref<number | null>(null)
const totalBytes = ref<number | null>(null)
const suggestedFormat = ref<'zip' | 'folder' | null>(null)

const submitting = computed(() => snapshot.creating)

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      // 초기화
      memo.value = ''
      pinned.value = false
      forceFolderFormat.value = false
      scanError.value = null
      fileCount.value = null
      totalBytes.value = null
      suggestedFormat.value = null
      folder.value = props.initialFolder ?? snapshot.lastProjectPath ?? null
      if (folder.value) await runScan()
    }
  },
)

async function pickFolder() {
  const r = await window.textdiff.snapshotPickProjectFolder()
  if (r.canceled || !r.folderPath) return
  folder.value = r.folderPath
  await runScan()
}

async function runScan() {
  if (!folder.value) return
  scanLoading.value = true
  scanError.value = null
  fileCount.value = null
  totalBytes.value = null
  suggestedFormat.value = null
  try {
    const r = await window.textdiff.snapshotScan(folder.value)
    if (r.ok) {
      fileCount.value = r.fileCount ?? 0
      totalBytes.value = r.totalBytes ?? 0
      suggestedFormat.value = r.format ?? 'zip'
    } else {
      scanError.value = r.error ?? '스캔 실패'
    }
  } finally {
    scanLoading.value = false
  }
}

function formatBytes(b: number | null): string {
  if (b === null) return '?'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

async function submit() {
  if (!folder.value) {
    toast.warning('폴더 미지정', '먼저 폴더를 선택하세요.')
    return
  }
  if (fileCount.value === 0) {
    toast.warning('파일 없음', '제외 패턴 적용 후 백업할 파일이 없습니다.')
    return
  }
  snapshot.setCurrentProject(folder.value)
  const created = await snapshot.create(memo.value, pinned.value, forceFolderFormat.value)
  if (!created) {
    toast.error('스냅샷 생성 실패', snapshot.createError ?? '알 수 없음')
    return
  }
  toast.success(
    `📦 스냅샷 만들어짐 — ${created.id}`,
    `${created.fileCount}개 파일 · ${formatBytes(created.sizeBytes)}`,
  )
  emit('created', created.id)
  close()
}

function close() {
  if (submitting.value) return
  emit('close')
}

const progressPercent = computed(() => {
  const p = snapshot.createProgress
  if (!p || p.filesTotal === 0) return 0
  return Math.min(100, Math.round((p.filesDone / p.filesTotal) * 100))
})

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
    <div v-if="open" class="snap-backdrop" @click.self="close">
      <div class="snap-modal" role="dialog" aria-labelledby="snap-create-title">
        <header class="snap-header">
          <h2 id="snap-create-title" class="snap-title">📦 새 스냅샷 만들기</h2>
          <button class="btn-close" :disabled="submitting" @click="close" aria-label="닫기">✕</button>
        </header>

        <div class="snap-body">
          <!-- 폴더 -->
          <section class="form-row">
            <div class="row-label">프로젝트 폴더</div>
            <div class="folder-row">
              <code v-if="folder" class="folder-path" :title="folder">{{ folder }}</code>
              <span v-else class="folder-empty">선택된 폴더 없음</span>
              <button class="btn btn-default btn-small" :disabled="submitting" @click="pickFolder">
                {{ folder ? '폴더 변경' : '폴더 선택' }}
              </button>
            </div>
          </section>

          <!-- 스캔 결과 -->
          <section class="scan-info">
            <div v-if="scanLoading" class="state-msg">파일 스캔 중...</div>
            <div v-else-if="scanError" class="state-msg error">{{ scanError }}</div>
            <div v-else-if="fileCount !== null" class="scan-result">
              <div>
                <span class="scan-label">파일 수:</span>
                <strong>{{ fileCount.toLocaleString() }}</strong>
                <span class="scan-help">(제외 패턴 적용 후)</span>
              </div>
              <div>
                <span class="scan-label">예상 크기:</span>
                <strong>{{ formatBytes(totalBytes) }}</strong>
              </div>
              <div v-if="suggestedFormat === 'folder'" class="scan-note">
                ⚠ 큰 폴더 — 압축 대신 폴더 복사 모드로 자동 전환됩니다 (더 빠름).
              </div>
            </div>
            <div v-else class="state-msg dim">폴더를 선택하면 스캔합니다.</div>
          </section>

          <!-- 메모 -->
          <section class="form-row">
            <label class="row-label" for="snap-memo">메모 (선택)</label>
            <input
              id="snap-memo"
              v-model="memo"
              type="text"
              class="memo-input"
              placeholder="예: AI 리팩토링 시작"
              :disabled="submitting"
              maxlength="80"
            />
          </section>

          <!-- 고급 옵션 -->
          <section class="opts-row">
            <label class="opt-chip">
              <input v-model="pinned" type="checkbox" :disabled="submitting" />
              <span>📌 핀 고정 <span class="opt-help">(자동 삭제 제외)</span></span>
            </label>
            <label class="opt-chip">
              <input v-model="forceFolderFormat" type="checkbox" :disabled="submitting" />
              <span>📁 폴더 복사 강제 <span class="opt-help">(압축 안 함)</span></span>
            </label>
          </section>

          <!-- 진행률 -->
          <section v-if="submitting && snapshot.createProgress" class="progress-section">
            <div class="progress-label">
              {{ snapshot.createProgress.phase === 'pack' ? '백업 진행 중' :
                 snapshot.createProgress.phase === 'finalize' ? '마무리 중' : '스캔 중' }}
              ·
              {{ snapshot.createProgress.filesDone.toLocaleString() }} /
              {{ snapshot.createProgress.filesTotal.toLocaleString() }} 파일
              ({{ progressPercent }}%)
            </div>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
            </div>
          </section>
        </div>

        <footer class="snap-actions">
          <button class="btn btn-default" :disabled="submitting" @click="close">취소 (Esc)</button>
          <button
            class="btn btn-primary"
            :disabled="!folder || fileCount === 0 || scanLoading || submitting"
            @click="submit"
          >
            {{ submitting ? '생성 중...' : '📦 생성 시작' }}
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
  width: min(640px, 96vw);
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
.btn-close:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-close:hover:not(:disabled) {
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

.folder-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.folder-path {
  flex: 1;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  padding: 6px 10px;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-empty {
  flex: 1;
  color: var(--color-text-muted);
  font-style: italic;
  font-size: var(--text-sm);
  padding: 6px 10px;
  background: var(--color-bg-subtle);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
}

.scan-info {
  padding: var(--space-3);
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.scan-result {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--text-sm);
}
.scan-label {
  color: var(--color-text-muted);
  margin-right: 6px;
}
.scan-help {
  margin-left: 6px;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.scan-note {
  margin-top: 4px;
  font-size: var(--text-xs);
  color: var(--color-warning, #d97706);
}

.state-msg {
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

.memo-input {
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-family: var(--font-ui);
  background: var(--color-bg);
}
.memo-input:focus {
  outline: none;
  border-color: var(--color-source-snapshot);
}

.opts-row {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.opt-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  cursor: pointer;
  font-size: var(--text-sm);
}
.opt-chip:hover {
  background: var(--color-bg-hover);
}
.opt-help {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.progress-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}
.progress-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}
.progress-bar {
  height: 8px;
  background: var(--color-bg-subtle);
  border-radius: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--color-source-snapshot);
  transition: width 0.2s ease;
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
  font-size: var(--text-sm);
  cursor: pointer;
  background: var(--color-bg);
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
