<script setup lang="ts">
/**
 * Day 8.5: N1 출력 텍스트 → 코드 위치 역추적 모달
 *
 * - 검색어 + 옵션 (대소문자 / whole word / 정규식 / 파일 글로브) + 루트
 * - 결과 N개 → 라인 클릭으로 VS Code 점프 / 경로 복사
 * - [MD 리포트에 포함] → store stash → 다음 MD 저장 시 자동 포함
 */
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { useTextTrackerStore } from '../stores/textTracker'
import { useGitStore } from '../stores/git'
import { useComparisonStore } from '../stores/comparison'
import { useSettingsStore } from '../stores/settings'
import { useToastStore } from '../stores/toast'
import { resolveSearchRoot } from '../lib/search-root'
import { buildEditorUrl } from '../lib/editor-url'
import { generateTrackerReport, suggestTrackerFilename } from '../lib/tracker-report'

/**
 * 모달 상태는 store 가 관리 (글로벌 — FilePicker / DiffViewer 어디서든 동일 모달)
 * 호출자는 tracker.openModal(query?) / tracker.closeModal() 사용
 */
const tracker = useTextTrackerStore()
const git = useGitStore()
const comparison = useComparisonStore()
const settings = useSettingsStore()
const toast = useToastStore()

const isOpen = computed(() => tracker.modalOpen)

const query = ref('')
const caseSensitive = ref(false)
const wholeWord = ref(false)
const regex = ref(false)

// 파일 글로브 프리셋
const GLOB_PRESETS: Array<{ label: string; globs: string[] | undefined }> = [
  { label: '모든 파일', globs: undefined },
  { label: 'Vue / TS / JS', globs: ['*.vue', '*.ts', '*.tsx', '*.js', '*.jsx'] },
  { label: 'TS 만', globs: ['*.ts', '*.tsx'] },
  { label: 'JSON / i18n', globs: ['*.json'] },
  { label: 'Python', globs: ['*.py'] },
  { label: 'Markdown / 문서', globs: ['*.md', '*.mdx'] },
]
const globPresetIdx = ref(0)
const customGlob = ref('') // 사용자 직접 입력 (콤마 분리)

const overrideRoot = ref<string | null>(null)

const queryInput = ref<HTMLInputElement | null>(null)

const rootCandidate = computed(() =>
  resolveSearchRoot({
    override: overrideRoot.value,
    lastGitRepoPath: git.lastRepoPath,
    slots: comparison.slots,
  }),
)

const activeGlobs = computed<string[] | undefined>(() => {
  if (customGlob.value.trim()) {
    return customGlob.value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }
  return GLOB_PRESETS[globPresetIdx.value]?.globs
})

const optionsLabel = computed(() => {
  const parts: string[] = []
  if (caseSensitive.value) parts.push('Aa')
  if (wholeWord.value) parts.push('단어')
  if (regex.value) parts.push('정규식')
  const g = activeGlobs.value
  if (g && g.length > 0) parts.push(g.join(','))
  return parts.length > 0 ? parts.join(' · ') : '기본'
})

watch(
  () => tracker.modalOpen,
  async (open) => {
    if (open) {
      if (tracker.modalInitialQuery) {
        query.value = tracker.modalInitialQuery
      }
      await nextTick()
      queryInput.value?.focus()
      queryInput.value?.select()
      // 자동 검색
      if (query.value.trim().length >= 2 && rootCandidate.value) {
        await runSearch()
      }
    }
  },
)

async function pickRootFolder() {
  // 폴더 선택 다이얼로그 재사용 (git 의 pickRepoFolder 는 repo 검증 — 우린 일반 폴더)
  const r = await window.textdiff.gitPickRepoFolder()
  if (r.canceled || !r.folderPath) return
  // repo 아니어도 검색은 가능
  overrideRoot.value = r.folderPath
}

async function runSearch() {
  const q = query.value.trim()
  if (q.length < 2) {
    toast.warning('검색어 너무 짧음', '2자 이상 입력하세요.')
    return
  }
  if (!rootCandidate.value) {
    toast.warning('검색 루트 없음', '폴더를 선택하세요.')
    return
  }
  await tracker.search({
    query: q,
    root: rootCandidate.value.path,
    caseSensitive: caseSensitive.value,
    wholeWord: wholeWord.value,
    regex: regex.value,
    fileGlobs: activeGlobs.value,
  })
  if (tracker.error) {
    toast.error('검색 실패', tracker.error)
  }
}

