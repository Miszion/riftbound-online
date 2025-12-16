'use client'

import type { ToastTone } from '@/components/ui/ToastStack'
import { useToastContext } from '@/components/ui/ToastProvider'

export default function useToasts() {
  const { pushToast } = useToastContext()
  return { pushToast: (message: string, tone: ToastTone) => pushToast(message, tone) }
}
