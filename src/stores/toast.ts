import { defineStore } from 'pinia'

export type ToastLevel = 'info' | 'success' | 'warning' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void | Promise<void>
}

export interface Toast {
  id: number
  level: ToastLevel
  message: string
  detail?: string
  durationMs: number
  actions?: ToastAction[]
}

let nextId = 1

export const useToastStore = defineStore('toast', {
  state: () => ({
    items: [] as Toast[],
  }),

  actions: {
    push(toast: Omit<Toast, 'id'>) {
      const id = nextId++
      const item: Toast = { id, ...toast }
      this.items.push(item)
      if (item.durationMs > 0) {
        setTimeout(() => this.dismiss(id), item.durationMs)
      }
      return id
    },

    info(message: string, detail?: string, actions?: ToastAction[], durationMs?: number) {
      return this.push({ level: 'info', message, detail, actions, durationMs: durationMs ?? 3500 })
    },
    success(message: string, detail?: string, actions?: ToastAction[], durationMs?: number) {
      // 액션 있으면 7초로 늘림 (사용자 클릭 시간 확보)
      const dur = durationMs ?? (actions && actions.length > 0 ? 7000 : 3000)
      return this.push({ level: 'success', message, detail, actions, durationMs: dur })
    },
    warning(message: string, detail?: string, actions?: ToastAction[], durationMs?: number) {
      return this.push({ level: 'warning', message, detail, actions, durationMs: durationMs ?? 5000 })
    },
    error(message: string, detail?: string, actions?: ToastAction[], durationMs?: number) {
      return this.push({ level: 'error', message, detail, actions, durationMs: durationMs ?? 7000 })
    },

    dismiss(id: number) {
      this.items = this.items.filter((t) => t.id !== id)
    },
  },
})
