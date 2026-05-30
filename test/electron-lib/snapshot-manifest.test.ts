import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  projectHash,
  emptyManifest,
  validateManifest,
  readManifest,
  writeManifest,
  generateSnapshotId,
  selectSnapshotsToDelete,
  getProjectSnapshotDir,
  type SnapshotMeta,
  type ProjectManifest,
} from '../../electron/lib/snapshot-manifest'

describe('projectHash', () => {
  it('같은 경로 → 같은 해시', () => {
    const h1 = projectHash('D:\\my-project')
    const h2 = projectHash('D:\\my-project')
    expect(h1).toBe(h2)
  })

  it('백슬래시 vs 슬래시 → 같은 해시', () => {
    const h1 = projectHash('D:\\my-project')
    const h2 = projectHash('D:/my-project')
    expect(h1).toBe(h2)
  })

  it('대소문자 무시 (Windows 호환)', () => {
    const h1 = projectHash('D:\\My-Project')
    const h2 = projectHash('d:\\my-project')
    expect(h1).toBe(h2)
  })

  it('다른 경로 → 다른 해시', () => {
    expect(projectHash('D:\\a')).not.toBe(projectHash('D:\\b'))
  })

  it('SHA1 길이 (40 hex chars)', () => {
    expect(projectHash('D:\\x')).toMatch(/^[a-f0-9]{40}$/)
  })
})

describe('validateManifest', () => {
  it('유효한 manifest → true', () => {
    expect(validateManifest(emptyManifest('D:\\proj'))).toBe(true)
  })

  it('null / undefined / string → false', () => {
    expect(validateManifest(null)).toBe(false)
    expect(validateManifest(undefined)).toBe(false)
    expect(validateManifest('not an object')).toBe(false)
  })

  it('schema_version mismatch → false', () => {
    const m = emptyManifest('D:\\x') as unknown as { schema_version: number }
    m.schema_version = 99
    expect(validateManifest(m)).toBe(false)
  })

  it('snapshots 가 배열 아니면 false', () => {
    const m = { ...emptyManifest('D:\\x'), snapshots: 'not array' } as unknown
    expect(validateManifest(m)).toBe(false)
  })

  it('snapshot meta 필드 누락 → false', () => {
    const m = emptyManifest('D:\\x')
    ;(m.snapshots as unknown[]).push({ id: 'foo' }) // 다른 필드 없음
    expect(validateManifest(m)).toBe(false)
  })

  it('정상 snapshot meta 포함 → true', () => {
    const m = emptyManifest('D:\\x')
    m.snapshots.push({
      id: 'snap1',
      createdAt: '2026-05-25T10:00:00+09:00',
      memo: 'test',
      fileCount: 10,
      sizeBytes: 1024,
      format: 'zip',
      pinned: false,
      auto: false,
      relatedTo: null,
    })
    expect(validateManifest(m)).toBe(true)
  })
})

describe('generateSnapshotId', () => {
  const fixed = new Date('2026-05-25T14:32:00+09:00')

  it('메모 있음 → 날짜_시간_메모', () => {
    const id = generateSnapshotId('AI 수정 전', fixed)
    expect(id).toBe('2026-05-25_1432_AI 수정 전')
  })

  it('메모 빈 문자열 → 날짜_시간 만', () => {
    const id = generateSnapshotId('', fixed)
    expect(id).toBe('2026-05-25_1432')
  })

  it('Windows 금지 문자 치환', () => {
    const id = generateSnapshotId('a/b:c*d', fixed)
    expect(id).toBe('2026-05-25_1432_a_b_c_d')
  })

  it('40자 초과 메모 잘림', () => {
    const longMemo = 'a'.repeat(100)
    const id = generateSnapshotId(longMemo, fixed)
    expect(id.length).toBeLessThanOrEqual(40 + 20) // 메모 부분만 40자
  })

  it('auto 옵션 → AUTO_BEFORE_RESTORE 접두', () => {
    const id = generateSnapshotId('rollback', fixed, { auto: true })
    expect(id).toBe('2026-05-25_1432_AUTO_BEFORE_RESTORE_rollback')
  })
})

