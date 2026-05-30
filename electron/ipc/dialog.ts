/**
 * 파일/폴더 다이얼로그 IPC
 * 출처: 09 Day2 RSD FR-2, DP-Day2-1
 */

import { dialog, ipcMain, BrowserWindow } from 'electron'

const TEXT_FILE_FILTER = {
  name: '텍스트 파일',
  extensions: [
    'txt', 'md', 'markdown',
    'py', 'js', 'ts', 'jsx', 'tsx', 'vue', 'svelte',
    'java', 'kt', 'go', 'rs', 'rb', 'php', 'c', 'cpp', 'h', 'hpp', 'cs',
    'json', 'jsonl', 'xml', 'yaml', 'yml', 'toml',
    'html', 'htm', 'css', 'scss', 'sass', 'less',
    'csv', 'tsv',
    'log', 'conf', 'config', 'ini', 'env',
    'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
    'sql',
  ],
}

const ALL_FILES_FILTER = { name: '모든 파일', extensions: ['*'] }

export function registerDialogIpc() {
  ipcMain.handle('dialog:openFile', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { canceled: true, paths: [] }

    const result = await dialog.showOpenDialog(win, {
      title: '비교할 파일 선택',
      properties: ['openFile'],
      filters: [TEXT_FILE_FILTER, ALL_FILES_FILTER],
    })

    return {
      canceled: result.canceled,
      paths: result.filePaths,
    }
  })
}
