<script setup lang="ts">
/**
 * Day 9.5: 스냅샷 복원 모달 — 위험 액션
 *
 * 디자인 (06§6.3):
 *   - 빨강 헤더 + 살짝 빨강 틴트 배경
 *   - 영향 분석 (added/overwritten/removed/unsafe + 디스크)
 *   - 안전장치 ✓ 체크리스트 (자동 백업 / 자동 롤백 / 디스크 사전 검사)
 *   - 스냅샷 ID 직접 타이핑 확인 (실시간 검증)
 *   - 버튼: 취소 (기본 포커스) / 복원 진행 (이름 일치 시만 활성, 빨강)
 *   - dry-run = 모달 열리자마자 자동 실행 (impact 표시)
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useSnapshotStore, type SnapshotMetaWire } from '../stores/snapshot'
import { useToastStore } from '../stores/toast'

interface Impact {
  willAdd: string[]
  willOverwrite: string[]
  unchanged: string[]
  willRemove: string[]
  unsafePaths: string[]
  estimatedBytes: number
  diskFreeBytes: number
  diskSufficient: boolean
  contentCompared: boolean
}

interface Props {
  open: boolean
  snapshot: SnapshotMetaWire | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'restored', autoBackupId: string | null): void
}>()

const store = useSnapshotStore()
const toast = useToastStore()

const loadingImpact = ref(false)
const impact = ref<Impact | null>(null)
const nameInput = ref('')
const submitting = ref(false)
const expandedList = ref<'add' | 'overwrite' | 'unchanged' | 'remove' | null>(null)

// 내용 hash 비교 토글 — 기본 ON (정확)
const contentCompare = ref(true)

async function runAnalysis() {
  if (!props.snapshot) return
  loadingImpact.value = true
  impact.value = null
  expandedList.value = null
  try {
    const r = await store.analyzeRestore(props.snapshot.id, contentCompare.value)
    impact.value = r
  } finally {
    loadingImpact.value = false
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen && props.snapshot) {
      nameInput.value = ''
      contentCompare.value = true
      await runAnalysis()
    }
  },
)

// 토글 변경 시 재분석
watch(contentCompare, async () => {
  if (props.open) await runAnalysis()
})

const nameMatches = computed(() => {
  if (!props.snapshot) return false
  return nameInput.value.trim() === props.snapshot.id.trim()
})

const canRestore = computed(() => {
  if (!impact.value) return false
  if (!nameMatches.value) return false
  if (impact.value.unsafePaths.length > 0) return false
  if (!impact.value.diskSufficient) return false
  return !submitting.value
})

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

async function doRestore() {
  if (!canRestore.value || !props.snapshot) return
  submitting.value = true
  try {
    const r = await store.restore(props.snapshot.id, nameInput.value)
    if (r.ok) {
      toast.success(
        '⤴ 복원 완료',
        `추가 ${r.summary?.added ?? 0} / 덮어쓰기 ${r.summary?.overwritten ?? 0} / 삭제 ${r.summary?.removed ?? 0}`,
      )
      emit('restored', r.autoBackupId ?? null)
      emit('close')
    } else {
      handleErrorCode(r.code, r.error)
    }
  } finally {
    submitting.value = false
  }
}

function handleErrorCode(code: string | undefined, message: string | undefined) {
  switch (code) {
    case 'INSUFFICIENT_DISK_SPACE':
      toast.error('디스크 공간 부족', message ?? '')
      break
    case 'AUTO_BACKUP_FAILED':
      toast.error('자동 백업 실패 — 복원 거부됨', message ?? '안전장치 1 깨짐. 데이터 보호 위해 진행 X.')
      break
    case 'UNSAFE_SNAPSHOT':
      toast.error('스냅샷 안전성 검증 실패', message ?? 'path traversal 위험 경로 발견')
      break
    case 'RESTORE_ROLLED_BACK':
      toast.warning('복원 실패 — 자동 롤백됨', message ?? '복원 직전 상태로 되돌렸습니다.')
      break
    case 'RESTORE_AND_ROLLBACK_FAILED':
      toast.error('❌ CRITICAL — 복원/롤백 모두 실패', message ?? '자동 백업 위치를 직접 확인하세요.')
      break
    case 'NAME_MISMATCH':
      toast.error('이름 불일치', message ?? '')
      break
    default:
      toast.error('복원 실패', message ?? '알 수 없음')
  }
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
    <div v-if="open" class="danger-backdrop" @click.self="close">
      <div class="danger-modal" role="dialog" aria-labelledby="restore-title">
        <header class="danger-header">
          <h2 id="restore-title" class="danger-title">⚠ 스냅샷 복원 (위험)</h2>
          <button class="btn-close" :disabled="submitting" @click="close" aria-label="닫기">✕</button>
        </header>

        <div class="danger-body">
          <p v-if="snapshot" class="lead">
            <strong>"{{ snapshot.id }}"</strong> 로 복원하시겠습니까?
            <br />
            <span class="snap-meta">
              생성: {{ snapshot.createdAt }} ·
              메모: {{ snapshot.memo || '(없음)' }}
            </span>
          </p>

          <!-- 영향 분석 -->
          <section class="block">
            <div class="block-head-row">
              <div class="block-head">📊 영향 분석</div>
              <label class="cmp-toggle" :title="contentCompare ? '파일 내용 hash 비교 (정확하지만 느림)' : '존재 여부만 비교 (빠름, 보수적)'">
                <input v-model="contentCompare" type="checkbox" />
                <span>내용 비교</span>
                <span class="cmp-help">{{ contentCompare ? '(정확)' : '(빠름)' }}</span>
              </label>
            </div>
            <div v-if="loadingImpact" class="state-msg">
              {{ contentCompare ? '내용 hash 비교 중... (큰 폴더는 다소 시간 걸림)' : '분석 중...' }}
            </div>
            <div v-else-if="!impact" class="state-msg error">분석 실패</div>
            <template v-else>
              <div class="impact-grid" :class="{ 'four-col': impact.contentCompared && impact.unchanged.length > 0 }">
                <button
                  class="impact-cell add"
                  :class="{ active: expandedList === 'add' }"
                  @click="expandedList = expandedList === 'add' ? null : 'add'"
                >
                  ⊕ {{ impact.willAdd.length }} 신규
                </button>
                <button
                  class="impact-cell mod"
                  :class="{ active: expandedList === 'overwrite' }"
                  @click="expandedList = expandedList === 'overwrite' ? null : 'overwrite'"
                >
                  ⟳ {{ impact.willOverwrite.length }}
                  {{ impact.contentCompared ? '실제 수정' : '양쪽 존재' }}
                </button>
                <button
                  v-if="impact.contentCompared && impact.unchanged.length > 0"
                  class="impact-cell same"
                  :class="{ active: expandedList === 'unchanged' }"
                  @click="expandedList = expandedList === 'unchanged' ? null : 'unchanged'"
                  title="내용이 같아서 복원해도 변화 없음"
                >
                  ✓ {{ impact.unchanged.length }} 동일
                </button>
                <button
                  class="impact-cell del"
                  :class="{ active: expandedList === 'remove' }"
                  @click="expandedList = expandedList === 'remove' ? null : 'remove'"
                >
                  ⊖ {{ impact.willRemove.length }} 삭제
                </button>
              </div>
              <div v-if="expandedList" class="files-preview">
                <div class="files-list-head">
                  <template v-if="expandedList === 'add'">신규 추가될 파일 (스냅샷에만 존재):</template>
                  <template v-else-if="expandedList === 'overwrite'">
                    <template v-if="impact.contentCompared">
                      실제 수정될 파일 (내용 hash 비교 결과 다름 — 복원 시 스냅샷 내용으로 덮어씀):
                    </template>
                    <template v-else>
                      덮어쓰기 될 파일 (양쪽 존재 — 내용 비교 안 함, 같을 수도 다를 수도 있음):
                    </template>
                  </template>
                  <template v-else-if="expandedList === 'unchanged'">
                    내용 동일 파일 (hash 같음 — 복원해도 변화 없음, 안전):
                  </template>
                  <template v-else>삭제될 파일 (스냅샷에 없음 — 현재 폴더에만 있음):</template>
                </div>
                <ul class="files-list">
                  <li
                    v-for="f in (expandedList === 'add' ? impact.willAdd
                      : expandedList === 'overwrite' ? impact.willOverwrite
                      : expandedList === 'unchanged' ? impact.unchanged
                      : impact.willRemove).slice(0, 100)"
                    :key="f"
                  >
                    {{ f }}
                  </li>
                  <li
                    v-if="((expandedList === 'add' ? impact.willAdd
                      : expandedList === 'overwrite' ? impact.willOverwrite
                      : expandedList === 'unchanged' ? impact.unchanged
                      : impact.willRemove).length > 100)"
                    class="more"
                  >
                    ... +{{
                      (expandedList === 'add' ? impact.willAdd
                        : expandedList === 'overwrite' ? impact.willOverwrite
                        : expandedList === 'unchanged' ? impact.unchanged
                        : impact.willRemove).length - 100
                    }} 더
                  </li>
                </ul>
              </div>
              <div v-if="impact.unsafePaths.length > 0" class="warn">
                ❌ 스냅샷에 안전하지 않은 경로 {{ impact.unsafePaths.length }}개 발견 (path traversal). 복원 진행 불가.
              </div>
            </template>
          </section>

          <!-- 안전장치 -->
          <section v-if="impact" class="block">
            <div class="block-head">🛡 안전장치</div>
            <ul class="safe-list">
              <li>✓ 현재 상태도 자동 백업됩니다 (<code>AUTO_BEFORE_RESTORE_&lt;시간&gt;</code> — 핀 고정)</li>
              <li>✓ 복원 중 오류 발생 시 → 자동 롤백 (자동 백업으로)</li>
              <li>
                {{ impact.diskSufficient ? '✓' : '❌' }}
                디스크 공간:
                필요 ≈ <strong>{{ formatBytes(impact.estimatedBytes) }}</strong> ×1.2,
                가용 <strong>{{ formatBytes(impact.diskFreeBytes) }}</strong>
                <span v-if="!impact.diskSufficient" class="warn-inline"> — 부족!</span>
              </li>
            </ul>
          </section>

          <!-- 이름 확인 -->
          <section v-if="impact && impact.unsafePaths.length === 0 && impact.diskSufficient" class="block">
            <div class="block-head">⚠ 확인 — 복원할 스냅샷 이름을 정확히 입력하세요</div>
            <input
              v-model="nameInput"
              type="text"
              class="name-input"
              :placeholder="snapshot?.id ?? ''"
              :disabled="submitting"
            />
            <div v-if="nameInput && !nameMatches" class="warn-inline">❌ 입력값 불일치</div>
            <div v-else-if="nameMatches" class="ok-inline">✓ 일치 — 복원 가능</div>
          </section>
        </div>

        <footer class="danger-actions">
          <button class="btn btn-default" :disabled="submitting" @click="close">취소 (Esc)</button>
          <button class="btn btn-danger" :disabled="!canRestore" @click="doRestore">
            {{ submitting ? '복원 진행 중...' : '🔴 복원 진행' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.danger-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1080;
}

.danger-modal {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  border: 2px solid var(--color-danger);
  box-shadow: 0 8px 32px rgba(207, 34, 46, 0.3);
  width: min(720px, 96vw);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.danger-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  background: var(--color-danger-bg, rgba(207, 34, 46, 0.08));
  border-bottom: 1px solid var(--color-danger);
}

.danger-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-danger);
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

.danger-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  background: rgba(207, 34, 46, 0.02);
}

.lead {
  margin: 0;
  font-size: var(--text-base);
  line-height: 1.5;
}
.snap-meta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.block {
  padding: var(--space-3);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.block-head {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}

.state-msg {
  text-align: center;
  color: var(--color-text-muted);
  font-style: italic;
}
.state-msg.error {
  color: var(--color-danger);
}

.impact-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}
.impact-grid.four-col {
  grid-template-columns: repeat(4, 1fr);
}
.impact-cell {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 600;
  text-align: center;
}
.impact-cell:hover {
  background: var(--color-bg-hover);
}
.impact-cell.active {
  background: rgba(207, 34, 46, 0.06);
  border-color: var(--color-danger);
}
.impact-cell.add { color: var(--diff-add-text, #1a7f37); }
.impact-cell.mod { color: var(--diff-mod-text, #9a6700); }
.impact-cell.same {
  color: var(--color-text-muted);
  font-weight: 400;
  background: var(--color-bg-subtle);
}
.impact-cell.del { color: var(--color-danger); }

.block-head-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.block-head-row .block-head {
  margin-bottom: 0;
}
.cmp-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  cursor: pointer;
  user-select: none;
}
.cmp-toggle input {
  margin: 0;
  cursor: pointer;
}
.cmp-help {
  color: var(--color-text-muted);
  font-style: italic;
}

.files-preview {
  margin-top: var(--space-2);
  padding: var(--space-2);
  background: var(--color-bg-subtle);
  border-radius: var(--radius-sm);
}
.files-list-head {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-bottom: 4px;
  font-weight: 600;
}
.files-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 160px;
  overflow-y: auto;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
.files-list li {
  padding: 2px 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.files-list .more {
  font-style: italic;
  color: var(--color-text-muted);
}

.safe-list {
  margin: 0;
  padding-left: 20px;
  font-size: var(--text-sm);
}
.safe-list li {
  margin-bottom: 4px;
  line-height: 1.5;
}
.safe-list code {
  font-family: var(--font-mono);
  background: var(--color-bg-subtle);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: var(--text-xs);
}

.name-input {
  width: 100%;
  padding: 8px 12px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  background: var(--color-bg);
}
.name-input:focus {
  outline: none;
  border-color: var(--color-danger);
}

.warn {
  margin-top: 6px;
  padding: 6px 10px;
  background: rgba(207, 34, 46, 0.1);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-sm);
  color: var(--color-danger);
  font-size: var(--text-sm);
}
.warn-inline {
  margin-top: 4px;
  font-size: var(--text-xs);
  color: var(--color-danger);
}
.ok-inline {
  margin-top: 4px;
  font-size: var(--text-xs);
  color: var(--diff-add-text, #1a7f37);
  font-weight: 600;
}

.danger-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-subtle);
  border-top: 1px solid var(--color-border);
}
.btn {
  padding: 8px 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-size: var(--text-sm);
  cursor: pointer;
}
.btn-default:hover:not(:disabled) {
  background: var(--color-bg-hover);
}
.btn-danger {
  background: var(--color-danger);
  border-color: var(--color-danger);
  color: white;
  font-weight: 600;
}
.btn-danger:hover:not(:disabled) {
  filter: brightness(1.1);
}
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
