/**
 * macOS 애플리케이션 메뉴.
 *
 * 왜 필요한가: 맥 Electron 은 Edit 메뉴(copy/paste/cut/selectAll roles)가 없으면
 * 입력창에서 Cmd+C/V/X/A 가 동작하지 않는다 (잘 알려진 맥 함정).
 * 윈도우는 기본 메뉴로 Ctrl+C/V 가 되므로 darwin 일 때만 적용한다.
 *
 * 특히 이 앱의 기능 #3(클립보드 직접 비교 — Cmd+V 로 AI 응답 즉시 슬롯 주입)이
 * Edit 메뉴의 paste role 에 의존하므로 맥에서 필수.
 */
import { app, Menu, type MenuItemConstructorOptions } from 'electron'

export function applyAppMenu(): void {
  // 맥이 아니면 기본 메뉴 유지 (윈도우 회귀 방지)
  if (process.platform !== 'darwin') return

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }, // Cmd+Q
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, // Cmd+X
        { role: 'copy' }, // Cmd+C
        { role: 'paste' }, // Cmd+V  ← 기능 #3 핵심
        { role: 'selectAll' }, // Cmd+A
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
