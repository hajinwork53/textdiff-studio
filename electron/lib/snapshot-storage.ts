/**
 * Day 9 hotfix: 스냅샷 저장 위치 결정
 *
 * 사용자 요청 (2026-05-25):
 *   기본 = 프로젝트 폴더 안 `snapshots/`
 *   설정으로 사용자가 지정 가능
 *
 * 3 모드:
 *   - 'project'  : <projectRoot>/snapshots/                       (기본)
 *                  · 직관적 — 프로젝트 옆에 보임
 *                  · 주의: Git 사용 시 .gitignore 에 추가 필요
 *                  · 주의: OneDrive 폴더면 클라우드 동기화 부담
 *   - 'appdata'  : %APPDATA%/TextDiff/snapshots/<sha1>/           (이전 기본)
 *                  · 깨끗 — 프로젝트 안 더럽힘 X
 *                  · OneDrive 영향 X
 *                  · 단점: 백업 위치 찾기 어려움
 *   - 'custom'   : <customPath>/<sha1>/
 *                  · 사용자가 별도 드라이브 등에 둘 때
 */

import * as path from 'path'
import { app } from 'electron'
import { projectHash } from './snapshot-manifest'

export type StorageMode = 'project' | 'appdata' | 'custom'

export interface StorageConfig {
  mode: StorageMode
  customPath?: string | null
}

/** 기본 설정 (앱 첫 실행 시) */
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  mode: 'project',
  customPath: null,
}

/**
 * 특정 프로젝트의 스냅샷 저장 폴더 경로 (manifest + 스냅샷 zip/folder 들 위치).
 *
 * 'project' 모드는 hash 안 씀 (이미 프로젝트 안이라 unique).
 * 'appdata'/'custom' 모드는 여러 프로젝트가 한 곳에 모이므로 hash 필요.
 */
export function resolveProjectSnapshotDir(
  projectRoot: string,
  cfg: StorageConfig,
): string {
  if (cfg.mode === 'project') {
    return path.join(projectRoot, 'snapshots')
  }
  if (cfg.mode === 'custom' && cfg.customPath) {
    return path.join(cfg.customPath, projectHash(projectRoot))
  }
  // appdata fallback (mode === 'appdata' 또는 custom 인데 customPath 없음)
  let userData = ''
  try {
    userData = app.getPath('userData')
  } catch {
    // electron 없음 (테스트) — 임시 fallback
    userData = path.join(process.cwd(), '.userdata-test')
  }
  return path.join(userData, 'snapshots', projectHash(projectRoot))
}

// ============================================================
// main 측 글로벌 캐시 (renderer 가 settings 변경 시 main 에 push)
// ============================================================

let currentConfig: StorageConfig = { ...DEFAULT_STORAGE_CONFIG }

export function setCurrentStorageConfig(cfg: StorageConfig): void {
  currentConfig = {
    mode: cfg.mode,
    customPath: cfg.customPath ?? null,
  }
}

export function getCurrentStorageConfig(): StorageConfig {
  return currentConfig
}
