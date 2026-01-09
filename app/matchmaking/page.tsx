'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import RequireAuth from '@/components/auth/RequireAuth'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import {
  useJoinMatchmakingQueue,
  useLeaveMatchmakingQueue,
  useMatchmakingStatus,
  useDecklists,
  useInitMatch,
} from '@/hooks/useGraphQL'
import { useAuth } from '@/hooks/useAuth'
import useToasts from '@/hooks/useToasts'

type DeckCardSnapshot = {
  cardId?: string | null
  slug?: string | null
  name?: string | null
  type?: string | null
  rarity?: string | null
  colors?: string[] | null
  keywords?: string[] | null
  effect?: string | null
  assets?: {
    remote?: string | null
    localPath?: string | null
  } | null
}

type DeckCardEntry = {
  cardId?: string | null
  slug?: string | null
  quantity?: number | null
  cardSnapshot?: DeckCardSnapshot | null
}

type DeckSummary = {
  deckId: string
  name: string
  description?: string | null
  format?: string | null
  isDefault?: boolean | null
  cardCount?: number | null
  cards?: DeckCardEntry[]
  runeDeck?: DeckCardEntry[]
  battlefields?: DeckCardEntry[]
  sideDeck?: DeckCardEntry[]
  championLegend?: DeckCardEntry | null
  championLeader?: DeckCardEntry | null
}

type MatchMode = 'ranked' | 'free'

const MIN_DECK_SIZE = 39
const MIN_RUNE_DECK_SIZE = 12

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

type SerializedDeck = {
  deckId: string
  name: string
  format?: string | null
  cardCount?: number | null
  cards?: { cardId?: string | null; slug?: string | null; quantity?: number | null }[]
  runeDeck?: { cardId?: string | null; slug?: string | null; quantity?: number | null }[]
  battlefields?: { cardId?: string | null; slug?: string | null; quantity?: number | null }[]
  sideDeck?: { cardId?: string | null; slug?: string | null; quantity?: number | null }[]
  championLegend?: { cardId?: string | null; slug?: string | null; quantity?: number | null } | null
  championLeader?: { cardId?: string | null; slug?: string | null; quantity?: number | null } | null
}

const simplifyEntry = (entry?: DeckCardEntry | null) => {
  if (!entry) {
    return undefined
  }
  return {
    cardId: entry.cardId ?? entry.cardSnapshot?.cardId ?? null,
    slug: entry.slug ?? entry.cardSnapshot?.slug ?? null,
    quantity: entry.quantity ?? null,
  }
}

const simplifyCollection = (entries?: DeckCardEntry[]) => {
  if (!entries?.length) {
    return undefined
  }
  return entries
    .map((entry) => simplifyEntry(entry))
    .filter((entry): entry is NonNullable<ReturnType<typeof simplifyEntry>> => Boolean(entry))
}

const serializeDeckForMatch = (deck?: DeckSummary | null): SerializedDeck | undefined => {
  if (!deck) {
    return undefined
  }
  const simplifiedCards = simplifyCollection(deck.cards)
  const simplifiedRunes = simplifyCollection(deck.runeDeck)
  return {
    deckId: deck.deckId,
    name: deck.name,
    format: deck.format,
    cardCount: deck.cardCount ?? null,
    cards: simplifiedCards,
    runeDeck: simplifiedRunes,
    battlefields: simplifyCollection(deck.battlefields),
    sideDeck: simplifyCollection(deck.sideDeck),
    championLegend: simplifyEntry(deck.championLegend ?? undefined),
    championLeader: simplifyEntry(deck.championLeader ?? undefined),
  }
}

const buildDecksPayload = (
  userId: string,
  opponentId: string | null,
  playerDeck?: SerializedDeck,
) => {
  const payload: Record<string, unknown> = {}
  if (playerDeck) {
    payload[userId] = playerDeck
  }
  if (opponentId) {
    payload[opponentId] = payload[opponentId] ?? { deckId: '__opponent_pending__' }
  }
  return payload
}

export default function MatchmakingPage() {
  return (
    <RequireAuth>
      <MatchmakingContent />
    </RequireAuth>
  )
}

