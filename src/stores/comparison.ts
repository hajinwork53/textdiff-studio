import { defineStore } from 'pinia'
import type { FileReadResult } from '../../electron/preload'
import type { DiffChange, DiffStats } from '../lib/diff-changes'
import type { SlotSource } from '../lib/slot-source'
import { makeVirtualPath } from '../lib/slot-source'
import { useClipboardStore, type ClipboardEntry } from './clipboard'

export type SlotStatus =
  | 'empty'
  | 'loading'
  | 'ready'
  | 'binary-warning'
  | 'error'

export interface FileSlot {
  index: number
  /** 가상 식별자 — file 이면 실제 경로, clipboard 면 'clipboard:N' */
  path: string | null
  /** Day 6: 슬롯 출처 정보 (null = empty) */
  source: SlotSource | null
  status: SlotStatus
  data: FileReadResult | null
  error: string | null
  pendingBinaryPath: string | null
}

/**
 * Day 10.5 hotfix: 비교 진입 출처 추적 (DiffViewer 의 [← 새 비교] 가 올바른 위치로 복귀하도록)
 *  - 'file'      : FilePicker 의 직접 파일 선택 → /diff
 *  - 'clipboard' : Ctrl+V 또는 [📋 클립보드 붙여넣기] → /diff
 *  - 'git'       : GitCompareModal → /diff
 *  - 'snapshot'  : SnapshotCompareModal → /diff
 *  - 'cli'       : CLI dispatch → /diff
 *  - null        : 알 수 없음 (fallback = router.back() 또는 /)
 */
export type ComparisonEntrySource = 'file' | 'clipboard' | 'git' | 'snapshot' | 'cli' | null

interface State {
  slotCount: number
  slots: FileSlot[]

  // Day 3 추가
  changes: DiffChange[]
  stats: DiffStats | null
  activeChangeIndex: number | null

  // Day 3 추가: 좌측 패널 상태
  panelWidth: number
  panelCollapsed: boolean

  // Day 10.5 hotfix: 진입 출처
  entrySource: ComparisonEntrySource
}

const PANEL_DEFAULT_WIDTH = 280
const PANEL_MIN_WIDTH = 220
const PANEL_MAX_WIDTH = 500

function emptySlot(index: number): FileSlot {
  return {
    index,
    path: null,
    source: null,
    status: 'empty',
    data: null,
    error: null,
    pendingBinaryPath: null,
  }
}

