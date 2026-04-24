'use client'

import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import RequireAuth from '@/components/auth/RequireAuth'
import { useRecentMatches } from '@/hooks/useGraphQL'

export default function SpectatePage() {
  return (
    <RequireAuth>
      <SpectateContent />
    </RequireAuth>
  )
}

interface RecentMatch {
  matchId: string
  players?: string[] | null
  winner?: string | null
  loser?: string | null
  duration?: number | null
  turns?: number | null
  createdAt?: string | number | null
  status?: string | null
  endReason?: string | null
}

type BadgeTone = 'green' | 'amber' | 'slate' | 'red' | 'blue'

interface StatusBadge {
  label: string
  tone: BadgeTone
}

const BADGE_TONE_CLASSES: Record<BadgeTone, string> = {
  green: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  slate: 'bg-slate-500/15 text-slate-300 border border-slate-500/30',
  red: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
  blue: 'bg-sky-500/15 text-sky-300 border border-sky-500/30',
}

function capitalize(value: string): string {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function getStatusBadge(
  status: string | null | undefined,
  endReason: string | null | undefined,
): StatusBadge {
  if (status === 'completed') {
    if (endReason === 'victory_points') return { label: 'Victory Points', tone: 'green' }
    if (endReason === 'burn_out') return { label: 'Burn-out', tone: 'amber' }
    if (endReason === 'concede') return { label: 'Concede', tone: 'slate' }
    if (
      endReason === 'timeout' ||
      endReason === 'turn_cap' ||
      endReason === 'action_cap'
    ) {
      return { label: 'Timeout', tone: 'slate' }
    }
    return { label: 'Completed', tone: 'slate' }
  }
  if (status === 'abandoned') {
    if (
      endReason === 'crashed' ||
      endReason === 'invariant' ||
      endReason === 'infinite_loop'
    ) {
      return { label: 'Error', tone: 'red' }
    }
    return { label: 'Abandoned', tone: 'red' }
  }
  if (status === 'in_progress' || status == null) {
    return { label: 'In Progress', tone: 'blue' }
  }
  return { label: capitalize(status), tone: 'slate' }
}

function shortId(id: string): string {
  if (!id) return '—'
  if (id.length <= 12) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

function formatWhen(value: string | number | null | undefined): string {
  if (!value) return '—'
  let ts: number
  if (typeof value === 'number') {
    ts = value
  } else {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      ts = parsed
    } else {
      const asNum = Number(value)
      if (Number.isFinite(asNum)) {
        ts = asNum
      } else {
        return String(value)
      }
    }
  }
  const now = Date.now()
  const diff = now - ts
  if (diff < 0 || !Number.isFinite(diff)) {
    return new Date(ts).toLocaleString()
  }
  const seconds = Math.round(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 14) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

function formatDuration(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—'
  // Duration from backend is seconds.
  const totalSeconds = Math.round(value)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}

function SpectateContent() {
  const router = useRouter()
  const {
    data: recentMatchesData,
    loading,
    error,
    refetch: refetchRecentMatches,
  } = useRecentMatches(25)

  const recentMatches: RecentMatch[] = recentMatchesData?.recentMatches ?? []

  // Completed matches open the real interactive GameBoard via the
  // /replay/[matchId] route. Starting a new bot match now lives on the
  // landing page (app/page.tsx) and routes to /game/[matchId].
  const handleWatchReplay = (matchId: string) => {
    router.push(`/replay/${matchId}`)
  }

  return (
    <>
      <Header />
      <main className="spectate container">
        <div className="spectate-layout">
          <section className="spectate-card">
            <div className="recent-header">
              <h3>Recent Matches</h3>
              <button
                className="btn secondary"
                onClick={() => refetchRecentMatches()}
              >
                Refresh
              </button>
            </div>
            <p className="muted small">
              Replays of finished bot and player matches. Click Watch Replay to
              scrub through the full interactive board.
            </p>
            {error && (
              <p className="muted small" role="alert">
                Failed to load recent matches: {error.message}
              </p>
            )}
            <ul className="recent-list">
              {recentMatches.map((match) => {
                const players = Array.isArray(match.players) ? match.players : []
                const winnerLabel = match.winner
                  ? shortId(match.winner)
                  : '—'
                const playerLabel =
                  players.length >= 2
                    ? `${shortId(players[0])} vs ${shortId(players[1])}`
                    : players.map(shortId).join(', ') || '—'
                const badge = getStatusBadge(match.status, match.endReason)
                return (
                  <li key={match.matchId}>
                    <div>
                      <div className="flex items-center gap-2">
                        <strong>{shortId(match.matchId)}</strong>
                        <span
                          style={{ marginLeft: '4px' }}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONE_CLASSES[badge.tone]}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p className="muted small">{playerLabel}</p>
                      <p className="muted small">
                        Winner: {winnerLabel} · Turns:{' '}
                        {match.turns ?? '—'} · Duration:{' '}
                        {formatDuration(match.duration)} · {formatWhen(match.createdAt)}
                      </p>
                    </div>
                    <button
                      className="btn secondary"
                      onClick={() => handleWatchReplay(match.matchId)}
                    >
                      Watch Replay
                    </button>
                  </li>
                )
              })}
              {!loading && recentMatches.length === 0 && (
                <li className="muted small">No matches recorded.</li>
              )}
              {loading && recentMatches.length === 0 && (
                <li className="muted small">Loading recent matches…</li>
              )}
            </ul>
          </section>
        </div>
      </main>
      <Footer />
    </>
  )
}
