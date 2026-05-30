/**
 * Windows 파일명 안전 변환 — 금지 문자 치환
 * 출처: 13 Day4 RSD FR-9
 *
 * Windows 금지 문자: \ / : * ? " < > |
 * 추가로 제어 문자 (0x00-0x1F) 도 제거.
 */

const FORBIDDEN_RE = /[\\/:*?"<>|\x00-\x1F]/g
const MULTI_UNDERSCORE_RE = /_+/g
const TRIM_DOT_SPACE_RE = /^[\s.]+|[\s.]+$/g

const RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
])

export function sanitizeFilename(name: string, fallback = 'untitled'): string {
  if (!name) return fallback

  let cleaned = name.replace(FORBIDDEN_RE, '_')
  cleaned = cleaned.replace(MULTI_UNDERSCORE_RE, '_')
  cleaned = cleaned.replace(TRIM_DOT_SPACE_RE, '')

  // 빈 문자열 또는 underscore-only (= 의미있는 이름 없음) → fallback
  if (!cleaned || /^_+$/.test(cleaned)) return fallback

  // Windows 예약어 회피 (확장자 빼고 비교)
  const base = cleaned.replace(/\.[^.]+$/, '').toUpperCase()
  if (RESERVED_NAMES.has(base)) {
    cleaned = '_' + cleaned
  }

  // Windows 파일명 최대 255자
  if (cleaned.length > 255) {
    const ext = cleaned.match(/\.[^.]+$/)?.[0] ?? ''
    cleaned = cleaned.substring(0, 255 - ext.length) + ext
  }

  return cleaned
}

/**
 * 파일 경로에서 확장자 없는 basename 추출
 *   D:\proj\carboncredit_v1.html → carboncredit_v1
 */
export function basenameWithoutExt(absolutePath: string): string {
  const parts = absolutePath.split(/[\\/]/)
  const filename = parts[parts.length - 1] ?? ''
  return filename.replace(/\.[^.]+$/, '')
}
