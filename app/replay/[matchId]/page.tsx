'use client'

import { useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import RequireAuth from '@/components/auth/RequireAuth'
import GameBoard from '@/components/GameBoard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/hooks/useAuth'
import { useMatchReplay } from '@/hooks/useGraphQL'
import type {
  ReplayMove,
  ReplaySpectatorState,
} from '@/lib/replay/reducer'

/**
 * Replay page — mounts the full interactive GameBoard in replay mode.
 *
 * Route: /replay/[matchId]
 *
 * Fetches the persisted match record via `useMatchReplay` and hands the
 * `finalState` + `moves` to GameBoard's replay prop. The GameBoard itself
 * handles reducer wiring and playback controls.
 */
export default function ReplayPage() {
  return (
    <RequireAuth>
      <ReplayPageContent />
    </RequireAuth>
  )
}

function ReplayPageContent() {
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
    if (segments.length >= 2 && segments[0] === 'replay') {
      return segments[1] ?? ''
    }
    return ''
  }, [searchParams, pathname])

  const { data, loading, error } = useMatchReplay(matchId || null)
  const replayRecord = data?.matchReplay ?? null

  if (!matchId) {
    return (
      <main className="game-screen container">
        <div className="queue-waiting" aria-live="polite">
          <strong>No replay selected</strong>
          <span>Open a replay link with a valid match ID to get started.</span>
        </div>
      </main>
    )
  }

  if (loading && !replayRecord) {
    return (
      <main className="game-screen container">
        <div className="loading-overlay" aria-live="polite">
          <LoadingSpinner size="lg" />
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="game-screen container">
        <div className="queue-waiting" aria-live="polite">
          <strong>Unable to load replay.</strong>
          <span>{error.message}</span>
        </div>
      </main>
    )
  }

  if (!replayRecord || !replayRecord.finalState) {
    return (
      <main className="game-screen container">
        <div className="queue-waiting" aria-live="polite">
          <strong>Replay not available.</strong>
          <span>
            This match has not been finalized yet or its final state is
            missing.
          </span>
        </div>
      </main>
    )
  }

  // Default perspective: the viewer's own id if they were a participant,
  // otherwise the first player in the record.
  const finalState = replayRecord.finalState as ReplaySpectatorState
  const moves = (replayRecord.moves ?? []) as ReplayMove[]
  const participants: string[] = Array.isArray(replayRecord.players)
    ? replayRecord.players
    : []
  const perspectivePlayerId =
    (user?.userId && participants.includes(user.userId)
      ? user.userId
      : participants[0]) ?? undefined

  // We pass a non-empty `matchId` + `playerId` for type compatibility, but
  // `replay` short-circuits every live hook inside GameBoard.
  return (
    <main className="game-screen container">
      <div className="game-screen__board">
        <GameBoard
          matchId={matchId}
          playerId={perspectivePlayerId ?? user?.userId ?? ''}
          replay={{
            moves,
            finalState,
            speed: 1,
            perspectivePlayerId,
          }}
        />
      </div>
    </main>
  )
}
