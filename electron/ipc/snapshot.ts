/**
 * Day 9: 스냅샷 IPC
 *
 * 핸들러:
 *  - snapshot:pick-project-folder   → 폴더 선택 다이얼로그
 *  - snapshot:scan                  → 제외 패턴 적용한 파일 목록 + 총 크기 (생성 모달 프리뷰)
 *  - snapshot:create                → 실제 생성 (zip 또는 folder fallback)
 *  - snapshot:list                  → 한 프로젝트의 스냅샷 메타 목록
 *  - snapshot:set-pinned            → 핀 토글
 *  - snapshot:delete                → 삭제 (zip 또는 folder)
 *  - snapshot:list-files            → 한 스냅샷 안의 파일 목록 (비교 화면)
 *  - snapshot:read-file             → 한 스냅샷 안의 텍스트 파일 내용
 *  - snapshot:diff-files            → 두 스냅샷의 파일 목록 diff
 *
 * Day 9.5 에서 restore 추가 예정.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import { createExcludeMatcher } from '../lib/snapshot-exclude'
import {
  scanProjectFiles,
  decideFormat,
  createSnapshot,
  listSnapshotFiles,
  readSnapshotFile,
  diffFileLists,
  deleteSnapshotPath,
  type CreateProgress,
} from '../lib/snapshot-zip'
import {
  readManifest,
  writeManifest,
  generateSnapshotId,
  getSnapshotPath,
  selectSnapshotsToDelete,
  isoNow,
  type SnapshotMeta,
} from '../lib/snapshot-manifest'
import {
  resolveProjectSnapshotDir,
  setCurrentStorageConfig,
  getCurrentStorageConfig,
  type StorageMode,
} from '../lib/snapshot-storage'
import {
  analyzeRestoreImpact,
  extractOverProject,
  AutoBackupFailedError,
  InsufficientDiskSpaceError,
  RestoreFailedRolledBackError,
  RestoreAndRollbackFailedError,
  UnsafeSnapshotError,
  type RestoreImpact,
} from '../lib/snapshot-restore'
import { decodeBuffer } from '../lib/encoding'
import { isBinary } from '../lib/binary-detect'

// 모든 IPC 가 현재 storage config 기반으로 dir 계산
function dirFor(projectRoot: string): string {
  return resolveProjectSnapshotDir(projectRoot, getCurrentStorageConfig())
}

// manifest 함수들이 override 받는데 우리가 미리 계산한 dir 전달
function read(projectRoot: string) {
  return readManifest(projectRoot, dirFor(projectRoot))
}
function write(m: Parameters<typeof writeManifest>[0]) {
  return writeManifest(m, dirFor(m.project.absolutePath))
}

/**
 * Day 9.5: 복원 직전 자동 백업 생성 (안전장치 1).
 * snapshot:create 와 비슷하지만 auto=true + relatedTo 설정 + 진행률 prefix 'auto-' 로 구분.
 * 실패 시 throw (호출자가 AutoBackupFailedError 로 감쌈).
 */
async function createAutoBackup(
  projectRoot: string,
  relatedSnapshotId: string,
  sender: Electron.WebContents,
): Promise<SnapshotMeta> {
  const matcher = createExcludeMatcher(projectRoot)
  const scan = await scanProjectFiles(projectRoot, matcher)
  const format = decideFormat(scan)
  const id = generateSnapshotId('', undefined, { auto: true })
  const projectDir = dirFor(projectRoot)
  await fs.promises.mkdir(projectDir, { recursive: true })
  const outputPath = getSnapshotPath(projectDir, { id, format })

  const onProgress = (p: CreateProgress) => {
    if (!sender.isDestroyed()) {
      sender.send('snapshot:progress', { ...p, phase: 'pack' })
    }
  }

  const result = await createSnapshot({
    projectRoot,
    outputPath,
    format,
    files: scan.files,
    totalBytes: scan.totalBytes,
    onProgress,
  })

  const meta: SnapshotMeta = {
    id,
    createdAt: isoNow(),
    memo: `자동 — 복원 전 (${relatedSnapshotId})`,
    fileCount: result.fileCount,
    sizeBytes: result.sizeBytes,
    format: result.format,
    pinned: true, // 자동 백업은 핀 고정 (보관 cap 으로 삭제되지 않게)
    auto: true,
    relatedTo: relatedSnapshotId,
  }

  const manifest = read(projectRoot)
  manifest.snapshots.push(meta)
  write(manifest)
  return meta
}

