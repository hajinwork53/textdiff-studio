/**
 * Day 8.5: N1 텍스트 트래커 store
 * - 마지막 검색 결과 + 옵션
 * - skip 된 파일 목록 (잠긴 파일 등 비치명적 에러)
 * - 모달 상태 글로벌화 (어디서든 openModal)
 *
 * Day 8.5 hotfix v2: stash 제거 — 사용자 의견 반영 ("검색 결과는 항상 별도 MD")
 */
import { defineStore } from 'pinia'

export interface SearchHit {
  path: string
  relpath: string
  line: number
  column: number
  text: string
}

export interface SkippedFile {
  path: string
  reason: string
}

export interface SearchOptions {
  query: string
  root: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  fileGlobs?: string[]
  maxResults?: number
}

interface State {
  // 마지막 검색
  lastQuery: string
  lastRoot: string | null
  lastOptions: SearchOptions | null
  lastHits: SearchHit[]
  lastSkipped: SkippedFile[]
  lastTruncated: boolean
  lastDurationMs: number | null
  // 진행 상태
  searching: boolean
  error: string | null
  // 모달 상태
  modalOpen: boolean
  modalInitialQuery: string
}

const DEFAULT_OPTIONS: Omit<SearchOptions, 'query' | 'root'> = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  fileGlobs: undefined,
  maxResults: 500,
}

export const useTextTrackerStore = defineStore('textTracker', {
  state: (): State => ({
    lastQuery: '',
    lastRoot: null,
    lastOptions: null,
    lastHits: [],
    lastSkipped: [],
    lastTruncated: false,
    lastDurationMs: null,
    searching: false,
    error: null,
    modalOpen: false,
    modalInitialQuery: '',
  }),

  getters: {
    hasResults(state): boolean {
      return state.lastHits.length > 0
    },
    hasSkipped(state): boolean {
      return state.lastSkipped.length > 0
    },
  },

  actions: {
    async search(opts: SearchOptions) {
      this.searching = true
      this.error = null
      this.lastQuery = opts.query
      this.lastRoot = opts.root
      this.lastOptions = opts
      this.lastHits = []
      this.lastSkipped = []
      this.lastTruncated = false
      this.lastDurationMs = null

      try {
        const result = await window.textdiff.trackerSearch(opts)
        if (result.ok) {
          this.lastHits = result.hits ?? []
          this.lastSkipped = result.skippedFiles ?? []
          this.lastTruncated = !!result.truncated
          this.lastDurationMs = result.durationMs ?? null
        } else {
          this.error = result.error ?? '검색 실패'
          // 치명적이어도 skip 정보는 보존
          this.lastSkipped = result.skippedFiles ?? []
        }
      } catch (e) {
        this.error = (e as Error).message
      } finally {
        this.searching = false
      }
    },

    /** DiffViewer 떠날 때 호출 (옵션) */
    resetAll() {
      this.lastQuery = ''
      this.lastRoot = null
      this.lastOptions = null
      this.lastHits = []
      this.lastSkipped = []
      this.lastTruncated = false
      this.lastDurationMs = null
      this.error = null
    },

    /** 글로벌 모달 열기 (FilePicker / DiffViewer 어디서든) */
    openModal(query?: string) {
      this.modalInitialQuery = (query ?? '').trim()
      this.modalOpen = true
    },

    closeModal() {
      this.modalOpen = false
      this.modalInitialQuery = ''
    },
  },
})

export { DEFAULT_OPTIONS }
