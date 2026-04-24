'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useMutation } from '@apollo/client'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ReplayDrawer from '@/components/ReplayDrawer'
import { useActiveBotMatches, useStartBotMatch } from '@/hooks/useGraphQL'
import {
  CANCEL_BOT_MATCH,
  CANCEL_ALL_BOT_MATCHES,
} from '@/lib/graphql/queries'

// Backend BE-5 asserts these are the five strategies the engine supports
// (StartBotMatchResult.availableStrategies). We seed the dropdowns with the
// same five so the page works before the first mutation completes, and we
// replace the list from the response on submit so a future backend change
// (new strategy added, old one removed) flows through without a code change.
const DEFAULT_STRATEGIES = ['baseline', 'heuristic', 'random', 'aggro', 'control'] as const
const DEFAULT_STRATEGY_A = 'aggro'
const DEFAULT_STRATEGY_B = 'control'

interface BotMatchSummary {
  matchId: string
  players: string[]
  strategies: string[]
  status: string
  winner: string | null
  reason: string | null
}

export default function Home() {
  const router = useRouter()
  const [startBotMatch, { loading: startingBotMatch }] = useStartBotMatch()
  const [botError, setBotError] = useState<string | null>(null)
  const [strategyA, setStrategyA] = useState<string>(DEFAULT_STRATEGY_A)
  const [strategyB, setStrategyB] = useState<string>(DEFAULT_STRATEGY_B)
  const [availableStrategies, setAvailableStrategies] = useState<string[]>([
    ...DEFAULT_STRATEGIES,
  ])

  const { data: activeData, refetch: refetchActive } = useActiveBotMatches({ pollMs: 4000 })

  const [cancelBotMatch, { loading: cancelling }] = useMutation<{
    cancelBotMatch: boolean
  }>(CANCEL_BOT_MATCH)
  const [cancelAllBotMatches, { loading: cancellingAll }] = useMutation<{
    cancelAllBotMatches: number
  }>(CANCEL_ALL_BOT_MATCHES)

  const handleStartBotMatch = async () => {
    setBotError(null)
    try {
      const { data } = await startBotMatch({
        variables: {
          strategyA,
          strategyB,
        },
      })
      const payload = data?.startBotMatch
      if (Array.isArray(payload?.availableStrategies) && payload.availableStrategies.length > 0) {
        setAvailableStrategies(payload.availableStrategies)
      }
      // Trust the backend's spectatorPath. BE-3 made this canonical
      // (/spectate/<matchId>); the old /game/<matchId> fallback would
      // re-introduce the participant-only-view bug (spec D1) so it is gone.
      const spectatorPath: string | undefined = payload?.spectatorPath
      if (!spectatorPath) {
        setBotError('Bot match could not be started.')
        return
      }
      await refetchActive()
      router.push(spectatorPath)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error starting bots.'
      setBotError(message)
    }
  }

  const handleCancel = async (matchId: string) => {
    try {
      await cancelBotMatch({ variables: { matchId } })
      await refetchActive()
    } catch (err) {
      console.error('cancelBotMatch failed', err)
    }
  }

  const handleCancelAll = async () => {
    try {
      await cancelAllBotMatches()
      await refetchActive()
    } catch (err) {
      console.error('cancelAllBotMatches failed', err)
    }
  }

  const summaries: BotMatchSummary[] = activeData?.activeBotMatches ?? []
  const activeMatches = summaries.filter(
    (m) => m.status === 'running' || m.status === 'initializing'
  )
  const recentlyFinished = summaries
    .filter((m) => m.status === 'completed' || m.status === 'crashed')
    .slice(0, 5)

  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="container hero-inner">
            <div className="hero-text">
              <h2>Take command of the rift</h2>
              <p>
                Riftbound Online is a fan-built landing page inspired by the Riftbound card game from League of
                Legends. Discover decks, collect champions, and clash on the rift.
              </p>
              <p className="muted">
                This is a demo homepage and sign-in mockup, not an official Riot Games product.
              </p>
              <p>
                <Link className="cta" href="/sign-in">
                  Get started. Sign in
                </Link>
                {' '}
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleStartBotMatch}
                  disabled={startingBotMatch}
                >
                  {startingBotMatch ? 'Starting bot vs bot...' : 'Start Bot vs Bot'}
                </button>
              </p>
              <div className="bot-strategy-pickers" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.5rem' }}>
                <label style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span className="muted small">Bot A</span>
                  <select
                    value={strategyA}
                    onChange={(event) => setStrategyA(event.target.value)}
                    disabled={startingBotMatch}
                    aria-label="Bot A strategy"
                  >
                    {availableStrategies.map((value) => (
                      <option key={`a-${value}`} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span className="muted small">Bot B</span>
                  <select
                    value={strategyB}
                    onChange={(event) => setStrategyB(event.target.value)}
                    disabled={startingBotMatch}
                    aria-label="Bot B strategy"
                  >
                    {availableStrategies.map((value) => (
                      <option key={`b-${value}`} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {botError && (
                <p className="muted small" aria-live="polite">
                  {botError}
                </p>
              )}
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="card-slab">
                <div className="card">
                  <div className="card-image-wrapper">
                    <Image
                      src="/images/viktor.jpg"
                      alt="Viktor champion card art"
                      fill
                      sizes="(max-width: 800px) 120px, 160px"
                      priority
                    />
                  </div>
                </div>
                <div className="card alt">
                  <div className="card-image-wrapper">
                    <Image
                      src="/images/falling-star.jpg"
                      alt="Falling Star spell art"
                      fill
                      sizes="(max-width: 800px) 110px, 140px"
                    />
                  </div>
                </div>
                <div className="card alt2">
                  <div className="card-image-wrapper">
                    <Image
                      src="/images/mind-rune.jpg"
                      alt="Mind rune card art"
                      fill
                      sizes="(max-width: 800px) 95px, 120px"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="container" style={{ padding: '32px 0' }}>
          <div
            style={{
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 12,
              padding: 24,
              background: 'rgba(255, 255, 255, 0.02)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 8,
              }}
            >
              <h4 style={{ margin: 0 }}>
                Active bot matches{' '}
                <span style={{ opacity: 0.6, fontWeight: 400, fontSize: '0.85em' }}>
                  ({activeMatches.length})
                </span>
              </h4>
              {activeMatches.length > 0 ? (
                <button
                  type="button"
                  onClick={handleCancelAll}
                  disabled={cancellingAll}
                  style={{
                    fontSize: 12,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(255, 136, 136, 0.5)',
                    background: 'transparent',
                    color: '#ff8888',
                    cursor: cancellingAll ? 'wait' : 'pointer',
                    opacity: cancellingAll ? 0.7 : 1,
                  }}
                >
                  {cancellingAll ? 'Cancelling...' : `Cancel all (${activeMatches.length})`}
                </button>
              ) : null}
            </div>
            {activeMatches.length === 0 ? (
              <p style={{ opacity: 0.7, margin: 0 }}>
                No bot matches running right now. Start one above.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                {activeMatches.map((m) => (
                  <li
                    key={m.matchId}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 14px',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 8,
                      background: 'rgba(255, 255, 255, 0.03)',
                    }}
                  >
                    <div style={{ display: 'grid', gap: 2 }}>
                      <strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{m.matchId}</strong>
                      <span style={{ fontSize: 12, opacity: 0.75 }}>
                        {m.strategies.join(' vs ')} - status {m.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Link
                        className="cta"
                        href={`/spectate/${encodeURIComponent(m.matchId)}`}
                        style={{ fontSize: 13, padding: '6px 12px' }}
                      >
                        Spectate
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleCancel(m.matchId)}
                        disabled={cancelling}
                        style={{
                          fontSize: 12,
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: '1px solid rgba(255, 136, 136, 0.5)',
                          background: 'transparent',
                          color: '#ff8888',
                          cursor: cancelling ? 'wait' : 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {recentlyFinished.length > 0 ? (
              <details style={{ marginTop: 16 }}>
                <summary style={{ cursor: 'pointer', opacity: 0.8 }}>
                  Recently finished ({recentlyFinished.length})
                </summary>
                <ul style={{ listStyle: 'none', padding: 0, marginTop: 8, display: 'grid', gap: 6 }}>
                  {recentlyFinished.map((m) => (
                    <li
                      key={m.matchId}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: 6,
                        fontSize: 12,
                        opacity: 0.85,
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontFamily: 'monospace' }}>{m.matchId}</span>
                      <span>
                        {m.status} - winner: {m.winner ?? 'n/a'} - {m.reason ?? ''}
                      </span>
                      <Link
                        href={`/replay/${encodeURIComponent(m.matchId)}`}
                        style={{ color: 'inherit', textDecoration: 'underline' }}
                      >
                        replay
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </section>

        <section className="features container">
          <h3>Features</h3>
          <div className="grid">
            <div className="feature">
              <h4>Deck building</h4>
              <p>Create custom decks by blending champion synergies and spells to outplay your opponent.</p>
            </div>
            <div className="feature">
              <h4>Ranked play</h4>
              <p>Test your skill in ranked matches and climb the ladder.</p>
            </div>
            <div className="feature">
              <h4>Collect & craft</h4>
              <p>Collect cards, craft new ones, and evolve your favorite champions.</p>
            </div>
          </div>
        </section>
      </main>
      {/* Recent-matches drawer. Clicking a completed match routes to
          /replay/<id>, which renders the persisted engine frames on the
          real GameBoard via setSpectatorOverride. */}
      <ReplayDrawer />
      <Footer />
    </>
  )
}
