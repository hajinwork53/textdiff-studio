/**
 * Day 9: 스냅샷 manifest.json 읽기/쓰기/검증
 *
 * 한 프로젝트(폴더) 당 1개 manifest. 위치:
 *   %APPDATA%/TextDiff/snapshots/<sha1(절대경로)>/manifest.json
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { app } from 'electron'

export const MANIFEST_SCHEMA_VERSION = 1
const MANIFEST_FILENAME = 'manifest.json'
const MANIFEST_BACKUP_FILENAME = 'manifest.json.bak'

export type SnapshotFormat = 'zip' | 'folder'

export interface SnapshotMeta {
  /** 파일명 base (확장자/폴더 X). 예: '2026-05-23_14-32_AI수정전' */
  id: string
  /** ISO 8601 with timezone */
  createdAt: string
  /** 사용자 메모 (선택) */
  memo: string
  /** 압축 풀린 후 기준 파일 수 */
  fileCount: number
  /** 압축 후 또는 폴더 복사된 총 크기 */
  sizeBytes: number
  format: SnapshotFormat
  /** 핀 고정 (자동 삭제 제외) */
  pinned: boolean
  /** 자동 생성 여부 (AUTO_BEFORE_RESTORE 등) */
  auto: boolean
  /** 다른 스냅샷과 연관 (auto-backup → 원본 snapshot id) */
  relatedTo: string | null
}

export interface ProjectManifest {
  schema_version: number
  project: {
    absolutePath: string
    /** manifest 첫 생성 시각 */
    createdAt: string
  }
  snapshots: SnapshotMeta[]
}

// ============================================================
// 경로 헬퍼
// ============================================================

/**
 * 프로젝트 절대경로 → sha1 해시 (스냅샷 폴더 이름)
 * Windows / POSIX 슬래시 차이 정규화하여 일관된 해시 생성
 */
export function projectHash(absolutePath: string): string {
  const normalized = path.normalize(absolutePath).toLowerCase().replace(/\\/g, '/')
  return crypto.createHash('sha1').update(normalized).digest('hex')
}

/**
 * 스냅샷 저장 루트 (모든 프로젝트 공통) — 이전 default 위치.
 * Day 9 hotfix: snapshot-storage.ts 의 resolveProjectSnapshotDir 가 우선.
 * 이 함수는 테스트 호환성을 위해 유지 (override 받음).
 */
export function getSnapshotsRoot(override?: string): string {
  if (override) return override
  try {
    const userData = app.getPath('userData')
    return path.join(userData, 'snapshots')
  } catch {
    return path.join(process.cwd(), '.snapshots-test')
  }
}

/**
 * 특정 프로젝트의 스냅샷 폴더 경로.
 *
 * Day 9 hotfix: override 는 직접 폴더 경로 (resolveProjectSnapshotDir 가 미리 계산)
 *   - override 있음: 그대로 사용 (snapshot-storage 결과)
 *   - override 없음: 이전 default (AppData 의 hash 폴더)
 */
export function getProjectSnapshotDir(absolutePath: string, override?: string): string {
  if (override) return override
  return path.join(getSnapshotsRoot(), projectHash(absolutePath))
}

/**
 * 스냅샷 zip / folder 의 실제 저장 경로
 */
export function getSnapshotPath(
  projectDir: string,
  meta: Pick<SnapshotMeta, 'id' | 'format'>,
): string {
  return meta.format === 'zip'
    ? path.join(projectDir, `${meta.id}.zip`)
    : path.join(projectDir, meta.id)
}

// ============================================================
// 읽기 / 쓰기 / 검증
// ============================================================

/**
 * manifest.json 읽기. 없으면 빈 manifest 반환 (첫 사용).
 * 손상되면 manifest.json.bak 시도, 그것도 실패하면 새로 생성.
 */
