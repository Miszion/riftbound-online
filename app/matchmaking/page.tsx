'use client'

import { useMemo, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import RequireAuth from '@/components/auth/RequireAuth'
import {
  useJoinMatchmakingQueue,
  useLeaveMatchmakingQueue,
  useMatchmakingStatus,
} from '@/hooks/useGraphQL'
import { useAuth } from '@/hooks/useAuth'

type MatchMode = 'ranked' | 'free'

const MODES: { value: MatchMode; label: string; description: string }[] = [
  {
    value: 'ranked',
    label: 'Ranked Play',
    description: 'Matchmaking Rating (MMR) based pairing with tighter tolerance.',
  },
  {
    value: 'free',
    label: 'Free Play',
    description: 'Fast casual games with flexible matching.',
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
  const [deckId, setDeckId] = useState('')
  const [mode, setMode] = useState<MatchMode>('ranked')
  const [message, setMessage] = useState<string | null>(null)
  const pollInterval = userId ? 4000 : undefined
  const {
    data: statusData,
    loading: statusLoading,
    refetch: refetchStatus,
  } = useMatchmakingStatus(userId || null, mode, pollInterval)
  const status = statusData?.matchmakingStatus

  const [joinQueue, { loading: joining }] = useJoinMatchmakingQueue()
  const [leaveQueue, { loading: leaving }] = useLeaveMatchmakingQueue()

  const actionDisabled = !userId || joining || leaving

  const statusSummary = useMemo(() => {
    if (!status) {
      return 'Signed in users can join ranked or free queues.'
    }
    if (status.matchId && !status.queued) {
      return `Match found! Opponent: ${status.opponentId ?? 'pending'}`
    }
    if (status.queued) {
      return `Queued (${mode}). Estimated wait: ${
        status.estimatedWaitSeconds ?? '?'
      }s`
    }
    return 'Not in queue.'
  }, [status, mode])

  const handleJoin = async () => {
    if (!userId) {
      setMessage('Sign in before queueing.')
      return
    }
    setMessage('Joining queue…')
    try {
      const result = await joinQueue({
        variables: {
          input: {
            userId,
            mode,
            deckId: deckId || undefined,
          },
        },
      })
      const payload = result.data?.joinMatchmakingQueue
      if (payload?.matchFound) {
        setMessage(
          `Matched immediately! Match ID: ${payload.matchId ?? 'pending'}`,
        )
      } else {
        setMessage(
          `Queued for ${mode}. Est. wait ~${payload?.estimatedWaitSeconds ?? '?'}s`,
        )
      }
      await refetchStatus()
    } catch (error: any) {
      setMessage(error.message || 'Failed to join queue')
    }
  }

  const handleLeave = async () => {
    if (!userId) {
      return
    }
    setMessage('Leaving queue…')
    try {
      await leaveQueue({
        variables: {
          userId,
          mode,
        },
      })
      await refetchStatus()
      setMessage('Removed from matchmaking queue.')
    } catch (error: any) {
      setMessage(error.message || 'Failed to leave queue')
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
              Hop into free play or ranked mode. Ranked matches pair you with
              similar MMR players; free play prioritizes speed.
            </p>
          </div>
          <div className="status-message" aria-live="polite">
            {message}
          </div>
        </div>

        <section className="matchmaking-controls">
          <div className="form-field">
            <label>Signed in as</label>
            <div className="user-context">
              <strong>{user?.email ?? userId}</strong>
              <span className="muted small">{userId}</span>
            </div>
          </div>
          <label>
            Active Deck ID <span className="muted small">(optional)</span>
            <input
              type="text"
              placeholder="deck-abc"
              value={deckId}
              onChange={(event) => setDeckId(event.target.value)}
            />
          </label>
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
            {joining ? 'Joining…' : `Join ${mode === 'ranked' ? 'Ranked' : 'Free'} Queue`}
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
          {statusLoading && <p className="muted small">Loading status…</p>}
          {!statusLoading && <p>{statusSummary}</p>}
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
                <span className="muted small">Match ID</span>
                <strong>{status.matchId ?? '—'}</strong>
              </div>
              <div>
                <span className="muted small">Opponent</span>
                <strong>{status.opponentId ?? 'Pending'}</strong>
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
      </main>
      <Footer />
    </>
  )
}
