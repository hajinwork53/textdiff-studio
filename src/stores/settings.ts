import { defineStore } from 'pinia'
import type { EditorConfig, EditorScheme } from '../lib/editor-url'

/**
 * 앱 설정 (Day 4 는 메모리만, Day 6+ 에 electron-store 로 영속화)
 * 출처: 13 Day4 RSD FR-8
 *
 * Day 9 hotfix: snapshotStorage 추가
 *   - mode 'project'  : <projectRoot>/snapshots (기본 — 사용자 명시)
 *   - mode 'appdata'  : %APPDATA%/TextDiff/snapshots/<hash> (이전 기본, 옵션 유지)
 *   - mode 'custom'   : <customPath>/<hash>
 */
export type SnapshotStorageMode = 'project' | 'appdata' | 'custom'

export interface SnapshotStorage {
  mode: SnapshotStorageMode
  customPath: string | null
}

interface State {
  editor: EditorConfig
  appVersion: string
  snapshotStorage: SnapshotStorage
}

export const useSettingsStore = defineStore('settings', {
  state: (): State => ({
    editor: { scheme: 'vscode' as EditorScheme }, // DP-Day4-1 기본 VS Code
    appVersion: '0.1.0',
    snapshotStorage: { mode: 'project', customPath: null },
  }),

  actions: {
    setEditorScheme(scheme: EditorScheme) {
      this.editor.scheme = scheme
    },
    setCustomTemplate(template: string) {
      this.editor.customTemplate = template
    },
    async setSnapshotStorage(mode: SnapshotStorageMode, customPath: string | null = null) {
      this.snapshotStorage = { mode, customPath }
      // main 에 동기화
      await window.textdiff.setSnapshotStorage(mode, customPath)
    },
    /** 앱 시작 시 (App.vue) — 현재 settings 값을 main 에 한 번 push */
    async syncSnapshotStorageToMain() {
      await window.textdiff.setSnapshotStorage(
        this.snapshotStorage.mode,
        this.snapshotStorage.customPath,
      )
    },
  },
})
