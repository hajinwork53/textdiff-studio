/**
 * Day 8.5: 검색 루트 결정 우선순위
 *
 * 1. 사용자가 모달에서 명시한 경로 (override)
 * 2. git.lastRepoPath (Day 7+ 마지막 git repo)
 * 3. 비교 중인 file 슬롯의 부모 폴더
 * 4. 모두 없으면 null → 모달이 폴더 선택 강제
 */

import type { FileSlot } from '../stores/comparison'

export interface SearchRootCandidate {
  path: string
  /** 사용자에게 보여줄 짧은 이유 ("마지막 git repo", "비교 파일 폴더") */
  reason: string
}

export function resolveSearchRoot(args: {
  override?: string | null
  lastGitRepoPath?: string | null
  slots?: FileSlot[]
}): SearchRootCandidate | null {
  if (args.override) {
    return { path: args.override, reason: '사용자 선택' }
  }
  if (args.lastGitRepoPath) {
    return { path: args.lastGitRepoPath, reason: '마지막 git repo' }
  }
  if (args.slots) {
    for (const slot of args.slots) {
      if (slot.source?.kind === 'file' && slot.source.path) {
        const parent = parentDir(slot.source.path)
        if (parent) return { path: parent, reason: '비교 파일 폴더' }
      }
    }
  }
  return null
}

function parentDir(filePath: string): string | null {
  // 양쪽 슬래시 호환 (Windows + POSIX)
  const lastSlash = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  if (lastSlash < 1) return null
  return filePath.substring(0, lastSlash)
}
