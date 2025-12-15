'use client'

import { useEffect, useMemo, useState } from 'react'

type CatalogCard = {
  id: string
  slug: string
  name: string
  rarity?: string | null
  assets?: {
    remote?: string | null
    localPath?: string
  }
  effect?: string
  keywords?: string[]
}

type SpectatorCard = {
  cardId: string
  name: string
  type?: string
  power?: number
  toughness?: number
}

type SpectatorBoard = {
  creatures: SpectatorCard[]
  artifacts: SpectatorCard[]
  enchantments: SpectatorCard[]
}

type SpectatorPlayer = {
  playerId: string
  victoryPoints: number
  victoryScore?: number
  mana: number
  maxMana: number
  hand: SpectatorCard[]
  board: SpectatorBoard
  graveyard: SpectatorCard[]
}

type SpectatorState = {
  matchId: string
  players: SpectatorPlayer[]
  victoryScore?: number
  currentPhase: string
  turnNumber: number
  moveHistory?: any[]
}

type GameViewerProps = {
  state?: SpectatorState | null
  moves?: any[] | null
  catalogIndex?: Record<string, CatalogCard>
  title?: string
}

const rarityClass = (meta?: CatalogCard) => {
  const rarity = meta?.rarity?.toLowerCase()
  if (!rarity) return 'rarity-common'
  return `rarity-${rarity}`
}

const cardMetaLookup = (
  card: SpectatorCard,
  catalogIndex?: Record<string, CatalogCard>,
) => {
  if (!catalogIndex) return undefined
  return (
    catalogIndex[card.cardId] ||
    catalogIndex[card.name.toLowerCase()] ||
    undefined
  )
}

const formatMove = (move: any) => {
  const action = (move?.action || '').replace(/_/g, ' ')
  const phase = move?.phase ? `— ${move.phase}` : ''
  const cardId = move?.cardId ? `(${move.cardId})` : ''
  return `Turn ${move?.turn ?? '?'} ${phase} · ${action} ${cardId}`
}

export default function GameViewer({
  state,
  moves,
  catalogIndex,
  title,
}: GameViewerProps) {
  const [activeMove, setActiveMove] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)

  useEffect(() => {
    if (!autoPlay) return
    const id = setInterval(() => {
      setActiveMove((prev) => {
        if (!moves || prev >= moves.length - 1) {
          return prev
        }
        return prev + 1
      })
    }, 1800)
    return () => clearInterval(id)
  }, [autoPlay, moves])

  useEffect(() => {
    setActiveMove(0)
  }, [moves])

  if (!state) {
    return (
      <div className="game-viewer empty">
        <p className="muted small">No game state available.</p>
      </div>
    )
  }

  return (
    <div className="game-viewer">
      <header className="game-viewer-header">
        <div>
          <h3>{title ?? 'Game Viewer'}</h3>
          <p className="muted small">
            Match {state.matchId} · Turn {state.turnNumber} · Phase{' '}
            {state.currentPhase}
          </p>
        </div>
        {moves && moves.length > 0 && (
          <div className="timeline-controls">
            <button
              onClick={() => setAutoPlay((current) => !current)}
              className="btn secondary"
            >
              {autoPlay ? 'Pause' : 'Auto-play'}
            </button>
            <button
              onClick={() =>
                setActiveMove((prev) => Math.max(0, prev - 1))
              }
              className="btn secondary"
            >
              ‹ Prev
            </button>
            <button
              onClick={() =>
                setActiveMove((prev) =>
                  moves ? Math.min(moves.length - 1, prev + 1) : prev,
                )
              }
              className="btn secondary"
            >
              Next ›
            </button>
          </div>
        )}
      </header>

      <section className="game-viewer-body">
        {state.players?.map((player) => (
          <div key={player.playerId} className="player-panel">
            <div className="player-header">
              <div>
                <h4>{player.playerId}</h4>
                <p className="muted small">
                  Score {player.victoryPoints}/
                  {player.victoryScore ?? state.victoryScore ?? 8} · Mana{' '}
                  {player.mana}/{player.maxMana}
                </p>
                <p className="muted small">
                  Graveyard: {player.graveyard?.length ?? 0} cards
                </p>
              </div>
            </div>
            <div className="board-row">
              <ZoneDisplay
                title="Creatures"
                cards={player.board?.creatures || []}
                catalogIndex={catalogIndex}
              />
              <ZoneDisplay
                title="Artifacts"
                cards={player.board?.artifacts || []}
                catalogIndex={catalogIndex}
              />
              <ZoneDisplay
                title="Enchantments"
                cards={player.board?.enchantments || []}
                catalogIndex={catalogIndex}
              />
            </div>
            <div className="hand-row">
              <ZoneDisplay
                title="Hand"
                cards={player.hand || []}
                catalogIndex={catalogIndex}
                compact
              />
            </div>
          </div>
        ))}
      </section>

      {moves && moves.length > 0 && (
        <section className="timeline">
          <h4>Move Timeline</h4>
          <div className="timeline-list">
            {moves.map((move, index) => (
              <button
                key={`${move.turn}-${move.action}-${index}`}
                className={`timeline-item ${
                  index === activeMove ? 'active' : ''
                }`}
                onClick={() => {
                  setActiveMove(index)
                  setAutoPlay(false)
                }}
              >
                {formatMove(move)}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

type ZoneDisplayProps = {
  title: string
  cards: SpectatorCard[]
  catalogIndex?: Record<string, CatalogCard>
  compact?: boolean
}

function ZoneDisplay({
  title,
  cards,
  catalogIndex,
  compact,
}: ZoneDisplayProps) {
  return (
    <div className="zone">
      <div className="zone-title">
        {title} ({cards.length})
      </div>
      <div className={`zone-cards ${compact ? 'compact' : ''}`}>
        {cards.map((card, index) => {
          const meta = cardMetaLookup(card, catalogIndex)
          return (
            <div
              key={`${card.cardId}-${card.name}-${index}`}
              className={`card-visual ${rarityClass(meta)}`}
            >
              <div
                className="card-art"
                style={
                  meta?.assets?.remote
                    ? {
                        backgroundImage: `url(${meta.assets.remote})`,
                      }
                    : undefined
                }
              />
              <div className="card-info">
                <strong>{card.name}</strong>
                <span className="muted small">
                  {card.type || 'Spell'} ·{' '}
                  {card.power !== undefined && card.toughness !== undefined
                    ? `${card.power}/${card.toughness}`
                    : '—'}
                </span>
              </div>
            </div>
          )
        })}
        {cards.length === 0 && (
          <div className="muted small">No cards</div>
        )}
      </div>
    </div>
  )
}
