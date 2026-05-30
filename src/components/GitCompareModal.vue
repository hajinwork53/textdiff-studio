<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGitStore } from '../stores/git'
import { useComparisonStore } from '../stores/comparison'
import { useToastStore } from '../stores/toast'
import CommitPickerModal from './CommitPickerModal.vue'
import BranchPickerDropdown from './BranchPickerDropdown.vue'

interface Props {
  open: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const router = useRouter()
const git = useGitStore()
const comparison = useComparisonStore()
const toast = useToastStore()

type Mode = 'working' | 'commits' | 'branches'
const mode = ref<Mode>('working')

const repoPath = ref<string | null>(null)
const repoLoading = ref(false)
const repoError = ref<string | null>(null)

interface ChangedFileInfo {
  relpath: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'unknown'
  oldRelpath?: string
}

const changedFiles = ref<ChangedFileInfo[]>([])
const filesLoading = ref(false)
const selectedFile = ref<string | null>(null)

// === Day 7.5: commits 모드 상태 ===
interface CommitRef {
  hash: string
  hashShort: string
  message: string
  authorName: string
  relativeDate: string
}
const commitA = ref<CommitRef | null>(null)
const commitB = ref<CommitRef | null>(null)
const commitPickerOpen = ref(false)
const commitPickerTarget = ref<'A' | 'B'>('A')

// === Day 7.5: branches 모드 상태 ===
const branchA = ref<string | null>(null)
const branchB = ref<string | null>(null)

// 모달 열릴 때 마지막 repo 자동 로드
watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      mode.value = 'working'
      selectedFile.value = null
      repoError.value = null
      // 모드 상태 초기화
      commitA.value = null
      commitB.value = null
      branchA.value = null
      branchB.value = null
      if (git.lastRepoPath) {
        repoPath.value = git.lastRepoPath
        await loadChangedFiles()
      } else {
        repoPath.value = null
        changedFiles.value = []
      }
    }
  },
)

async function pickRepoFolder() {
  repoLoading.value = true
  repoError.value = null
  try {
    const result = await window.textdiff.gitPickRepoFolder()
    if (result.canceled) {
      repoLoading.value = false
      return
    }
    if (!result.isRepo) {
      repoError.value = '선택한 폴더는 Git 저장소가 아닙니다.'
      repoLoading.value = false
      return
    }
    repoPath.value = result.folderPath!
    git.setLastRepoPath(repoPath.value)
    // repo 가 바뀌면 모든 선택 초기화
    commitA.value = null
    commitB.value = null
    branchA.value = null
    branchB.value = null
    await loadChangedFiles()
  } catch (e) {
    repoError.value = (e as Error).message
  } finally {
    repoLoading.value = false
  }
}

async function loadChangedFiles() {
  if (!repoPath.value) return
  filesLoading.value = true
  changedFiles.value = []
  selectedFile.value = null
  repoError.value = null

  if (mode.value === 'working') {
    const result = await window.textdiff.gitDiffFiles(repoPath.value, null, null)
    if (result.ok && result.files) {
      changedFiles.value = result.files
      if (result.files.length === 0) {
        repoError.value = '변경된 파일이 없습니다 (HEAD = 작업 디렉토리).'
      }
    } else {
      repoError.value = result.error ?? '변경 파일 목록 조회 실패'
    }
  } else if (mode.value === 'commits') {
    if (!commitA.value || !commitB.value) {
      // 둘 다 선택해야 파일 로드
      filesLoading.value = false
      return
    }
    if (commitA.value.hash === commitB.value.hash) {
      repoError.value = '같은 커밋끼리는 비교할 수 없습니다.'
      filesLoading.value = false
      return
    }
    const result = await window.textdiff.gitDiffFiles(
      repoPath.value,
      commitA.value.hash,
      commitB.value.hash,
    )
    if (result.ok && result.files) {
      changedFiles.value = result.files
      if (result.files.length === 0) {
        repoError.value = '두 커밋 사이 변경된 파일이 없습니다.'
      }
    } else {
      repoError.value = result.error ?? '변경 파일 목록 조회 실패'
    }
  } else if (mode.value === 'branches') {
    if (!branchA.value || !branchB.value) {
      filesLoading.value = false
      return
    }
    if (branchA.value === branchB.value) {
      repoError.value = '같은 브랜치끼리는 비교할 수 없습니다.'
      filesLoading.value = false
      return
    }
    const result = await window.textdiff.gitDiffFiles(
      repoPath.value,
      branchA.value,
      branchB.value,
    )
    if (result.ok && result.files) {
      changedFiles.value = result.files
      if (result.files.length === 0) {
        repoError.value = '두 브랜치 사이 변경된 파일이 없습니다.'
      }
    } else {
      repoError.value = result.error ?? '변경 파일 목록 조회 실패'
    }
  }
  filesLoading.value = false
}

