/**
 * Day 9.5: 스냅샷 복원 + 3 안전장치
 *
 * 위험 액션 — 사용자 작업물을 덮어씀. 데이터 손실 가능.
 *
 * 3 안전장치:
 *   1. 복원 직전 현재 상태 자동 백업 (AUTO_BEFORE_RESTORE_<ts>)
 *      → 실패 시 복원 자체 거부 (안전장치 1 깨지면 진행 X)
 *   2. 복원 중 에러 → 자동 백업으로 즉시 롤백
 *   3. 디스크 공간 사전 검사 (필요 × 1.2 마진)
 *
 * 추가 보호:
 *   - Path traversal 차단 (스냅샷 안의 `..` 경로 거부)
 *   - OneDrive / Dropbox 잠금 → 재시도 (3회 × 1초)
 *   - 영향 분석 (dry-run) — 실제 변경 없이 미리보기
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import JSZip from 'jszip'
import checkDiskSpace from 'check-disk-space'
import { createExcludeMatcher } from './snapshot-exclude'
import { scanProjectFiles, deleteSnapshotPath } from './snapshot-zip'
import type { SnapshotMeta, SnapshotFormat } from './snapshot-manifest'

const RETRY_COUNT = 3
const RETRY_DELAY_MS = 1000
const DISK_SAFETY_MARGIN = 1.2 // 필요 공간 × 1.2

// ============================================================
// 영향 분석 (dry-run)
// ============================================================

export interface RestoreImpact {
  /** 스냅샷에만 있음 → 복원 시 새로 추가됨 */
  willAdd: string[]
  /**
   * 양쪽에 있음 + (contentCompared ? 내용 실제로 다름 : 내용 비교 안 함).
   * contentCompared=false 면 보수적으로 모든 양쪽 존재 파일을 여기로.
   */
  willOverwrite: string[]
  /** 양쪽 존재 + 내용 같음 (contentCompared 일 때만 채워짐 — 복원 시 변화 X) */
  unchanged: string[]
  /** 프로젝트에만 있음 → 복원 시 삭제됨 (제외 패턴 제외) */
  willRemove: string[]
  /** 스냅샷 안 파일 중 경로 위험 (path traversal) */
  unsafePaths: string[]
  /** 예상 디스크 사용 (압축 풀린 크기 + 자동 백업 크기) */
  estimatedBytes: number
  /** 현재 디스크 여유 공간 */
  diskFreeBytes: number
  /** 안전 여유 충분 여부 (estimatedBytes × 1.2 ≤ diskFreeBytes) */
  diskSufficient: boolean
  /** 내용 hash 비교 수행 여부 (UI 에서 결과 해석에 사용) */
  contentCompared: boolean
}

/**
 * 스냅샷에서 압축 풀린 파일 목록 (relpath) 추출.
 */
async function listSnapshotEntries(
  snapshotPath: string,
  format: SnapshotFormat,
): Promise<string[]> {
  if (format === 'zip') {
    const buf = await fs.promises.readFile(snapshotPath)
    const zip = await JSZip.loadAsync(buf)
    const files: string[] = []
    zip.forEach((relpath, entry) => {
      if (!entry.dir) files.push(relpath)
    })
    return files
  }
  // folder
  const files: string[] = []
  async function walk(dir: string, rel: string): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const next = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(path.join(dir, e.name), next)
      else if (e.isFile()) files.push(next)
    }
  }
  await walk(snapshotPath, '')
  return files
}

// ============================================================
// 내용 hash 비교 (Day 9.5 hotfix: "양쪽 존재" 를 실제 수정 vs 동일로 분류)
// ============================================================

/** SHA1 hash of a buffer */
export function hashBuffer(buf: Buffer): string {
  return crypto.createHash('sha1').update(buf).digest('hex')
}

/**
 * 프로젝트 파일의 hash. 읽기 실패 시 null.
 * (스냅샷-vs-현재 비교에서 현재 파일이 잠겨있거나 없을 수 있음)
 */
async function hashProjectFile(absPath: string): Promise<string | null> {
  try {
    const buf = await fs.promises.readFile(absPath)
    return hashBuffer(buf)
  } catch {
    return null
  }
}

/**
 * 스냅샷 안의 한 파일의 hash 가져오기 (zip 또는 folder)
 */
async function hashSnapshotFile(
  snapshotPath: string,
  format: SnapshotFormat,
  relpath: string,
  zipCache?: JSZip,
): Promise<string | null> {
  try {
    if (format === 'zip') {
      const zip = zipCache ?? await loadZip(snapshotPath)
      const entry = zip.file(relpath)
      if (!entry) return null
      const buf = Buffer.from(await entry.async('nodebuffer'))
      return hashBuffer(buf)
    }
    const abs = path.join(snapshotPath, relpath)
    return await hashProjectFile(abs)
  } catch {
    return null
  }
}

async function loadZip(snapshotPath: string): Promise<JSZip> {
  const buf = await fs.promises.readFile(snapshotPath)
  return JSZip.loadAsync(buf)
}

/**
 * 양쪽 존재하는 파일들을 hash 비교하여 modified vs unchanged 로 분류.
 */
