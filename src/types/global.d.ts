import type { TextDiffApi } from '../../electron/preload'

declare global {
  interface Window {
    textdiff: TextDiffApi
  }
}

export {}
