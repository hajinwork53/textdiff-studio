/**
 * 파일 읽기 + 인코딩 자동 감지 + 바이너리 검사 IPC
 * 출처: 09 Day2 RSD FR-3, FR-4, FR-5
 */

import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { decodeBuffer } from '../lib/encoding'
import { isBinary, isBinaryByExtension } from '../lib/binary-detect'

const MAX_WARN_BYTES = 20 * 1024 * 1024 // 20MB (D5)
const MAX_HARD_LIMIT_BYTES = 500 * 1024 * 1024 // 500MB 절대 거부

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
  code: string // 'ENOENT' | 'EACCES' | 'EPERM' | 'EBUSY' | 'TOO_LARGE' | 'UNKNOWN'
  message: string
}

export type FileReadResponse = FileReadResult | FileReadError

interface FileReadRequest {
  path: string
  forceEncoding?: string
  forceBinary?: boolean // true 면 바이너리여도 강제 읽기 (사용자 명시)
}

function mapErrorCode(err: NodeJS.ErrnoException): { code: string; message: string } {
  switch (err.code) {
    case 'ENOENT':
      return { code: 'ENOENT', message: '파일이 존재하지 않습니다.' }
    case 'EACCES':
    case 'EPERM':
      return { code: err.code, message: '파일 권한이 없습니다.' }
    case 'EBUSY':
      return { code: 'EBUSY', message: '다른 프로그램이 파일을 사용 중입니다.' }
    case 'EISDIR':
      return { code: 'EISDIR', message: '폴더는 비교할 수 없습니다.' }
    default:
      return { code: err.code ?? 'UNKNOWN', message: err.message || '파일 읽기 실패' }
  }
}

export function registerFileIpc() {
  ipcMain.handle(
    'file:read',
    async (_event, req: FileReadRequest): Promise<FileReadResponse> => {
      if (!req?.path) {
        return { ok: false, path: '', code: 'UNKNOWN', message: '경로가 비어있습니다.' }
      }

      const absPath = path.resolve(req.path)

      // 1) 파일 존재/크기 확인
      let stats: fs.Stats
      try {
        stats = fs.statSync(absPath)
      } catch (e) {
        const err = e as NodeJS.ErrnoException
        return { ok: false, path: absPath, ...mapErrorCode(err) }
      }

      if (stats.isDirectory()) {
        return {
          ok: false,
          path: absPath,
          code: 'EISDIR',
          message: '폴더는 비교할 수 없습니다.',
        }
      }

      if (stats.size > MAX_HARD_LIMIT_BYTES) {
        return {
          ok: false,
          path: absPath,
          code: 'TOO_LARGE',
          message: `파일이 너무 큽니다 (${formatBytes(stats.size)}). 500MB 초과는 지원하지 않습니다.`,
        }
      }

      // 2) 확장자 사전 검사 (큰 바이너리는 읽지도 않음)
      if (!req.forceBinary && isBinaryByExtension(absPath)) {
        // 헤더 검사를 위해 첫 8KB 만 읽음
        try {
          const fd = fs.openSync(absPath, 'r')
          const sampleBuf = Buffer.alloc(Math.min(8192, stats.size))
          fs.readSync(fd, sampleBuf, 0, sampleBuf.length, 0)
          fs.closeSync(fd)
          return {
            ok: true,
            path: absPath,
            content: '',
            encoding: 'binary',
            confidence: 1.0,
            hadBom: false,
            isBinary: true,
            size: stats.size,
            lineCount: 0,
          }
        } catch (e) {
          const err = e as NodeJS.ErrnoException
          return { ok: false, path: absPath, ...mapErrorCode(err) }
        }
      }

      // 3) 파일 읽기
      let buf: Buffer
      try {
        buf = fs.readFileSync(absPath)
      } catch (e) {
        const err = e as NodeJS.ErrnoException
        return { ok: false, path: absPath, ...mapErrorCode(err) }
      }

      // 4) 바이너리 검사 (헤더 분석)
      const binary = !req.forceBinary && isBinary(buf)
      if (binary && !req.forceEncoding) {
        return {
          ok: true,
          path: absPath,
          content: '',
          encoding: 'binary',
          confidence: 1.0,
          hadBom: false,
          isBinary: true,
          size: stats.size,
          lineCount: 0,
        }
      }

      // 5) 인코딩 감지 + 디코딩
      const { content, encoding, confidence, hadBom } = decodeBuffer(buf, req.forceEncoding)

      // 6) 라인 수 계산 (CR/LF 정규화 후)
      const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const lineCount = normalized === '' ? 0 : normalized.split('\n').length

      return {
        ok: true,
        path: absPath,
        content,
        encoding,
        confidence,
        hadBom,
        isBinary: false,
        size: stats.size,
        lineCount,
      }
    },
  )

  ipcMain.handle('file:warn-large', async (_event, sizeBytes: number) => {
    return sizeBytes > MAX_WARN_BYTES
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
