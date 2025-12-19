'use client'

import { useEffect, useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import RequireAuth from '@/components/auth/RequireAuth'
import GameBoard from '@/components/GameBoard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Link from 'next/link'
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
      <>
        <Header />
        <main className="game-screen container">
          <div className="queue-waiting" aria-live="polite">
            <LoadingSpinner size="sm" label="Awaiting match context" />
            <span>
              Waiting for a match assignment. Join the queue to start a duel or open an
              existing arena link.
            </span>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="game-screen container">
        <div className="game-screen__toolbar">
          <div>
            <p className="muted small">Match #{matchId}</p>
            <h2>Arena Engagement</h2>
          </div>
          <Link href="/matchmaking" className="btn secondary">
            Back to Matchmaking
          </Link>
        </div>
        <div className="game-screen__board">
          <GameBoard matchId={matchId} playerId={user.userId} />
        </div>
      </main>
      <Footer />
    </>
  )
}