export function readManifest(projectAbsolutePath: string, override?: string): ProjectManifest {
  const dir = getProjectSnapshotDir(projectAbsolutePath, override)
  const file = path.join(dir, MANIFEST_FILENAME)
  const backup = path.join(dir, MANIFEST_BACKUP_FILENAME)

  if (fs.existsSync(file)) {
    try {
      const raw = fs.readFileSync(file, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      if (validateManifest(parsed)) return parsed
    } catch {
      // 손상 — backup 시도
    }
  }
  if (fs.existsSync(backup)) {
    try {
      const raw = fs.readFileSync(backup, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      if (validateManifest(parsed)) return parsed
    } catch {
      // backup 도 손상
    }
  }
  return emptyManifest(projectAbsolutePath)
}

/**
 * manifest 저장. 쓰기 전 기존 파일을 .bak 으로 백업 (손상 복구용).
 */
export function writeManifest(
  manifest: ProjectManifest,
  override?: string,
): void {
  const dir = getProjectSnapshotDir(manifest.project.absolutePath, override)
  fs.mkdirSync(dir, { recursive: true })

  const file = path.join(dir, MANIFEST_FILENAME)
  const backup = path.join(dir, MANIFEST_BACKUP_FILENAME)

  // 기존 파일이 있으면 백업 갱신
  if (fs.existsSync(file)) {
    try {
      fs.copyFileSync(file, backup)
    } catch {
      // 백업 실패는 무시 — 본 쓰기 우선
    }
  }
  // atomic-ish 쓰기: tmp 에 쓴 후 rename
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

/**
 * 빈 manifest 생성 (첫 사용)
 */
export function emptyManifest(projectAbsolutePath: string): ProjectManifest {
  return {
    schema_version: MANIFEST_SCHEMA_VERSION,
    project: {
      absolutePath: projectAbsolutePath,
      createdAt: isoNow(),
    },
    snapshots: [],
  }
}

/**
 * unknown → ProjectManifest 검증.
 * schema_version mismatch 면 false (현재 schema 만 지원).
 */
export function validateManifest(obj: unknown): obj is ProjectManifest {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  if (o.schema_version !== MANIFEST_SCHEMA_VERSION) return false
  const proj = o.project as Record<string, unknown> | undefined
  if (!proj || typeof proj.absolutePath !== 'string' || typeof proj.createdAt !== 'string') {
    return false
  }
  if (!Array.isArray(o.snapshots)) return false
  for (const s of o.snapshots) {
    if (!validateSnapshotMeta(s)) return false
  }
  return true
}

function validateSnapshotMeta(obj: unknown): obj is SnapshotMeta {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.createdAt === 'string' &&
    typeof o.memo === 'string' &&
    typeof o.fileCount === 'number' &&
    typeof o.sizeBytes === 'number' &&
    (o.format === 'zip' || o.format === 'folder') &&
    typeof o.pinned === 'boolean' &&
    typeof o.auto === 'boolean' &&
    (o.relatedTo === null || typeof o.relatedTo === 'string')
  )
}

// ============================================================
// ID / 날짜 헬퍼
// ============================================================

/**
 * 스냅샷 ID 생성: YYYY-MM-DD_HHmm_<safe-memo>
 * memo 가 비면 timestamp 만.
 */
export function generateSnapshotId(
  memo: string,
  now: Date = new Date(),
  opts?: { auto?: boolean },
): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`
  const prefix = opts?.auto ? 'AUTO_BEFORE_RESTORE' : ''
  const memoSafe = (memo || '').trim().replace(/[\\/:*?"<>|]/g, '_').substring(0, 40)
  const parts = [date, time]
  if (prefix) parts.push(prefix)
  if (memoSafe) parts.push(memoSafe)
  return parts.join('_')
}

export function isoNow(): string {
  return formatIso8601(new Date())
}

function formatIso8601(d: Date): string {
  const tz = -d.getTimezoneOffset()
  const sign = tz >= 0 ? '+' : '-'
  const tzAbs = Math.abs(tz)
  const tzh = String(Math.floor(tzAbs / 60)).padStart(2, '0')
  const tzm = String(tzAbs % 60).padStart(2, '0')
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${tzh}:${tzm}`
  )
}

// ============================================================
// 용량 cap (RSD FR-8)
// ============================================================

export const SNAPSHOT_RETENTION_DEFAULT = 20

/**
 * 보관 정책 적용: 최신 N개 + 핀 고정 무제한.
 * 삭제 대상 스냅샷 ID 목록 반환 (실제 삭제는 호출자가 수행).
 */
export function selectSnapshotsToDelete(
  snapshots: SnapshotMeta[],
  keepCount: number = SNAPSHOT_RETENTION_DEFAULT,
): string[] {
  // 핀 고정 제외
  const unpinned = snapshots.filter((s) => !s.pinned)
  // createdAt 내림차순 (최신 우선)
  const sorted = [...unpinned].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  // keepCount 초과분 → 삭제 대상
  return sorted.slice(keepCount).map((s) => s.id)
}