function jumpTo(hit: { path: string; line: number; column: number }) {
  const url = buildEditorUrl(hit.path, hit.line, settings.editor)
  window.textdiff.openInEditor(url)
}

async function copyPath(hit: { relpath: string; line: number }) {
  const text = `${hit.relpath}:${hit.line}`
  try {
    await navigator.clipboard.writeText(text)
    toast.info('경로 복사됨', text)
  } catch {
    toast.error('복사 실패', text)
  }
}

// Day 8.5 hotfix v2: skip 목록 펼침 토글
const skipExpanded = ref(false)

// Day 8.5 hotfix v2: 검색 결과를 독립 MD 파일로 저장
async function saveAsMd() {
  if (tracker.lastHits.length === 0 && tracker.lastSkipped.length === 0) {
    toast.warning('저장할 결과 없음', '먼저 검색을 실행하세요.')
    return
  }
  if (!tracker.lastRoot) {
    toast.warning('저장 불가', '검색 루트가 없습니다.')
    return
  }
  const content = generateTrackerReport({
    query: tracker.lastQuery,
    root: tracker.lastRoot,
    optionsLabel: optionsLabel.value,
    hits: tracker.lastHits,
    skipped: tracker.lastSkipped,
    truncated: tracker.lastTruncated,
    durationMs: tracker.lastDurationMs,
    generatedAt: new Date(),
    editor: settings.editor,
    appVersion: settings.appVersion,
  })
  const filename = suggestTrackerFilename({
    query: tracker.lastQuery,
    root: tracker.lastRoot,
    optionsLabel: optionsLabel.value,
    hits: tracker.lastHits,
    skipped: tracker.lastSkipped,
    truncated: tracker.lastTruncated,
    durationMs: tracker.lastDurationMs,
    generatedAt: new Date(),
    editor: settings.editor,
    appVersion: settings.appVersion,
  })
  const result = await window.textdiff.saveReport(filename, content)
  if (!result.ok) {
    if (result.code === 'CANCELED') return
    toast.error('저장 실패', result.message ?? '알 수 없는 오류')
    return
  }
  const savedPath = result.path!
  toast.success('🔍 텍스트 추적 리포트 저장됨', savedPath, [
    {
      label: '📂 폴더 열기',
      onClick: () => window.textdiff.showInFolder(savedPath),
    },
    {
      label: '📝 에디터로 열기',
      onClick: () => {
        const slashed = savedPath.replace(/\\/g, '/')
        const url = `${settings.editor.scheme}://file/${encodeURI(slashed)}:1`
        window.textdiff.openInEditor(url)
      },
    },
  ])
}

function close() {
  tracker.closeModal()
}

