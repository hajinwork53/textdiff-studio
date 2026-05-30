/**
 * Day 8.5: N1 트래커 IPC
 *  - tracker:search — ripgrep 호출
 */
import { ipcMain } from 'electron'
import { searchText, type SearchOptions, type SearchResult } from '../lib/ripgrep'

export function registerTrackerIpc() {
  ipcMain.handle(
    'tracker:search',
    async (_event, opts: SearchOptions): Promise<SearchResult> => {
      // 최소 검증 — query 너무 짧으면 거부
      if (!opts || typeof opts.query !== 'string' || opts.query.trim().length < 2) {
        return { ok: false, error: '검색어는 2자 이상이어야 합니다.' }
      }
      if (!opts.root || typeof opts.root !== 'string') {
        return { ok: false, error: '검색 루트가 지정되지 않았습니다.' }
      }
      try {
        return await searchText(opts)
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  )
}
