/**
 * 슬롯 소스 종류 추상화 (file / clipboard / git / snapshot)
 * 출처: 17 Day6 RSD FR-1
 *
 * Day 6: file + clipboard 만 사용. git/snapshot 은 Day 7+/9+ 에서 확장.
 *
 * 호환성 전략:
 *   - 기존 FileSlot.path 는 그대로 유지 (모든 종류에 가상 식별자로 매핑)
 *   - source 필드는 추가 메타데이터 (clipboardId, capturedAt 등) 보관
 *   - 코드 호환성을 위해 path 기준 함수들은 그대로 동작 (clipboard 면 'clipboard:N')
 */

export type SourceKind = 'file' | 'clipboard' | 'git' | 'snapshot'

export type SlotSource =
  | { kind: 'file'; path: string }
  | { kind: 'clipboard'; clipboardId: number; capturedAt: Date }
  | {
      kind: 'git'
      repoPath: string
      ref: string // 'HEAD', 'a3f2e1d', 'main' 등
      relpath: string // 'src/main.py'
      refLabel: string // 'HEAD' 또는 'a3f2e1d (2시간 전)' 등 사람용
    }
  | {
      kind: 'snapshot'
      projectRoot: string
      snapshotId: string
      snapshotLabel: string // '2026-05-25 14:32 — "AI 수정 전"' 사람용
      relpath: string
    }

/**
 * 가상 식별자 (FileSlot.path 에 들어가는 값)
 *   - file: 실제 절대 경로 (예: 'D:\proj\file.html')
 *   - clipboard: 'clipboard:N' (예: 'clipboard:1', 'clipboard:2')
 *   - git: 'git:<ref>:<relpath>' (Day 7+)
 *   - snapshot: 'snapshot:<id>:<relpath>' (Day 9+)
 */
export function makeVirtualPath(source: SlotSource): string {
  if (!source) return ''
  if (source.kind === 'file') return source.path
  if (source.kind === 'clipboard') return `clipboard:${source.clipboardId}`
  if (source.kind === 'git') return `git:${source.ref}:${source.relpath}`
  if (source.kind === 'snapshot') return `snapshot:${source.snapshotId}:${source.relpath}`
  return ''
}

/**
 * 가상 식별자가 실제 파일 시스템 경로인지 (vscode:// 점프 가능 여부 등 판단)
 */
export function isRealFilePath(virtualPath: string): boolean {
  return !virtualPath.startsWith('clipboard:') &&
         !virtualPath.startsWith('git:') &&
         !virtualPath.startsWith('snapshot:')
}

/**
 * 사람용 표시명
 *   - file: 파일명 (basename)
 *   - clipboard: "📋 클립보드 #1 (10:32)"
 */
export function getDisplayName(source: SlotSource): string {
  if (!source) return ''
  if (source.kind === 'file') {
    const parts = source.path.split(/[/\\]/)
    return parts[parts.length - 1] ?? source.path
  }
  if (source.kind === 'clipboard') {
    const hh = String(source.capturedAt.getHours()).padStart(2, '0')
    const mm = String(source.capturedAt.getMinutes()).padStart(2, '0')
    return `클립보드 #${source.clipboardId} (${hh}:${mm})`
  }
  if (source.kind === 'git') {
    return `${source.refLabel} · ${source.relpath}`
  }
  if (source.kind === 'snapshot') {
    return `${source.snapshotLabel} · ${source.relpath}`
  }
  return ''
}

/**
 * 슬롯 아이콘 (이모지 — Day 6 MVP, lucide 는 v1.1)
 */
export function getSourceIcon(source: SlotSource): string {
  if (!source) return ''
  if (source.kind === 'file') return '📄'
  if (source.kind === 'clipboard') return '📋'
  if (source.kind === 'git') return '⎇'
  if (source.kind === 'snapshot') return '📦'
  return ''
}

/**
 * 슬롯 색상 토큰 (CSS var 이름)
 */
export function getSourceColorVar(source: SlotSource): string {
  if (!source) return '--color-text'
  if (source.kind === 'file') return '--color-source-file'
  if (source.kind === 'clipboard') return '--color-source-clipboard'
  if (source.kind === 'git') return '--color-source-git'
  if (source.kind === 'snapshot') return '--color-source-snapshot'
  return '--color-text'
}
