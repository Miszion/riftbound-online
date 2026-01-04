'use client'

import { useEffect, useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import RequireAuth from '@/components/auth/RequireAuth'
import GameBoard from '@/components/GameBoard'
import { useAuth } from '@/hooks/useAuth'

export default function GamePage() {
  return (
    <RequireAuth>
      <GamePageContent />
    </RequireAuth>
  )
}

function GamePageContent() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const matchId = useMemo(() => {
    const fromQuery = searchParams.get('matchId')
    if (fromQuery) {
      return fromQuery
    }
    if (!pathname) {
      return ''
    }
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length >= 2 && segments[0] === 'game') {
      return segments[1] ?? ''
    }
    return ''
  }, [searchParams, pathname])

  useEffect(() => {
    if (!matchId || typeof window === 'undefined') {
      return
    }
    const desired = `/game/${matchId}`
    if (window.location.pathname !== desired) {
      window.history.replaceState(null, '', desired)
    }
  }, [matchId])

  if (!matchId || !user?.userId) {
    return (
      <main className="game-screen container">
        <div className="queue-waiting" aria-live="polite">
          <strong>Awaiting match context…</strong>
          <span>Join the queue or open an existing arena link to start a duel.</span>
        </div>
      </main>
    )
  }

  return (
    <main className="game-screen container">
      <div className="game-screen__board">
        <GameBoard matchId={matchId} playerId={user.userId} />
      </div>
    </main>
  )
}
