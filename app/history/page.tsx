'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import RequireAuth from '@/components/auth/RequireAuth'
import { useAuth } from '@/hooks/useAuth'
import { useMatchHistory } from '@/hooks/useGraphQL'

type MatchHistoryEntry = {
  matchId: string
  timestamp?: string | number | null
  players?: string[] | null
  winner?: string | null
  loser?: string | null
  duration?: number | null
  turns?: number | null
  moveCount?: number | null
  status?: string | null
}

export default function HistoryPage() {
  return (
    <RequireAuth>
      <HistoryContent />
    </RequireAuth>
  )
}

function HistoryContent() {
  const { user } = useAuth()
  const userId = user?.userId ?? null
  const { data, loading, error, refetch } = useMatchHistory(userId, 25)

  const matches = useMemo<MatchHistoryEntry[]>(
    () => (data?.matchHistory ?? []) as MatchHistoryEntry[],
    [data],
  )

  const resolveOpponent = (match: MatchHistoryEntry) => {
    if (!userId) {
      return 'Unknown'
    }
    const others = (match.players ?? []).filter((id) => id && id !== userId)
    if (others.length === 0) {
      return 'Unknown'
    }
    return others.join(', ')
  }

  const formatDuration = (seconds?: number | null) => {
    if (!seconds || seconds <= 0) {
      return '—'
    }
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    if (mins === 0) {
      return `${secs}s`
    }
    return `${mins}m ${secs.toString().padStart(2, '0')}s`
  }

  const formatDate = (value?: string | number | null) => {
    if (!value) {
      return '—'
    }
    try {
      const date = new Date(value as string | number)
      if (Number.isNaN(date.getTime())) {
        return '—'
      }
      return date.toLocaleString()
    } catch {
      return '—'
    }
  }

  const statusLabel = (status?: string | null) =>
    (status ?? 'completed').replace(/_/g, ' ')

  return (
    <>
      <Header />
      <main className="spectate container">
        <div className="spectate-layout">
          <section className="spectate-card">
            <div className="recent-header">
              <h3>Your Matches</h3>
              <button
                className="btn secondary"
                onClick={() => refetch()}
                disabled={loading}
              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            <p className="muted small">
              Recent duels for your account. Watch replays of finished matches
              or jump back into anything still in progress.
            </p>

            {error && (
              <p className="muted small" role="alert">
                Failed to load match history: {error.message}
              </p>
            )}

            <ul className="recent-list">
              {matches.map((match) => {
                const isInProgress =
                  match.status && match.status.toLowerCase() !== 'completed'
                const isWinner =
                  Boolean(match.winner) && match.winner === userId
                const resultBadge = isInProgress
                  ? { label: 'Live', tone: 'muted small' }
                  : isWinner
                    ? { label: 'Victory', tone: 'small' }
                    : match.winner
                      ? { label: 'Defeat', tone: 'muted small' }
                      : { label: statusLabel(match.status), tone: 'muted small' }

                return (
                  <li key={match.matchId}>
                    <div>
                      <strong>vs {resolveOpponent(match)}</strong>
                      <p className="muted small">
                        <span style={{ fontWeight: 600 }}>
                          {resultBadge.label}
                        </span>
                        {' · Turns: '}
                        {match.turns ?? '—'}
                        {' · '}
                        {formatDuration(match.duration)}
                        {' · '}
                        {formatDate(match.timestamp)}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {isInProgress ? (
                        <Link
                          className="btn secondary"
                          href={`/game?matchId=${match.matchId}`}
                        >
                          Watch Live
                        </Link>
                      ) : (
                        <Link
                          className="btn secondary"
                          href={`/replay/${match.matchId}`}
                        >
                          Watch Replay
                        </Link>
                      )}
                    </div>
                  </li>
                )
              })}

              {!loading && matches.length === 0 && !error && (
                <li className="muted small">
                  No matches yet. Queue up in Matchmaking or watch bots in
                  Spectate.
                </li>
              )}

              {loading && matches.length === 0 && (
                <li className="muted small">Loading match history…</li>
              )}
            </ul>
          </section>
        </div>
      </main>
      <Footer />
    </>
  )
}