watch(mode, async () => {
  selectedFile.value = null
  changedFiles.value = []
  await loadChangedFiles()
})

// commits 모드: 둘 다 선택되면 자동 로드
watch([commitA, commitB], async () => {
  if (mode.value === 'commits') {
    await loadChangedFiles()
  }
})

// branches 모드: 둘 다 선택되면 자동 로드
watch([branchA, branchB], async () => {
  if (mode.value === 'branches') {
    await loadChangedFiles()
  }
})

function openCommitPicker(target: 'A' | 'B') {
  commitPickerTarget.value = target
  commitPickerOpen.value = true
}

function onCommitPicked(commit: CommitRef) {
  if (commitPickerTarget.value === 'A') {
    commitA.value = commit
  } else {
    commitB.value = commit
  }
  commitPickerOpen.value = false
}

const statusLabel: Record<ChangedFileInfo['status'], string> = {
  added: '⊕ 추가(staged)',
  modified: '↻ 수정',
  deleted: '⊖ 삭제',
  renamed: '↪ 이동',
  untracked: '★ 신규(untracked)',
  unknown: '?',
}

const statusColor: Record<ChangedFileInfo['status'], string> = {
  added: 'var(--diff-add-text)',
  modified: 'var(--diff-mod-text)',
  deleted: 'var(--diff-del-text)',
  renamed: 'var(--color-text-muted)',
  untracked: 'var(--diff-add-text)',
  unknown: 'var(--color-text-muted)',
}

const canStart = computed(() => repoPath.value !== null && selectedFile.value !== null)

function getFileName(relpath: string): string {
  const parts = relpath.split('/')
  return parts[parts.length - 1] ?? relpath
}

function getFileDir(relpath: string): string {
  const parts = relpath.split('/')
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/') + '/'
}

async function startCompare() {
  if (!canStart.value || !repoPath.value || !selectedFile.value) return
  const relpath = selectedFile.value

  if (mode.value === 'working') {
    await comparison.loadFromGit(0, repoPath.value, 'HEAD', relpath, 'HEAD')
    await comparison.loadFromGit(1, repoPath.value, 'WORKING', relpath, '작업 디렉토리')
  } else if (mode.value === 'commits') {
    if (!commitA.value || !commitB.value) return
    await comparison.loadFromGit(
      0,
      repoPath.value,
      commitA.value.hash,
      relpath,
      commitA.value.hashShort,
    )
    await comparison.loadFromGit(
      1,
      repoPath.value,
      commitB.value.hash,
      relpath,
      commitB.value.hashShort,
    )
  } else if (mode.value === 'branches') {
    if (!branchA.value || !branchB.value) return
    await comparison.loadFromGit(0, repoPath.value, branchA.value, relpath, branchA.value)
    await comparison.loadFromGit(1, repoPath.value, branchB.value, relpath, branchB.value)
  }

  const sa = comparison.slots[0]
  const sb = comparison.slots[1]
  if (sa.status === 'ready' && sb.status === 'ready') {
    comparison.setEntrySource('git')
    emit('close')
    router.push('/diff')
  } else {
    toast.error('Git 비교 로드 실패', sa.error ?? sb.error ?? '알 수 없음')
  }
}

