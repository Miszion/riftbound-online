'use client'

import { useEffect, useState } from 'react'
import { networkActivity } from '@/lib/networkActivity'
import LoadingSpinner from './LoadingSpinner'

export function GlobalLoadingOverlay() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    return networkActivity.subscribe((count) => {
      setActive(count > 0)
    })
  }, [])

  if (!active) {
    return null
  }

  return (
    <div className="loading-overlay" aria-live="polite">
      <LoadingSpinner size="lg" />
    </div>
  )
}

export default GlobalLoadingOverlay
