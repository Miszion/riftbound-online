'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import ToastStack, { type ToastMessage, type ToastTone } from './ToastStack'

type ToastContextValue = {
  pushToast: (message: string, tone: ToastTone) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = useCallback(
    (message: string, tone: ToastTone) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      setToasts((prev) => [...prev, { id, message, tone }])
      setTimeout(() => dismissToast(id), 4000)
    },
    [dismissToast]
  )

  const value = useMemo(
    () => ({
      pushToast,
      dismissToast,
    }),
    [pushToast, dismissToast]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && <ToastStack toasts={toasts} onDismiss={dismissToast} />}
    </ToastContext.Provider>
  )
}

export const useToastContext = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToastContext must be used within ToastProvider')
  }
  return ctx
}