function close() {
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (commitPickerOpen.value) return // 자식 모달이 우선
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
    <div v-if="open" class="git-backdrop" @click.self="close">
      <div class="git-modal" role="dialog" aria-labelledby="git-title">
        <header class="git-header">
          <h2 id="git-title" class="git-title">⎇ Git 비교</h2>
          <button class="btn-close" @click="close" aria-label="닫기">✕</button>
        </header>

        <div class="git-body">
          <!-- 저장소 선택 -->
          <section class="repo-section">
            <div class="section-label">저장소</div>
            <div class="repo-row">
              <code v-if="repoPath" class="repo-path" :title="repoPath">{{ repoPath }}</code>
              <span v-else class="repo-empty">선택된 저장소 없음</span>
              <button class="btn btn-default btn-small" @click="pickRepoFolder" :disabled="repoLoading">
                {{ repoPath ? '폴더 변경' : '폴더 선택' }}
              </button>
            </div>
            <div v-if="repoError" class="error-msg">{{ repoError }}</div>
          </section>

          <!-- 비교 모드 -->
          <section class="mode-section">
            <div class="section-label">비교 모드</div>
            <div class="mode-list">
              <label class="mode-option" :class="{ active: mode === 'working' }">
                <input v-model="mode" type="radio" value="working" :disabled="!repoPath" />
                <div class="mode-info">
                  <div class="mode-name">현재 변경 사항 (HEAD ↔ 작업 디렉토리)</div>
                  <div class="mode-detail">아직 커밋 안 한 변경. AI 수정 직후 가장 빈번한 시나리오.</div>
                </div>
              </label>
              <label class="mode-option" :class="{ active: mode === 'commits' }">
                <input v-model="mode" type="radio" value="commits" :disabled="!repoPath" />
                <div class="mode-info">
                  <div class="mode-name">두 커밋 비교</div>
                  <div class="mode-detail">From 커밋 + To 커밋 선택 → 둘 사이 변경 파일.</div>
                </div>
              </label>
              <label class="mode-option" :class="{ active: mode === 'branches' }">
                <input v-model="mode" type="radio" value="branches" :disabled="!repoPath" />
                <div class="mode-info">
                  <div class="mode-name">두 브랜치 비교</div>
                  <div class="mode-detail">From 브랜치 + To 브랜치 → 둘 사이 변경 파일.</div>
                </div>
              </label>
            </div>
          </section>

          <!-- commits 모드: From/To 커밋 선택 -->
          <section v-if="mode === 'commits' && repoPath" class="picker-section">
            <div class="section-label">커밋 선택</div>
            <div class="picker-row">
              <div class="picker-side">
                <div class="side-label">From (A · 이전)</div>
                <button class="ref-trigger" :class="{ filled: !!commitA }" @click="openCommitPicker('A')">
                  <template v-if="commitA">
                    <span class="ref-hash">{{ commitA.hashShort }}</span>
                    <span class="ref-msg" :title="commitA.message">{{ commitA.message }}</span>
                  </template>
                  <span v-else class="ref-empty">커밋 선택...</span>
                </button>
                <div v-if="commitA" class="ref-meta">
                  {{ commitA.authorName }} · {{ commitA.relativeDate }}
                </div>
              </div>
              <div class="picker-arrow">→</div>
              <div class="picker-side">
                <div class="side-label">To (B · 이후)</div>
                <button class="ref-trigger" :class="{ filled: !!commitB }" @click="openCommitPicker('B')">
                  <template v-if="commitB">
                    <span class="ref-hash">{{ commitB.hashShort }}</span>
                    <span class="ref-msg" :title="commitB.message">{{ commitB.message }}</span>
                  </template>
                  <span v-else class="ref-empty">커밋 선택...</span>
                </button>
                <div v-if="commitB" class="ref-meta">
                  {{ commitB.authorName }} · {{ commitB.relativeDate }}
                </div>
              </div>
            </div>
          </section>

          <!-- branches 모드: From/To 브랜치 선택 -->
          <section v-if="mode === 'branches' && repoPath" class="picker-section">
            <div class="section-label">브랜치 선택</div>
            <div class="picker-row">
              <div class="picker-side">
                <div class="side-label">From (A · 이전)</div>
                <BranchPickerDropdown
                  v-model="branchA"
                  :repo-path="repoPath"
                  placeholder="브랜치 선택..."
                  :exclude-name="branchB"
                />
              </div>
              <div class="picker-arrow">→</div>
              <div class="picker-side">
                <div class="side-label">To (B · 이후)</div>
                <BranchPickerDropdown
                  v-model="branchB"
                  :repo-path="repoPath"
                  placeholder="브랜치 선택..."
                  :exclude-name="branchA"
                />
              </div>
            </div>
          </section>

          <!-- 파일 목록 -->
          <section v-if="repoPath" class="files-section">
            <div class="section-label">
              변경 파일
              <span v-if="changedFiles.length > 0" class="files-count">({{ changedFiles.length }}개)</span>
            </div>
            <div v-if="filesLoading" class="loading">파일 목록 로드 중...</div>
            <div
              v-else-if="mode === 'commits' && (!commitA || !commitB)"
              class="empty"
            >
              두 커밋을 모두 선택하세요.
            </div>
            <div
              v-else-if="mode === 'branches' && (!branchA || !branchB)"
              class="empty"
            >
              두 브랜치를 모두 선택하세요.
            </div>
            <div v-else-if="changedFiles.length === 0 && !repoError" class="empty">변경 파일 없음</div>
            <div v-else class="files-list">
              <label
                v-for="file in changedFiles"
                :key="file.relpath"
                class="file-row"
                :class="{ active: selectedFile === file.relpath }"
              >
                <input
                  v-model="selectedFile"
                  type="radio"
                  :value="file.relpath"
                />
                <span class="file-status" :style="{ color: statusColor[file.status] }">
                  {{ statusLabel[file.status] }}
                </span>
                <span class="file-path-wrap" :title="file.relpath">
                  <span class="file-name">{{ getFileName(file.relpath) }}</span>
                  <span v-if="getFileDir(file.relpath)" class="file-dir">{{ getFileDir(file.relpath) }}</span>
                </span>
                <span v-if="file.oldRelpath" class="file-old" :title="file.oldRelpath">
                  ← {{ file.oldRelpath }}
                </span>
              </label>
            </div>
          </section>
        </div>

        <footer class="git-actions">
          <button class="btn btn-default" @click="close">취소 (Esc)</button>
          <button class="btn btn-primary" :disabled="!canStart" @click="startCompare">
            비교 시작 →
          </button>
        </footer>
      </div>
    </div>

    <CommitPickerModal
      :open="commitPickerOpen"
      :repo-path="repoPath"
      :title="commitPickerTarget === 'A' ? 'From 커밋 선택 (이전)' : 'To 커밋 선택 (이후)'"
      @close="commitPickerOpen = false"
      @pick="onCommitPicked"
    />
  </Teleport>
</template>

<style scoped>
.git-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
}