async function classifyBothFiles(
  bothFiles: string[],
  projectRoot: string,
  snapshotPath: string,
  snapshotFormat: SnapshotFormat,
): Promise<{ modified: string[]; unchanged: string[] }> {
  const modified: string[] = []
  const unchanged: string[] = []

  // zip 인 경우 한 번만 로드 (모든 파일 비교에 재사용)
  const zipCache = snapshotFormat === 'zip' ? await loadZip(snapshotPath) : undefined

  for (const rel of bothFiles) {
    const projectAbs = path.resolve(projectRoot, rel)
    const [projHash, snapHash] = await Promise.all([
      hashProjectFile(projectAbs),
      hashSnapshotFile(snapshotPath, snapshotFormat, rel, zipCache),
    ])
    // 한쪽 읽기 실패 → 보수적으로 modified 로 (복원 진행 시 덮어씀)
    if (projHash === null || snapHash === null) {
      modified.push(rel)
    } else if (projHash === snapHash) {
      unchanged.push(rel)
    } else {
      modified.push(rel)
    }
  }
  return { modified: modified.sort(), unchanged: unchanged.sort() }
}

/**
 * path traversal 차단: relpath 가 root 안으로 resolve 되는지 검증.
 */
export function isSafeRelpath(relpath: string, root: string): boolean {
  if (!relpath || relpath.includes('\0')) return false
  // 절대 경로 거부
  if (path.isAbsolute(relpath)) return false
  const resolved = path.resolve(root, relpath)
  const rootResolved = path.resolve(root)
  // resolved 가 root 의 하위인지 (또는 root 자체)
  return resolved === rootResolved || resolved.startsWith(rootResolved + path.sep)
}

/**
 * 복원 시 영향 분석. 실제 변경 X.
 *
 * @param contentCompare 양쪽 존재 파일들의 내용 hash 비교 여부 (기본 false — 빠름).
 *   true 면 willOverwrite 가 "실제 다른 파일", unchanged 가 "같은 파일".
 *   false 면 willOverwrite 가 "양쪽 존재 전부", unchanged 는 빈 배열.
 */
export async function analyzeRestoreImpact(args: {
  projectRoot: string
  snapshotPath: string
  snapshotFormat: SnapshotFormat
  snapshotMeta: SnapshotMeta
  contentCompare?: boolean
}): Promise<RestoreImpact> {
  const { projectRoot, snapshotPath, snapshotFormat, snapshotMeta } = args
  const contentCompare = !!args.contentCompare

  // 스냅샷 안의 파일 목록
  const snapEntries = await listSnapshotEntries(snapshotPath, snapshotFormat)

  // path traversal 검사
  const safe: string[] = []
  const unsafe: string[] = []
  for (const rel of snapEntries) {
    if (isSafeRelpath(rel, projectRoot)) safe.push(rel)
    else unsafe.push(rel)
  }
  const snapSet = new Set(safe)

  // 현재 프로젝트 파일 목록 (제외 패턴 적용)
  const matcher = createExcludeMatcher(projectRoot)
  const scan = await scanProjectFiles(projectRoot, matcher)
  const projectSet = new Set(scan.files)

  const willAdd: string[] = []
  const bothFiles: string[] = []
  for (const f of safe) {
    if (projectSet.has(f)) bothFiles.push(f)
    else willAdd.push(f)
  }
  const willRemove: string[] = []
  for (const f of scan.files) {
    if (!snapSet.has(f)) willRemove.push(f)
  }

  // 양쪽 존재 파일 분류 — contentCompare 면 hash 비교, 아니면 전부 overwrite 후보
  let willOverwrite: string[]
  let unchanged: string[]
  if (contentCompare && bothFiles.length > 0) {
    const r = await classifyBothFiles(bothFiles, projectRoot, snapshotPath, snapshotFormat)
    willOverwrite = r.modified
    unchanged = r.unchanged
  } else {
    willOverwrite = bothFiles.sort()
    unchanged = []
  }

  // 디스크 여유 공간
  let diskFreeBytes = 0
  try {
    const info = await checkDiskSpace(projectRoot)
    diskFreeBytes = info.free
  } catch {
    diskFreeBytes = 0
  }

  // 필요 공간 = 스냅샷 풀린 크기 + 자동 백업 (현재 상태 크기 ≈ scan.totalBytes)
  const estimatedBytes = snapshotMeta.sizeBytes + scan.totalBytes
  const diskSufficient = diskFreeBytes >= estimatedBytes * DISK_SAFETY_MARGIN

  return {
    willAdd: willAdd.sort(),
    willOverwrite,
    unchanged,
    willRemove: willRemove.sort(),
    unsafePaths: unsafe.sort(),
    estimatedBytes,
    diskFreeBytes,
    diskSufficient,
    contentCompared: contentCompare,
  }
}

// ============================================================
// 재시도 헬퍼 — OneDrive/Dropbox 잠금 대응
// ============================================================

function isLockError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: string }).code
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES'
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 잠금 에러 발생 시 재시도. 그 외 에러는 즉시 throw.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = RETRY_COUNT,
  delayMs: number = RETRY_DELAY_MS,
): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (!isLockError(e)) throw e
      if (i < retries - 1) await sleep(delayMs)
    }
  }
  throw lastErr
}

