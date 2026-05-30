<script setup lang="ts">
/**
 * Day 7.5: 브랜치 선택 드롭다운
 * - 로컬 + 원격 브랜치
 * - 현재 브랜치 ★ 표시
 * - 검색 가능
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'

interface Branch {
  name: string
  isCurrent: boolean
  isRemote: boolean
}

interface Props {
  repoPath: string | null
  modelValue: string | null
  placeholder?: string
  /** 비활성화할 브랜치 이름 (반대편에 선택된 것) */
  excludeName?: string | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
}>()

const branches = ref<Branch[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const open = ref(false)
const searchText = ref('')
const rootEl = ref<HTMLElement | null>(null)

watch(
  () => props.repoPath,
  async (path) => {
    if (path) await loadBranches()
    else branches.value = []
  },
  { immediate: true },
)

async function loadBranches() {
  if (!props.repoPath) return
  loading.value = true
  error.value = null
  try {
    const result = await window.textdiff.gitListBranches(props.repoPath)
    if (result.ok && result.branches) {
      branches.value = result.branches
    } else {
      error.value = result.error ?? '브랜치 목록 조회 실패'
    }
  } finally {
    loading.value = false
  }
}

const localBranches = computed(() => branches.value.filter((b) => !b.isRemote))
const remoteBranches = computed(() => branches.value.filter((b) => b.isRemote))

function filtered(list: Branch[]): Branch[] {
  const q = searchText.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((b) => b.name.toLowerCase().includes(q))
}

function select(branch: Branch) {
  emit('update:modelValue', branch.name)
  open.value = false
  searchText.value = ''
}

function toggle() {
  open.value = !open.value
  if (open.value) searchText.value = ''
}

function onDocClick(e: MouseEvent) {
  if (!open.value) return
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) {
    open.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    e.preventDefault()
    open.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="rootEl" class="branch-dropdown">
    <button
      type="button"
      class="dropdown-trigger"
      :class="{ 'is-empty': !modelValue }"
      :disabled="!repoPath"
      @click="toggle"
    >
      <span class="trigger-text">
        {{ modelValue || placeholder || '브랜치 선택' }}
      </span>
      <span class="trigger-caret" :class="{ open }">▾</span>
    </button>

    <div v-if="open" class="dropdown-panel">
      <div class="search-wrap">
        <input
          v-model="searchText"
          type="text"
          class="search-input"
          placeholder="검색..."
          autofocus
        />
      </div>

      <div v-if="loading" class="state-msg">로드 중...</div>
      <div v-else-if="error" class="state-msg error">{{ error }}</div>
      <div v-else class="branch-list">
        <div v-if="localBranches.length > 0" class="group">
          <div class="group-label">로컬</div>
          <button
            v-for="b in filtered(localBranches)"
            :key="b.name"
            class="branch-row"
            :class="{ active: modelValue === b.name, disabled: excludeName === b.name }"
            :disabled="excludeName === b.name"
            @click="select(b)"
          >
            <span class="branch-marker">{{ b.isCurrent ? '★' : '·' }}</span>
            <span class="branch-name">{{ b.name }}</span>
            <span v-if="b.isCurrent" class="branch-tag">현재</span>
            <span v-if="excludeName === b.name" class="branch-tag muted">선택됨</span>
          </button>
          <div v-if="filtered(localBranches).length === 0" class="state-msg small">로컬 결과 없음</div>
        </div>

        <div v-if="remoteBranches.length > 0" class="group">
          <div class="group-label">원격</div>
          <button
            v-for="b in filtered(remoteBranches)"
            :key="b.name"
            class="branch-row"
            :class="{ active: modelValue === b.name, disabled: excludeName === b.name }"
            :disabled="excludeName === b.name"
            @click="select(b)"
          >
            <span class="branch-marker">·</span>
            <span class="branch-name">{{ b.name }}</span>
            <span v-if="excludeName === b.name" class="branch-tag muted">선택됨</span>
          </button>
          <div v-if="filtered(remoteBranches).length === 0" class="state-msg small">원격 결과 없음</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.branch-dropdown {
  position: relative;
  display: inline-block;
  width: 100%;
}

.dropdown-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-size: var(--text-sm);
  font-family: var(--font-mono);
  cursor: pointer;
  color: var(--color-text);
}

.dropdown-trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dropdown-trigger.is-empty {
  color: var(--color-text-muted);
  font-style: italic;
  font-family: inherit;
}

.dropdown-trigger:hover:not(:disabled) {
  border-color: var(--color-source-git);
}

.trigger-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.trigger-caret {
  margin-left: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  transition: transform 0.15s ease;
}

.trigger-caret.open {
  transform: rotate(180deg);
}

.dropdown-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  z-index: 1200;
  max-height: 360px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-wrap {
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.search-input {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-family: var(--font-mono);
}

.search-input:focus {
  outline: none;
  border-color: var(--color-source-git);
}

.branch-list {
  flex: 1;
  overflow-y: auto;
}

.group + .group {
  border-top: 1px solid var(--color-border);
}

.group-label {
  padding: 4px var(--space-3);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-muted);
  letter-spacing: 0.05em;
  background: var(--color-bg-subtle);
}

.branch-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px var(--space-3);
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: var(--text-sm);
  font-family: var(--font-mono);
}

.branch-row:hover:not(.disabled) {
  background: var(--color-bg-hover);
}

.branch-row.active {
  background: rgba(111, 66, 193, 0.08);
  color: var(--color-source-git);
  font-weight: 600;
}

.branch-row.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.branch-marker {
  width: 14px;
  text-align: center;
  color: var(--color-source-git);
}

.branch-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.branch-tag {
  font-size: 10px;
  padding: 1px 6px;
  background: var(--color-source-git);
  color: white;
  border-radius: var(--radius-sm);
  font-family: inherit;
}

.branch-tag.muted {
  background: var(--color-border);
  color: var(--color-text-muted);
}

.state-msg {
  padding: var(--space-3);
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-style: italic;
}

.state-msg.small {
  padding: var(--space-2);
  font-size: var(--text-xs);
}

.state-msg.error {
  color: var(--color-danger);
}
</style>
