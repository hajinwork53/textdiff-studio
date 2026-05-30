<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useComparisonStore } from '../stores/comparison'
import { useToastStore } from '../stores/toast'
import { useSettingsStore } from '../stores/settings'
import { getJumpTargetLine, type DiffChange } from '../lib/diff-changes'
import type { DiffStats } from '../lib/diff-changes'
import { generateMdReport, suggestFilename, type MdReportInput } from '../lib/md-serializer'
import { formatBytes } from '../lib/format-bytes'
import DiffViewer from '../components/DiffViewer.vue'
import DiffTocPanel from '../components/DiffTocPanel.vue'
import ResizeHandle from '../components/ResizeHandle.vue'
import MdPreviewModal from '../components/MdPreviewModal.vue'
import EditorSettingsModal from '../components/EditorSettingsModal.vue'
import PasteConfirmModal from '../components/PasteConfirmModal.vue'
import ClipboardPanel from '../components/ClipboardPanel.vue'
import { useClipboardStore } from '../stores/clipboard'
import { useTextTrackerStore } from '../stores/textTracker'
import { useGitStore } from '../stores/git'
import { usePasteHandler } from '../composables/usePasteHandler'

const router = useRouter()
const comparison = useComparisonStore()
const toast = useToastStore()
const settings = useSettingsStore()
const clipboardStore = useClipboardStore()
const tracker = useTextTrackerStore()
const git = useGitStore()

const ready = computed(() =>
  comparison.slots.length >= 2 &&
  comparison.slots[0].data &&
  comparison.slots[1].data
)

const slotA = computed(() => comparison.slots[0])
const slotB = computed(() => comparison.slots[1])

const diffViewerRef = ref<InstanceType<typeof DiffViewer> | null>(null)

const previewOpen = ref(false)
const previewContent = ref('')
const previewFilename = ref('')
const settingsOpen = ref(false)

// Day 8.5: 텍스트 트래커는 글로벌 store 가 관리 (App.vue 에 모달 마운트)
function openTracker(initialQuery = '') {
  tracker.openModal(initialQuery)
}

// Day 6: paste 확인 모달 상태
const pasteModalOpen = ref(false)
const pastePreview = ref('')
const pasteByteSize = ref(0)
const pasteLineCount = ref(0)
let pendingPasteText = ''
const pasteEnabled = ref(true)

// [무시] 처리된 파일 — 세션 내 다시 알림 X (DP-Day5-3)
const ignoredPaths = ref<Set<string>>(new Set())
// 활성 토스트 ID 추적 — 같은 파일 알림 중복 방지
const activeChangeToasts = ref<Map<string, number>>(new Map())
let unsubscribeWatcher: (() => void) | null = null

const languageHint = computed(() => {
  const path = slotA.value?.path
  if (!path) return 'plaintext'
  const ext = path.toLowerCase().split('.').pop() ?? ''
  const map: Record<string, string> = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    jsx: 'javascript',
    vue: 'html',
    py: 'python',
    md: 'markdown', markdown: 'markdown',
    json: 'json', jsonl: 'json',
    yaml: 'yaml', yml: 'yaml',
    html: 'html', htm: 'html',
    css: 'css', scss: 'scss', less: 'less',
    xml: 'xml',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    sql: 'sql',
    go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', rb: 'ruby', php: 'php',
    c: 'c', cpp: 'cpp', h: 'cpp', cs: 'csharp',
  }
  return map[ext] ?? 'plaintext'
})

function back() {
  // Day 10.5 hotfix: entrySource 따라 자연스러운 복귀
  const src = comparison.entrySource
  if (src === 'git') {
    // FilePicker 로 가되 Git 모달 자동 재오픈 (마지막 모드 = working — 사용자가 다시 선택)
    git.pendingOpenModal = 'working'
    router.push('/')
    return
  }
  if (src === 'snapshot') {
    router.push('/snapshots')
    return
  }
  // file / clipboard / cli / null 모두 FilePicker 로
  router.push('/')
}

function onChangesUpdated(changes: DiffChange[]) {
  comparison.setChanges(changes)
}

function onStatsUpdated(stats: DiffStats) {
  comparison.setStats(stats)
}

function onTocJump(change: DiffChange) {
  const target = getJumpTargetLine(change)
  diffViewerRef.value?.jumpToLine(target.line, target.side)
}

