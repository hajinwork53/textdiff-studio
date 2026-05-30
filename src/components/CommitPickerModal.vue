<script setup lang="ts">
/**
 * Day 7.5: 커밋 선택 모달
 * - 검색 (메시지/해시/작성자 fuzzy)
 * - 페이지네이션 (100개씩, '더 보기')
 * - 브랜치 필터 (모든 브랜치 / 특정 브랜치)
 * - 모달 안의 모달 (z-index 1100 > 부모 1050)
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'

interface Commit {
  hash: string
  hashShort: string
  message: string
  authorName: string
  authorEmail: string
  date: string
  relativeDate: string
}

interface Branch {
  name: string
  isCurrent: boolean
  isRemote: boolean
}

interface Props {
  open: boolean
  repoPath: string | null
  title: string // 'From 커밋 선택' / 'To 커밋 선택'
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'pick', commit: Commit): void
}>()

const PAGE_SIZE = 100

const branches = ref<Branch[]>([])
const branchesLoading = ref(false)
const selectedBranch = ref<string>('') // '' = 모든 브랜치 (--all 효과: branch 미지정)
const currentBranch = ref<string | null>(null)

const commits = ref<Commit[]>([])
const commitsLoading = ref(false)
const loadError = ref<string | null>(null)
const hasMore = ref(false)
const offset = ref(0)

const searchText = ref('')

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen && props.repoPath) {
      searchText.value = ''
      offset.value = 0
      commits.value = []
      loadError.value = null
      await loadBranches()
      // 기본: 현재 브랜치
      selectedBranch.value = currentBranch.value ?? ''
      await loadFirstPage()
    }
  },
)

watch(selectedBranch, async () => {
  if (!props.open) return
  offset.value = 0
  commits.value = []
  await loadFirstPage()
})

async function loadBranches() {
  if (!props.repoPath) return
  branchesLoading.value = true
  try {
    const result = await window.textdiff.gitListBranches(props.repoPath)
    if (result.ok && result.branches) {
      // 로컬만 (원격은 너무 많아서 별도 모드)
      branches.value = result.branches.filter((b) => !b.isRemote)
      currentBranch.value = result.current ?? null
    }
  } finally {
    branchesLoading.value = false
  }
}

async function loadFirstPage() {
  await loadPage(0, true)
}

async function loadMore() {
  await loadPage(offset.value, false)
}

async function loadPage(skipOffset: number, replace: boolean) {
  if (!props.repoPath) return
  commitsLoading.value = true
  loadError.value = null
  try {
    const result = await window.textdiff.gitListCommits(props.repoPath, {
      branch: selectedBranch.value || undefined,
      limit: PAGE_SIZE,
      offset: skipOffset,
    })
    if (result.ok && result.commits) {
      if (replace) {
        commits.value = result.commits
      } else {
        commits.value = [...commits.value, ...result.commits]
      }
      offset.value = skipOffset + result.commits.length
      hasMore.value = result.commits.length === PAGE_SIZE
    } else {
      loadError.value = result.error ?? '커밋 목록 조회 실패'
    }
  } finally {
    commitsLoading.value = false
  }
}

const filteredCommits = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  if (!q) return commits.value
  return commits.value.filter(
    (c) =>
      c.message.toLowerCase().includes(q) ||
      c.hashShort.toLowerCase().includes(q) ||
      c.hash.toLowerCase().includes(q) ||
      c.authorName.toLowerCase().includes(q),
  )
})

function pick(commit: Commit) {
  emit('pick', commit)
}

function close() {
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="picker-backdrop" @click.self="close">
      <div class="picker-modal" role="dialog" aria-labelledby="commit-picker-title">
        <header class="picker-header">
          <h3 id="commit-picker-title" class="picker-title">{{ title }}</h3>
          <button class="btn-close" @click="close" aria-label="닫기">✕</button>
        </header>

        <div class="picker-toolbar">
          <div class="toolbar-row">
            <label class="branch-filter">
              <span class="filter-label">브랜치:</span>
              <select v-model="selectedBranch" :disabled="branchesLoading">
                <option value="">모든 브랜치</option>
                <option v-for="b in branches" :key="b.name" :value="b.name">
                  {{ b.name }}{{ b.isCurrent ? ' (현재)' : '' }}
                </option>
              </select>
            </label>
            <input
              v-model="searchText"
              type="text"
              class="search-input"
              placeholder="검색: 메시지 / 해시 / 작성자"
            />
          </div>
        </div>

        <div class="picker-body">
          <div v-if="commitsLoading && commits.length === 0" class="loading">
            커밋 목록 로드 중...
          </div>
          <div v-else-if="loadError" class="error-msg">{{ loadError }}</div>
          <div v-else-if="filteredCommits.length === 0" class="empty">
            <template v-if="searchText">검색 결과 없음</template>
            <template v-else>커밋이 없습니다.</template>
          </div>
          <div v-else class="commit-list">
            <button
              v-for="commit in filteredCommits"
              :key="commit.hash"
              class="commit-row"
              @click="pick(commit)"
            >
              <span class="commit-hash">{{ commit.hashShort }}</span>
              <span class="commit-message" :title="commit.message">{{ commit.message }}</span>
              <span class="commit-author" :title="commit.authorEmail">{{ commit.authorName }}</span>
              <span class="commit-date" :title="commit.date">{{ commit.relativeDate }}</span>
            </button>
          </div>

          <div v-if="hasMore && !searchText" class="more-row">
            <button class="btn-more" :disabled="commitsLoading" @click="loadMore">
              {{ commitsLoading ? '로드 중...' : `더 보기 (현재 ${commits.length}개)` }}
            </button>
          </div>
        </div>

        <footer class="picker-footer">
          <span class="footer-info">
            {{ filteredCommits.length }}개 표시 / 총 {{ commits.length }}개 로드됨
          </span>
          <button class="btn btn-default" @click="close">취소 (Esc)</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.picker-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.picker-modal {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  width: min(820px, 96vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.picker-title {
  margin: 0;
  font-size: var(--text-base);
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

.picker-toolbar {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.toolbar-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.branch-filter {
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-weight: 600;
}

.branch-filter select {
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  font-size: var(--text-sm);
  min-width: 180px;
}

.search-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  font-size: var(--text-sm);
  font-family: var(--font-mono);
}

.search-input:focus {
  outline: none;
  border-color: var(--color-source-git);
}

.picker-body {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.loading,
.empty {
  padding: var(--space-5);
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-style: italic;
}

.error-msg {
  margin: var(--space-3);
  padding: var(--space-2);
  background: var(--color-danger-bg);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-sm);
  color: var(--color-danger);
  font-size: var(--text-sm);
}

.commit-list {
  display: flex;
  flex-direction: column;
}

.commit-row {
  display: grid;
  grid-template-columns: 70px 1fr 140px 90px;
  align-items: center;
  gap: var(--space-2);
  padding: 8px var(--space-4);
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: var(--text-sm);
  width: 100%;
}

.commit-row:hover {
  background: rgba(111, 66, 193, 0.06);
}

.commit-row:focus {
  outline: none;
  background: rgba(111, 66, 193, 0.1);
}

.commit-hash {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-source-git);
  font-size: var(--text-xs);
}

.commit-message {
  font-weight: 400;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.commit-author {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.commit-date {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  text-align: right;
}

.more-row {
  padding: var(--space-3) var(--space-4);
  text-align: center;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.btn-more {
  padding: 6px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-size: var(--text-sm);
  cursor: pointer;
  color: var(--color-text);
}

.btn-more:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-source-git);
  color: var(--color-source-git);
}

.btn-more:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.picker-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.footer-info {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.btn {
  padding: 6px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  cursor: pointer;
}

.btn-default {
  background: var(--color-bg);
}

.btn-default:hover {
  background: var(--color-bg-hover);
}
</style>
