/**
 * Day 9: N2 스냅샷 store
 *
 * - 현재 선택된 프로젝트 폴더
 * - 그 프로젝트의 스냅샷 목록 (manifest 로부터)
 * - 생성 진행률 (main → renderer push)
 */
import { defineStore } from 'pinia'
import type { SnapshotMetaWire } from '../../electron/preload'

export type { SnapshotMetaWire }

export interface CreateProgress {
  phase: 'scan' | 'pack' | 'finalize'
  filesDone: number
  filesTotal: number
  bytesDone: number
  bytesTotal: number
}

interface State {
  /** 현재 활성 프로젝트 (관리 화면 / 생성 모달이 작업 대상) */
  currentProject: string | null
  snapshots: SnapshotMetaWire[]
  loading: boolean
  error: string | null

  // 생성 진행률
  creating: boolean
  createProgress: CreateProgress | null
  createError: string | null

  // 마지막 사용한 프로젝트 — Day 7 git.lastRepoPath 와 동일 패턴
  lastProjectPath: string | null
}

export const useSnapshotStore = defineStore('snapshot', {
  state: (): State => ({
    currentProject: null,
    snapshots: [],
    loading: false,
    error: null,
    creating: false,
    createProgress: null,
    createError: null,
    lastProjectPath: null,
  }),

  getters: {
    sortedSnapshots(state): SnapshotMetaWire[] {
      // 최신 우선
      return [...state.snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    totalSize(state): number {
      return state.snapshots.reduce((sum, s) => sum + s.sizeBytes, 0)
    },
  },

  actions: {
    setCurrentProject(path: string | null) {
      this.currentProject = path
      if (path) this.lastProjectPath = path
      this.snapshots = []
      this.error = null
    },

    async refresh() {
      if (!this.currentProject) return
      this.loading = true
      this.error = null
      try {
        const r = await window.textdiff.snapshotList(this.currentProject)
        if (r.ok && r.snapshots) {
          this.snapshots = r.snapshots
        } else {
          this.error = r.error ?? '스냅샷 목록 로드 실패'
        }
      } finally {
        this.loading = false
      }
    },

    async create(memo: string, pinned: boolean, forceFolderFormat = false) {
      if (!this.currentProject) {
        this.createError = '프로젝트가 지정되지 않았습니다.'
        return null
      }
      this.creating = true
      this.createError = null
      this.createProgress = null

      const unsub = window.textdiff.onSnapshotProgress((p) => {
        this.createProgress = p
      })

      try {
        const r = await window.textdiff.snapshotCreate({
          projectRoot: this.currentProject,
          memo,
          pinned,
          forceFolderFormat,
        })
        if (!r.ok) {
          this.createError = r.error ?? '생성 실패'
          return null
        }
        // 목록 즉시 갱신
        await this.refresh()
        return r.snapshot ?? null
      } finally {
        unsub()
        this.creating = false
        this.createProgress = null
      }
    },

    async togglePin(id: string) {
      if (!this.currentProject) return
      const snap = this.snapshots.find((s) => s.id === id)
      if (!snap) return
      const r = await window.textdiff.snapshotSetPinned(
        this.currentProject,
        id,
        !snap.pinned,
      )
      if (r.ok && r.snapshot) {
        snap.pinned = r.snapshot.pinned
      }
    },

    async remove(id: string) {
      if (!this.currentProject) return false
      const r = await window.textdiff.snapshotDelete(this.currentProject, id)
      if (r.ok) {
        this.snapshots = this.snapshots.filter((s) => s.id !== id)
        return true
      }
      this.error = r.error ?? '삭제 실패'
      return false
    },

    // Day 9.5: 복원
    async analyzeRestore(id: string, contentCompare = false) {
      if (!this.currentProject) return null
      const r = await window.textdiff.snapshotAnalyzeRestore(
        this.currentProject,
        id,
        contentCompare,
      )
      if (r.ok && r.impact) return r.impact
      this.error = r.error ?? '영향 분석 실패'
      return null
    },

    async restore(id: string, expectedNameConfirm: string) {
      if (!this.currentProject) return { ok: false as const, code: 'NOT_FOUND' as const }
      const r = await window.textdiff.snapshotRestore(
        this.currentProject,
        id,
        expectedNameConfirm,
      )
      // 새 자동 백업이 생겼을 수 있으니 목록 refresh
      await this.refresh()
      return r
    },
  },
})
