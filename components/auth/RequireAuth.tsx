'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import useToasts from '@/hooks/useToasts'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, hydrated } = useAuth()
  const router = useRouter()
  const { pushToast } = useToasts()
  const warnedRef = useRef(false)

  useEffect(() => {
    if (!hydrated) {
      return
    }
    if (!user) {
      if (!warnedRef.current) {
        pushToast('Please sign in to continue.', 'warning')
        warnedRef.current = true
      }
      router.replace('/sign-in')
    } else {
      warnedRef.current = false
    }
  }, [user, hydrated, router, pushToast])

  if (!hydrated) {
    return (
      <div className="queue-waiting" aria-live="polite">
        <LoadingSpinner size="sm" label="Restoring session" />
        <span>Validating your session…</span>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return <>{children}</>
}
