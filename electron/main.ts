import { app, BrowserWindow, ipcMain, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as net from 'net'
import { registerDialogIpc } from './ipc/dialog'
import { registerFileIpc } from './ipc/file'
import { registerReportIpc } from './ipc/report'
import { registerWatcherIpc } from './ipc/watcher'
import { registerClipboardIpc } from './ipc/clipboard'
import { registerGitIpc } from './ipc/git'
import { registerTrackerIpc } from './ipc/tracker'
import { registerSnapshotIpc } from './ipc/snapshot'
import { applyAppMenu } from './lib/menu'

// Day 10.5 hotfix: ELECTRON_RUN_AS_NODE 환경변수 안전망
// 이 변수가 set 되어 있으면 Electron .exe 가 일반 Node 처럼 동작 → main process 미동작 → silent exit
// 사용자 PC 어딘가에 set 되어 있을 수 있음 (개발 도구가 남긴 잔재 등). packaged 에서 안전하게 무시.
if (process.env.ELECTRON_RUN_AS_NODE) {
  delete process.env.ELECTRON_RUN_AS_NODE
}

const isDev = process.env.NODE_ENV === 'development'

// Day 10.5: dev 와 packaged 의 single-instance lock 충돌 방지
// (lock key 는 app.name + userData path 기반 — 다른 이름이면 공존 가능)
app.setName(isDev ? 'TextDiff Studio Dev' : 'TextDiff Studio')
if (isDev) {
  app.setPath('userData', path.join(app.getPath('appData'), 'TextDiff Studio Dev'))
}

/**
 * Day 8 hotfix: 5173 포트에 Vite dev server 가 떠있는지 100ms 안에 확인
 * CLI 가 NODE_ENV 없이 spawn 했을 때 (`textdiff a b`) 도 dev URL 로드 가능하도록.
 */
function isViteRunning(port = 5173, timeoutMs = 100): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, '127.0.0.1')
  })
}

async function loadAppContent(window: BrowserWindow) {
  if (isDev) {
    await window.loadURL('http://localhost:5173')
    window.webContents.openDevTools()
    return
  }
  const viteUp = await isViteRunning()
  if (viteUp) {
    await window.loadURL('http://localhost:5173')
    return
  }
  const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
  if (fs.existsSync(indexPath)) {
    await window.loadFile(indexPath)
    return
  }
  // 둘 다 없음 — 명확한 에러 화면
  await window.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        '<html><body style="font-family:sans-serif;padding:40px;color:#cf222e">' +
          '<h1>TextDiff Studio — 빌드 누락</h1>' +
          '<p>렌더러 빌드 결과(<code>dist/index.html</code>)가 없고, Vite dev server(localhost:5173)도 떠있지 않습니다.</p>' +
          '<p>해결: 별도 터미널에서 <code>npm run dev</code> 실행 후 CLI 재호출,<br>' +
          '또는 <code>npm run build</code> 한 번 실행하여 <code>dist/</code> 생성.</p>' +
          '</body></html>',
      ),
  )
}

let mainWindow: BrowserWindow | null = null

/**
 * Day 8: CLI 사용자 인자 추출
 * argv 구조 (dev): [electron.exe, '.', '--', userArg1, userArg2, ...]
 * argv 구조 (packaged, 추후): [textdiff.exe, '--', userArg1, ...] (Day 10 .cmd 래퍼)
 *
 * `--` 가 없으면 사용자 인자가 없는 것으로 간주.
 */
function extractUserArgs(argv: string[]): string[] {
  const sepIdx = argv.indexOf('--')
  if (sepIdx === -1) return []
  return argv.slice(sepIdx + 1)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'TextDiff Studio',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  loadAppContent(mainWindow).catch((err) => {
    console.error('loadAppContent 실패:', err)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Day 8: 첫 인스턴스 — render 가 준비된 직후 첫 CLI 인자 dispatch
  mainWindow.webContents.once('did-finish-load', () => {
    const userArgs = extractUserArgs(process.argv)
    if (userArgs.length > 0 && mainWindow) {
      mainWindow.webContents.send('cli:dispatch', {
        argv: userArgs,
        cwd: process.cwd(),
      })
    }
  })
}

// Day 8: single-instance lock — 두 번째 호출은 첫 번째 창에 인자 전달
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv, workingDir) => {
    const userArgs = extractUserArgs(argv)
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    if (userArgs.length > 0) {
      mainWindow.webContents.send('cli:dispatch', {
        argv: userArgs,
        cwd: workingDir,
      })
    }
  })

  app.whenReady().then(() => {
    // IPC 핸들러 등록
    registerDialogIpc()
    registerFileIpc()
    registerReportIpc()
    registerWatcherIpc()
    registerClipboardIpc()
    registerGitIpc()
    registerTrackerIpc()
    registerSnapshotIpc()

    applyAppMenu() // 맥 Edit 메뉴 적용 (Cmd+C/V/X/A — 기능 #3). 윈도우는 no-op

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 공용 IPC
ipcMain.handle('app:version', () => app.getVersion())

ipcMain.handle('editor:open', async (_event, url: string) => {
  await shell.openExternal(url)
  return { ok: true }
})
