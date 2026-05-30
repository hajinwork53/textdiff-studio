/**
 * Day 9: 스냅샷 생성 (zip + 큰 폴더 fs.cp fallback) + 압축 풀기 + 파일 목록 조회
 *
 * 정책 (RSD 25 FR-3):
 *  - 기본: JSZIP (단일 파일, 메타데이터 포함)
 *  - 10,000 파일 OR 50MB 초과 시 → fs.cp 폴더 복사로 자동 전환
 *  - 진행률은 콜백으로 보고 (renderer 가 UI 업데이트)
 */

import * as fs from 'fs'
import * as path from 'path'
import JSZip from 'jszip'
import type { ExcludeMatcher } from './snapshot-exclude'
import type { SnapshotFormat } from './snapshot-manifest'

export const ZIP_FALLBACK_FILE_COUNT = 10_000
export const ZIP_FALLBACK_SIZE_BYTES = 50 * 1024 * 1024 // 50MB

export interface ScanResult {
  files: string[] // relpath POSIX 슬래시
  totalBytes: number
}

export interface CreateProgress {
  phase: 'scan' | 'pack' | 'finalize'
  filesDone: number
  filesTotal: number
  bytesDone: number
  bytesTotal: number
}

export type ProgressCallback = (p: CreateProgress) => void

export interface CreateSnapshotResult {
  format: SnapshotFormat
  outputPath: string
  fileCount: number
  sizeBytes: number
}

// ============================================================
// 스캔: 제외 패턴 적용하여 전체 파일 목록
// ============================================================

/**
 * projectRoot 안의 모든 파일을 재귀로 스캔. 제외 패턴 적용.
 * 심볼릭 링크는 따라가지 않음 (lstat).
 */
export async function scanProjectFiles(
  projectRoot: string,
  matcher: ExcludeMatcher,
): Promise<ScanResult> {
  const files: string[] = []
  let totalBytes = 0

  async function walk(dir: string, relDir: string): Promise<void> {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return // 접근 권한 없음 등 — skip
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name

      // 디렉토리 또는 파일 — 제외 매칭
      // 디렉토리에 대해서는 trailing `/` 포함하여 매칭 시도 (ignore 패키지 호환)
      const relForMatch = entry.isDirectory() ? `${rel}/` : rel
      if (matcher.shouldExclude(relForMatch)) continue

      if (entry.isSymbolicLink()) {
        // 심링크는 따라가지 않음 (보안 + 무한 루프 방지)
        continue
      }
      if (entry.isDirectory()) {
        await walk(abs, rel)
      } else if (entry.isFile()) {
        try {
          const stat = await fs.promises.stat(abs)
          files.push(rel)
          totalBytes += stat.size
        } catch {
          // stat 실패 — skip
        }
      }
    }
  }

  await walk(projectRoot, '')
  return { files, totalBytes }
}

/**
 * scan 결과 기반으로 format 결정
 */
export function decideFormat(scan: ScanResult): SnapshotFormat {
  if (scan.files.length > ZIP_FALLBACK_FILE_COUNT) return 'folder'
  if (scan.totalBytes > ZIP_FALLBACK_SIZE_BYTES) return 'folder'
  return 'zip'
}

// ============================================================
// 생성: zip 또는 folder
// ============================================================

export interface CreateSnapshotOptions {
  projectRoot: string
  outputPath: string // .zip 파일 경로 또는 폴더 경로
  format: SnapshotFormat
  files: string[]
  totalBytes: number
  onProgress?: ProgressCallback
}

export async function createSnapshot(
  opts: CreateSnapshotOptions,
): Promise<CreateSnapshotResult> {
  if (opts.format === 'zip') {
    return createZipSnapshot(opts)
  }
  return createFolderSnapshot(opts)
}

async function createZipSnapshot(
  opts: CreateSnapshotOptions,
): Promise<CreateSnapshotResult> {
  const zip = new JSZip()
  let filesDone = 0
  let bytesDone = 0

  for (const rel of opts.files) {
    const abs = path.join(opts.projectRoot, rel)
    try {
      const data = await fs.promises.readFile(abs)
      // POSIX 슬래시로 zip 안에 저장 (cross-platform 호환)
      zip.file(rel.replace(/\\/g, '/'), data)
      bytesDone += data.length
    } catch {
      // 파일 잠금 등 — skip (개별 파일 실패가 전체 실패로 번지면 안 됨)
    }
    filesDone += 1
    if (opts.onProgress && filesDone % 50 === 0) {
      opts.onProgress({
        phase: 'pack',
        filesDone,
        filesTotal: opts.files.length,
        bytesDone,
        bytesTotal: opts.totalBytes,
      })
    }
  }

  if (opts.onProgress) {
    opts.onProgress({
      phase: 'finalize',
      filesDone,
      filesTotal: opts.files.length,
      bytesDone,
      bytesTotal: opts.totalBytes,
    })
  }

  // zip → buffer → write
  const content = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  await fs.promises.mkdir(path.dirname(opts.outputPath), { recursive: true })
  await fs.promises.writeFile(opts.outputPath, content)

  const stat = await fs.promises.stat(opts.outputPath)
  return {
    format: 'zip',
    outputPath: opts.outputPath,
    fileCount: filesDone,
    sizeBytes: stat.size,
  }
}

