'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ReplayDrawer from '@/components/ReplayDrawer'
import { useStartBotMatch } from '@/hooks/useGraphQL'

// Backend BE-5 asserts these are the five strategies the engine supports
// (StartBotMatchResult.availableStrategies). We seed the dropdowns with the
// same five so the page works before the first mutation completes, and we
// replace the list from the response on submit so a future backend change
// (new strategy added, old one removed) flows through without a code change.
const DEFAULT_STRATEGIES = ['baseline', 'heuristic', 'random', 'aggro', 'control'] as const
const DEFAULT_STRATEGY_A = 'aggro'
const DEFAULT_STRATEGY_B = 'control'

export default function Home() {
  const router = useRouter()
  const [startBotMatch, { loading: startingBotMatch }] = useStartBotMatch()
  const [botError, setBotError] = useState<string | null>(null)
  const [strategyA, setStrategyA] = useState<string>(DEFAULT_STRATEGY_A)
  const [strategyB, setStrategyB] = useState<string>(DEFAULT_STRATEGY_B)
  const [availableStrategies, setAvailableStrategies] = useState<string[]>([
    ...DEFAULT_STRATEGIES,
  ])

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
      // Replace the dropdown options from the backend's reply so any future
      // change to the supported strategy list is reflected here without a
      // frontend redeploy. Defaults stay if the field is missing.
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
      router.push(spectatorPath)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error starting bots.'
      setBotError(message)
    }
  }

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
          real GameBoard via setSpectatorOverride. The drawer itself was
          shipped in PR #1 ("mount replay drawer inside the gameboard");
          mounting it here brings the same entry point to the homepage. */}
      <ReplayDrawer />
      <Footer />
    </>
  )
}
