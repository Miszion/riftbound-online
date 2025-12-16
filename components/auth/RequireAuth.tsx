'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import useToasts from '@/hooks/useToasts'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const router = useRouter()
  const { pushToast } = useToasts()
  const warnedRef = useRef(false)

  useEffect(() => {
    if (!user) {
      if (!warnedRef.current) {
        pushToast('Please sign in to continue.', 'warning')
        warnedRef.current = true
      }
      router.replace('/sign-in')
    } else {
      warnedRef.current = false
    }
  }, [user, router, pushToast])

  if (!user) {
    return null
  }

  return <>{children}</>
}
