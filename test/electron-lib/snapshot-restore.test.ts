import { describe, it, expect, vi } from 'vitest'
import * as path from 'path'
import {
  isSafeRelpath,
  withRetry,
  hashBuffer,
  AutoBackupFailedError,
  InsufficientDiskSpaceError,
  RestoreFailedRolledBackError,
  RestoreAndRollbackFailedError,
  UnsafeSnapshotError,
} from '../../electron/lib/snapshot-restore'

describe('isSafeRelpath — path traversal 차단', () => {
  const root = path.resolve('/test/project')

  it('정상 상대경로 → 안전', () => {
    expect(isSafeRelpath('src/App.vue', root)).toBe(true)
    expect(isSafeRelpath('a/b/c.txt', root)).toBe(true)
    expect(isSafeRelpath('README.md', root)).toBe(true)
  })

  it('상위 디렉토리 escape (..) → 거부', () => {
    expect(isSafeRelpath('../escape.txt', root)).toBe(false)
    expect(isSafeRelpath('src/../../etc/passwd', root)).toBe(false)
    expect(isSafeRelpath('../../malicious', root)).toBe(false)
  })

  it('절대 경로 → 거부', () => {
    // POSIX absolute
    expect(isSafeRelpath('/etc/passwd', root)).toBe(false)
    // Windows absolute
    if (process.platform === 'win32') {
      expect(isSafeRelpath('C:\\Windows\\System32', root)).toBe(false)
    }
  })

  it('null 바이트 포함 → 거부', () => {
    expect(isSafeRelpath('safe\0path', root)).toBe(false)
  })

  it('빈 경로 → 거부', () => {
    expect(isSafeRelpath('', root)).toBe(false)
  })

  it('점 한 개 (현재 디렉토리) → 안전 (root 자체)', () => {
    expect(isSafeRelpath('.', root)).toBe(true)
  })

  it('깊은 정상 경로 → 안전', () => {
    expect(isSafeRelpath('a/b/c/d/e/f.txt', root)).toBe(true)
  })
})

describe('withRetry — OneDrive/Dropbox 잠금 재시도', () => {
  it('첫 시도 성공 → retry 안 함', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const r = await withRetry(fn, 3, 1)
    expect(r).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('EBUSY 에러 → 재시도 후 성공', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }))
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }))
      .mockResolvedValue('finally')
    const r = await withRetry(fn, 3, 1)
    expect(r).toBe('finally')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('EPERM 도 잠금으로 간주 → 재시도', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('perm'), { code: 'EPERM' }))
      .mockResolvedValue('ok')
    const r = await withRetry(fn, 2, 1)
    expect(r).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('잠금 외 에러 → 즉시 throw', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('parse error'))
    await expect(withRetry(fn, 3, 1)).rejects.toThrow('parse error')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('재시도 횟수 초과 → throw', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('busy'), { code: 'EBUSY' }))
    await expect(withRetry(fn, 3, 1)).rejects.toMatchObject({ code: 'EBUSY' })
    expect(fn).toHaveBeenCalledTimes(3)
  })
})

describe('hashBuffer — 내용 비교용 SHA1', () => {
  it('같은 buffer → 같은 hash', () => {
    const a = Buffer.from('hello world', 'utf8')
    const b = Buffer.from('hello world', 'utf8')
    expect(hashBuffer(a)).toBe(hashBuffer(b))
  })

  it('다른 buffer → 다른 hash', () => {
    const a = Buffer.from('hello world', 'utf8')
    const b = Buffer.from('hello world!', 'utf8')
    expect(hashBuffer(a)).not.toBe(hashBuffer(b))
  })

  it('SHA1 형식 (40 hex chars)', () => {
    const h = hashBuffer(Buffer.from('x'))
    expect(h).toMatch(/^[a-f0-9]{40}$/)
  })

  it('빈 buffer 도 안전', () => {
    const h = hashBuffer(Buffer.alloc(0))
    expect(h).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709') // 알려진 SHA1("")
  })

  it('한글 / UTF-8 정상 처리', () => {
    const a = Buffer.from('회원가입 완료', 'utf8')
    const b = Buffer.from('회원가입 완료', 'utf8')
    const c = Buffer.from('회원가입 시작', 'utf8')
    expect(hashBuffer(a)).toBe(hashBuffer(b))
    expect(hashBuffer(a)).not.toBe(hashBuffer(c))
  })
})

describe('Error 클래스', () => {
  it('AutoBackupFailedError 에 code', () => {
    const e = new AutoBackupFailedError(new Error('disk full'))
    expect(e.code).toBe('AUTO_BACKUP_FAILED')
    expect(e.message).toContain('disk full')
  })

  it('InsufficientDiskSpaceError 에 needed/available', () => {
    const e = new InsufficientDiskSpaceError(100 * 1024 * 1024, 50 * 1024 * 1024)
    expect(e.code).toBe('INSUFFICIENT_DISK_SPACE')
    expect(e.message).toContain('100.0MB')
    expect(e.message).toContain('50.0MB')
  })

  it('RestoreFailedRolledBackError', () => {
    const e = new RestoreFailedRolledBackError(new Error('write fail'))
    expect(e.code).toBe('RESTORE_ROLLED_BACK')
    expect(e.message).toContain('롤백')
  })

  it('RestoreAndRollbackFailedError 는 둘 다 명시', () => {
    const e = new RestoreAndRollbackFailedError(
      new Error('write fail'),
      new Error('rollback also fail'),
    )
    expect(e.code).toBe('RESTORE_AND_ROLLBACK_FAILED')
    expect(e.message).toContain('CRITICAL')
    expect(e.message).toContain('write fail')
    expect(e.message).toContain('rollback also fail')
  })

  it('UnsafeSnapshotError 는 처음 3개 path 표시', () => {
    const bad = ['../a', '../../b', '../../../c', '../d']
    const e = new UnsafeSnapshotError(bad)
    expect(e.code).toBe('UNSAFE_SNAPSHOT')
    expect(e.message).toContain('../a')
    expect(e.message).toContain('../../b')
    expect(e.message).toContain('../../../c')
    // 4번째는 자르기 — 메시지 길이 보호
    expect(e.message).not.toContain('../d')
  })
})