function buildMdInput(): MdReportInput | null {
  if (!slotA.value?.data || !slotB.value?.data || !comparison.stats) return null
  return {
    fileA: {
      path: slotA.value.data.path,
      name: pathBasename(slotA.value.data.path),
      encoding: slotA.value.data.encoding,
      lineCount: slotA.value.data.lineCount,
      size: slotA.value.data.size,
      sizeDisplay: formatBytes(slotA.value.data.size),
    },
    fileB: {
      path: slotB.value.data.path,
      name: pathBasename(slotB.value.data.path),
      encoding: slotB.value.data.encoding,
      lineCount: slotB.value.data.lineCount,
      size: slotB.value.data.size,
      sizeDisplay: formatBytes(slotB.value.data.size),
    },
    fileAContent: slotA.value.data.content,
    fileBContent: slotB.value.data.content,
    changes: comparison.changes,
    stats: comparison.stats,
    generatedAt: new Date(),
    editor: settings.editor,
    appVersion: settings.appVersion,
  }
}

function pathBasename(p: string): string {
  const parts = p.split(/[/\\]/)
  return parts[parts.length - 1] ?? p
}

function shortName(path: string | null): string {
  if (!path) return ''
  return pathBasename(path)
}

async function onSaveReport() {
  const input = buildMdInput()
  if (!input) {
    toast.warning('저장 불가', '비교 데이터가 준비되지 않았습니다.')
    return
  }
  const content = generateMdReport(input)
  const filename = suggestFilename(input)

  const result = await window.textdiff.saveReport(filename, content)

  if (!result.ok) {
    if (result.code === 'CANCELED') return
    toast.error('저장 실패', result.message ?? '알 수 없는 오류')
    return
  }

  const savedPath = result.path!
  toast.success('MD 리포트 저장됨', savedPath, [
    {
      label: '📂 폴더 열기',
      onClick: () => window.textdiff.showInFolder(savedPath),
    },
    {
      label: '📝 에디터로 열기',
      onClick: () => {
        const url = buildSavedFileUrl(savedPath)
        window.textdiff.openInEditor(url)
      },
    },
  ])
}

function buildSavedFileUrl(absPath: string): string {
  const slashed = absPath.replace(/\\/g, '/')
  const encoded = encodeURI(slashed)
  return `${settings.editor.scheme}://file/${encoded}:1`
}

function onShowPreview() {
  const input = buildMdInput()
  if (!input) {
    toast.warning('미리보기 불가', '비교 데이터가 준비되지 않았습니다.')
    return
  }
  previewContent.value = generateMdReport(input)
  previewFilename.value = suggestFilename(input)
  previewOpen.value = true
}

function onPreviewClose() {
  previewOpen.value = false
}

function onPreviewSave() {
  previewOpen.value = false
  onSaveReport()
}

// Day 5: 파일 변경 감지 → 토스트
async function reloadBothFiles() {
  // 양쪽 슬롯 재로드 (현재 인코딩 강제 — 자동 감지 다시 안 함)
  for (const slot of comparison.slots) {
    if (!slot.path) continue
    const force = slot.data?.encoding
    await comparison.loadFile(slot.index, slot.path, force ? { forceEncoding: force } : undefined)
  }
  toast.info('파일 다시 비교됨')
}

const CHANGE_TOAST_DURATION_MS = 30000 // DP-Day5-2: 30초 (백그라운드 작업 후 돌아와도 보이도록)

function handleFileChange(data: { path: string; type: 'change' | 'unlink' }) {
  // [무시] 한 파일은 알림 X
  if (ignoredPaths.value.has(data.path)) return
  // 이미 활성 토스트 있으면 갱신 안 함 (debounce 가 main 에서 처리)
  if (activeChangeToasts.value.has(data.path)) return

  const filename = pathBasename(data.path)
  let toastId = 0

  if (data.type === 'unlink') {
    toastId = toast.warning(
      `파일 삭제됨: ${filename}`,
      data.path,
      [
        {
          label: '확인',
          onClick: () => {
            toast.dismiss(toastId)
            activeChangeToasts.value.delete(data.path)
          },
        },
      ],
      CHANGE_TOAST_DURATION_MS,
    )
    activeChangeToasts.value.set(data.path, toastId)
    setTimeout(() => activeChangeToasts.value.delete(data.path), CHANGE_TOAST_DURATION_MS + 1000)
    return
  }

  toastId = toast.info(
    `파일 변경됨: ${filename}`,
    data.path,
    [
      {
        label: '🔄 다시 비교',
        onClick: async () => {
          toast.dismiss(toastId)
          activeChangeToasts.value.delete(data.path)
          await reloadBothFiles()
        },
      },
      {
        label: '무시',
        onClick: () => {
          toast.dismiss(toastId)
          ignoredPaths.value.add(data.path)
          activeChangeToasts.value.delete(data.path)
          toast.info('이 세션에서 해당 파일 알림 끔')
        },
      },
    ],
    CHANGE_TOAST_DURATION_MS,
  )
  activeChangeToasts.value.set(data.path, toastId)
  // 자동 닫힘 후 active 맵에서 제거 (CHANGE_TOAST_DURATION_MS + 여유 1초)
  setTimeout(() => activeChangeToasts.value.delete(data.path), CHANGE_TOAST_DURATION_MS + 1000)
}

