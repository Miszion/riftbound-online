'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import RequireAuth from '@/components/auth/RequireAuth'
import {
  useCardCatalog,
  useDecklists,
  useSaveDecklist,
  useDeleteDecklist,
} from '@/hooks/useGraphQL'
import { useAuth } from '@/hooks/useAuth'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

type CatalogCard = {
  id: string
  slug: string
  name: string
  type: string | null
  rarity: string | null
  colors: string[]
  keywords: string[]
  effect: string
  activation?: {
    timing?: string
    stateful?: boolean
  }
  assets?: {
    remote: string | null
    localPath: string
  }
}

type DeckEntry = {
  card: CatalogCard
  quantity: number
}

type SavedDeck = {
  deckId: string
  userId: string
  name: string
  description?: string | null
  cards: { cardId?: string | null; slug?: string | null; quantity: number }[]
  runeDeck?: { cardId?: string | null; slug?: string | null; quantity: number }[]
}

const MIN_DECK_CARDS = 40
const MAX_COPIES = 3
const MAX_RESULTS = 180

const domainFilters = ['all', 'fury', 'calm', 'mind', 'body', 'chaos', 'order']
const typeFilters = ['all', 'creature', 'spell', 'artifact', 'enchantment']
const rarityFilters = ['all', 'common', 'uncommon', 'rare', 'legendary', 'epic', 'promo', 'showcase']

export default function DeckbuilderPage() {
  return (
    <RequireAuth>
      <DeckbuilderView />
    </RequireAuth>
  )
}

