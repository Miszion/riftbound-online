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
const MAX_RESULTS = 120

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
  const cardCatalogFilter = useMemo(() => ({ limit: 600 }), [])
  const { data: catalogData, loading: catalogLoading, error: catalogError } = useCardCatalog(cardCatalogFilter)
  const cards: CatalogCard[] = catalogData?.cardCatalog ?? []

  const userId = user?.userId ?? ''
  const [deckName, setDeckName] = useState('')
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [domainFilter, setDomainFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [rarityFilter, setRarityFilter] = useState('all')
  const [pendingDeck, setPendingDeck] = useState<SavedDeck | null>(null)

  const [deckEntries, setDeckEntries] = useState<Record<string, DeckEntry>>({})

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
    const term = search.trim().toLowerCase()
    return cards
      .filter((card) => {
        if (term) {
          const matchesName = card.name.toLowerCase().includes(term)
          const matchesEffect = card.effect.toLowerCase().includes(term)
          const matchesKeywords = card.keywords?.some((keyword) => keyword.toLowerCase().includes(term))
          if (!matchesName && !matchesEffect && !matchesKeywords) {
            return false
          }
        }

        if (domainFilter !== 'all') {
          const matchesDomain = card.colors?.some((color) => color.toLowerCase() === domainFilter)
          if (!matchesDomain) {
            return false
          }
        }

        if (typeFilter !== 'all' && card.type?.toLowerCase() !== typeFilter) {
          return false
        }

        if (rarityFilter !== 'all' && card.rarity?.toLowerCase() !== rarityFilter) {
          return false
        }

        return true
      })
      .slice(0, MAX_RESULTS)
  }, [cards, search, domainFilter, typeFilter, rarityFilter])

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
            <h2>Deckbuilder</h2>
            <p className="muted">
              Browse the card catalog, drag cards into your list, and save decks directly to your Riftbound profile.
            </p>
          </div>
          <div className="status-message" aria-live="polite">
            {statusMessage}
          </div>
        </div>

        <section className="deckbuilder-controls">
          <div className="user-context">
            <span className="muted small">Signed in as</span>
            <strong>{user?.email ?? userId}</strong>
            <span className="muted small">User ID: {userId}</span>
          </div>
          <label>
            Deck name
            <input
              type="text"
              placeholder="Name this deck"
              value={deckName}
              onChange={(event) => setDeckName(event.target.value)}
            />
          </label>
          <label>
            Search catalog
            <input
              type="text"
              placeholder="Card name, effect, keyword"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="filter-row">
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
          </div>
        </section>

        <section className="deckbuilder-layout">
          <div className="catalog-panel">
            <div className="panel-heading">
              <h3>Card catalog</h3>
              {catalogLoading && <span className="muted small">Loading cards…</span>}
              {catalogError && <span className="error">Failed to load cards.</span>}
            </div>
            <div className="card-catalog-grid">
              {filteredCards.map((card) => (
                <article
                  key={card.id}
                  className="card-preview"
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
                  <div className="card-image">
                    {card.assets?.remote ? (
                      <Image
                        src={card.assets.remote}
                        alt={card.name}
                        width={180}
                        height={250}
                        loading="lazy"
                        unoptimized
                      />
                    ) : (
                      <div className="image-fallback">{card.name.slice(0, 1)}</div>
                    )}
                  </div>
                  <div className="card-info">
                    <div className="card-title-row">
                      <h4>{card.name}</h4>
                      <span className="pill">{card.type ?? 'Spell'}</span>
                    </div>
                    <p className="muted small">{card.effect}</p>
                    <div className="keyword-row">
                      {card.keywords?.slice(0, 3).map((keyword) => (
                        <span key={keyword} className="pill muted">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
              {!filteredCards.length && !catalogLoading && (
                <p className="muted small">No cards match your filters.</p>
              )}
            </div>
          </div>

          <div className="deck-panel">
            <div className="panel-heading">
              <h3>Deck list ({totalCards} / {MIN_DECK_CARDS})</h3>
              <div className="deck-panel-actions">
                <button className="btn-link" onClick={handleResetDeck}>
                  New deck
                </button>
                <button
                  className="cta"
                  disabled={!canSaveDeck || savingDeck}
                  onClick={handleSaveDeck}
                >
                  {savingDeck ? 'Saving…' : activeDeckId ? 'Update deck' : 'Save deck'}
                </button>
              </div>
            </div>
            {totalCards < MIN_DECK_CARDS && (
              <p className="muted small">
                Add {MIN_DECK_CARDS - totalCards} more card(s) to hit the minimum deck size.
              </p>
            )}
            <ul className="decklist">
              {deckCards.map(({ card, quantity }) => (
                <li key={card.id}>
                  <div>
                    <strong>{card.name}</strong>
                    <span className="muted small">
                      {card.type ?? 'Spell'} · {card.colors?.join(', ') || 'Neutral'}
                    </span>
                  </div>
                  <div className="deck-controls">
                    <button onClick={() => handleRemoveCard(card.id)}>-</button>
                    <span>{quantity}</span>
                    <button onClick={() => handleAddCard(card)}>+</button>
                  </div>
                </li>
              ))}
              {!deckCards.length && <li className="muted small">Select cards to start building your deck.</li>}
            </ul>

            <div className="saved-decks">
              <h4>Saved decks</h4>
              {!userId && <p className="muted small">Sign in to load saved decks.</p>}
              {userId && decklistsLoading && <p className="muted small">Loading decks...</p>}
              {userId && !decklistsLoading && decklists.length === 0 && (
                <p className="muted small">No decks saved yet.</p>
              )}
              <ul>
                {decklists.map((deck) => (
                  <li key={deck.deckId}>
                    <div>
                      <strong>{deck.name}</strong>
                      <span className="muted small">{deck.cards?.length ?? 0} cards saved</span>
                    </div>
                    <div className="saved-deck-actions">
                      <button onClick={() => handleLoadDeck(deck)}>Load</button>
                      <button onClick={() => handleDeleteDeck(deck)} disabled={deletingDeck}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