describe('selectSnapshotsToDelete', () => {
  const makeSnap = (id: string, createdAt: string, pinned = false): SnapshotMeta => ({
    id,
    createdAt,
    memo: '',
    fileCount: 0,
    sizeBytes: 0,
    format: 'zip',
    pinned,
    auto: false,
    relatedTo: null,
  })

  it('keepCount 이하면 삭제 대상 없음', () => {
    const snaps = [
      makeSnap('a', '2026-05-25T10:00:00+09:00'),
      makeSnap('b', '2026-05-25T11:00:00+09:00'),
    ]
    expect(selectSnapshotsToDelete(snaps, 5)).toEqual([])
  })

  it('초과분 = 가장 오래된 것부터 삭제', () => {
    const snaps = [
      makeSnap('a', '2026-05-23T10:00:00+09:00'),
      makeSnap('b', '2026-05-24T10:00:00+09:00'),
      makeSnap('c', '2026-05-25T10:00:00+09:00'),
    ]
    // keep 2 → a 삭제 대상
    expect(selectSnapshotsToDelete(snaps, 2)).toEqual(['a'])
  })

  it('핀 고정은 항상 보존 (cap 에 포함 안 됨)', () => {
    const snaps = [
      makeSnap('pinned-old', '2026-05-20T10:00:00+09:00', true), // pinned
      makeSnap('a', '2026-05-22T10:00:00+09:00'),
      makeSnap('b', '2026-05-23T10:00:00+09:00'),
      makeSnap('c', '2026-05-24T10:00:00+09:00'),
    ]
    // keep 2 → a 삭제 대상, b/c 유지, pinned-old 는 항상 유지
    expect(selectSnapshotsToDelete(snaps, 2)).toEqual(['a'])
  })

  it('keepCount = 0 → unpinned 전부 삭제', () => {
    const snaps = [
      makeSnap('a', '2026-05-25T10:00:00+09:00'),
      makeSnap('b', '2026-05-25T11:00:00+09:00', true), // pinned
    ]
    expect(selectSnapshotsToDelete(snaps, 0).sort()).toEqual(['a'])
  })
})

describe('readManifest / writeManifest 통합', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-rw-'))
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('파일 없으면 빈 manifest 반환', () => {
    const m = readManifest('D:\\proj', tmpDir)
    expect(m.snapshots).toEqual([])
    expect(m.project.absolutePath).toBe('D:\\proj')
  })

  it('write → read 라운드트립', () => {
    const m = emptyManifest('D:\\proj')
    m.snapshots.push({
      id: 'test',
      createdAt: '2026-05-25T10:00:00+09:00',
      memo: 'hello',
      fileCount: 5,
      sizeBytes: 1024,
      format: 'zip',
      pinned: false,
      auto: false,
      relatedTo: null,
    })
    writeManifest(m, tmpDir)
    const r = readManifest('D:\\proj', tmpDir)
    expect(r).toEqual(m)
  })

  it('manifest 손상 → backup 으로 복구', () => {
    const m = emptyManifest('D:\\proj')
    m.snapshots.push({
      id: 'survived',
      createdAt: '2026-05-25T10:00:00+09:00',
      memo: '',
      fileCount: 0,
      sizeBytes: 0,
      format: 'zip',
      pinned: false,
      auto: false,
      relatedTo: null,
    })
    writeManifest(m, tmpDir)

    // 두 번째 write 로 backup 만들어둠
    m.snapshots.push({
      id: 'new',
      createdAt: '2026-05-25T11:00:00+09:00',
      memo: '',
      fileCount: 0,
      sizeBytes: 0,
      format: 'zip',
      pinned: false,
      auto: false,
      relatedTo: null,
    })
    writeManifest(m, tmpDir)

    // 본 파일 손상
    const dir = getProjectSnapshotDir('D:\\proj', tmpDir)
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{ corrupted', 'utf8')

    // backup 의 첫 번째 상태가 복구되어야 함 (snapshots = ['survived'])
    const r = readManifest('D:\\proj', tmpDir)
    expect(r.snapshots.map((s) => s.id)).toEqual(['survived'])
  })

  it('manifest + backup 모두 손상 → 빈 manifest', () => {
    const m = emptyManifest('D:\\proj')
    writeManifest(m, tmpDir)
    const dir = getProjectSnapshotDir('D:\\proj', tmpDir)
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{ bad', 'utf8')
    fs.writeFileSync(path.join(dir, 'manifest.json.bak'), '{ also bad', 'utf8')
    const r = readManifest('D:\\proj', tmpDir)
    expect(r.snapshots).toEqual([])
  })
})
