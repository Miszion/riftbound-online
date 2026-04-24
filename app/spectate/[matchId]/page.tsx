'use client'

import { useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import GameBoard from '@/components/GameBoard'
import { useAuth } from '@/hooks/useAuth'
import { useActiveBotMatches, useMatch } from '@/hooks/useGraphQL'

type BotMatchSummary = {
  matchId: string
  players?: string[] | null
  strategies?: string[] | null
  status?: string | null
}

/**
 * Live spectate page for a single match.
 *
 * Route: /spectate/[matchId]
 *
 * Public, no RequireAuth wrapper. Anyone with the link can watch a bot
 * match (or any in-progress match) play out on the real GameBoard, fed by
 * the gameStateChanged subscription that the engine publishes after every
 * dispatched action. The scrubber + pause controls live inside GameBoard
 * (see components/GameBoard.tsx spectator-mode ReplayControls wiring).
 *
 * The board needs a `playerId` to seed perspective even though spectator
 * mode skips the player-scoped query and subscription. We resolve the first
 * bot's id from the match query (match.players[0]); if the query has not
 * resolved yet we fall back to the signed-in viewer's id (which is fine,
 * spectator mode does not use it for any backend call), and finally to an
 * empty string. GameBoard's spectator branch zeroes out livePlayerId
 * regardless, so this is purely a perspective hint.
 */
export default function SpectateMatchPage() {
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
    if (segments.length >= 2 && segments[0] === 'spectate') {
      return segments[1] ?? ''
    }
    return ''
  }, [searchParams, pathname])

  const { data: matchData } = useMatch(matchId || null)
  const firstBotPlayerId: string | undefined = matchData?.match?.players?.[0]?.playerId

  // Poll activeBotMatches every 5s so the strategy header updates quickly
  // when a match the user just started enters the list. Once matchId is
  // resolved and we have its strategies, polling overhead is negligible
  // (one cheap in-memory list read on the backend).
  const { data: botMatchesData } = useActiveBotMatches({
    pollMs: matchId ? 5_000 : undefined,
  })

  const { strategyA, strategyB, playerA, playerB } = useMemo(() => {
    const matches: BotMatchSummary[] = botMatchesData?.activeBotMatches ?? []
    const summary = matches.find((m) => m.matchId === matchId) ?? null
    const strategies = Array.isArray(summary?.strategies) ? summary!.strategies! : []
    const summaryPlayers = Array.isArray(summary?.players) ? summary!.players! : []
    // Backend emits bot player ids as `bot-<strategy>-<suffix>`; fall back to
    // parsing that shape so a match that's already dropped out of the active
    // list still surfaces strategies in the HUD.
    const fallbackStrategyFromId = (id?: string | null): string | null => {
      if (!id) return null
      const match = /^bot-([a-zA-Z]+)-/.exec(id)
      return match?.[1] ?? null
    }
    const players = summaryPlayers.length > 0
      ? summaryPlayers
      : (matchData?.match?.players ?? []).map((p: any) => p?.playerId).filter(Boolean)
    const stratA = strategies[0] ?? fallbackStrategyFromId(players[0]) ?? null
    const stratB = strategies[1] ?? fallbackStrategyFromId(players[1]) ?? null
    return {
      strategyA: stratA,
      strategyB: stratB,
      playerA: players[0] ?? null,
      playerB: players[1] ?? null,
    }
  }, [botMatchesData, matchData, matchId])

  if (!matchId) {
    return (
      <main className="game-screen container">
        <div className="queue-waiting" aria-live="polite">
          <strong>No match id in the URL.</strong>
          <span>Open a /spectate link from the homepage or the recent matches list.</span>
        </div>
      </main>
    )
  }

  const perspectivePlayerId = firstBotPlayerId ?? user?.userId ?? ''
  const hasStrategyLabels = Boolean(strategyA || strategyB)

  return (
    <main className="game-screen container">
      {hasStrategyLabels && (
        <div
          className="spectate-hud"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '8px 16px',
            fontSize: 14,
            color: '#f4f6fb',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
          aria-live="polite"
        >
          <strong style={{ opacity: 0.9 }}>Bot A</strong>
          <span style={{ opacity: 0.7 }}>
            {playerA ?? '-'}
            {strategyA ? ` (${strategyA})` : ''}
          </span>
          <span style={{ opacity: 0.5 }}>vs</span>
          <strong style={{ opacity: 0.9 }}>Bot B</strong>
          <span style={{ opacity: 0.7 }}>
            {playerB ?? '-'}
            {strategyB ? ` (${strategyB})` : ''}
          </span>
        </div>
      )}
      <div className="game-screen__board">
        <GameBoard
          matchId={matchId}
          playerId={perspectivePlayerId}
          spectator
        />
      </div>
    </main>
  )
}
