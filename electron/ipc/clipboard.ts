/**
 * 클립보드 텍스트 읽기 IPC (보조 — 일반 paste 이벤트로 부족할 때)
 * 출처: 17 Day6 RSD FR-2
 *
 * Renderer 에서 [📋 클립보드 붙여넣기] 버튼 클릭 시 사용.
 * Ctrl+V 는 DOM paste 이벤트로 처리 (IPC 불필요).
 */

import { clipboard, ipcMain } from 'electron'

export interface ClipboardReadResult {
  text: string
  length: number
  isEmpty: boolean
}

export function registerClipboardIpc() {
  ipcMain.handle('clipboard:read', async (): Promise<ClipboardReadResult> => {
    const text = clipboard.readText()
    return {
      text,
      length: text.length,
      isEmpty: text.length === 0,
    }
  })
}
