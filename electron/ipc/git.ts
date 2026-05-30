/**
 * Git IPC 핸들러
 * 출처: 19 Day7 RSD FR-2
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import {
  detectGit,
  isRepoFolder,
  findRepoRoot,
  listCommits,
  listBranches,
  readFileAtRef,
  diffFiles,
  type GitDetectResult,
  type CommitInfo,
  type BranchInfo,
  type ChangedFile,
} from '../lib/git'

export function registerGitIpc() {
  // 앱 시작 시 1회 호출 → settings store 에 캐싱
  ipcMain.handle('git:detect', async (): Promise<GitDetectResult> => {
    return await detectGit()
  })

  // 폴더가 git repo 인지 검사 (CommitPicker 등에서 호출)
  ipcMain.handle('git:is-repo', async (_, folderPath: string): Promise<boolean> => {
    if (!folderPath) return false
    return await isRepoFolder(folderPath)
  })

  // 폴더에서 git repo 루트 검색
  ipcMain.handle(
    'git:find-repo-root',
    async (_, folderPath: string): Promise<string | null> => {
      if (!folderPath) return null
      return await findRepoRoot(folderPath)
    },
  )

  // 폴더 선택 (Git 비교 모달용)
  ipcMain.handle(
    'git:pick-repo-folder',
    async (event): Promise<{ canceled: boolean; folderPath?: string; isRepo?: boolean }> => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return { canceled: true }

      const result = await dialog.showOpenDialog(win, {
        title: 'Git 저장소 폴더 선택',
        properties: ['openDirectory'],
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true }
      }

      const folderPath = result.filePaths[0]
      const isRepo = await isRepoFolder(folderPath)
      return { canceled: false, folderPath, isRepo }
    },
  )

  // 브랜치 목록
  ipcMain.handle(
    'git:list-branches',
    async (
      _,
      { folderPath }: { folderPath: string },
    ): Promise<{
      ok: boolean
      branches?: BranchInfo[]
      current?: string | null
      isDetached?: boolean
      error?: string
    }> => {
      try {
        const result = await listBranches(folderPath)
        return { ok: true, ...result }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  )

  // 커밋 목록 (페이지네이션)
  ipcMain.handle(
    'git:list-commits',
    async (
      _,
      {
        folderPath,
        branch,
        limit,
        offset,
      }: { folderPath: string; branch?: string; limit?: number; offset?: number },
    ): Promise<{ ok: boolean; commits?: CommitInfo[]; error?: string }> => {
      try {
        const commits = await listCommits(folderPath, { branch, limit, offset })
        return { ok: true, commits }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  )

  // 특정 ref 의 파일 내용 (git show)
  ipcMain.handle(
    'git:read-at',
    async (
      _,
      { folderPath, ref, relpath }: { folderPath: string; ref: string; relpath: string },
    ): Promise<{ ok: boolean; content?: string; error?: string }> => {
      try {
        if (ref === 'WORKING') {
          // 작업 디렉토리의 실제 파일 (file:read IPC 와 별개 — 클라이언트가 통일된 인터페이스 원할 때 보조)
          const absPath = path.join(folderPath, relpath)
          if (!fs.existsSync(absPath)) {
            return { ok: false, error: '파일이 존재하지 않습니다 (작업 디렉토리).' }
          }
          const content = fs.readFileSync(absPath, 'utf-8')
          return { ok: true, content }
        }
        const content = await readFileAtRef(folderPath, ref, relpath)
        return { ok: true, content }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  )

  // 두 ref 간 변경된 파일 (또는 HEAD vs WORKING)
  ipcMain.handle(
    'git:diff-files',
    async (
      _,
      {
        folderPath,
        refA,
        refB,
      }: { folderPath: string; refA: string | null; refB: string | null },
    ): Promise<{ ok: boolean; files?: ChangedFile[]; error?: string }> => {
      try {
        const files = await diffFiles(folderPath, refA, refB)
        return { ok: true, files }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  )
}
