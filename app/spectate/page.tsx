'use client'

import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import RequireAuth from '@/components/auth/RequireAuth'
import GameViewer from '@/components/GameViewer'
import {
  useCardCatalog,
  useGameStateSubscription,
  useMatch,
  useMatchReplay,
  useRecentMatches,
} from '@/hooks/useGraphQL'

export default function SpectatePage() {
  return (
    <RequireAuth>
      <SpectateContent />
    </RequireAuth>
  )
}

function SpectateContent() {
  const [liveInput, setLiveInput] = useState('')
  const [liveMatchId, setLiveMatchId] = useState('')
  const [selectedReplayId, setSelectedReplayId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const { data: liveQueryData } = useMatch(liveMatchId || null)
  const { data: liveSubData } = useGameStateSubscription(
    liveMatchId || null,
  )
  const { data: catalogData } = useCardCatalog({ limit: 600 })
  const { data: replayData, refetch: refetchReplay } = useMatchReplay(
    selectedReplayId,
  )
  const {
    data: recentMatchesData,
    refetch: refetchRecentMatches,
  } = useRecentMatches(12)

  const [spectatorState, setSpectatorState] = useState<any | null>(null)
  const [spectatorMoves, setSpectatorMoves] = useState<any[]>([])

  useEffect(() => {
    if (liveQueryData?.match) {
      setSpectatorState(liveQueryData.match)
      setSpectatorMoves(liveQueryData.match.moveHistory || [])
    }
  }, [liveQueryData])

  useEffect(() => {
    if (liveSubData?.gameStateChanged) {
      setSpectatorState(liveSubData.gameStateChanged)
      setSpectatorMoves(liveSubData.gameStateChanged.moveHistory || [])
    }
  }, [liveSubData])

  const catalogIndex = useMemo(() => {
    if (!catalogData?.cardCatalog) return {}
    const index: Record<string, any> = {}
    catalogData.cardCatalog.forEach((card: any) => {
      index[card.id] = card
      index[card.slug?.toLowerCase()] = card
      index[card.name.toLowerCase()] = card
    })
    return index
  }, [catalogData])

  const replay = replayData?.matchReplay
  const recentMatches = recentMatchesData?.recentMatches ?? []

  const handleLoadLive = () => {
    setLiveMatchId(liveInput.trim())
    setStatusMessage(
      liveInput.trim()
        ? `Spectating live match ${liveInput.trim()}`
        : 'Enter a match ID',
    )
  }

  const handleLoadReplay = (matchId: string) => {
    setSelectedReplayId(matchId)
    refetchReplay?.({ matchId })
  }

  return (
    <>
      <Header />
      <main className="spectate container">
        <div className="spectate-layout">
          <section className="spectate-card">
            <h3>Live Spectate</h3>
            <p className="muted small">
              Enter the match ID you want to watch in real-time.
            </p>
            <div className="spectate-control">
              <label>
                Match ID
                <input
                  type="text"
                  placeholder="match-123"
                  value={liveInput}
                  onChange={(event) => setLiveInput(event.target.value)}
                />
              </label>
              <button className="cta" onClick={handleLoadLive}>
                Watch Live
              </button>
            </div>
            {statusMessage && (
              <p className="muted small" aria-live="polite">
                {statusMessage}
              </p>
            )}
          </section>
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
                    onClick={() => handleLoadReplay(match.matchId)}
                  >
                    Replay
                  </button>
                </li>
              ))}
              {recentMatches.length === 0 && (
                <li className="muted small">No matches recorded.</li>
              )}
            </ul>
          </section>
        </div>

        {spectatorState && (
          <GameViewer
            state={spectatorState}
            moves={spectatorMoves}
            catalogIndex={catalogIndex}
            title="Live Match"
          />
        )}

        {replay && replay.finalState && (
          <GameViewer
            state={replay.finalState}
            moves={replay.moves}
            catalogIndex={catalogIndex}
            title={`Replay · ${replay.matchId}`}
          />
        )}
      </main>
      <Footer />
    </>
  )
}