export const useComparisonStore = defineStore('comparison', {
  state: (): State => ({
    slotCount: 2,
    slots: [emptySlot(0), emptySlot(1)],
    changes: [],
    stats: null,
    activeChangeIndex: null,
    panelWidth: PANEL_DEFAULT_WIDTH,
    panelCollapsed: false,
    entrySource: null,
  }),

  getters: {
    canCompare(state): boolean {
      return state.slots.every((s) => s.status === 'ready' && s.data !== null)
    },
    readySlots(state): FileSlot[] {
      return state.slots.filter((s) => s.status === 'ready')
    },
    hasChanges(state): boolean {
      return state.changes.length > 0
    },
    firstEmptySlotIndex(state): number {
      for (let i = 0; i < state.slots.length; i++) {
        if (state.slots[i].status === 'empty') return i
      }
      return -1
    },
  },

  actions: {
    setSlotCount(count: number) {
      this.slotCount = Math.max(2, Math.min(5, count))
      if (this.slots.length < this.slotCount) {
        for (let i = this.slots.length; i < this.slotCount; i++) {
          this.slots.push(emptySlot(i))
        }
      } else if (this.slots.length > this.slotCount) {
        this.slots = this.slots.slice(0, this.slotCount)
      }
    },

    clearSlot(slotIndex: number) {
      if (slotIndex < 0 || slotIndex >= this.slots.length) return
      this.slots[slotIndex] = emptySlot(slotIndex)
    },

    async loadFile(
      slotIndex: number,
      path: string,
      options?: { forceEncoding?: string; forceBinary?: boolean },
    ): Promise<void> {
      if (slotIndex < 0 || slotIndex >= this.slots.length) return
      const slot = this.slots[slotIndex]

      slot.source = { kind: 'file', path }
      slot.path = path
      slot.status = 'loading'
      slot.error = null
      slot.pendingBinaryPath = null

      const result = await window.textdiff.readFile(path, options)

      if (!result.ok) {
        slot.status = 'error'
        slot.error = result.message
        slot.data = null
        return
      }

      if (result.isBinary && !options?.forceBinary) {
        slot.status = 'binary-warning'
        slot.pendingBinaryPath = path
        slot.data = null
        return
      }

      slot.status = 'ready'
      slot.data = result
    },

    /**
     * Day 6: 클립보드 텍스트를 슬롯에 로드 (가상 슬롯)
     * 동시에 clipboard store 에도 추가 (누적 패널용)
     */
    loadFromClipboard(slotIndex: number, text: string): ClipboardEntry | null {
      if (slotIndex < 0 || slotIndex >= this.slots.length) return null

      const clipboard = useClipboardStore()
      const entry = clipboard.add(text)

      const slot = this.slots[slotIndex]
      slot.source = {
        kind: 'clipboard',
        clipboardId: entry.id,
        capturedAt: entry.capturedAt,
      }
      slot.path = makeVirtualPath(slot.source)
      slot.status = 'ready'
      slot.error = null
      slot.pendingBinaryPath = null
      slot.data = {
        ok: true,
        path: slot.path,
        content: text,
        encoding: 'UTF-8',
        confidence: 1.0,
        hadBom: false,
        isBinary: false,
        size: entry.size,
        lineCount: entry.lineCount,
      } as FileReadResult

      return entry
    },

    /**
     * Day 6: 기존 clipboard entry 로 슬롯 채움 (좌측 패널에서 클릭 시)
     */
    loadFromExistingClipboard(slotIndex: number, clipboardId: number): boolean {
      const clipboard = useClipboardStore()
      const entry = clipboard.findById(clipboardId)
      if (!entry) return false

      if (slotIndex < 0 || slotIndex >= this.slots.length) return false
      const slot = this.slots[slotIndex]
      slot.source = {
        kind: 'clipboard',
        clipboardId: entry.id,
        capturedAt: entry.capturedAt,
      }
      slot.path = makeVirtualPath(slot.source)
      slot.status = 'ready'
      slot.error = null
      slot.pendingBinaryPath = null
      slot.data = {
        ok: true,
        path: slot.path,
        content: entry.content,
        encoding: 'UTF-8',
        confidence: 1.0,
        hadBom: false,
        isBinary: false,
        size: entry.size,
        lineCount: entry.lineCount,
      } as FileReadResult
      return true
    },

    /**
     * Day 7: Git ref 에서 파일 내용 로드
     * - ref === 'WORKING': 작업 디렉토리의 실제 파일 (source.kind = 'file' 로 처리)
     * - 그 외 ref: git show ref:relpath
     */
    async loadFromGit(
      slotIndex: number,
      repoPath: string,
      ref: string,
      relpath: string,
      refLabel: string,
    ): Promise<void> {
      if (slotIndex < 0 || slotIndex >= this.slots.length) return
      const slot = this.slots[slotIndex]

      slot.status = 'loading'
      slot.error = null
      slot.pendingBinaryPath = null

      // WORKING 은 실제 파일이라 file:read IPC 사용 (점프 가능)
      if (ref === 'WORKING') {
        // repoPath + relpath = 절대 경로
        const sep = repoPath.endsWith('/') || repoPath.endsWith('\\') ? '' : '\\'
        const absPath = repoPath + sep + relpath.replace(/\//g, '\\')
        await this.loadFile(slotIndex, absPath)
        return
      }

      // Git ref: text 가져와서 가상 슬롯
      const result = await window.textdiff.gitReadAt(repoPath, ref, relpath)
      let text: string
      if (result.ok && result.content !== undefined) {
        text = result.content
      } else {
        // HEAD 에 그 파일이 없는 경우 (untracked / added) — 빈 텍스트로 fallback
        // → 사용자에겐 "신규 추가" 로 보임 (B 전체가 새로 추가된 것처럼)
        if (ref === 'HEAD' || ref === 'WORKING') {
          text = ''
        } else {
          slot.status = 'error'
          slot.error = result.error ?? `Git ref 읽기 실패: ${ref}:${relpath}`
          slot.data = null
          return
        }
      }
      slot.source = { kind: 'git', repoPath, ref, relpath, refLabel }
      slot.path = `git:${ref}:${relpath}`
      slot.status = 'ready'
      slot.data = {
        ok: true,
        path: slot.path,
        content: text,
        encoding: 'UTF-8',
        confidence: 1.0,
        hadBom: false,
        isBinary: false,
        size: new Blob([text]).size,
        lineCount: text === '' ? 0 : text.split(/\r\n|\r|\n/).length,
      } as FileReadResult
    },

    /**
     * Day 9: 스냅샷에서 특정 파일 내용 로드 (가상 슬롯)
     */
    async loadFromSnapshot(
      slotIndex: number,
      projectRoot: string,
      snapshotId: string,
      snapshotLabel: string,
      relpath: string,
      forceEncoding?: string,
    ): Promise<void> {
      if (slotIndex < 0 || slotIndex >= this.slots.length) return
      const slot = this.slots[slotIndex]
      slot.status = 'loading'
      slot.error = null
      slot.pendingBinaryPath = null

      const result = await window.textdiff.snapshotReadFile(
        projectRoot,
        snapshotId,
        relpath,
        forceEncoding,
      )

      if (!result.ok) {
        slot.status = 'error'
        slot.error = result.error ?? '스냅샷 파일 읽기 실패'
        slot.data = null
        return
      }

      slot.source = {
        kind: 'snapshot',
        projectRoot,
        snapshotId,
        snapshotLabel,
        relpath,
      }
      slot.path = makeVirtualPath(slot.source)
      slot.status = 'ready'
      slot.data = {
        ok: true,
        path: slot.path,
        content: result.content!,
        encoding: result.encoding ?? 'UTF-8',
        confidence: result.confidence ?? 1.0,
        hadBom: result.hadBom ?? false,
        isBinary: false,
        size: result.size ?? 0,
        lineCount: result.lineCount ?? 0,
      } as FileReadResult
    },

    async confirmBinaryLoad(slotIndex: number, encoding: string = 'UTF-8') {
      const slot = this.slots[slotIndex]
      if (slot.status !== 'binary-warning' || !slot.pendingBinaryPath) return
      await this.loadFile(slotIndex, slot.pendingBinaryPath, {
        forceEncoding: encoding,
        forceBinary: true,
      })
    },

    async changeEncoding(slotIndex: number, encoding: string) {
      const slot = this.slots[slotIndex]
      if (!slot.path) return
      // clipboard 는 인코딩 변경 무의미 (이미 UTF-8 string)
      if (slot.source?.kind !== 'file') return
      await this.loadFile(slotIndex, slot.source.path, { forceEncoding: encoding })
    },

    // Day 3: 변경 목록 + 통계
    setChanges(changes: DiffChange[]) {
      this.changes = changes
      this.activeChangeIndex = null
    },

    setStats(stats: DiffStats | null) {
      this.stats = stats
    },

    setActiveChange(index: number | null) {
      this.activeChangeIndex = index
    },

    setPanelWidth(width: number) {
      this.panelWidth = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, width))
    },

    togglePanel() {
      this.panelCollapsed = !this.panelCollapsed
    },

    resetForNewComparison() {
      this.changes = []
      this.stats = null
      this.activeChangeIndex = null
      // entrySource 는 호출자가 명시적으로 setEntrySource 로 갱신 (resetForNewComparison 직후)
    },

    /** Day 10.5 hotfix: 진입 시 호출 (GitCompareModal / SnapshotCompareModal / FilePicker / CLI dispatch) */
    setEntrySource(source: ComparisonEntrySource) {
      this.entrySource = source
    },
  },
})

export { PANEL_DEFAULT_WIDTH, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH }
