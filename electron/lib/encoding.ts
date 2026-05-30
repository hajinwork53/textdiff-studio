/**
 * 인코딩 자동 감지 + 디코딩 + BOM 제거
 *
 * jschardet 로 감지, iconv-lite 로 디코딩.
 * 한국 환경에서 CP949/EUC-KR 정확히 잡는 게 핵심.
 *
 * 출처: 02 엔지니어링검토 E1, E6 (BOM)
 */

import * as jschardet from 'jschardet'
import * as iconv from 'iconv-lite'

export interface EncodingResult {
  content: string
  encoding: string // 'UTF-8' | 'EUC-KR' | 'CP949' | ...
  confidence: number // 0.0 - 1.0
  hadBom: boolean
}

// 인코딩 이름 정규화 (jschardet → iconv-lite 호환)
function normalizeEncoding(enc: string): string {
  const upper = enc.toUpperCase()
  // jschardet 는 'EUC-KR' 반환, iconv 도 같은 이름 OK
  // 'CP949' 는 'EUC-KR' 의 슈퍼셋 — iconv-lite 가 둘 다 지원
  if (upper === 'ASCII') return 'UTF-8' // ASCII 는 UTF-8 의 부분집합
  return upper
}

// BOM 자동 제거 (디코딩된 문자열 기준)
function stripBom(content: string): { content: string; hadBom: boolean } {
  if (content.charCodeAt(0) === 0xfeff) {
    return { content: content.substring(1), hadBom: true }
  }
  return { content, hadBom: false }
}

// Buffer 의 첫 바이트가 BOM signature 인지 검사
// (iconv-lite 가 일부 인코딩에서 BOM 을 자동 제거하므로
//  디코딩 후 stripBom 만으로는 감지 불가 → buffer 직접 검사)
function detectBomInBuffer(buf: Buffer): boolean {
  if (buf.length < 2) return false
  // UTF-8 BOM: EF BB BF
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return true
  // UTF-16 LE BOM: FF FE
  if (buf[0] === 0xff && buf[1] === 0xfe) return true
  // UTF-16 BE BOM: FE FF
  if (buf[0] === 0xfe && buf[1] === 0xff) return true
  return false
}

export function decodeBuffer(buf: Buffer, forceEncoding?: string): EncodingResult {
  let encoding: string
  let confidence: number

  // 디코딩 전에 buffer 의 BOM 직접 검사 (iconv-lite 가 자동 제거 전에)
  const bufferHasBom = detectBomInBuffer(buf)

  if (forceEncoding) {
    encoding = normalizeEncoding(forceEncoding)
    confidence = 1.0 // 사용자가 강제 지정
  } else {
    // 빈 파일
    if (buf.length === 0) {
      return { content: '', encoding: 'UTF-8', confidence: 1.0, hadBom: false }
    }

    const detected = jschardet.detect(buf) as { encoding: string | null; confidence: number }
    encoding = detected.encoding ? normalizeEncoding(detected.encoding) : 'UTF-8'
    confidence = detected.confidence ?? 0
  }

  // iconv-lite 지원 확인 (fallback to UTF-8)
  if (!iconv.encodingExists(encoding)) {
    encoding = 'UTF-8'
    confidence = Math.min(confidence, 0.5) // 신뢰도 낮춤
  }

  let decoded: string
  try {
    decoded = iconv.decode(buf, encoding)
  } catch (_e) {
    // 디코딩 실패 시 UTF-8 으로 강제
    decoded = iconv.decode(buf, 'UTF-8')
    encoding = 'UTF-8'
    confidence = 0
  }

  // BOM 정보는 buffer 기준 OR 디코딩 결과 기준 — 어느 쪽에서든 감지
  const { content, hadBom: contentHadBom } = stripBom(decoded)
  return { content, encoding, confidence, hadBom: bufferHasBom || contentHadBom }
}

/**
 * 지원하는 수동 선택 인코딩 목록 (UI 드롭다운용)
 * 출처: RSD DP-Day2-4
 */
export const SUPPORTED_ENCODINGS = [
  'UTF-8',
  'UTF-16LE',
  'UTF-16BE',
  'EUC-KR',
  'CP949',
  'Shift_JIS',
  'GB2312',
  'Big5',
  'ISO-8859-1',
  'Windows-1252',
] as const

export type SupportedEncoding = typeof SUPPORTED_ENCODINGS[number]