function MatchmakingContent() {
  const { user } = useAuth()
  const router = useRouter()
  const userId = user?.userId ?? ''
  const [selectedDeckId, setSelectedDeckId] = useState('')
  const [mode, setMode] = useState<MatchMode>('free')
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null)
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null)
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null)
  const [matchCountdown, setMatchCountdown] = useState<number | null>(null)
  const [matchInitState, setMatchInitState] = useState<Record<
    string,
    'pending' | 'success' | 'error'
  >>({})
  const { pushToast } = useToasts()
  const lastAnnouncedMatchId = useRef<string | null>(null)
  const redirectedMatchId = useRef<string | null>(null)
  const {
    data: deckData,
    loading: decksLoading,
    error: deckError,
  } = useDecklists(userId || null)
  const decklists = (deckData?.decklists ?? []) as DeckSummary[]
  const selectedDeck = decklists.find((deck) => deck.deckId === selectedDeckId)
  const serializedSelectedDeck = useMemo(
    () => serializeDeckForMatch(selectedDeck),
    [selectedDeck],
  )
  const serializedDeckCardTotal = useMemo(() => {
    if (!serializedSelectedDeck?.cards?.length) {
      return 0
    }
    return serializedSelectedDeck.cards.reduce(
      (sum, entry) => sum + (entry.quantity ?? 0),
      0,
    )
  }, [serializedSelectedDeck])
  const serializedRuneCardTotal = useMemo(() => {
    if (!serializedSelectedDeck?.runeDeck?.length) {
      return 0
    }
    return serializedSelectedDeck.runeDeck.reduce(
      (sum, entry) => sum + (entry.quantity ?? 0),
      0,
    )
  }, [serializedSelectedDeck])
  const deckHasRequiredCards = serializedDeckCardTotal >= MIN_DECK_SIZE
  const deckHasRequiredRunes = serializedRuneCardTotal >= MIN_RUNE_DECK_SIZE
  const deckPayloadReady = Boolean(
    serializedSelectedDeck && deckHasRequiredCards && deckHasRequiredRunes,
  )
  const activeMatchInitStatus = activeMatchId ? matchInitState[activeMatchId] : undefined
  const pendingMatchInitStatus = pendingMatchId ? matchInitState[pendingMatchId] : undefined
  const currentMatchInitStatus = pendingMatchInitStatus ?? activeMatchInitStatus ?? null
  const liveMatchReady =
    Boolean(activeMatchId && activePlayerId && activeMatchInitStatus !== 'pending')
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
  const isQueued = Boolean(status?.queued)
  const userMmrDisplay =
    typeof status?.mmr === 'number' && Number.isFinite(status.mmr) ? status.mmr : '—'

  const [joinQueue, { loading: joining }] = useJoinMatchmakingQueue()
  const [leaveQueue, { loading: leaving }] = useLeaveMatchmakingQueue()
  const [initMatchMutation] = useInitMatch()

  const actionDisabled =
    !userId || joining || leaving || !selectedDeckId || isQueued || !deckPayloadReady
  const selectedMode = useMemo(
    () => MODES.find((entry) => entry.value === mode),
    [mode],
  )

  const cleanupMatchState = useCallback(() => {
    setPendingMatchId(null)
    setMatchCountdown(null)
    setActiveMatchId(null)
    setActivePlayerId(null)
    redirectedMatchId.current = null
  }, [])

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

  useEffect(() => {
    if (!status?.matchId || status.queued || !userId || !deckPayloadReady || !serializedSelectedDeck) {
      return
    }
    const opponentId = status.opponentId ?? null
    if (!opponentId) {
      return
    }
    const matchId = status.matchId
    const currentState = matchInitState[matchId]
    if (
      currentState === 'pending' ||
      currentState === 'success' ||
      currentState === 'error'
    ) {
      return
    }
    const isPrimary = userId.localeCompare(opponentId) <= 0
    if (!isPrimary) {
      return
    }
    setMatchInitState((previous) => ({ ...previous, [matchId]: 'pending' }))
    const decksPayload = buildDecksPayload(userId, opponentId, serializedSelectedDeck)
    initMatchMutation({
      variables: {
        matchId,
        player1: userId,
        player2: opponentId,
        decks: decksPayload,
      },
    })
      .then(() => {
        setMatchInitState((previous) => ({ ...previous, [matchId]: 'success' }))
      })
      .catch(async (error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Failed to initialize match. Please retry.'
        pushToast(message, 'error')
        setMatchInitState((previous) => ({ ...previous, [matchId]: 'error' }))
        cleanupMatchState()
        if (userId && isQueued) {
          try {
            await leaveQueue({
              variables: {
                userId,
                mode,
              },
            })
          } catch (leaveError) {
            console.error('Failed to leave queue after match init failure', leaveError)
          } finally {
            await refetchStatus()
          }
        }
      })
  }, [
    initMatchMutation,
    matchInitState,
    serializedSelectedDeck,
    status?.matchId,
    status?.opponentId,
    status?.queued,
    userId,
    pushToast,
    leaveQueue,
    isQueued,
    mode,
    refetchStatus,
    cleanupMatchState,
    deckPayloadReady,
  ])

  const statusSummary = useMemo(() => {
    if (!status) {
      return ''
    }
    if (status.matchId && !status.queued) {
      return `Match found! Opponent: ${status.opponentName ?? 'pending'}`
    }
    if (status.queued) {
      return `Queued (${selectedMode?.label ?? mode}). Estimated wait: ${
        status.estimatedWaitSeconds ?? '?'
      }s`
    }
    return ''
  }, [status, mode, selectedMode])

  const showQueueMessage = isQueued

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

  useEffect(() => {
    if (!status?.matchId || status.queued || !userId) {
      return
    }
    if (pendingMatchId || matchCountdown !== null) {
      return
    }
    if (activeMatchId === status.matchId && activePlayerId) {
      return
    }
    setActiveMatchId(status.matchId)
    setActivePlayerId(userId)
  }, [
    status?.matchId,
    status?.queued,
    userId,
    pendingMatchId,
    matchCountdown,
    activeMatchId,
    activePlayerId,
  ])

  useEffect(() => {
    if (!liveMatchReady || !activeMatchId) {
      return
    }
    if (redirectedMatchId.current === activeMatchId) {
      return
    }
    redirectedMatchId.current = activeMatchId
    const target = new URLSearchParams({ matchId: activeMatchId })
    router.push(`/game?${target.toString()}`)
  }, [liveMatchReady, activeMatchId, router])

  const handleJoin = async () => {
    if (!userId) {
      pushToast('Sign in before queueing.', 'warning')
      return
    }
    if (!selectedDeckId) {
      pushToast('Select a deck before joining the queue.', 'warning')
      return
    }
    if (!deckPayloadReady || !serializedSelectedDeck) {
      const mainCountMessage = deckHasRequiredCards
        ? null
        : `Main deck needs ${MIN_DECK_SIZE} cards (currently ${serializedDeckCardTotal}).`
      const runeCountMessage = deckHasRequiredRunes
        ? null
        : `Rune deck needs ${MIN_RUNE_DECK_SIZE} runes (currently ${serializedRuneCardTotal}).`
      const detail = [mainCountMessage, runeCountMessage].filter(Boolean).join(' ')
      pushToast(
        detail || 'Selected deck data is still loading. Please try again in a moment.',
        'warning',
      )
      return
    }
    if (isQueued) {
      pushToast('You are already in the queue. Leave before joining again.', 'warning')
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
    if (!isQueued) {
      pushToast('You are not currently in a queue.', 'warning')
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
              <span className="muted small">MMR: {userMmrDisplay}</span>
              {isQueued && (
                <span className="muted small" aria-live="polite">
                  Currently queued
                </span>
              )}
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
                <div className="deck-select-control">
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
                </div>
                {selectedDeck && (
                  <p className="muted small">
                    {selectedDeck.cardCount ?? 0} cards ·{' '}
                    {selectedDeck.format ?? 'standard'}
                  </p>
                )}
                {selectedDeck && !deckHasRequiredCards && (
                  <p className="muted small" aria-live="polite">
                    Deck must include at least {MIN_DECK_SIZE} cards. Currently has{' '}
                    {serializedDeckCardTotal}.
                  </p>
                )}
                {selectedDeck && !deckHasRequiredRunes && (
                  <p className="muted small" aria-live="polite">
                    Rune deck must include {MIN_RUNE_DECK_SIZE} runes. Currently has{' '}
                    {serializedRuneCardTotal}.
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
            disabled={!userId || leaving || !isQueued}
          >
            {leaving ? 'Leaving…' : 'Leave Queue'}
          </button>
        </section>

        <section className="matchmaking-status">
          <h3>Status</h3>
          {statusSummary && <p>{statusSummary}</p>}
          {status && (
            <div className="status-grid">
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
        {currentMatchInitStatus === 'pending' ? (
          <div className="queue-waiting" aria-live="polite">
            <LoadingSpinner size="sm" label="Preparing arena" />
            <span>Match found! Initializing the arena…</span>
          </div>
        ) : matchCountdown !== null && pendingMatchId ? (
          <div className="queue-waiting" aria-live="polite">
            <LoadingSpinner size="sm" label="Match starting soon" />
            <span>Match found! Launching in {matchCountdown}s…</span>
          </div>
        ) : (
          showQueueMessage && (
            <div className="queue-waiting" aria-live="polite">
              <LoadingSpinner size="sm" label="Searching for opponent" />
              <span>
                Queued for {selectedMode?.label ?? mode}. Searching for an opponent…
              </span>
            </div>
          )
        )}
        {liveMatchReady && activeMatchId && (
          <div className="queue-waiting" aria-live="polite">
            <LoadingSpinner size="sm" label="Launching duel" />
            <span>Match ready! Redirecting to the arena…</span>
          </div>
        )}
      </main>
      <Footer />
    </>
  )
}
