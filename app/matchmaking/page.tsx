'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import RequireAuth from '@/components/auth/RequireAuth'
import GameBoard from '@/components/GameBoard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import {
  useJoinMatchmakingQueue,
  useLeaveMatchmakingQueue,
  useMatchmakingStatus,
  useDecklists,
} from '@/hooks/useGraphQL'
import { useAuth } from '@/hooks/useAuth'
import useToasts from '@/hooks/useToasts'

type DeckSummary = {
  deckId: string
  name: string
  description?: string | null
  format?: string | null
  isDefault?: boolean | null
  cardCount?: number | null
}

type MatchMode = 'ranked' | 'free'

const MODES: { value: MatchMode; label: string; description: string }[] = [
  {
    value: 'free',
    label: 'Quick Play',
    description:
      'Fast casual queue that pairs the first two players waiting. Perfect for testing matches end-to-end.',
  },
  {
    value: 'ranked',
    label: 'Ranked Play',
    description:
      'MMR-based matchmaking with tighter tolerance windows. Ideal once balance tuning begins.',
  },
]

export default function MatchmakingPage() {
  return (
    <RequireAuth>
      <MatchmakingContent />
    </RequireAuth>
  )
}

function MatchmakingContent() {
  const { user } = useAuth()
  const userId = user?.userId ?? ''
  const [selectedDeckId, setSelectedDeckId] = useState('')
  const [mode, setMode] = useState<MatchMode>('free')
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null)
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null)
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null)
  const [matchCountdown, setMatchCountdown] = useState<number | null>(null)
  const { pushToast } = useToasts()
  const lastAnnouncedMatchId = useRef<string | null>(null)
  const {
    data: deckData,
    loading: decksLoading,
    error: deckError,
  } = useDecklists(userId || null)
  const decklists = (deckData?.decklists ?? []) as DeckSummary[]
  const selectedDeck = decklists.find((deck) => deck.deckId === selectedDeckId)
  useEffect(() => {
    if (!decklists.length) {
      setSelectedDeckId('')
      return
    }
    setSelectedDeckId((previous) => {
      if (previous && decklists.some((deck) => deck.deckId === previous)) {
        return previous
      }
      const defaultDeck = decklists.find((deck) => deck.isDefault)
      return defaultDeck?.deckId ?? decklists[0].deckId
    })
  }, [decklists])
  const pollInterval = userId ? 4000 : undefined
  const {
    data: statusData,
    error: statusError,
    refetch: refetchStatus,
  } = useMatchmakingStatus(userId || null, mode, pollInterval)
  const status = statusData?.matchmakingStatus

  const [joinQueue, { loading: joining }] = useJoinMatchmakingQueue()
  const [leaveQueue, { loading: leaving }] = useLeaveMatchmakingQueue()

  const actionDisabled = !userId || joining || leaving || !selectedDeckId
  const selectedMode = useMemo(
    () => MODES.find((entry) => entry.value === mode),
    [mode],
  )

  useEffect(() => {
    if (deckError) {
      pushToast(deckError.message ?? 'Failed to load decklists.', 'error')
    }
  }, [deckError, pushToast])

  useEffect(() => {
    if (statusError) {
      pushToast(statusError.message ?? 'Failed to refresh matchmaking status.', 'error')
    }
  }, [statusError, pushToast])

  const statusSummary = useMemo(() => {
    if (!status) {
      return 'Signed in users can join ranked or free queues.'
    }
    if (status.matchId && !status.queued) {
      return `Match found! Opponent: ${status.opponentName ?? 'pending'}`
    }
    if (status.queued) {
      return `Queued (${selectedMode?.label ?? mode}). Estimated wait: ${
        status.estimatedWaitSeconds ?? '?'
      }s`
    }
    return 'Not in queue.'
  }, [status, mode, selectedMode])

  const showQueueMessage = Boolean(status?.queued)

  useEffect(() => {
    if (status?.matchId && !status.queued && userId) {
      const alreadyRunning =
        status.matchId === activeMatchId || status.matchId === pendingMatchId
      if (!alreadyRunning) {
        lastAnnouncedMatchId.current = status.matchId
        setPendingMatchId(status.matchId)
        setMatchCountdown(5)
        const opponentLabel = status.opponentName ?? 'your opponent'
        pushToast(`Match found vs ${opponentLabel}. Starting in 5 seconds…`, 'success')
      }
    } else {
      if (!status?.matchId) {
        lastAnnouncedMatchId.current = null
      }
      setPendingMatchId(null)
      setMatchCountdown(null)
    }
  }, [
    status?.matchId,
    status?.queued,
    status?.opponentName,
    userId,
    activeMatchId,
    pendingMatchId,
    pushToast,
  ])

  useEffect(() => {
    if (!userId) {
      setActiveMatchId(null)
      setActivePlayerId(null)
      setPendingMatchId(null)
      setMatchCountdown(null)
      return
    }
    if (matchCountdown === null) {
      return
    }
    if (matchCountdown <= 0) {
      if (pendingMatchId) {
        setActiveMatchId(pendingMatchId)
        setActivePlayerId(userId)
      }
      setPendingMatchId(null)
      setMatchCountdown(null)
      return
    }
    const timer = setTimeout(() => {
      setMatchCountdown((prev) => (prev !== null ? prev - 1 : null))
    }, 1000)
    return () => clearTimeout(timer)
  }, [matchCountdown, pendingMatchId, userId])

  const handleJoin = async () => {
    if (!userId) {
      pushToast('Sign in before queueing.', 'warning')
      return
    }
    if (!selectedDeckId) {
      pushToast('Select a deck before joining the queue.', 'warning')
      return
    }
    try {
      const result = await joinQueue({
        variables: {
          input: {
            userId,
            mode,
            deckId: selectedDeckId,
          },
        },
      })
      const payload = result.data?.joinMatchmakingQueue
      if (payload?.matchFound) {
        pushToast(`Matched immediately! Preparing to launch…`, 'success')
      } else {
        pushToast(
          `Joined ${selectedMode?.label ?? mode} queue. Est. wait ~${payload?.estimatedWaitSeconds ?? '?'}s`,
          'success'
        )
      }
      await refetchStatus()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to join queue'
      pushToast(message, 'error')
    }
  }

  const handleLeave = async () => {
    if (!userId) {
      pushToast('You must be signed in to leave the queue.', 'warning')
      return
    }
    try {
      await leaveQueue({
        variables: {
          userId,
          mode,
        },
      })
      await refetchStatus()
      pushToast('Removed from matchmaking queue.', 'warning')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to leave queue'
      pushToast(message, 'error')
    }
  }

  return (
    <>
      <Header />
      <main className="matchmaking container">
        <div className="matchmaking-hero">
          <div>
            <h2>Matchmaking Queue</h2>
            <p className="muted">
              Quick Play instantly pairs the first two players waiting so you
              can validate gameplay flows with real accounts. Ranked Play uses
              MMR windows and will be our focus once competitive tuning starts.
            </p>
          </div>
        </div>

        <section className="matchmaking-controls">
          <div className="form-field">
            <label>Signed in as</label>
            <div className="user-context">
              <strong>{user?.username ?? user?.email ?? 'Unknown Summoner'}</strong>
            </div>
          </div>
          <div className="form-field">
            <label>Deck to queue</label>
            {decksLoading && (
              <p className="muted small">Loading decks…</p>
            )}
            {!decksLoading && decklists.length === 0 && (
              <p className="muted small">
                Save a deck in the deckbuilder to enable matchmaking.
              </p>
            )}
            {decklists.length > 0 && (
              <>
                <select
                  value={selectedDeckId}
                  onChange={(event) => setSelectedDeckId(event.target.value)}
                >
                  {decklists.map((deck) => (
                    <option key={deck.deckId} value={deck.deckId}>
                      {deck.name}
                      {deck.isDefault ? ' (Default)' : ''}
                    </option>
                  ))}
                </select>
                {selectedDeck && (
                  <p className="muted small">
                    {selectedDeck.cardCount ?? 0} cards ·{' '}
                    {selectedDeck.format ?? 'standard'}
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        <section className="matchmaking-modes">
          {MODES.map((entry) => (
            <label
              key={entry.value}
              className={`mode-card ${mode === entry.value ? 'active' : ''}`}
            >
              <input
                type="radio"
                name="match-mode"
                value={entry.value}
                checked={mode === entry.value}
                onChange={() => setMode(entry.value)}
              />
              <div>
                <strong>{entry.label}</strong>
                <p className="muted small">{entry.description}</p>
              </div>
            </label>
          ))}
        </section>

        <section className="matchmaking-actions">
          <button
            className="cta"
            onClick={handleJoin}
            disabled={actionDisabled}
          >
            {joining ? 'Joining…' : `Join ${selectedMode?.label ?? 'queue'}`}
          </button>
          <button
            className="btn secondary"
            onClick={handleLeave}
            disabled={!userId || leaving}
          >
            {leaving ? 'Leaving…' : 'Leave Queue'}
          </button>
        </section>

        <section className="matchmaking-status">
          <h3>Status</h3>
          <p>{statusSummary}</p>
          {status && (
            <div className="status-grid">
              <div>
                <span className="muted small">MMR</span>
                <strong>{status.mmr ?? '—'}</strong>
              </div>
              <div>
                <span className="muted small">Queued</span>
                <strong>{status.queued ? 'Yes' : 'No'}</strong>
              </div>
              <div>
                <span className="muted small">Estimated Wait</span>
                <strong>{status.estimatedWaitSeconds ?? '—'} sec</strong>
              </div>
              <div>
                <span className="muted small">Opponent</span>
                <strong>{status.opponentName ?? 'Pending'}</strong>
              </div>
              <div>
                <span className="muted small">Queued At</span>
                <strong>
                  {status.queuedAt
                    ? new Date(status.queuedAt).toLocaleTimeString()
                    : '—'}
                </strong>
              </div>
            </div>
          )}
        </section>
        {matchCountdown !== null && pendingMatchId ? (
          <div className="queue-waiting" aria-live="polite">
            <LoadingSpinner size="sm" label="Match starting soon" />
            <span>Match found! Launching in {matchCountdown}s…</span>
          </div>
        ) : (
          showQueueMessage && (
            <div className="queue-waiting" aria-live="polite">
              <LoadingSpinner size="sm" label="Searching for opponent" />
              <span>Searching for an opponent…</span>
            </div>
          )
        )}
        {activeMatchId && activePlayerId && (
          <section className="matchmaking-live-match">
            <div className="live-match-header">
              <div>
                <h3>Live Match</h3>
              </div>
            </div>
            <div className="matchmaking-gameboard">
              <GameBoard matchId={activeMatchId} playerId={activePlayerId} />
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  )
}
