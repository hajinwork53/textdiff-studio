import { contextBridge, ipcRenderer } from 'electron'

// 타입은 file.ts 에서 import 하지 않고 여기서 mirror (preload 는 격리되어야)
export interface FileReadResult {
  ok: true
  path: string
  content: string
  encoding: string
  confidence: number
  hadBom: boolean
  isBinary: boolean
  size: number
  lineCount: number
}
export interface FileReadError {
  ok: false
  path: string
  code: string
  message: string
}
export type FileReadResponse = FileReadResult | FileReadError

export interface OpenFileResult {
  canceled: boolean
  paths: string[]
}

export interface ReportSaveResult {
  ok: boolean
  path?: string
  code?: string
  message?: string
}

// Day 9: 스냅샷 메타 (wire)
export interface SnapshotMetaWire {
  id: string
  createdAt: string
  memo: string
  fileCount: number
  sizeBytes: number
  format: 'zip' | 'folder'
  pinned: boolean
  auto: boolean
  relatedTo: string | null
}

const api = {
  // 공용
  getVersion: () => ipcRenderer.invoke('app:version') as Promise<string>,
  openInEditor: (url: string) =>
    ipcRenderer.invoke('editor:open', url) as Promise<{ ok: boolean }>,

  // Day 2: 파일 다이얼로그
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile') as Promise<OpenFileResult>,

  // Day 2: 파일 읽기 (인코딩 자동 감지 + 바이너리 검사)
  readFile: (path: string, options?: { forceEncoding?: string; forceBinary?: boolean }) =>
    ipcRenderer.invoke('file:read', {
      path,
      forceEncoding: options?.forceEncoding,
      forceBinary: options?.forceBinary,
    }) as Promise<FileReadResponse>,

  // Day 2: 큰 파일 경고 여부
  shouldWarnLargeFile: (sizeBytes: number) =>
    ipcRenderer.invoke('file:warn-large', sizeBytes) as Promise<boolean>,

  // Day 4: MD 리포트 저장
  saveReport: (suggestedFilename: string, content: string) =>
    ipcRenderer.invoke('report:save', { suggestedFilename, content }) as Promise<ReportSaveResult>,

  // Day 4: 탐색기에서 파일 위치 열기
  showInFolder: (path: string) =>
    ipcRenderer.invoke('shell:show-in-folder', path) as Promise<{ ok: boolean; message?: string }>,

  // Day 5: 파일 감시 시작/중단
  startWatch: (paths: string[]) =>
    ipcRenderer.invoke('watcher:start', { paths }) as Promise<{ ok: boolean; message?: string }>,
  stopWatch: () =>
    ipcRenderer.invoke('watcher:stop') as Promise<{ ok: boolean }>,
  /** 변경 이벤트 listener 등록 — 반환된 cleanup 함수로 해제 */
  onFileChanged: (
    cb: (data: { path: string; type: 'change' | 'unlink' }) => void,
  ): (() => void) => {
    const handler = (_: unknown, data: { path: string; type: 'change' | 'unlink' }) => cb(data)
    ipcRenderer.on('watcher:changed', handler)
    return () => ipcRenderer.removeListener('watcher:changed', handler)
  },

  // Day 6: 클립보드 텍스트 읽기 (보조 — 일반 paste 이벤트 외에 버튼 클릭용)
  readClipboard: () =>
    ipcRenderer.invoke('clipboard:read') as Promise<{ text: string; length: number; isEmpty: boolean }>,

  // Day 7: Git 통합
  gitDetect: () =>
    ipcRenderer.invoke('git:detect') as Promise<{ installed: boolean; version?: string; error?: string }>,
  gitIsRepo: (folderPath: string) =>
    ipcRenderer.invoke('git:is-repo', folderPath) as Promise<boolean>,
  gitFindRepoRoot: (folderPath: string) =>
    ipcRenderer.invoke('git:find-repo-root', folderPath) as Promise<string | null>,
  gitPickRepoFolder: () =>
    ipcRenderer.invoke('git:pick-repo-folder') as Promise<{
      canceled: boolean
      folderPath?: string
      isRepo?: boolean
    }>,
  gitListBranches: (folderPath: string) =>
    ipcRenderer.invoke('git:list-branches', { folderPath }) as Promise<{
      ok: boolean
      branches?: Array<{ name: string; isCurrent: boolean; isRemote: boolean }>
      current?: string | null
      isDetached?: boolean
      error?: string
    }>,
  gitListCommits: (folderPath: string, options?: { branch?: string; limit?: number; offset?: number }) =>
    ipcRenderer.invoke('git:list-commits', {
      folderPath,
      branch: options?.branch,
      limit: options?.limit,
      offset: options?.offset,
    }) as Promise<{
      ok: boolean
      commits?: Array<{
        hash: string
        hashShort: string
        message: string
        authorName: string
        authorEmail: string
        date: string
        relativeDate: string
      }>
      error?: string
    }>,
  gitReadAt: (folderPath: string, ref: string, relpath: string) =>
    ipcRenderer.invoke('git:read-at', { folderPath, ref, relpath }) as Promise<{
      ok: boolean
      content?: string
      error?: string
    }>,
  gitDiffFiles: (folderPath: string, refA: string | null, refB: string | null) =>
    ipcRenderer.invoke('git:diff-files', { folderPath, refA, refB }) as Promise<{
      ok: boolean
      files?: Array<{
        relpath: string
        status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'unknown'
        oldRelpath?: string
      }>
      error?: string
    }>,

  // Day 8: CLI dispatch (main → renderer 단방향 push)
  onCliDispatch: (
    cb: (data: { argv: string[]; cwd: string }) => void,
  ): (() => void) => {
    const handler = (_: unknown, data: { argv: string[]; cwd: string }) => cb(data)
    ipcRenderer.on('cli:dispatch', handler)
    return () => ipcRenderer.removeListener('cli:dispatch', handler)
  },

  // Day 9: 스냅샷
  snapshotPickProjectFolder: () =>
    ipcRenderer.invoke('snapshot:pick-project-folder') as Promise<{
      canceled: boolean
      folderPath?: string
    }>,
  snapshotScan: (projectRoot: string) =>
    ipcRenderer.invoke('snapshot:scan', { projectRoot }) as Promise<{
      ok: boolean
      fileCount?: number
      totalBytes?: number
      format?: 'zip' | 'folder'
      error?: string
    }>,
  snapshotCreate: (args: {
    projectRoot: string
    memo: string
    pinned: boolean
    forceFolderFormat?: boolean
  }) =>
    ipcRenderer.invoke('snapshot:create', args) as Promise<{
      ok: boolean
      snapshot?: SnapshotMetaWire
      deletedIds?: string[]
      error?: string
    }>,
  snapshotList: (projectRoot: string) =>
    ipcRenderer.invoke('snapshot:list', { projectRoot }) as Promise<{
      ok: boolean
      snapshots?: SnapshotMetaWire[]
      error?: string
    }>,
  /** id 없으면 프로젝트 폴더만, 있으면 + 해당 스냅샷 파일/폴더 경로 */
  snapshotGetPaths: (projectRoot: string, id?: string) =>
    ipcRenderer.invoke('snapshot:get-paths', { projectRoot, id }) as Promise<{
      ok: boolean
      rootDir?: string
      snapshotPath?: string
      error?: string
    }>,
  /** 저장 모드 설정을 main 에 push (renderer 의 settings store 변경 시) */
  setSnapshotStorage: (mode: 'project' | 'appdata' | 'custom', customPath?: string | null) =>
    ipcRenderer.invoke('settings:set-snapshot-storage', { mode, customPath }) as Promise<{
      ok: boolean
      current: { mode: string; customPath: string | null }
    }>,
  /** custom 모드의 저장 폴더 선택 다이얼로그 */
  pickSnapshotStorageFolder: () =>
    ipcRenderer.invoke('settings:pick-snapshot-storage-folder') as Promise<{
      canceled: boolean
      folderPath?: string
    }>,
  snapshotSetPinned: (projectRoot: string, id: string, pinned: boolean) =>
    ipcRenderer.invoke('snapshot:set-pinned', { projectRoot, id, pinned }) as Promise<{
      ok: boolean
      snapshot?: SnapshotMetaWire
      error?: string
    }>,
  snapshotDelete: (projectRoot: string, id: string) =>
    ipcRenderer.invoke('snapshot:delete', { projectRoot, id }) as Promise<{
      ok: boolean
      error?: string
    }>,
  snapshotListFiles: (projectRoot: string, id: string) =>
    ipcRenderer.invoke('snapshot:list-files', { projectRoot, id }) as Promise<{
      ok: boolean
      files?: string[]
      error?: string
    }>,
  snapshotReadFile: (
    projectRoot: string,
    id: string,
    relpath: string,
    forceEncoding?: string,
  ) =>
    ipcRenderer.invoke('snapshot:read-file', {
      projectRoot,
      id,
      relpath,
      forceEncoding,
    }) as Promise<{
      ok: boolean
      content?: string
      encoding?: string
      confidence?: number
      hadBom?: boolean
      size?: number
      lineCount?: number
      isBinary?: boolean
      error?: string
    }>,
  // Day 9.5: 복원 — contentCompare 면 hash 비교로 modified vs unchanged 분류 (정확하지만 느림)
  snapshotAnalyzeRestore: (projectRoot: string, id: string, contentCompare = false) =>
    ipcRenderer.invoke('snapshot:analyze-restore', { projectRoot, id, contentCompare }) as Promise<{
      ok: boolean
      impact?: {
        willAdd: string[]
        willOverwrite: string[]
        unchanged: string[]
        willRemove: string[]
        unsafePaths: string[]
        estimatedBytes: number
        diskFreeBytes: number
        diskSufficient: boolean
        contentCompared: boolean
      }
      error?: string
    }>,
  snapshotRestore: (projectRoot: string, id: string, expectedNameConfirm: string) =>
    ipcRenderer.invoke('snapshot:restore', { projectRoot, id, expectedNameConfirm }) as Promise<{
      ok: boolean
      code?:
        | 'NOT_FOUND'
        | 'NAME_MISMATCH'
        | 'INSUFFICIENT_DISK_SPACE'
        | 'AUTO_BACKUP_FAILED'
        | 'UNSAFE_SNAPSHOT'
        | 'RESTORE_ROLLED_BACK'
        | 'RESTORE_AND_ROLLBACK_FAILED'
        | 'UNKNOWN'
      autoBackupId?: string | null
      summary?: { added: number; overwritten: number; removed: number }
      error?: string
    }>,

  snapshotDiffFiles: (projectRoot: string, idA: string, idB: string | null) =>
    ipcRenderer.invoke('snapshot:diff-files', { projectRoot, idA, idB }) as Promise<{
      ok: boolean
      diff?: { added: string[]; removed: string[]; both: string[] }
      error?: string
    }>,
  /** snapshot:create 진행률 (main → renderer push) */
  onSnapshotProgress: (
    cb: (p: {
      phase: 'scan' | 'pack' | 'finalize'
      filesDone: number
      filesTotal: number
      bytesDone: number
      bytesTotal: number
    }) => void,
  ): (() => void) => {
    const handler = (_: unknown, p: Parameters<typeof cb>[0]) => cb(p)
    ipcRenderer.on('snapshot:progress', handler)
    return () => ipcRenderer.removeListener('snapshot:progress', handler)
  },

  // Day 8.5: N1 트래커 — ripgrep 검색
  trackerSearch: (opts: {
    query: string
    root: string
    caseSensitive: boolean
    wholeWord: boolean
    regex: boolean
    fileGlobs?: string[]
    maxResults?: number
  }) =>
    ipcRenderer.invoke('tracker:search', opts) as Promise<{
      ok: boolean
      hits?: Array<{
        path: string
        relpath: string
        line: number
        column: number
        text: string
      }>
      truncated?: boolean
      durationMs?: number
      skippedFiles?: Array<{ path: string; reason: string }>
      error?: string
    }>,
}

contextBridge.exposeInMainWorld('textdiff', api)

export type TextDiffApi = typeof api
