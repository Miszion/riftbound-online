'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import RequireAuth from '@/components/auth/RequireAuth'
import GameBoard from '@/components/GameBoard'
import ReplayDrawer from '@/components/ReplayDrawer'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/hooks/useAuth'
import { useMatchFrames, useMatchReplay } from '@/hooks/useGraphQL'
import type { ReplaySpectatorState } from '@/lib/replay/reducer'

/**
 * Replay page - mounts the full interactive GameBoard in replay mode.
 *
 * Route: /replay/[matchId]
 *
 * Reads the per-move `SerializedFrame`s from the `matchFrames` GraphQL query
 * (backed by the persistent replay-frame store) and hands them to GameBoard's
 * replay prop. GameBoard's replay pipeline feeds each frame through
 * `setSpectatorOverride` - the same setter the live subscription uses - so
 * the same renderer serves both live and replay with zero client-side engine.
 *
 * `matchReplay` is still fetched for match metadata (players, winner,
 * duration) and the fresh-match polling window, but its `finalState` /
 * `moves` are no longer the source of truth.
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

  const {
    data: replayData,
    loading: replayLoading,
    error: replayError,
    refetch: refetchReplay,
  } = useMatchReplay(matchId || null)
  const replayRecord = replayData?.matchReplay ?? null

  const {
    data: framesData,
    loading: framesLoading,
    error: framesError,
    refetch: refetchFrames,
  } = useMatchFrames(matchId || null)
  const frames: ReplaySpectatorState[] = useMemo(() => {
    const raw = framesData?.matchFrames
    if (!Array.isArray(raw)) return []
    return raw as ReplaySpectatorState[]
  }, [framesData])

  // Fresh-match race: the replay record + frame store may take a moment to
  // finalize after a match ends. Poll both queries for up to ~10s before
  // falling through to the "Replay not available" message.
  const firstLoadAtRef = useRef<number | null>(null)
  const [gaveUpPolling, setGaveUpPolling] = useState(false)

  useEffect(() => {
    if (!matchId) {
      firstLoadAtRef.current = null
      setGaveUpPolling(false)
      return
    }
    if (firstLoadAtRef.current === null) {
      firstLoadAtRef.current = Date.now()
    }
  }, [matchId])

  const hasReplay = Boolean(replayRecord && replayRecord.finalState)
  const hasFrames = frames.length > 0
  const loading = replayLoading || framesLoading
  const error = replayError ?? framesError
  const isMissing =
    Boolean(matchId) && !loading && !error && !hasReplay && !hasFrames
  const elapsed =
    firstLoadAtRef.current === null ? 0 : Date.now() - firstLoadAtRef.current
  const shouldPoll = isMissing && !gaveUpPolling && elapsed < 10_000

  useEffect(() => {
    if (!shouldPoll) {
      return
    }
    const timer = setTimeout(() => {
      const elapsedNow =
        firstLoadAtRef.current === null
          ? 0
          : Date.now() - firstLoadAtRef.current
      if (elapsedNow >= 10_000) {
        setGaveUpPolling(true)
        return
      }
      refetchReplay?.().catch(() => {
        // Swallow transient refetch errors; the effect re-schedules.
      })
      refetchFrames?.().catch(() => {
        // Same swallow-and-retry policy for the frames query.
      })
    }, 1000)
    return () => clearTimeout(timer)
  }, [shouldPoll, refetchReplay, refetchFrames, framesData, replayData])

  // Pick the inner view based on load/error/polling state. The surrounding
  // <main> + ReplayDrawer stay constant so the drawer is always available,
  // including during the 10s fresh-match polling window.
  const inner = (() => {
    if (!matchId) {
      return (
        <div className="queue-waiting" aria-live="polite">
          <strong>No replay selected</strong>
          <span>Open a replay link with a valid match ID to get started.</span>
        </div>
      )
    }
    if (loading && !hasFrames && !hasReplay) {
      return (
        <div className="loading-overlay" aria-live="polite">
          <LoadingSpinner size="lg" />
        </div>
      )
    }
    if (error) {
      return (
        <div className="queue-waiting" aria-live="polite">
          <strong>Unable to load replay.</strong>
          <span>{error.message}</span>
        </div>
      )
    }
    if (!hasFrames) {
      if (!gaveUpPolling && elapsed < 10_000) {
        return (
          <div className="loading-overlay" aria-live="polite">
            <LoadingSpinner size="lg" />
            <span>Preparing replay...</span>
          </div>
        )
      }
      return (
        <div className="queue-waiting" aria-live="polite">
          <strong>Replay not available.</strong>
          <span>
            This match has no persisted frames yet. Only matches finished on the
            new replay-frame store can be replayed on the board.
          </span>
        </div>
      )
    }

    // Default perspective: the viewer's own id if they were a participant,
    // otherwise the first player in the record / last frame.
    const recordParticipants: string[] = Array.isArray(replayRecord?.players)
      ? (replayRecord!.players as string[])
      : []
    const lastFramePlayers = frames[frames.length - 1]?.players ?? []
    const framePlayerIds: string[] = Array.isArray(lastFramePlayers)
      ? lastFramePlayers
          .map((p: any) => p?.playerId)
          .filter((id: unknown): id is string => typeof id === 'string' && !!id)
      : []
    const participants =
      recordParticipants.length > 0 ? recordParticipants : framePlayerIds
    const perspectivePlayerId =
      (user?.userId && participants.includes(user.userId)
        ? user.userId
        : participants[0]) ?? undefined

    // `replay` short-circuits every live hook inside GameBoard; matchId and
    // playerId are passed for type compatibility only.
    return (
      <div className="game-screen__board">
        <GameBoard
          matchId={matchId}
          playerId={perspectivePlayerId ?? user?.userId ?? ''}
          replay={{
            frames,
            speed: 1,
            perspectivePlayerId,
          }}
        />
      </div>
    )
  })()

  return (
    <main className="game-screen container">
      {inner}
      <ReplayDrawer currentMatchId={matchId || null} />
    </main>
  )
}