export function registerSnapshotIpc() {
  ipcMain.handle('snapshot:pick-project-folder', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: '스냅샷 대상 폴더 선택',
          properties: ['openDirectory'],
        })
      : await dialog.showOpenDialog({
          title: '스냅샷 대상 폴더 선택',
          properties: ['openDirectory'],
        })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }
    return { canceled: false, folderPath: result.filePaths[0] }
  })

  ipcMain.handle('snapshot:scan', async (_e, { projectRoot }: { projectRoot: string }) => {
    if (!fs.existsSync(projectRoot)) {
      return { ok: false, error: '폴더를 찾을 수 없습니다.' }
    }
    try {
      const matcher = createExcludeMatcher(projectRoot)
      const scan = await scanProjectFiles(projectRoot, matcher)
      return {
        ok: true,
        fileCount: scan.files.length,
        totalBytes: scan.totalBytes,
        format: decideFormat(scan), // 미리 알려서 UI 가 "큰 폴더 → 폴더 복사 모드" 안내 가능
      }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle(
    'snapshot:create',
    async (
      event,
      args: { projectRoot: string; memo: string; pinned: boolean; forceFolderFormat?: boolean },
    ) => {
      const { projectRoot, memo, pinned, forceFolderFormat } = args
      if (!fs.existsSync(projectRoot)) {
        return { ok: false, error: '폴더를 찾을 수 없습니다.' }
      }

      try {
        const matcher = createExcludeMatcher(projectRoot)
        const scan = await scanProjectFiles(projectRoot, matcher)
        const format = forceFolderFormat ? 'folder' : decideFormat(scan)
        const id = generateSnapshotId(memo)
        const projectDir = dirFor(projectRoot)
        await fs.promises.mkdir(projectDir, { recursive: true })
        const outputPath = getSnapshotPath(projectDir, { id, format })

        const sender = event.sender
        const onProgress = (p: CreateProgress) => {
          // 비동기 — best-effort
          if (!sender.isDestroyed()) {
            sender.send('snapshot:progress', p)
          }
        }

        const result = await createSnapshot({
          projectRoot,
          outputPath,
          format,
          files: scan.files,
          totalBytes: scan.totalBytes,
          onProgress,
        })

        // manifest 갱신
        const manifest = read(projectRoot)
        const meta: SnapshotMeta = {
          id,
          createdAt: isoNow(),
          memo: memo.trim(),
          fileCount: result.fileCount,
          sizeBytes: result.sizeBytes,
          format: result.format,
          pinned,
          auto: false,
          relatedTo: null,
        }
        manifest.snapshots.push(meta)

        // 용량 cap 적용 → 오래된 거 삭제
        const toDelete = selectSnapshotsToDelete(manifest.snapshots)
        for (const delId of toDelete) {
          const delMeta = manifest.snapshots.find((s) => s.id === delId)
          if (!delMeta) continue
          const delPath = getSnapshotPath(projectDir, delMeta)
          try {
            await deleteSnapshotPath(delPath, delMeta.format)
          } catch {
            // 삭제 실패 — manifest 에서는 제거
          }
        }
        manifest.snapshots = manifest.snapshots.filter((s) => !toDelete.includes(s.id))

        write(manifest)

        return {
          ok: true,
          snapshot: meta,
          deletedIds: toDelete,
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  )

  ipcMain.handle(
    'snapshot:get-paths',
    async (_e, args: { projectRoot: string; id?: string }) => {
      try {
        const projectDir = dirFor(args.projectRoot)
        if (!args.id) {
          return { ok: true, rootDir: projectDir }
        }
        const manifest = read(args.projectRoot)
        const snap = manifest.snapshots.find((s) => s.id === args.id)
        if (!snap) return { ok: false, error: '스냅샷을 찾을 수 없음' }
        const snapPath = getSnapshotPath(projectDir, snap)
        return { ok: true, rootDir: projectDir, snapshotPath: snapPath }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  )

  ipcMain.handle('snapshot:list', async (_e, { projectRoot }: { projectRoot: string }) => {
    try {
      const manifest = read(projectRoot)
      // 최신 정렬 + 핀 우선 X (그냥 시간순; UI 가 정렬)
      return { ok: true, snapshots: manifest.snapshots }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // Day 9 hotfix: renderer 의 settings 변경을 main 에 push (storage mode/custom path)
  ipcMain.handle(
    'settings:set-snapshot-storage',
    async (
      _e,
      args: { mode: StorageMode; customPath?: string | null },
    ) => {
      setCurrentStorageConfig({ mode: args.mode, customPath: args.customPath ?? null })
      return { ok: true, current: getCurrentStorageConfig() }
    },
  )

  // 사용자가 custom 모드의 폴더 선택 시
  ipcMain.handle('settings:pick-snapshot-storage-folder', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: '스냅샷 저장 폴더 선택 (custom)',
          properties: ['openDirectory', 'createDirectory'],
        })
      : await dialog.showOpenDialog({
          title: '스냅샷 저장 폴더 선택 (custom)',
          properties: ['openDirectory', 'createDirectory'],
        })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }
    return { canceled: false, folderPath: result.filePaths[0] }
  })

  ipcMain.handle(
    'snapshot:set-pinned',
    async (_e, args: { projectRoot: string; id: string; pinned: boolean }) => {
      try {
        const manifest = read(args.projectRoot)
        const snap = manifest.snapshots.find((s) => s.id === args.id)
        if (!snap) return { ok: false, error: '스냅샷을 찾을 수 없음' }
        snap.pinned = args.pinned
        write(manifest)
        return { ok: true, snapshot: snap }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  )

  ipcMain.handle(
    'snapshot:delete',
    async (_e, args: { projectRoot: string; id: string }) => {
      try {
        const manifest = read(args.projectRoot)
        const snap = manifest.snapshots.find((s) => s.id === args.id)
        if (!snap) return { ok: false, error: '스냅샷을 찾을 수 없음' }
        const projectDir = dirFor(args.projectRoot)
        const snapPath = getSnapshotPath(projectDir, snap)
        await deleteSnapshotPath(snapPath, snap.format)
        manifest.snapshots = manifest.snapshots.filter((s) => s.id !== args.id)
        write(manifest)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  )

  ipcMain.handle(
    'snapshot:list-files',
    async (_e, args: { projectRoot: string; id: string }) => {
      try {
        const manifest = read(args.projectRoot)
        const snap = manifest.snapshots.find((s) => s.id === args.id)
        if (!snap) return { ok: false, error: '스냅샷을 찾을 수 없음' }
        const projectDir = dirFor(args.projectRoot)
        const snapPath = getSnapshotPath(projectDir, snap)
        const files = await listSnapshotFiles(snapPath, snap.format)
        return { ok: true, files }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  )

  ipcMain.handle(
    'snapshot:read-file',
    async (
      _e,
      args: { projectRoot: string; id: string; relpath: string; forceEncoding?: string },
    ) => {
      try {
        const manifest = read(args.projectRoot)
        const snap = manifest.snapshots.find((s) => s.id === args.id)
        if (!snap) return { ok: false, error: '스냅샷을 찾을 수 없음' }
        const projectDir = dirFor(args.projectRoot)
        const snapPath = getSnapshotPath(projectDir, snap)
        const buf = await readSnapshotFile(snapPath, snap.format, args.relpath)
        if (!buf) return { ok: false, error: '파일이 스냅샷에 없습니다.' }
        if (isBinary(buf)) {
          return { ok: false, error: '바이너리 파일은 비교할 수 없습니다.', isBinary: true }
        }
        const decoded = decodeBuffer(buf, args.forceEncoding)
        return {
          ok: true,
          content: decoded.content,
          encoding: decoded.encoding,
          confidence: decoded.confidence,
          hadBom: decoded.hadBom,
          size: buf.length,
          lineCount: decoded.content === '' ? 0 : decoded.content.split(/\r\n|\r|\n/).length,
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  )

  // Day 9.5: 복원 영향 분석 (dry-run)
  ipcMain.handle(
    'snapshot:analyze-restore',
    async (_e, args: { projectRoot: string; id: string; contentCompare?: boolean }) => {
      try {
        const manifest = read(args.projectRoot)
        const snap = manifest.snapshots.find((s) => s.id === args.id)
        if (!snap) return { ok: false, error: '스냅샷을 찾을 수 없음' }
        const projectDir = dirFor(args.projectRoot)
        const snapPath = getSnapshotPath(projectDir, snap)
        const impact = await analyzeRestoreImpact({
          projectRoot: args.projectRoot,
          snapshotPath: snapPath,
          snapshotFormat: snap.format,
          snapshotMeta: snap,
          contentCompare: !!args.contentCompare,
        })
        return { ok: true, impact }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  )

  // Day 9.5: 복원 실행 (3 안전장치 모두)
  ipcMain.handle(
    'snapshot:restore',
    async (event, args: { projectRoot: string; id: string; expectedNameConfirm: string }) => {
      try {
        const manifest = read(args.projectRoot)
        const snap = manifest.snapshots.find((s) => s.id === args.id)
        if (!snap) return { ok: false, code: 'NOT_FOUND', error: '스냅샷을 찾을 수 없음' }

        // 사용자 입력 검증 — 이름 일치
        if (args.expectedNameConfirm.trim() !== snap.id.trim()) {
          return {
            ok: false,
            code: 'NAME_MISMATCH',
            error: '입력한 이름이 스냅샷 ID 와 일치하지 않습니다.',
          }
        }

        const projectDir = dirFor(args.projectRoot)
        const snapPath = getSnapshotPath(projectDir, snap)

        // STEP A: 영향 분석 (path traversal + 디스크 사전 검사 + 내용 hash 비교 → unchanged skip 으로 더 빠름)
        const impact = await analyzeRestoreImpact({
          projectRoot: args.projectRoot,
          snapshotPath: snapPath,
          snapshotFormat: snap.format,
          snapshotMeta: snap,
          contentCompare: true, // 복원 실제 실행 시는 항상 hash 비교 (unchanged 안 건드림 — 속도 + I/O 보호)
        })

        if (impact.unsafePaths.length > 0) {
          throw new UnsafeSnapshotError(impact.unsafePaths)
        }
        if (!impact.diskSufficient) {
          throw new InsufficientDiskSpaceError(impact.estimatedBytes, impact.diskFreeBytes)
        }

        // STEP B: 자동 백업 생성 (안전장치 1)
        let autoBackup: SnapshotMeta | null = null
        try {
          autoBackup = await createAutoBackup(args.projectRoot, snap.id, event.sender)
        } catch (e) {
          throw new AutoBackupFailedError(e)
        }

        // STEP C: 복원 실행
        const safeFiles = [...impact.willAdd, ...impact.willOverwrite]
        try {
          await extractOverProject({
            projectRoot: args.projectRoot,
            snapshotPath: snapPath,
            snapshotFormat: snap.format,
            files: safeFiles,
            extras: impact.willRemove,
          })
        } catch (restoreErr) {
          // STEP D: 롤백 (안전장치 2)
          if (autoBackup) {
            try {
              const autoPath = getSnapshotPath(projectDir, autoBackup)
              // 자동 백업으로 되돌리려면 영향 분석 다시 (현재 상태가 손상되었을 수 있음)
              const rollbackImpact = await analyzeRestoreImpact({
                projectRoot: args.projectRoot,
                snapshotPath: autoPath,
                snapshotFormat: autoBackup.format,
                snapshotMeta: autoBackup,
                contentCompare: true,
              })
              const rollbackFiles = [...rollbackImpact.willAdd, ...rollbackImpact.willOverwrite]
              await extractOverProject({
                projectRoot: args.projectRoot,
                snapshotPath: autoPath,
                snapshotFormat: autoBackup.format,
                files: rollbackFiles,
                extras: rollbackImpact.willRemove,
              })
              throw new RestoreFailedRolledBackError(restoreErr)
            } catch (rollbackErr) {
              if (rollbackErr instanceof RestoreFailedRolledBackError) throw rollbackErr
              throw new RestoreAndRollbackFailedError(restoreErr, rollbackErr)
            }
          }
          throw restoreErr
        }

        return {
          ok: true,
          autoBackupId: autoBackup?.id ?? null,
          summary: {
            added: impact.willAdd.length,
            overwritten: impact.willOverwrite.length,
            removed: impact.willRemove.length,
          },
        }
      } catch (e) {
        const err = e as Error & { code?: string }
        return {
          ok: false,
          code: err.code ?? 'UNKNOWN',
          error: err.message,
        }
      }
    },
  )

  ipcMain.handle(
    'snapshot:diff-files',
    async (_e, args: { projectRoot: string; idA: string; idB: string | null }) => {
      try {
        const manifest = read(args.projectRoot)
        const snapA = manifest.snapshots.find((s) => s.id === args.idA)
        if (!snapA) return { ok: false, error: 'A 스냅샷을 찾을 수 없음' }
        const projectDir = dirFor(args.projectRoot)
        const pathA = getSnapshotPath(projectDir, snapA)
        const filesA = await listSnapshotFiles(pathA, snapA.format)

        let filesB: string[]
        if (args.idB === null) {
          // "현재 상태" — 실제 프로젝트 폴더 스캔
          const matcher = createExcludeMatcher(args.projectRoot)
          const scan = await scanProjectFiles(args.projectRoot, matcher)
          filesB = scan.files.sort()
        } else {
          const snapB = manifest.snapshots.find((s) => s.id === args.idB)
          if (!snapB) return { ok: false, error: 'B 스냅샷을 찾을 수 없음' }
          const pathB = getSnapshotPath(projectDir, snapB)
          filesB = await listSnapshotFiles(pathB, snapB.format)
        }

        const diff = diffFileLists(filesA, filesB)
        return { ok: true, diff }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  )
}