async function startWatching() {
  const paths = comparison.slots
    .map((s) => s.path)
    .filter((p): p is string => p !== null)
  if (paths.length === 0) return
  await window.textdiff.startWatch(paths)
}

async function stopWatching() {
  await window.textdiff.stopWatch()
  if (unsubscribeWatcher) {
    unsubscribeWatcher()
    unsubscribeWatcher = null
  }
}

// Ctrl+B 토글 + Ctrl+S 저장
// (Ctrl+Shift+F 는 App.vue 글로벌 — 여기선 비교 화면 선택 텍스트를 먼저 prefill 하기 위해 가로채기)
function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
    // 비교 화면 안에서는 Monaco 의 선택 텍스트를 우선 사용
    const sel = diffViewerRef.value?.getCurrentSelection?.() ?? ''
    if (sel) {
      e.preventDefault()
      e.stopPropagation()
      openTracker(sel)
    }
    // sel 없으면 글로벌 핸들러(App.vue)에 맡김 (window selection / 빈 입력)
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
    e.preventDefault()
    comparison.togglePanel()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    onSaveReport()
  }
}

const panelStyle = computed(() => {
  if (comparison.panelCollapsed) {
    return { width: '0px', borderRight: 'none' }
  }
  return { width: `${comparison.panelWidth}px` }
})

function onResize(width: number) {
  comparison.setPanelWidth(width)
}

// Day 6: paste 핸들러 (DiffViewer 안에서)
function onPaste(text: string) {
  if (!text) {
    toast.warning('클립보드 비어있음', '복사한 텍스트가 없습니다.')
    return
  }
  // 슬롯 B 가 비어있으면 바로 채움
  if (comparison.slots[1].status === 'empty') {
    const entry = comparison.loadFromClipboard(1, text)
    if (entry) {
      toast.info(`📋 클립보드 #${entry.id} → 슬롯 B`, `${entry.lineCount}줄`)
    }
    return
  }
  // 이미 비교 중 → 확인 모달
  pendingPasteText = text
  pastePreview.value = text.split('\n')[0] ?? ''
  pasteByteSize.value = new Blob([text]).size
  pasteLineCount.value = text.split(/\r\n|\r|\n/).length
  pasteModalOpen.value = true
}

function onPasteCancel() {
  pasteModalOpen.value = false
  pendingPasteText = ''
}

function onPasteReplaceB() {
  pasteModalOpen.value = false
  const entry = comparison.loadFromClipboard(1, pendingPasteText)
  pendingPasteText = ''
  if (entry) {
    toast.info(`📋 클립보드 #${entry.id} → 슬롯 B 교체됨`, `${entry.lineCount}줄`)
  }
}

function onPasteAddOnly() {
  pasteModalOpen.value = false
  // clipboard store 에만 추가 (슬롯 안 바꿈)
  const entry = clipboardStore.add(pendingPasteText)
  pendingPasteText = ''
  toast.info(`📋 클립보드 #${entry.id} 좌측 패널에 추가됨`, `${entry.lineCount}줄`)
}

usePasteHandler({ enabled: pasteEnabled, onPaste })

