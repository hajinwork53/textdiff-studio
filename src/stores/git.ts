import { defineStore } from 'pinia'

/**
 * Git 가용성 + 현재 컨텍스트의 repo 경로 캐시
 * 출처: 19 Day7 RSD FR-11
 */

type PendingModalMode = 'working' | 'commits' | 'branches' | null

interface State {
  available: boolean
  version: string | null
  detectedOnce: boolean // 앱 시작 시 1회 검사
  /** 마지막으로 사용한 git repo 경로 (다음 비교 시 기본값) */
  lastRepoPath: string | null
  /** Day 8: CLI dispatch 가 FilePicker 진입 시 자동으로 Git 모달 + 모드 열고 싶을 때 */
  pendingOpenModal: PendingModalMode
}

export const useGitStore = defineStore('git', {
  state: (): State => ({
    available: false,
    version: null,
    detectedOnce: false,
    lastRepoPath: null,
    pendingOpenModal: null,
  }),

  actions: {
    async detect() {
      if (this.detectedOnce) return
      const result = await window.textdiff.gitDetect()
      this.available = result.installed
      this.version = result.version ?? null
      this.detectedOnce = true
    },
    setLastRepoPath(path: string | null) {
      this.lastRepoPath = path
    },
    consumePendingOpenModal(): PendingModalMode {
      const v = this.pendingOpenModal
      this.pendingOpenModal = null
      return v
    },
  },
})