async function createFolderSnapshot(
  opts: CreateSnapshotOptions,
): Promise<CreateSnapshotResult> {
  await fs.promises.mkdir(opts.outputPath, { recursive: true })
  let filesDone = 0
  let bytesDone = 0

  for (const rel of opts.files) {
    const src = path.join(opts.projectRoot, rel)
    const dst = path.join(opts.outputPath, rel)
    try {
      await fs.promises.mkdir(path.dirname(dst), { recursive: true })
      await fs.promises.copyFile(src, dst)
      const stat = await fs.promises.stat(src)
      bytesDone += stat.size
    } catch {
      // skip
    }
    filesDone += 1
    if (opts.onProgress && filesDone % 100 === 0) {
      opts.onProgress({
        phase: 'pack',
        filesDone,
        filesTotal: opts.files.length,
        bytesDone,
        bytesTotal: opts.totalBytes,
      })
    }
  }

  return {
    format: 'folder',
    outputPath: opts.outputPath,
    fileCount: filesDone,
    sizeBytes: bytesDone,
  }
}

// ============================================================
// 읽기 / 비교 / 추출
// ============================================================

/**
 * 스냅샷의 파일 목록 (zip 이든 folder 든) — 비교 화면에서 사용
 */
export async function listSnapshotFiles(
  snapshotPath: string,
  format: SnapshotFormat,
): Promise<string[]> {
  if (format === 'zip') {
    const data = await fs.promises.readFile(snapshotPath)
    const zip = await JSZip.loadAsync(data)
    const files: string[] = []
    zip.forEach((relpath, entry) => {
      if (!entry.dir) files.push(relpath)
    })
    return files.sort()
  }
  // folder
  const files: string[] = []
  async function walk(dir: string, relDir: string): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), rel)
      } else if (entry.isFile()) {
        files.push(rel)
      }
    }
  }
  await walk(snapshotPath, '')
  return files.sort()
}

/**
 * 스냅샷에서 특정 파일 내용 읽기 — DiffViewer 진입 시 사용
 * (텍스트 파일 가정. binary 는 호출자가 사전 검사)
 */
export async function readSnapshotFile(
  snapshotPath: string,
  format: SnapshotFormat,
  relpath: string,
): Promise<Buffer | null> {
  if (format === 'zip') {
    const data = await fs.promises.readFile(snapshotPath)
    const zip = await JSZip.loadAsync(data)
    const entry = zip.file(relpath)
    if (!entry) return null
    return Buffer.from(await entry.async('nodebuffer'))
  }
  // folder
  const filePath = path.join(snapshotPath, relpath)
  // path traversal 방어
  const resolved = path.resolve(filePath)
  const root = path.resolve(snapshotPath)
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return null
  }
  try {
    return await fs.promises.readFile(filePath)
  } catch {
    return null
  }
}

/**
 * 두 스냅샷의 파일 목록 diff
 *  - added: B 에만 있음
 *  - removed: A 에만 있음
 *  - both: 양쪽 모두 (수정 여부는 호출자가 내용 비교)
 */
export interface FilesDiff {
  added: string[]
  removed: string[]
  both: string[]
}

export function diffFileLists(filesA: string[], filesB: string[]): FilesDiff {
  const setA = new Set(filesA)
  const setB = new Set(filesB)
  const added: string[] = []
  const removed: string[] = []
  const both: string[] = []
  for (const f of filesB) {
    if (setA.has(f)) both.push(f)
    else added.push(f)
  }
  for (const f of filesA) {
    if (!setB.has(f)) removed.push(f)
  }
  return {
    added: added.sort(),
    removed: removed.sort(),
    both: both.sort(),
  }
}

// ============================================================
// 삭제
// ============================================================

export async function deleteSnapshotPath(
  snapshotPath: string,
  format: SnapshotFormat,
): Promise<void> {
  if (format === 'zip') {
    await fs.promises.rm(snapshotPath, { force: true })
  } else {
    await fs.promises.rm(snapshotPath, { recursive: true, force: true })
  }
}
