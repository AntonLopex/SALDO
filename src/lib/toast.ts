import { ref } from 'vue'

export interface Toast {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void | Promise<void>
}

export const toasts = ref<Toast[]>([])
let seq = 0

export function showToast(message: string, opts: { actionLabel?: string; onAction?: () => void | Promise<void>; ms?: number } = {}) {
  const id = ++seq
  toasts.value = [...toasts.value, { id, message, actionLabel: opts.actionLabel, onAction: opts.onAction }]
  setTimeout(() => dismissToast(id), opts.ms ?? 6000)
}

export function dismissToast(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}
