/**
 * 바이너리 파일 감지 — null byte 비율 검사
 *
 * 텍스트 파일은 거의 null byte(0x00)를 포함하지 않음.
 * PDF/PNG/EXE 등 바이너리는 null byte 가 많음.
 *
 * 출처: 02 엔지니어링검토 E2
 */

const DEFAULT_SAMPLE = 8192 // 8KB
const NULL_BYTE_RATIO_THRESHOLD = 0.05 // 5% 이상이면 바이너리

export function isBinary(buf: Buffer, sampleSize: number = DEFAULT_SAMPLE): boolean {
  if (buf.length === 0) return false // 빈 파일은 텍스트로 취급

  const size = Math.min(buf.length, sampleSize)
  let nullCount = 0
  for (let i = 0; i < size; i++) {
    if (buf[i] === 0) nullCount++
  }
  const ratio = nullCount / size
  return ratio >= NULL_BYTE_RATIO_THRESHOLD
}

/**
 * 확장자 기반 사전 거부 (성능 최적화 — 큰 바이너리 파일은 읽지도 않음)
 * 보수적으로: 명백한 바이너리만 거부, 의심스러우면 isBinary() 로 확인
 */
const BINARY_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib',
  '.pdf',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.tif', '.tiff',
  '.mp3', '.mp4', '.avi', '.mov', '.mkv', '.wav', '.flac', '.ogg',
  '.zip', '.tar', '.gz', '.7z', '.rar', '.bz2',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.psd', '.ai', '.sketch',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
])

export function isBinaryByExtension(path: string): boolean {
  const lastDot = path.lastIndexOf('.')
  if (lastDot < 0) return false
  const ext = path.substring(lastDot).toLowerCase()
  return BINARY_EXTENSIONS.has(ext)
}