.git-modal {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  width: min(880px, 96vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.git-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.git-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-source-git);
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

.git-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.section-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: var(--space-2);
}

.repo-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.repo-path {
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

.repo-empty {
  flex: 1;
  color: var(--color-text-muted);
  font-style: italic;
  font-size: var(--text-sm);
  padding: 6px 10px;
  background: var(--color-bg-subtle);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
}

.error-msg {
  margin-top: var(--space-2);
  padding: var(--space-2);
  background: var(--color-danger-bg);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-sm);
  color: var(--color-danger);
  font-size: var(--text-sm);
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

.mode-option.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--color-bg-subtle);
}

.mode-option.active:not(.disabled) {
  border-color: var(--color-source-git);
  background: rgba(111, 66, 193, 0.04);
}

.mode-option input {
  margin-top: 2px;
  cursor: pointer;
}

.mode-info {
  flex: 1;
}

.mode-name {
  font-size: var(--text-sm);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.mode-detail {
  margin-top: 2px;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.badge-soon {
  font-size: 10px;
  padding: 1px 6px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-weight: 400;
}

/* Day 7.5: From → To 선택 영역 */
.picker-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.picker-side {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.picker-arrow {
  font-size: var(--text-lg);
  color: var(--color-source-git);
  font-weight: 600;
  align-self: center;
  margin-top: 18px;
}

.side-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
}

.ref-trigger {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-size: var(--text-sm);
  cursor: pointer;
  text-align: left;
  overflow: hidden;
}

.ref-trigger:hover {
  border-color: var(--color-source-git);
}

.ref-trigger.filled {
  background: rgba(111, 66, 193, 0.04);
  border-color: var(--color-source-git);
}

.ref-empty {
  color: var(--color-text-muted);
  font-style: italic;
}

.ref-hash {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-source-git);
  font-size: var(--text-xs);
  flex-shrink: 0;
}

.ref-msg {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ref-meta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  padding-left: 10px;
}

.files-count {
  font-weight: 400;
  font-family: var(--font-mono);
  color: var(--color-text);
  text-transform: none;
}

.loading,
.empty {
  padding: var(--space-3);
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-style: italic;
}

.files-list {
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
}

.file-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px var(--space-3);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  font-size: var(--text-sm);
}

.file-row:last-child {
  border-bottom: none;
}

.file-row:hover {
  background: var(--color-bg-hover);
}

.file-row.active {
  background: rgba(111, 66, 193, 0.06);
}

.file-status {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  width: 60px;
  flex-shrink: 0;
}

.file-path-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
}

.file-name {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: var(--text-sm);
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-dir {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* 폴더가 길면 앞부분 잘림 (RTL) — 끝부분이 가장 의미있음 */
  direction: rtl;
  text-align: left;
  unicode-bidi: plaintext;
}

.file-old {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.git-actions {
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
}

.btn-small {
  padding: 4px 10px;
  font-size: var(--text-xs);
}

.btn-default {
  background: var(--color-bg);
}

.btn-default:hover:not(:disabled) {
  background: var(--color-bg-hover);
}

.btn-primary {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.btn-primary:disabled {
  background: var(--color-border);
  border-color: var(--color-border);
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
