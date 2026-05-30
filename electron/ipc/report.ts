/**
 * MD 리포트 저장 + 폴더 열기 IPC
 * 출처: 13 Day4 RSD FR-3, FR-7
 */

import { dialog, ipcMain, shell, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export interface ReportSaveRequest {
  suggestedFilename: string
  content: string
}

export type ReportSaveResponse =
  | { ok: true; path: string }
  | { ok: false; code: 'CANCELED' | 'EACCES' | 'EPERM' | 'ENOSPC' | 'UNKNOWN'; message: string }

function mapErrorCode(err: NodeJS.ErrnoException): {
  code: 'EACCES' | 'EPERM' | 'ENOSPC' | 'UNKNOWN'
  message: string
} {
  switch (err.code) {
    case 'EACCES':
    case 'EPERM':
      return { code: err.code, message: '파일에 쓸 권한이 없습니다.' }
    case 'ENOSPC':
      return { code: 'ENOSPC', message: '디스크 공간이 부족합니다.' }
    default:
      return { code: 'UNKNOWN', message: err.message || '저장 실패' }
  }
}

export function registerReportIpc() {
  ipcMain.handle(
    'report:save',
    async (event, req: ReportSaveRequest): Promise<ReportSaveResponse> => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) {
        return { ok: false, code: 'UNKNOWN', message: '윈도우를 찾을 수 없습니다.' }
      }

      const result = await dialog.showSaveDialog(win, {
        title: 'MD 리포트 저장',
        defaultPath: req.suggestedFilename,
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: '모든 파일', extensions: ['*'] },
        ],
      })

      if (result.canceled || !result.filePath) {
        return { ok: false, code: 'CANCELED', message: '저장이 취소되었습니다.' }
      }

      try {
        // BOM 없는 UTF-8 로 저장 (대부분의 MD 뷰어 호환)
        fs.writeFileSync(result.filePath, req.content, { encoding: 'utf-8' })
        return { ok: true, path: result.filePath }
      } catch (e) {
        const err = e as NodeJS.ErrnoException
        return { ok: false, ...mapErrorCode(err) }
      }
    },
  )

  ipcMain.handle('shell:show-in-folder', async (_event, filePath: string) => {
    if (!filePath) return { ok: false, message: '경로가 비어있습니다.' }
    try {
      const resolved = path.resolve(filePath)
      shell.showItemInFolder(resolved)
      return { ok: true }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  })
}