// ============================================================
// 핵심: extractOverProject (스냅샷 풀어서 프로젝트에 덮어쓰기)
// ============================================================

/**
 * 스냅샷의 한 파일을 프로젝트의 해당 위치에 쓰기.
 * 디렉토리 자동 생성. 잠금 시 재시도.
 */
async function writeOneFile(absPath: string, data: Buffer): Promise<void> {
  await fs.promises.mkdir(path.dirname(absPath), { recursive: true })
  await withRetry(() => fs.promises.writeFile(absPath, data))
}

async function deleteOneFile(absPath: string): Promise<void> {
  try {
    await withRetry(() => fs.promises.rm(absPath, { force: true }))
  } catch (e) {
    // 잠금 외 에러도 너무 깐깐하게 막지 않음 — 어차피 rollback 메커니즘 있음
    if (isLockError(e)) throw e
    // 파일 없음 등은 OK
  }
}

/**
 * 스냅샷 → 프로젝트 폴더에 덮어쓰기.
 * `extras` 파일 (스냅샷에 없는 프로젝트 파일) 도 삭제 (complete restore 의미).
 */
export async function extractOverProject(args: {
  projectRoot: string
  snapshotPath: string
  snapshotFormat: SnapshotFormat
  /** 미리 검증된 안전한 relpath 들 */
  files: string[]
  /** 스냅샷에 없는 프로젝트 파일 (삭제 대상) — 호출자가 미리 영향 분석으로 계산 */
  extras: string[]
}): Promise<void> {
  const { projectRoot, snapshotPath, snapshotFormat, files, extras } = args

  // 1) 스냅샷 안 파일들 → 프로젝트에 덮어쓰기
  if (snapshotFormat === 'zip') {
    const buf = await fs.promises.readFile(snapshotPath)
    const zip = await JSZip.loadAsync(buf)
    for (const rel of files) {
      const entry = zip.file(rel)
      if (!entry) continue
      const data = Buffer.from(await entry.async('nodebuffer'))
      const absDest = path.resolve(projectRoot, rel)
      // 더블 체크: resolve 후 root 안인지
      if (!isSafeRelpath(rel, projectRoot)) continue
      await writeOneFile(absDest, data)
    }
  } else {
    // folder
    for (const rel of files) {
      if (!isSafeRelpath(rel, projectRoot)) continue
      const absSrc = path.join(snapshotPath, rel)
      const absDest = path.resolve(projectRoot, rel)
      await fs.promises.mkdir(path.dirname(absDest), { recursive: true })
      await withRetry(() => fs.promises.copyFile(absSrc, absDest))
    }
  }

  // 2) 스냅샷에 없는 파일 (extras) → 삭제
  for (const rel of extras) {
    if (!isSafeRelpath(rel, projectRoot)) continue
    const absDest = path.resolve(projectRoot, rel)
    await deleteOneFile(absDest)
  }

  // 빈 디렉토리는 굳이 정리 안 함 (다음 백업/스캔에 영향 X)
}

// ============================================================
// 에러 클래스 (UI 에서 분기 가능하도록 코드 첨부)
// ============================================================

export class AutoBackupFailedError extends Error {
  code = 'AUTO_BACKUP_FAILED' as const
  constructor(public cause: unknown) {
    super(`자동 백업 생성 실패 (안전장치 1 깨짐) — 복원 거부됨: ${(cause as Error)?.message ?? cause}`)
  }
}

export class InsufficientDiskSpaceError extends Error {
  code = 'INSUFFICIENT_DISK_SPACE' as const
  constructor(public needed: number, public available: number) {
    super(
      `디스크 공간 부족: 필요 ${(needed / (1024 * 1024)).toFixed(1)}MB / 가용 ${(available / (1024 * 1024)).toFixed(1)}MB`,
    )
  }
}

export class RestoreFailedRolledBackError extends Error {
  code = 'RESTORE_ROLLED_BACK' as const
  constructor(public originalCause: unknown) {
    super(
      `복원 실패 — 자동 백업으로 롤백 완료: ${(originalCause as Error)?.message ?? originalCause}`,
    )
  }
}

export class RestoreAndRollbackFailedError extends Error {
  code = 'RESTORE_AND_ROLLBACK_FAILED' as const
  constructor(public originalCause: unknown, public rollbackCause: unknown) {
    super(
      `❌ CRITICAL: 복원 실패 + 롤백도 실패. 자동 백업 위치를 직접 확인하세요. ` +
        `복원 에러: ${(originalCause as Error)?.message ?? originalCause}. ` +
        `롤백 에러: ${(rollbackCause as Error)?.message ?? rollbackCause}`,
    )
  }
}

export class UnsafeSnapshotError extends Error {
  code = 'UNSAFE_SNAPSHOT' as const
  constructor(public badPaths: string[]) {
    super(`스냅샷에 안전하지 않은 경로 포함 (path traversal): ${badPaths.slice(0, 3).join(', ')}`)
  }
}
