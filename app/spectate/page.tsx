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

function SpectateContent() {
  const router = useRouter()
  const {
    data: recentMatchesData,
    refetch: refetchRecentMatches,
  } = useRecentMatches(12)

  const recentMatches = recentMatchesData?.recentMatches ?? []

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
              Replays of finished matches. To watch a live bot match, start one
              from the home page.
            </p>
            <ul className="recent-list">
              {recentMatches.map((match: any) => (
                <li key={match.matchId}>
                  <div>
                    <strong>{match.matchId}</strong>
                    <p className="muted small">
                      Winner: {match.winner ?? '—'} · Turns:{' '}
                      {match.turns ?? '—'}
                    </p>
                  </div>
                  <button
                    className="btn secondary"
                    onClick={() => handleWatchReplay(match.matchId)}
                  >
                    Watch Replay
                  </button>
                </li>
              ))}
              {recentMatches.length === 0 && (
                <li className="muted small">No matches recorded.</li>
              )}
            </ul>
          </section>
        </div>
      </main>
      <Footer />
    </>
  )
}
