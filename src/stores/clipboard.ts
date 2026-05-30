import { defineStore } from 'pinia'

/**
 * 클립보드 페이스트 누적 관리 (DP-Day6-1: 최대 10개, 오래된 것 자동 삭제)
 * 출처: 17 Day6 RSD FR-7, FR-9
 *
 * 디스크 저장 없음 — 앱 종료 시 자동 소멸 (보안)
 */

export interface ClipboardEntry {
  id: number               // 자동 증분
  content: string
  capturedAt: Date
  lineCount: number
  size: number             // bytes
}

const MAX_CLIPBOARD_ENTRIES = 10

let nextId = 1

export const useClipboardStore = defineStore('clipboard', {
  state: () => ({
    entries: [] as ClipboardEntry[],
  }),

  getters: {
    count(state): number {
      return state.entries.length
    },
    findById:
      (state) =>
      (id: number): ClipboardEntry | undefined =>
        state.entries.find((e) => e.id === id),
  },

  actions: {
    /**
     * 클립보드 텍스트 추가 → ID 반환
     * 가장 오래된 것 자동 삭제 (10개 cap)
     */
    add(content: string): ClipboardEntry {
      const entry: ClipboardEntry = {
        id: nextId++,
        content,
        capturedAt: new Date(),
        lineCount: content === '' ? 0 : content.split(/\r\n|\r|\n/).length,
        size: new Blob([content]).size,
      }
      this.entries.push(entry)
      // 가장 오래된 것부터 제거
      while (this.entries.length > MAX_CLIPBOARD_ENTRIES) {
        this.entries.shift()
      }
      return entry
    },

    remove(id: number) {
      this.entries = this.entries.filter((e) => e.id !== id)
    },

    clear() {
      this.entries = []
    },
  },
})

export { MAX_CLIPBOARD_ENTRIES }