function onKeydown(e: KeyboardEvent) {
  if (!tracker.modalOpen) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    runSearch()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="tracker-backdrop" @click.self="close">
      <div class="tracker-modal" role="dialog" aria-labelledby="tracker-title">
        <header class="tracker-header">
          <h2 id="tracker-title" class="tracker-title">🔍 출력 텍스트 → 코드 위치</h2>
          <button class="btn-close" @click="close" aria-label="닫기">✕</button>
        </header>

        <div class="tracker-body">
          <!-- 검색 폼 -->
          <section class="form-section">
            <div class="query-row">
              <input
                ref="queryInput"
                v-model="query"
                type="text"
                class="query-input"
                placeholder="검색할 텍스트 (2자 이상)"
                @keydown.enter.prevent="runSearch"
              />
              <button class="btn btn-primary" :disabled="tracker.searching" @click="runSearch">
                {{ tracker.searching ? '검색 중...' : '검색' }}
              </button>
            </div>

            <div class="opts-row">
              <label class="opt-chip">
                <input v-model="caseSensitive" type="checkbox" />
                <span>Aa <span class="opt-help">대소문자</span></span>
              </label>
              <label class="opt-chip">
                <input v-model="wholeWord" type="checkbox" />
                <span>단어 <span class="opt-help">whole word</span></span>
              </label>
              <label class="opt-chip">
                <input v-model="regex" type="checkbox" />
                <span>.* <span class="opt-help">정규식</span></span>
              </label>
            </div>

            <div class="glob-row">
              <span class="row-label">파일</span>
              <select v-model="globPresetIdx" class="glob-select" :disabled="!!customGlob.trim()">
                <option v-for="(g, i) in GLOB_PRESETS" :key="i" :value="i">{{ g.label }}</option>
              </select>
              <input
                v-model="customGlob"
                type="text"
                class="custom-glob"
                placeholder="직접 입력 (콤마 분리: *.vue,*.ts)"
              />
            </div>

            <div class="root-row">
              <span class="row-label">루트</span>
              <code v-if="rootCandidate" class="root-path" :title="rootCandidate.path">
                {{ rootCandidate.path }}
              </code>
              <span v-else class="root-empty">검색 루트 없음 → 폴더 선택 필요</span>
              <span v-if="rootCandidate" class="root-reason">← {{ rootCandidate.reason }}</span>
              <button class="btn btn-default btn-small" @click="pickRootFolder">폴더 변경</button>
            </div>
          </section>

          <!-- 결과 -->
          <section class="results-section">
            <div v-if="tracker.searching" class="state-msg">검색 중...</div>
            <template v-else>
              <!-- 결과 메타 (있을 때) -->
              <div v-if="tracker.lastQuery" class="results-meta">
                <template v-if="tracker.lastHits.length > 0">
                  "{{ tracker.lastQuery }}" — <strong>{{ tracker.lastHits.length }} 위치</strong>
                </template>
                <template v-else-if="tracker.error">
                  검색 실패
                </template>
                <template v-else>
                  "{{ tracker.lastQuery }}" — 결과 없음
                </template>
                <span v-if="tracker.lastTruncated" class="warn-cap">(상한 500 도달)</span>
                <span v-if="tracker.lastDurationMs !== null" class="duration">
                  · {{ tracker.lastDurationMs }}ms
                </span>
                <span
                  v-if="tracker.hasSkipped"
                  class="skip-chip"
                  :title="`${tracker.lastSkipped.length}개 파일은 잠겨있거나 권한이 없어 검사 못함`"
                  @click="skipExpanded = !skipExpanded"
                >
                  ⚠ {{ tracker.lastSkipped.length }}개 파일 skip {{ skipExpanded ? '▴' : '▾' }}
                </span>
              </div>

              <!-- skip 아코디언 -->
              <div v-if="skipExpanded && tracker.hasSkipped" class="skip-block">
                <div class="skip-header">검사하지 못한 파일 — 잠겨있거나 권한 없음</div>
                <ul class="skip-list">
                  <li v-for="(s, i) in tracker.lastSkipped" :key="i" class="skip-row">
                    <code class="skip-path" :title="s.path">{{ s.path || '(경로 미상)' }}</code>
                    <div class="skip-reason">{{ s.reason }}</div>
                  </li>
                </ul>
              </div>

              <!-- 치명적 에러 (별도 표시) -->
              <div v-if="tracker.error" class="state-msg error">에러: {{ tracker.error }}</div>

              <!-- 결과 리스트 -->
              <ul v-if="tracker.lastHits.length > 0" class="hits-list">
                <li v-for="(hit, i) in tracker.lastHits" :key="i" class="hit-row">
                  <div class="hit-loc">
                    <span class="hit-relpath" :title="hit.path">{{ hit.relpath }}</span>
                    <span class="hit-line">:{{ hit.line }}</span>
                    <span class="hit-col">:{{ hit.column }}</span>
                  </div>
                  <pre class="hit-text">{{ hit.text }}</pre>
                  <div class="hit-actions">
                    <button class="action-btn" @click="jumpTo(hit)">
                      → {{ settings.editor.scheme === 'cursor' ? 'Cursor' : 'VS Code' }}
                    </button>
                    <button class="action-btn" @click="copyPath(hit)">📋 경로</button>
                  </div>
                </li>
              </ul>

              <!-- 초기 안내 -->
              <div
                v-if="!tracker.lastQuery && !tracker.error"
                class="state-msg dim"
              >
                검색어 입력 후 검색을 누르세요. (Ctrl+Enter)
              </div>
            </template>
          </section>
        </div>

        <footer class="tracker-footer">
          <div class="footer-left">
            <button
              class="btn btn-primary"
              :disabled="tracker.lastHits.length === 0 && tracker.lastSkipped.length === 0"
              title="검색 결과만 담은 독립 MD 파일로 저장 (비교 리포트와 분리)"
              @click="saveAsMd"
            >
              💾 결과를 MD로 저장
            </button>
          </div>
          <div class="footer-right">
            <button class="btn btn-default" @click="close">닫기 (Esc)</button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tracker-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
}

