/**
 * 파일 변경 감시 IPC — chokidar 기반
 * 출처: 15 Day5 RSD FR-1, FR-2
 *
 * 설계:
 *  - watcher:start 호출 시 sender (WebContents) 기억
 *  - chokidar 'change' / 'unlink' 이벤트 → debounce 1초 → watcher:changed 푸시
 *  - watcher:stop 또는 새 start 호출 시 이전 watcher 정리
 */

import { ipcMain, type WebContents } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'

const DEBOUNCE_MS = 1000 // DP-Day5-1

interface WatcherState {
  watcher: FSWatcher | null
  target: WebContents | null
  debouncers: Map<string, NodeJS.Timeout>
}

const state: WatcherState = {
  watcher: null,
  target: null,
  debouncers: new Map(),
}

function clearDebouncers() {
  for (const t of state.debouncers.values()) clearTimeout(t)
  state.debouncers.clear()
}

async function stopWatcher() {
  clearDebouncers()
  if (state.watcher) {
    try {
      await state.watcher.close()
    } catch {
      /* 이미 닫혔거나 에러 — 무시 */
    }
    state.watcher = null
  }
  state.target = null
}

function debouncedEmit(eventType: 'change' | 'unlink', filePath: string) {
  const existing = state.debouncers.get(filePath)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    state.debouncers.delete(filePath)
    if (state.target && !state.target.isDestroyed()) {
      try {
        state.target.send('watcher:changed', { path: filePath, type: eventType })
      } catch {
        /* target 닫힘 등 — 무시 */
      }
    }
  }, DEBOUNCE_MS)

  state.debouncers.set(filePath, timer)
}

export function registerWatcherIpc() {
  ipcMain.handle(
    'watcher:start',
    async (event, { paths }: { paths: string[] }) => {
      // 이전 감시 정리 후 새로 시작
      await stopWatcher()

      if (!paths || paths.length === 0) {
        return { ok: false, message: '감시할 경로가 없습니다.' }
      }

      try {
        state.target = event.sender
        state.watcher = chokidar.watch(paths, {
          awaitWriteFinish: {
            stabilityThreshold: 300,
            pollInterval: 100,
          },
          ignoreInitial: true,
          persistent: true,
          // Windows + OneDrive 폴더 일부 케이스 대비 (대부분 false 가 빠름)
          usePolling: false,
        })

        state.watcher.on('change', (p) => debouncedEmit('change', p))
        state.watcher.on('unlink', (p) => debouncedEmit('unlink', p))
        state.watcher.on('error', (err) => {
          // 권한 등 에러 — 콘솔만, 사용자에게는 silent fallback
          console.error('[watcher] error:', err)
        })

        return { ok: true, paths }
      } catch (e) {
        await stopWatcher()
        return { ok: false, message: (e as Error).message }
      }
    },
  )

  ipcMain.handle('watcher:stop', async () => {
    await stopWatcher()
    return { ok: true }
  })
}
