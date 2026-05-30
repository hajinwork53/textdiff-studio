export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function truncateMiddle(text: string, maxLen: number = 50): string {
  if (text.length <= maxLen) return text
  const half = Math.floor((maxLen - 3) / 2)
  return text.substring(0, half) + '...' + text.substring(text.length - half)
}