.tracker-modal {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  width: min(900px, 96vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tracker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.tracker-title {
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

.btn-close:hover {
  color: var(--color-text);
}

.tracker-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.form-section {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.query-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.query-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-size: var(--text-base);
  font-family: var(--font-mono);
}

.query-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.15);
}

.opts-row {
  display: flex;
  gap: var(--space-2);
}

.opt-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  cursor: pointer;
  font-size: var(--text-sm);
  font-family: var(--font-mono);
}

.opt-chip:hover {
  background: var(--color-bg-hover);
}

.opt-chip input {
  cursor: pointer;
}

.opt-chip input:checked + span {
  color: var(--color-accent);
  font-weight: 600;
}

.opt-help {
  font-family: var(--font-ui);
  font-weight: 400;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.glob-row,
.root-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.row-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  width: 40px;
  flex-shrink: 0;
}

.glob-select {
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  font-size: var(--text-sm);
  min-width: 160px;
}

.glob-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.custom-glob {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  font-size: var(--text-sm);
  font-family: var(--font-mono);
}

.root-path {
  flex: 1;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  padding: 4px 8px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.root-empty {
  flex: 1;
  color: var(--color-danger);
  font-style: italic;
  font-size: var(--text-sm);
}

.root-reason {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  flex-shrink: 0;
}

/* 결과 영역 */
.results-section {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-3) var(--space-4);
}

.state-msg {
  padding: var(--space-5);
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.state-msg.dim {
  font-style: italic;
}

.state-msg.error {
  color: var(--color-danger);
}

.results-meta {
  font-size: var(--text-sm);
  color: var(--color-text);
  margin-bottom: var(--space-2);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.warn-cap {
  color: var(--color-warning, #d97706);
  font-size: var(--text-xs);
}

.skip-chip {
  font-size: var(--text-xs);
  padding: 2px 8px;
  background: rgba(217, 119, 6, 0.12);
  color: var(--color-warning, #d97706);
  border: 1px solid var(--color-warning, #d97706);
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
}

.skip-chip:hover {
  background: rgba(217, 119, 6, 0.2);
}

.skip-block {
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: rgba(217, 119, 6, 0.06);
  border: 1px solid rgba(217, 119, 6, 0.3);
  border-radius: var(--radius-md);
}

.skip-header {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-warning, #d97706);
  margin-bottom: 6px;
}

.skip-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
}

.skip-row {
  font-size: var(--text-xs);
  padding: 4px 6px;
  background: var(--color-bg);
  border-radius: var(--radius-sm);
}

.skip-path {
  font-family: var(--font-mono);
  color: var(--color-text);
  word-break: break-all;
}

.skip-reason {
  margin-top: 2px;
  color: var(--color-text-muted);
}

.duration {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.hits-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hit-row {
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
}

.hit-row:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-accent);
}

.hit-loc {
  display: flex;
  align-items: baseline;
  gap: 2px;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  margin-bottom: 4px;
}

.hit-relpath {
  color: var(--color-accent);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hit-line,
.hit-col {
  color: var(--color-text-muted);
}

.hit-text {
  margin: 0 0 6px;
  padding: 4px 8px;
  background: var(--color-bg-subtle);
  border-left: 3px solid var(--color-border);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  white-space: pre;
  overflow-x: auto;
  color: var(--color-text);
}

.hit-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  padding: 3px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  font-size: var(--text-xs);
  cursor: pointer;
  color: var(--color-text);
}

.action-btn:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.tracker-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.footer-left,
.footer-right {
  display: flex;
  gap: var(--space-2);
}

.btn {
  padding: 6px 14px;
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
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
  font-weight: 500;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.btn-primary:disabled,
.btn-default:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
