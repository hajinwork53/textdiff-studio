/**
 * 글로벌 paste 이벤트 핸들러 — 입력 필드 내부는 무시
 * 출처: 17 Day6 RSD FR-4
 */

import { onMounted, onBeforeUnmount, type Ref } from 'vue'

interface Options {
  /** 활성 상태 — false 면 paste 이벤트 무시 */
  enabled?: Ref<boolean>
  /** paste 시 호출 — text 가 빈 문자열이면 호출되지만 처리는 콜백에서 */
  onPaste: (text: string) => void | Promise<void>
}

const MAX_CLIPBOARD_BYTES = 100 * 1024 * 1024 // 100MB

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea') return true
  if (target.isContentEditable) return true
  return false
}

export function usePasteHandler(options: Options) {
  function handler(e: ClipboardEvent) {
    // 입력 필드 안에서는 일반 paste 동작 (기본 동작) — 우리 핸들러 무시
    if (isEditableTarget(e.target)) return
    if (options.enabled && !options.enabled.value) return

    const text = e.clipboardData?.getData('text') ?? ''

    // 100MB 초과 사전 거부 (실제 측정 어렵지만 UTF-16 1자 = 2bytes 기준 대략)
    if (text.length * 2 > MAX_CLIPBOARD_BYTES) {
      console.warn('[paste] 클립보드 텍스트가 100MB 초과 — 무시')
      return
    }

    e.preventDefault()
    void options.onPaste(text)
  }

  onMounted(() => {
    document.addEventListener('paste', handler)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('paste', handler)
  })
}

export { MAX_CLIPBOARD_BYTES }