function DeckbuilderView() {
  const { user } = useAuth()
  const userId = user?.userId ?? ''
  const displayName = user?.username || user?.email || userId

  const [deckName, setDeckName] = useState('')
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [domainFilter, setDomainFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [rarityFilter, setRarityFilter] = useState('all')
  const [pendingDeck, setPendingDeck] = useState<SavedDeck | null>(null)
  const [focusedCard, setFocusedCard] = useState<CatalogCard | null>(null)
  const [deckEntries, setDeckEntries] = useState<Record<string, DeckEntry>>({})

  const cardCatalogFilter = useMemo(
    () => ({
      limit: MAX_RESULTS,
      search: search.trim() || undefined,
      domain: domainFilter !== 'all' ? domainFilter : undefined,
      type: typeFilter !== 'all' ? typeFilter : undefined,
      rarity: rarityFilter !== 'all' ? rarityFilter : undefined,
    }),
    [search, domainFilter, typeFilter, rarityFilter]
  )

  const {
    data: catalogData,
    loading: catalogLoading,
    error: catalogError,
  } = useCardCatalog(cardCatalogFilter)
  const cards: CatalogCard[] = catalogData?.cardCatalog ?? []

  useEffect(() => {
    if (!focusedCard && cards.length) {
      setFocusedCard(cards[0])
    }
  }, [cards, focusedCard])

  const { data: decklistsData, loading: decklistsLoading, refetch: refetchDecklists } = useDecklists(userId || null)
  const decklists: SavedDeck[] = (decklistsData?.decklists ?? []) as SavedDeck[]

  const [saveDecklist, { loading: savingDeck }] = useSaveDecklist()
  const [deleteDecklist, { loading: deletingDeck }] = useDeleteDecklist()

  const deckCards = useMemo(() => {
    return Object.values(deckEntries).sort((a, b) => a.card.name.localeCompare(b.card.name))
  }, [deckEntries])

  const totalCards = useMemo(() => deckCards.reduce((sum, entry) => sum + entry.quantity, 0), [deckCards])
  const canSaveDeck = Boolean(userId) && deckName.trim().length > 0 && totalCards >= MIN_DECK_CARDS

  const filteredCards = useMemo(() => {
    if (!search.trim()) {
      return cards.slice(0, MAX_RESULTS)
    }
    const term = search.trim().toLowerCase()
    return cards
      .filter((card) => {
        const matchesName = card.name.toLowerCase().includes(term)
        const matchesEffect = card.effect.toLowerCase().includes(term)
        const matchesKeywords = card.keywords?.some((keyword) => keyword.toLowerCase().includes(term))
        return matchesName || matchesEffect || matchesKeywords
      })
      .slice(0, MAX_RESULTS)
  }, [cards, search])

  const resolveCatalogCard = (entry?: { cardId?: string | null; slug?: string | null }) => {
    if (!entry) {
      return undefined
    }
    const entrySlug = entry.slug?.toLowerCase()
    if (entrySlug) {
      const foundBySlug = cards.find((card) => card.slug?.toLowerCase() === entrySlug)
      if (foundBySlug) {
        return foundBySlug
      }
    }
    if (entry.cardId) {
      return cards.find((card) => card.id === entry.cardId)
    }
    return undefined
  }

  useEffect(() => {
    if (pendingDeck && cards.length) {
      const restored: Record<string, DeckEntry> = {}
      pendingDeck.cards?.forEach((entry) => {
        const catalogCard = resolveCatalogCard(entry)
        if (catalogCard) {
          restored[catalogCard.id] = {
            card: catalogCard,
            quantity: Math.min(MAX_COPIES, entry.quantity),
          }
        }
      })
      setDeckEntries(restored)
      setFocusedCard(Object.values(restored)[0]?.card ?? null)
      setPendingDeck(null)
    }
  }, [pendingDeck, cards])

  const handleAddCard = (card: CatalogCard) => {
    setDeckEntries((prev) => {
      const existing = prev[card.id]
      const nextQuantity = Math.min(MAX_COPIES, (existing?.quantity ?? 0) + 1)
      if (existing && existing.quantity === nextQuantity) {
        return prev
      }
      return {
        ...prev,
        [card.id]: {
          card,
          quantity: nextQuantity,
        },
      }
    })
    setFocusedCard(card)
    setStatusMessage(null)
  }

  const handleRemoveCard = (cardId: string) => {
    setDeckEntries((prev) => {
      const existing = prev[cardId]
      if (!existing) {
        return prev
      }
      if (existing.quantity <= 1) {
        const { [cardId]: _omit, ...rest } = prev
        return rest
      }
      return {
        ...prev,
        [cardId]: {
          ...existing,
          quantity: existing.quantity - 1,
        },
      }
    })
  }

  const handleResetDeck = () => {
    setDeckEntries({})
    setDeckName('')
    setActiveDeckId(null)
    setFocusedCard(null)
    setStatusMessage(null)
  }

  const handleLoadDeck = (deck: SavedDeck) => {
    if (!cards.length) {
      setPendingDeck(deck)
    } else {
      const restored: Record<string, DeckEntry> = {}
      deck.cards?.forEach((entry) => {
        const catalogCard = resolveCatalogCard(entry)
        if (catalogCard) {
          restored[catalogCard.id] = {
            card: catalogCard,
            quantity: Math.min(MAX_COPIES, entry.quantity),
          }
        }
      })
      setDeckEntries(restored)
      setFocusedCard(Object.values(restored)[0]?.card ?? null)
    }
    setDeckName(deck.name)
    setActiveDeckId(deck.deckId)
    setStatusMessage(`Loaded ${deck.name}`)
  }

  const handleSaveDeck = async () => {
    if (!canSaveDeck) {
      setStatusMessage('Provide a deck name and at least 40 cards before saving.')
      return
    }

    const payload = {
      deckId: activeDeckId ?? undefined,
      userId: userId.trim(),
      name: deckName.trim(),
      cards: deckCards.map((entry) => ({
        cardId: entry.card.id,
        slug: entry.card.slug,
        quantity: entry.quantity,
      })),
      runeDeck: [],
      isPublic: false,
    }

    try {
      setStatusMessage('Saving deck...')
      const result = await saveDecklist({
        variables: { input: payload },
      })
      if (result.data?.saveDecklist?.deckId) {
        setActiveDeckId(result.data.saveDecklist.deckId)
      }
      await refetchDecklists?.()
      setStatusMessage('Deck saved!')
    } catch (error: any) {
      setStatusMessage(error.message || 'Failed to save deck')
    }
  }

  const handleDeleteDeck = async (deck: SavedDeck) => {
    const confirmed = window.confirm(`Delete deck "${deck.name}"?`)
    if (!confirmed) {
      return
    }

    try {
      setStatusMessage('Deleting deck...')
      await deleteDecklist({
        variables: {
          userId: deck.userId,
          deckId: deck.deckId,
        },
      })
      if (deck.deckId === activeDeckId) {
        handleResetDeck()
      } else {
        setStatusMessage('Deck deleted')
      }
      await refetchDecklists?.()
    } catch (error: any) {
      setStatusMessage(error.message || 'Failed to delete deck')
    }
  }

  return (
    <>
      <Header />
      <main className="deckbuilder container">
        <div className="deckbuilder-header">
          <div>
            <h2>Deck Studio</h2>
            <p className="muted">
              Build, tune, and save decks directly to your Riftbound profile. Click cards to inspect them or add them
              into the grid.
            </p>
          </div>
          <div className="deck-pillar">
            {[
              { label: 'Main', value: totalCards, min: MIN_DECK_CARDS },
              { label: 'Side', value: 0 },
              { label: 'Extra', value: 0 },
            ].map((entry) => (
              <div key={entry.label} className="deck-pillar-segment">
                <span className="deck-pillar-value">{String(entry.value).padStart(2, '0')}</span>
                <span className="deck-pillar-label">{entry.label}</span>
                {entry.min && <span className="deck-pillar-min">min {entry.min}</span>}
              </div>
            ))}
          </div>
        </div>

        <section className="deckbuilder-shell">
          <aside className="card-spotlight">
            <div className="spotlight-card">
              {focusedCard ? (
                <>
                  <div className="spotlight-card-media">
                    {focusedCard.assets?.remote ? (
                      <Image
                        src={focusedCard.assets.remote}
                        alt={focusedCard.name}
                        width={260}
                        height={360}
                        loading="lazy"
                        unoptimized
                      />
                    ) : (
                      <div className="image-fallback large">{focusedCard.name.slice(0, 1)}</div>
                    )}
                  </div>
                  <div className="spotlight-card-body">
                    <h3>{focusedCard.name}</h3>
                    <p className="muted small">{focusedCard.type ?? 'Spell'} · {focusedCard.rarity ?? 'Unknown rarity'}</p>
                    <p className="spotlight-card-text">{focusedCard.effect}</p>
                    {focusedCard.keywords?.length > 0 && (
                      <div className="keyword-row">
                        {focusedCard.keywords.slice(0, 6).map((keyword) => (
                          <span key={keyword} className="pill">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="card-placeholder">Select any card to inspect it.</div>
              )}
            </div>

            <div className="spotlight-meta">
              <label>
                Deck name
                <input
                  type="text"
                  placeholder="Name this deck"
                  value={deckName}
                  onChange={(event) => setDeckName(event.target.value)}
                />
              </label>
              <div className="user-context">
                <span className="muted small">Signed in as</span>
                <strong>{displayName}</strong>
                <span className="muted small">User ID: {userId}</span>
              </div>
              <div className="spotlight-actions">
                <button className="btn-link" onClick={handleResetDeck}>
                  New deck
                </button>
                <button className="cta" disabled={!canSaveDeck || savingDeck} onClick={handleSaveDeck}>
                  {savingDeck ? 'Saving…' : activeDeckId ? 'Update deck' : 'Save deck'}
                </button>
              </div>
              <div className="status-message" aria-live="polite">
                {statusMessage}
              </div>
            </div>

            <div className="saved-decks-panel">
              <div className="panel-heading">
                <h4>Saved decks</h4>
                {decklistsLoading && <LoadingSpinner size="sm" />}
              </div>
              {!userId && <p className="muted small">Sign in to load saved decks.</p>}
              {userId && !decklistsLoading && decklists.length === 0 && (
                <p className="muted small">No decks saved yet.</p>
              )}
              <ul>
                {decklists.map((deck) => (
                  <li key={deck.deckId}>
                    <button onClick={() => handleLoadDeck(deck)} className="saved-deck-button">
                      <strong>{deck.name}</strong>
                      <span className="muted small">{deck.cards?.length ?? 0} cards</span>
                    </button>
                    <button onClick={() => handleDeleteDeck(deck)} disabled={deletingDeck}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <section className="deck-canvas">
            <div className="deck-track deck-track-main">
              <div className="panel-heading">
                <h3>Main deck</h3>
                <span className="muted small">
                  {totalCards} / {MIN_DECK_CARDS}
                </span>
              </div>
              {totalCards < MIN_DECK_CARDS && (
                <p className="muted small">Add {MIN_DECK_CARDS - totalCards} more card(s) to hit the minimum.</p>
              )}
              <div className="deck-grid">
                {deckCards.map(({ card, quantity }) => (
                  <div
                    key={card.id}
                    className="deck-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => setFocusedCard(card)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setFocusedCard(card)
                      }
                    }}
                  >
                    <div className="deck-card-thumb">
                      {card.assets?.remote ? (
                        <Image
                          src={card.assets.remote}
                          alt={card.name}
                          width={80}
                          height={110}
                          loading="lazy"
                          unoptimized
                        />
                      ) : (
                        <div className="image-fallback">{card.name.slice(0, 1)}</div>
                      )}
                      <span className="deck-card-qty">{quantity}x</span>
                    </div>
                    <div className="deck-card-meta">
                      <strong>{card.name}</strong>
                      <span className="muted small">{card.type ?? 'Spell'}</span>
                    </div>
                    <div className="deck-card-controls">
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          handleRemoveCard(card.id)
                        }}
                      >
                        −
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          handleAddCard(card)
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
                {!deckCards.length && !catalogLoading && (
                  <div className="card-placeholder muted small">Select cards from the search panel to start building.</div>
                )}
              </div>
            </div>

            <div className="deck-track deck-track-side">
              <div className="panel-heading">
                <h3>Side deck</h3>
                <span className="muted small">Coming soon</span>
              </div>
              <p className="muted small">Side deck management will arrive in a future update.</p>
            </div>

            <div className="deck-track deck-track-extra">
              <div className="panel-heading">
                <h3>Extra deck</h3>
                <span className="muted small">Coming soon</span>
              </div>
              <p className="muted small">Keep an eye on this space for rune / extra deck tools.</p>
            </div>
          </section>

          <aside className="search-panel">
            <div className="panel-heading">
              <h3>Search catalog</h3>
              {catalogLoading && <LoadingSpinner size="sm" />}
            </div>
            {catalogError && <p className="error small">Failed to load cards. Try again later.</p>}
            <form className="search-form" onSubmit={(event) => event.preventDefault()}>
              <label>
                Search
                <input
                  type="text"
                  placeholder="Card name, keyword, effect"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label>
                Domain
                <select value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)}>
                  {domainFilters.map((domain) => (
                    <option key={domain} value={domain}>
                      {domain === 'all' ? 'All domains' : domain}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  {typeFilters.map((type) => (
                    <option key={type} value={type}>
                      {type === 'all' ? 'All types' : type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Rarity
                <select value={rarityFilter} onChange={(event) => setRarityFilter(event.target.value)}>
                  {rarityFilters.map((rarity) => (
                    <option key={rarity} value={rarity}>
                      {rarity === 'all' ? 'All rarities' : rarity}
                    </option>
                  ))}
                </select>
              </label>
            </form>

            <div className="search-results">
              {filteredCards.map((card) => (
                <article
                  key={card.id}
                  className="search-result-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleAddCard(card)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleAddCard(card)
                    }
                  }}
                >
                  <div className="search-card-header">
                    <strong>{card.name}</strong>
                    <span className="pill">{card.type ?? 'Spell'}</span>
                  </div>
                  <p className="search-card-effect">{card.effect}</p>
                  <div className="search-card-tags">
                    {card.keywords?.slice(0, 3).map((keyword) => (
                      <span key={keyword} className="pill muted">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
              {!filteredCards.length && !catalogLoading && (
                <p className="muted small">No cards match your filters.</p>
              )}
            </div>
          </aside>
        </section>
      </main>
      <Footer />
    </>
  )
}
