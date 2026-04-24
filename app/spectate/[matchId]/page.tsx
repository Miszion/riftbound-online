'use client'

import { useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import GameBoard from '@/components/GameBoard'
import { useAuth } from '@/hooks/useAuth'
import { useMatch } from '@/hooks/useGraphQL'

/**
 * Live spectate page for a single match.
 *
 * Route: /spectate/[matchId]
 *
 * Public, no RequireAuth wrapper. Anyone with the link can watch a bot
 * match (or any in-progress match) play out on the real GameBoard, fed by
 * the gameStateChanged subscription that the engine publishes after every
 * dispatched action.
 *
 * The board needs a `playerId` to seed perspective even though spectator
 * mode skips the player-scoped query and subscription. We resolve the first
 * bot's id from the match query (match.players[0]); if the query has not
 * resolved yet we fall back to the signed-in viewer's id (which is fine,
 * spectator mode does not use it for any backend call), and finally to an
 * empty string. GameBoard's spectator branch (GameBoard.tsx around 2548)
 * zeroes out livePlayerId regardless, so this is purely a perspective hint.
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

  return (
    <main className="game-screen container">
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