onMounted(async () => {
  if (!ready.value) {
    router.replace('/')
    return
  }
  comparison.resetForNewComparison()
  // Day 8.5: 새 비교 시작 시 이전 stash 도 비움
  tracker.resetAll()
  ignoredPaths.value.clear()
  activeChangeToasts.value.clear()

  window.addEventListener('keydown', onKeydown)

  // 파일 감시 시작
  unsubscribeWatcher = window.textdiff.onFileChanged(handleFileChange)
  startWatching()

  // Day 8.5: Monaco 양쪽 에디터에 컨텍스트 메뉴 액션 등록
  await nextTick()
  diffViewerRef.value?.registerSelectionAction?.({
    id: 'textdiff.find-output-location',
    label: '🔍 이 텍스트의 출력 위치 찾기',
    contextMenuOrder: 1.5,
    onRun: (sel) => openTracker(sel),
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stopWatching()
})
</script>

<template>
  <div class="diff-view">
    <header class="diff-header-bar">
      <button class="btn-back" @click="back">← 새 비교</button>

      <button
        class="btn-toggle"
        :class="{ active: !comparison.panelCollapsed }"
        :title="comparison.panelCollapsed ? '좌측 패널 열기 (Ctrl+B)' : '좌측 패널 닫기 (Ctrl+B)'"
        @click="comparison.togglePanel()"
      >
        <span class="sidebar-icon" aria-hidden="true">▦</span>
      </button>

      <div class="files-meta" v-if="ready">
        <span class="file-tag">📄 {{ shortName(slotA?.path ?? null) }}</span>
        <span class="vs">↔</span>
        <span class="file-tag">📄 {{ shortName(slotB?.path ?? null) }}</span>
      </div>

      <div class="header-actions">
        <button
          class="btn btn-default"
          :title="`외부 에디터: ${settings.editor.scheme}`"
          @click="settingsOpen = true"
        >
          ⚙ {{ settings.editor.scheme }}
        </button>
        <button
          class="btn btn-default"
          title="출력 텍스트 → 코드 위치 (Ctrl+Shift+F)"
          @click="openTracker(diffViewerRef?.getCurrentSelection?.() ?? '')"
        >
          🔍 텍스트 추적
        </button>
        <button class="btn btn-default" @click="onShowPreview" title="MD 리포트 미리보기">
          👁 미리보기
        </button>
        <button class="btn btn-primary" @click="onSaveReport" title="MD 리포트 저장 (Ctrl+S)">
          💾 MD 저장
        </button>
      </div>

      <div class="day-badge">Day 6 — 클립보드 비교</div>
    </header>

    <main class="diff-main">
      <template v-if="ready">
        <div class="panel-wrapper" :style="panelStyle">
          <div class="panel-content">
            <div class="panel-toc">
              <DiffTocPanel @jump="onTocJump" />
            </div>
            <div class="panel-clipboard">
              <ClipboardPanel />
            </div>
          </div>
        </div>

        <ResizeHandle
          v-if="!comparison.panelCollapsed"
          :initial-width="comparison.panelWidth"
          :min-width="220"
          :max-width="500"
          @resize="onResize"
        />

        <div class="diff-area">
          <DiffViewer
            ref="diffViewerRef"
            :original="slotA!.data!.content"
            :modified="slotB!.data!.content"
            :language="languageHint"
            :original-title="`A · ${slotA!.data!.encoding} · ${slotA!.data!.lineCount}줄`"
            :modified-title="`B · ${slotB!.data!.encoding} · ${slotB!.data!.lineCount}줄`"
            @changes-updated="onChangesUpdated"
            @stats-updated="onStatsUpdated"
          />
        </div>
      </template>
      <div v-else class="empty">
        준비된 파일이 없습니다. 메인으로 돌아가세요.
      </div>
    </main>

    <MdPreviewModal
      :open="previewOpen"
      :content="previewContent"
      :suggested-filename="previewFilename"
      @close="onPreviewClose"
      @save="onPreviewSave"
    />

    <EditorSettingsModal
      :open="settingsOpen"
      @close="settingsOpen = false"
    />

    <PasteConfirmModal
      :open="pasteModalOpen"
      :preview="pastePreview"
      :byte-size="pasteByteSize"
      :line-count="pasteLineCount"
      @cancel="onPasteCancel"
      @replace-b="onPasteReplaceB"
      @add-only="onPasteAddOnly"
    />

    <!-- TextTrackerModal 은 App.vue 에 글로벌 마운트됨 -->
  </div>
</template>

<style scoped>
.diff-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.diff-header-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
  flex-shrink: 0;
}

.btn-back,
.btn-toggle,
.btn {
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-size: var(--text-sm);
  cursor: pointer;
  white-space: nowrap;
}

.btn-back:hover,
.btn-toggle:hover,
.btn-default:hover {
  background: var(--color-bg-hover);
}

.btn-toggle.active {
  background: var(--color-accent);
  color: white;
  border-color: var(--color-accent);
}

.btn-primary {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

.btn-primary:hover {
  background: var(--color-accent-hover);
}

.sidebar-icon {
  font-size: var(--text-base);
}

.files-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  margin-left: var(--space-2);
}

.file-tag {
  font-weight: 500;
}

.vs {
  color: var(--color-text-muted);
}

.header-actions {
  display: flex;
  gap: var(--space-2);
  margin-left: auto;
}

.day-badge {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
}

.diff-main {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.panel-wrapper {
  flex-shrink: 0;
  transition: width 0.18s ease;
  overflow: hidden;
}

.panel-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.panel-toc {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.panel-clipboard {
  flex-shrink: 0;
  padding: var(--space-2) var(--space-3) var(--space-3);
  background: var(--color-bg-subtle);
  border-top: 1px solid var(--color-border);
}

.diff-area {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  color: var(--color-text-muted);
}
</style>
