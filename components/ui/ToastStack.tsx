import React from 'react'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export type ToastMessage = {
  id: string
  message: string
  tone: ToastTone
}

type ToastStackProps = {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}

export default function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (!toasts.length) {
    return null
  }

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          <span>{toast.message}</span>
          <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
