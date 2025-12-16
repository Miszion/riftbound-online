'use client'

import { useApolloClient } from '@apollo/client'
import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
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
import { GET_CARD_BY_ID, GET_CARD_BY_SLUG } from '@/lib/graphql/queries'

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

type CardSnapshot = {
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

type DeckCardDTO = {
  cardId?: string | null
  slug?: string | null
  quantity: number
  cardSnapshot?: CardSnapshot | null
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
  cards: DeckCardDTO[]
  runeDeck?: DeckCardDTO[]
  battlefields?: DeckCardDTO[]
  sideDeck?: DeckCardDTO[]
  championLegend?: DeckCardDTO | null
  championLeader?: DeckCardDTO | null
}

type ToastTone = 'info' | 'success' | 'warning' | 'error'

type ToastMessage = {
  id: string
  message: string
  tone: ToastTone
}

const createCardSnapshot = (card?: CatalogCard | null): CardSnapshot | undefined => {
  if (!card) {
    return undefined
  }
  return {
    cardId: card.id,
    slug: card.slug,
    name: card.name,
    type: card.type,
    rarity: card.rarity,
    colors: Array.isArray(card.colors) ? card.colors : [],
    keywords: Array.isArray(card.keywords) ? card.keywords : [],
    effect: card.effect,
    assets: {
      remote: card.assets?.remote ?? null,
      localPath: card.assets?.localPath ?? '',
    },
  }
}

const rarityClass = (card?: CatalogCard | null) => {
  const rarity = card?.rarity?.toLowerCase()
  if (!rarity) {
    return ''
  }
  return `rarity-${rarity.replace(/\s+/g, '-')}`
}

const MIN_DECK_CARDS = 39
const MAX_DECK_CARDS = MIN_DECK_CARDS
const MAX_COPIES = 3
const MAX_RESULTS = 180
const MAIN_DECK_COLUMNS = 10
const MAIN_DECK_ROWS = 3
const MAX_MAIN_SLOTS = MAIN_DECK_COLUMNS * MAIN_DECK_ROWS
const MAX_RUNE_TOTAL = 12
const MAX_RUNE_COPIES = 12
const RUNE_SLOT_COUNT = 2
const BATTLEFIELD_SLOTS = 3
const SIDE_DECK_MAX = 8

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
  const apolloClient = useApolloClient()
  const { user } = useAuth()
  const userId = user?.userId ?? ''

  const [deckName, setDeckName] = useState('')
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [domainFilter, setDomainFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [rarityFilter, setRarityFilter] = useState('all')
  const [pendingDeck, setPendingDeck] = useState<SavedDeck | null>(null)
  const [focusedCard, setFocusedCard] = useState<CatalogCard | null>(null)
  const [deckEntries, setDeckEntries] = useState<Record<string, DeckEntry>>({})
  const [leaderCard, setLeaderCard] = useState<CatalogCard | null>(null)
  const [legendCard, setLegendCard] = useState<CatalogCard | null>(null)
  const [battlefields, setBattlefields] = useState<(CatalogCard | null)[]>(() => Array(BATTLEFIELD_SLOTS).fill(null))
  const [runeDeck, setRuneDeck] = useState<Record<string, DeckEntry>>({})
  const [sideDeckEntries, setSideDeckEntries] = useState<Record<string, DeckEntry>>({})
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const catalogLimit = Number.isFinite(MAX_RESULTS) ? (MAX_RESULTS as number) : undefined

  const pushToast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      setToasts((prev) => [...prev, { id, message, tone }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id))
      }, 4000)
    },
    []
  )

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const cardCatalogFilter = useMemo(
    () => ({
      limit: catalogLimit,
      search: search.trim() || undefined,
      domain: domainFilter !== 'all' ? domainFilter : undefined,
      type: typeFilter !== 'all' ? typeFilter : undefined,
      rarity: rarityFilter !== 'all' ? rarityFilter : undefined,
    }),
    [catalogLimit, search, domainFilter, typeFilter, rarityFilter]
  )

  const {
    data: catalogData,
    loading: catalogLoading,
    error: catalogError,
  } = useCardCatalog(cardCatalogFilter)
  const cards: CatalogCard[] = catalogData?.cardCatalog ?? []
  const cardLookup = useMemo(() => {
    const map = new Map<string, CatalogCard>()
    cards.forEach((card) => map.set(card.id, card))
    return map
  }, [cards])

  useEffect(() => {
    if (!focusedCard && cards.length) {
      setFocusedCard(cards[0])
    }
  }, [cards, focusedCard])

  const { data: decklistsData, loading: decklistsLoading, refetch: refetchDecklists } = useDecklists(userId || null)
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([])

  useEffect(() => {
    if (decklistsData?.decklists) {
      setSavedDecks(decklistsData.decklists as SavedDeck[])
    } else if (!userId) {
      setSavedDecks([])
    }
  }, [decklistsData, userId])

  const [saveDecklist, { loading: savingDeck }] = useSaveDecklist()
  const [deleteDecklist, { loading: deletingDeck }] = useDeleteDecklist()

  const deckCards = useMemo(() => Object.values(deckEntries), [deckEntries])
  const sideDeckCards = useMemo(() => Object.values(sideDeckEntries), [sideDeckEntries])

  const mainDeckSlots = useMemo(() => {
    const entries = deckCards.slice().sort((a, b) => a.card.name.localeCompare(b.card.name))
    const padded: (DeckEntry | null)[] = Array(MAX_MAIN_SLOTS).fill(null)
    entries.slice(0, MAX_MAIN_SLOTS).forEach((entry, index) => {
      padded[index] = entry
    })
    return padded
  }, [deckCards])
  const runeDeckCards = useMemo(() => {
    return Object.values(runeDeck).sort((a, b) => a.card.name.localeCompare(b.card.name))
  }, [runeDeck])

  const totalSideDeckCards = useMemo(
    () => sideDeckCards.reduce((sum, entry) => sum + entry.quantity, 0),
    [sideDeckCards]
  )

  const filledBattlefieldSlots = useMemo(
    () => battlefields.filter((slot) => Boolean(slot)).length,
    [battlefields]
  )

  const sideDeckSlots = useMemo(() => {
    const padded: (DeckEntry | null)[] = Array(SIDE_DECK_MAX).fill(null)
    sideDeckCards.slice(0, SIDE_DECK_MAX).forEach((entry, index) => {
      padded[index] = entry
    })
    return padded
  }, [sideDeckCards])

  const totalRunes = useMemo(
    () => runeDeckCards.reduce((sum, entry) => sum + entry.quantity, 0),
    [runeDeckCards]
  )

  const runeSlots = useMemo(() => {
    const padded: (DeckEntry | null)[] = Array(RUNE_SLOT_COUNT).fill(null)
    runeDeckCards.slice(0, RUNE_SLOT_COUNT).forEach((entry, index) => {
      padded[index] = entry
    })
    return padded
  }, [runeDeckCards])

  const totalCards = useMemo(
    () => Object.values(deckEntries).reduce((sum, entry) => sum + entry.quantity, 0),
    [deckEntries]
  )
  const deckCountStatus = useMemo(() => {
    if (totalCards === MIN_DECK_CARDS) {
      return ''
    }
    return totalCards < MIN_DECK_CARDS
      ? `Add ${MIN_DECK_CARDS - totalCards} more card(s) to hit exactly ${MIN_DECK_CARDS}.`
      : `Remove ${totalCards - MIN_DECK_CARDS} card(s) to return to ${MIN_DECK_CARDS}.`
  }, [totalCards])
  const hasRequiredRunes = totalRunes === MAX_RUNE_TOTAL
  const hasRequiredMainDeck = totalCards === MIN_DECK_CARDS
  const battlefieldsComplete = filledBattlefieldSlots === BATTLEFIELD_SLOTS
  const hasChampions = Boolean(leaderCard && legendCard)
  const sideDeckWithinLimit = totalSideDeckCards <= SIDE_DECK_MAX

  const canSaveDeck =
    Boolean(userId) &&
    deckName.trim().length > 0 &&
    hasChampions &&
    hasRequiredRunes &&
    hasRequiredMainDeck &&
    battlefieldsComplete &&
    sideDeckWithinLimit

  const filteredCards = useMemo(() => {
    const effectiveLimit = catalogLimit ?? cards.length
    if (!search.trim()) {
      return cards.slice(0, effectiveLimit)
    }
    const term = search.trim().toLowerCase()
    return cards
      .filter((card) => {
        const matchesName = card.name.toLowerCase().includes(term)
        const matchesEffect = card.effect.toLowerCase().includes(term)
        const matchesKeywords = card.keywords?.some((keyword) => keyword.toLowerCase().includes(term))
        return matchesName || matchesEffect || matchesKeywords
      })
      .slice(0, effectiveLimit)
  }, [cards, search, catalogLimit])

  const resolveCatalogCard = useCallback(
    (entry?: DeckCardDTO | null) => {
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
      if (entry.cardSnapshot) {
        const snapshot = entry.cardSnapshot
        const fallbackId =
          snapshot.cardId || entry.cardId || snapshot.slug || entry.slug || 'snapshot-card'
        const fallbackSlug = (snapshot.slug || entry.slug || fallbackId).toLowerCase()
        return {
          id: fallbackId,
          slug: fallbackSlug,
          name: snapshot.name || snapshot.slug || snapshot.cardId || entry.slug || 'Unknown Card',
          type: snapshot.type ?? null,
          rarity: snapshot.rarity ?? null,
          colors: snapshot.colors?.filter(Boolean) ?? [],
          keywords: snapshot.keywords?.filter(Boolean) ?? [],
          effect: snapshot.effect ?? '',
          assets: {
            remote: snapshot.assets?.remote ?? null,
            localPath: snapshot.assets?.localPath ?? '',
          },
        }
      }
      return undefined
    },
    [cards]
  )

  const hydrateDeckSnapshots = useCallback(
    async (deck: SavedDeck): Promise<SavedDeck> => {
      const missingSlugs = new Set<string>()
      const missingIds = new Set<string>()

      const considerEntry = (entry?: DeckCardDTO | null) => {
        if (!entry || entry.cardSnapshot) {
          return
        }
        if (entry.slug) {
          missingSlugs.add(entry.slug.toLowerCase())
        } else if (entry.cardId) {
          missingIds.add(entry.cardId)
        }
      }

      deck.cards?.forEach(considerEntry)
      deck.runeDeck?.forEach(considerEntry)
      deck.battlefields?.forEach(considerEntry)
      deck.sideDeck?.forEach(considerEntry)
      considerEntry(deck.championLegend)
      considerEntry(deck.championLeader)

      if (!missingSlugs.size && !missingIds.size) {
        return deck
      }

      const snapshotMap: Record<string, CardSnapshot | null> = {}
      const fetches: Promise<void>[] = []

      missingSlugs.forEach((slug) => {
        fetches.push(
          apolloClient
            .query({ query: GET_CARD_BY_SLUG, variables: { slug } })
            .then(({ data }) => {
              const card = data?.cardBySlug ?? null
              const snapshot = card ? createCardSnapshot(card) ?? null : null
              snapshotMap[`slug:${slug}`] = snapshot
              if (card?.id) {
                snapshotMap[`id:${card.id}`] = snapshot
              }
            })
            .catch(() => {
              snapshotMap[`slug:${slug}`] = null
            })
        )
      })

      missingIds.forEach((id) => {
        fetches.push(
          apolloClient
            .query({ query: GET_CARD_BY_ID, variables: { id } })
            .then(({ data }) => {
              const card = data?.cardById ?? null
              const snapshot = card ? createCardSnapshot(card) ?? null : null
              snapshotMap[`id:${id}`] = snapshot
              if (card?.slug) {
                snapshotMap[`slug:${card.slug.toLowerCase()}`] = snapshot
              }
            })
            .catch(() => {
              snapshotMap[`id:${id}`] = null
            })
        )
      })

      await Promise.all(fetches)

      const pickSnapshot = (entry: DeckCardDTO): CardSnapshot | null => {
        if (entry.cardSnapshot) {
          return entry.cardSnapshot
        }
        if (entry.slug) {
          const bySlug = snapshotMap[`slug:${entry.slug.toLowerCase()}`]
          if (bySlug) {
            return bySlug
          }
        }
        if (entry.cardId) {
          const byId = snapshotMap[`id:${entry.cardId}`]
          if (byId) {
            return byId
          }
        }
        return null
      }

      const applySnapshots = (entries?: DeckCardDTO[] | null) =>
        entries?.map((entry) => {
          if (!entry) {
            return entry
          }
          if (entry.cardSnapshot) {
            return entry
          }
          const hydrated = pickSnapshot(entry)
          return hydrated ? { ...entry, cardSnapshot: hydrated } : entry
        }) ?? entries

      const applySingle = (entry?: DeckCardDTO | null) => {
        if (!entry || entry.cardSnapshot) {
          return entry
        }
        const hydrated = pickSnapshot(entry)
        return hydrated ? { ...entry, cardSnapshot: hydrated } : entry
      }

      return {
        ...deck,
        cards: applySnapshots(deck.cards),
        runeDeck: applySnapshots(deck.runeDeck),
        battlefields: applySnapshots(deck.battlefields),
        sideDeck: applySnapshots(deck.sideDeck),
        championLegend: applySingle(deck.championLegend),
        championLeader: applySingle(deck.championLeader),
      }
    },
    [apolloClient]
  )

  const restoreDeckFromSaved = useCallback(
    (deck: SavedDeck) => {
      const restoredMain: Record<string, DeckEntry> = {}
      const restoredRunes: Record<string, DeckEntry> = {}
      const restoredSide: Record<string, DeckEntry> = {}
      const restoredBattlefields: (CatalogCard | null)[] = Array(BATTLEFIELD_SLOTS).fill(null)

      const processEntry = (target: Record<string, DeckEntry>, entry?: DeckCardDTO, limit = MAX_COPIES) => {
        if (!entry) return
        const catalogCard = resolveCatalogCard(entry)
        if (catalogCard) {
          accumulateEntry(target, catalogCard, entry.quantity, limit)
        }
      }

      deck.cards?.forEach((entry) => processEntry(restoredMain, entry, MAX_COPIES))
      deck.runeDeck?.forEach((entry) => processEntry(restoredRunes, entry, MAX_RUNE_COPIES))
      deck.sideDeck?.forEach((entry) => processEntry(restoredSide, entry, MAX_COPIES))

      deck.battlefields?.forEach((entry, index) => {
        if (index >= BATTLEFIELD_SLOTS) {
          return
        }
        const catalogCard = resolveCatalogCard(entry)
        restoredBattlefields[index] = catalogCard ?? null
      })

      const restoredLegend = resolveCatalogCard(deck.championLegend) ?? null
      const restoredLeader = resolveCatalogCard(deck.championLeader) ?? null

      setDeckEntries(restoredMain)
      setRuneDeck(normalizeRuneEntries(restoredRunes))
      setSideDeckEntries(normalizeSideEntries(restoredSide))
      setBattlefields(restoredBattlefields)
      setLegendCard(restoredLegend)
      setLeaderCard(restoredLeader)
      setFocusedCard(
        Object.values(restoredMain)[0]?.card ??
          Object.values(restoredRunes)[0]?.card ??
          Object.values(restoredSide)[0]?.card ??
          restoredBattlefields.find((slot) => Boolean(slot)) ??
          restoredLegend ??
          restoredLeader ??
          null
      )
    },
    [resolveCatalogCard]
  )

  useEffect(() => {
    if (!pendingDeck || !cards.length) {
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const hydrated = await hydrateDeckSnapshots(pendingDeck)
        if (!cancelled) {
          restoreDeckFromSaved(hydrated)
          setPendingDeck(null)
        }
      } catch (error) {
        console.error('Failed to hydrate pending deck snapshots', error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pendingDeck, cards.length, restoreDeckFromSaved, hydrateDeckSnapshots])

  const isRuneCard = (card: CatalogCard) => {
    const typeValue = card.type?.trim().toLowerCase()
    return typeValue === 'rune'
  }

  const isBattlefieldCard = (card: CatalogCard) => {
    const typeMatches = card.type?.toLowerCase().includes('battlefield')
    const keywordMatches = card.keywords?.some((kw) => kw.toLowerCase().includes('battlefield'))
    return Boolean(typeMatches || keywordMatches)
  }

  const removeFromMainDeck = (cardId: string) => {
    setDeckEntries((prev) => {
      if (!prev[cardId]) {
        return prev
      }
      const { [cardId]: _omit, ...rest } = prev
      return rest
    })
  }

  const getChampionBaseName = (name?: string | null) => {
    if (!name) return ''
    const lower = name.toLowerCase()
    const [prefix] = lower.split(/[-–—]/, 1)
    const working = (prefix || lower)
      .replace(/\(.*?\)/g, '')
      .replace(/\blegend\b/g, '')
      .replace(/\bleader\b/g, '')
      .replace(/\bchampion\b/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    return working
  }

  const clearDeckForChampionChange = () => {
    const hadContents =
      Object.values(deckEntries).length > 0 ||
      Object.values(runeDeck).length > 0 ||
      Object.values(sideDeckEntries).length > 0 ||
      battlefields.some(Boolean)
    setDeckEntries({})
    setRuneDeck({})
    setSideDeckEntries({})
    setBattlefields(Array(BATTLEFIELD_SLOTS).fill(null))
    setActiveDeckId(null)
    if (hadContents) {
      pushToast('Deck reset after champion change.', 'info')
    }
  }

  const isLegendUnit = (card: CatalogCard) => {
    const type = card.type?.toLowerCase() ?? ''
    if (type.includes('legend')) {
      return true
    }
    return card.keywords?.some((kw) => kw.toLowerCase().includes('legend')) ?? false
  }

  const isLeaderCandidate = (card: CatalogCard) => {
    const type = card.type?.toLowerCase() ?? ''
    if (['leader', 'champion', 'unit'].some((token) => type.includes(token))) {
      return true
    }
    return card.keywords?.some((kw) => {
      const lower = kw.toLowerCase()
      return lower.includes('leader') || lower.includes('champion') || lower.includes('unit')
    })
  }

  const addRuneCard = (card: CatalogCard): boolean => {
    if (!isRuneCard(card)) {
      return false
    }

    const allowedRunes = new Set((legendCard?.colors || []).map((color) => color.toLowerCase()))
    if (allowedRunes.size && card.colors?.length) {
      const matchesRunes = card.colors.every((color) => allowedRunes.has(color.toLowerCase()))
      if (!matchesRunes) {
        pushToast(`${card.name} is not part of the legend rune order.`, 'warning')
        return false
      }
    }

    let didUpdate = false
    let blockedBySlots = false
    let blockedByTotal = false

    setRuneDeck((prev) => {
      const currentTotal = Object.values(prev).reduce((sum, entry) => sum + entry.quantity, 0)
      const existing = prev[card.id]
      if (!existing && Object.keys(prev).length >= RUNE_SLOT_COUNT) {
        blockedBySlots = true
        return prev
      }
      const nextQuantity = Math.min(MAX_RUNE_COPIES, (existing?.quantity ?? 0) + 1)
      const adjustedTotal = currentTotal - (existing?.quantity ?? 0) + nextQuantity
      if (adjustedTotal > MAX_RUNE_TOTAL) {
        blockedByTotal = true
        return prev
      }
      if (existing && existing.quantity === nextQuantity) {
        return prev
      }
      didUpdate = true
      return {
        ...prev,
        [card.id]: {
          card,
          quantity: nextQuantity,
        },
      }
    })

    if (!didUpdate) {
      if (blockedBySlots) {
        pushToast('Only two rune slots are available.', 'warning')
      } else if (blockedByTotal) {
        pushToast('Rune decks can only contain up to 12 cards.', 'warning')
      }
      return false
    }

    removeFromMainDeck(card.id)
    // no toast on success
    return true
  }

  const addBattlefieldCard = (card: CatalogCard): boolean => {
    if (!isBattlefieldCard(card)) {
      return false
    }

    let added = false
    let duplicate = false
    let filled = false
    setBattlefields((prev) => {
      if (prev.some((slot) => slot?.id === card.id)) {
        duplicate = true
        return prev
      }
      const next = [...prev]
      const emptyIndex = next.findIndex((slot) => slot === null)
      if (emptyIndex === -1) {
        filled = true
        return prev
      }
      next[emptyIndex] = card
      added = true
      return next
    })

    if (duplicate) {
      pushToast('Each battlefield must be unique.', 'warning')
      return false
    }

    if (filled && !added) {
      pushToast('All battlefield slots are filled.', 'warning')
      return false
    }

    if (!added) {
      return false
    }

    removeFromMainDeck(card.id)
    // no toast on success
    return true
  }

  const addSideDeckCard = (card: CatalogCard): boolean => {
    if (isBattlefieldCard(card)) {
      pushToast('Battlefields belong in their dedicated zone, not the side deck.', 'warning')
      return false
    }
    if (isRuneCard(card)) {
      pushToast('Runes are stored in the rune deck.', 'warning')
      return false
    }

    let updated = false
    let blocked = false
    setSideDeckEntries((prev) => {
      const prevTotal = Object.values(prev).reduce((sum, entry) => sum + entry.quantity, 0)
      const existing = prev[card.id]
      const nextQuantity = Math.min(MAX_COPIES, (existing?.quantity ?? 0) + 1)
      const adjustedTotal = prevTotal - (existing?.quantity ?? 0) + nextQuantity
      if (adjustedTotal > SIDE_DECK_MAX) {
        blocked = true
        return prev
      }
      if (existing && existing.quantity === nextQuantity) {
        return prev
      }
      updated = true
      return {
        ...prev,
        [card.id]: {
          card,
          quantity: nextQuantity,
        },
      }
    })

    if (blocked) {
      pushToast('Side decks can only hold up to 8 cards total.', 'warning')
      return false
    }

    if (!updated) {
      return false
    }

    // no toast on success
    return true
  }

const handleAddCard = (card: CatalogCard, target: 'main' | 'rune' | 'side' = 'main') => {
    const cardIsLegend = isLegendUnit(card)
    const cardIsLeader = isLeaderCandidate(card)

    if (target === 'rune') {
      if (!legendCard) {
        pushToast('Select a legend before configuring runes.', 'warning')
        return
      }
      const allowedRunes = new Set((legendCard.colors || []).map((color) => color.toLowerCase()))
      if (!isRuneCard(card)) {
        pushToast('Only rune cards are allowed in the rune deck.', 'warning')
        return
      }
      if (allowedRunes.size && card.colors?.length) {
        const matchesRunes = card.colors.every((color) => allowedRunes.has(color.toLowerCase()))
        if (!matchesRunes) {
          pushToast(`${card.name} does not align with your legend runes.`, 'warning')
          return
        }
      }
      const added = addRuneCard(card)
      if (added) {
        setFocusedCard(card)
      }
      return
    }

    if (target === 'side') {
      if (!leaderCard || !legendCard) {
        pushToast('Select your champion lineup before adding cards.', 'warning')
        return
      }
      const allowedRunes = new Set((legendCard.colors || []).map((color) => color.toLowerCase()))
      if (allowedRunes.size && card.colors?.length) {
        const matchesRunes = card.colors.every((color) => allowedRunes.has(color.toLowerCase()))
        if (!matchesRunes) {
          pushToast(`${card.name} does not align with your legend runes.`, 'warning')
          return
        }
      }
      const added = addSideDeckCard(card)
      if (added) {
        setFocusedCard(card)
      }
      return
    }

    if (cardIsLegend) {
      handleAssignLegend(card)
      return
    }

    if (cardIsLeader) {
      if (!legendCard) {
        pushToast('Select a legend before assigning a leader.', 'warning')
        return
      }
      if (!leaderCard) {
        handleAssignLeader(card)
        return
      }
      const candidateBase = getChampionBaseName(card.name)
      const legendBase = getChampionBaseName(legendCard.name)
      if (candidateBase && legendBase && candidateBase === legendBase && leaderCard.id !== card.id) {
        pushToast('Leader slot already filled. Card sent to main deck.', 'info')
      }
      // Leader already assigned; fall through to main deck handling
    }

    if (!leaderCard || !legendCard) {
      pushToast('Choose a champion leader and legend before adding cards.', 'warning')
      return
    }

    const allowedRunes = new Set((legendCard.colors || []).map((color) => color.toLowerCase()))

    if (isBattlefieldCard(card)) {
      const addedBattlefield = addBattlefieldCard(card)
      if (addedBattlefield) {
        setFocusedCard(card)
      }
      return
    }

    if (isRuneCard(card)) {
      const added = addRuneCard(card)
      if (added) {
        setFocusedCard(card)
      }
      return
    }

    if (allowedRunes.size && card.colors?.length) {
      const matchesRunes = card.colors.every((color) => allowedRunes.has(color.toLowerCase()))
      if (!matchesRunes) {
        pushToast(`${card.name} does not align with your legend runes.`, 'warning')
        return
      }
    }

    const existingQuantity = deckEntries[card.id]?.quantity ?? 0
    const nextQuantity = Math.min(MAX_COPIES, existingQuantity + 1)
    if (existingQuantity === nextQuantity && existingQuantity > 0) {
      pushToast('You already hold the maximum copies of this card.', 'warning')
      return
    }
    const adjustedTotal = totalCards - existingQuantity + nextQuantity
    if (adjustedTotal > MAX_DECK_CARDS) {
      const sideAdded = addSideDeckCard(card)
      if (sideAdded) {
        setFocusedCard(card)
        pushToast('Main deck is full. Added card to the side deck.', 'info')
      } else {
        const sideFull = totalSideDeckCards >= SIDE_DECK_MAX
        pushToast(
          sideFull
            ? 'Side deck is full.'
            : 'Cannot add more copies of this card to the side deck.',
          'warning'
        )
      }
      return
    }

    setDeckEntries((prev) => ({
      ...prev,
      [card.id]: {
        card,
        quantity: nextQuantity,
      },
    }))

    setFocusedCard(card)
    // success message handled elsewhere when needed
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

  const handleRemoveRuneCard = (cardId: string) => {
    setRuneDeck((prev) => {
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

  const handleRemoveSideCard = (cardId: string) => {
    setSideDeckEntries((prev) => {
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

  const handleAssignLeader = (card: CatalogCard | null) => {
    if (card && legendCard) {
      const leaderBase = getChampionBaseName(card.name)
      const legendBase = getChampionBaseName(legendCard.name)
      if (leaderBase && legendBase && leaderBase !== legendBase) {
        pushToast('Leaders must share the same base name as the selected legend.', 'warning')
        return
      }
    }

    setLeaderCard((prev) => {
      if (prev?.id !== card?.id) {
        clearDeckForChampionChange()
      }
      return card
    })

    if (card) {
      setFocusedCard(card)
    }
  }

  const handleAssignLegend = (card: CatalogCard | null) => {
    setLegendCard((prev) => {
      if (prev?.id !== card?.id) {
        clearDeckForChampionChange()
        setLeaderCard(null)
      }
      return card
    })
    if (card) {
      setFocusedCard(card)
    }
  }

  const handleChampionDrop = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const card = resolveDraggedCard(event)
    if (!card) {
      return
    }

    if (legendCard && leaderCard && !isLegendUnit(card)) {
      handleAddCard(card)
      return
    }

    if (isLegendUnit(card)) {
      handleAssignLegend(card)
      return
    }

    if (!isLeaderCandidate(card)) {
      pushToast(`${card.name} cannot be assigned as a leader.`, 'warning')
      return
    }

    handleAssignLeader(card)
  }

  const resolveDraggedCard = (event: DragEvent) => {
    const cardId = event.dataTransfer.getData('text/plain')
    if (!cardId) return null
    return cardLookup.get(cardId) || null
  }

  const handleRuneDrop = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const card = resolveDraggedCard(event)
    if (card) {
      handleAddCard(card, 'rune')
    }
  }

  const handleBattlefieldDrop = (slotIndex: number) => (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const card = resolveDraggedCard(event)
    if (card) {
      if (!isBattlefieldCard(card)) {
        pushToast('Only battlefield cards can occupy these slots.', 'warning')
        return
      }
      setBattlefields((prev) => {
        const existsElsewhere = prev.some((slot, idx) => slot?.id === card.id && idx !== slotIndex)
        if (existsElsewhere) {
          pushToast('Each battlefield must be unique.', 'warning')
          return prev
        }
        const next = [...prev]
        next[slotIndex] = card
        return next
      })
      removeFromMainDeck(card.id)
      setFocusedCard(card)
    }
  }

  const handleClearBattlefield = (slotIndex: number) => {
    setBattlefields((prev) => {
      const next = [...prev]
      next[slotIndex] = null
      return next
    })
  }

  const handleSideDrop = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const card = resolveDraggedCard(event)
    if (card) {
      handleAddCard(card, 'side')
    }
  }

  const handleMainDrop = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const card = resolveDraggedCard(event)
    if (card) {
      handleAddCard(card)
    }
  }

  const commonDropProps = {
    onDragOver: (event: DragEvent) => event.preventDefault(),
    onDragEnter: (event: DragEvent) => event.preventDefault(),
  }

  const handleResetDeck = () => {
    setDeckEntries({})
    setRuneDeck({})
    setSideDeckEntries({})
    setDeckName('')
    setActiveDeckId(null)
    setFocusedCard(null)
    setLeaderCard(null)
    setLegendCard(null)
    setBattlefields(Array(BATTLEFIELD_SLOTS).fill(null))
  }

  const handleLoadDeck = async (deck: SavedDeck) => {
    try {
      const hydratedDeck = await hydrateDeckSnapshots(deck)
      if (!cards.length) {
        setPendingDeck(hydratedDeck)
      } else {
        restoreDeckFromSaved(hydratedDeck)
      }
      setDeckName(hydratedDeck.name)
      setActiveDeckId(hydratedDeck.deckId)
      pushToast(`Loaded ${hydratedDeck.name}`, 'success')
    } catch (error) {
      console.error('Failed to hydrate deck snapshots', error)
      pushToast('Unable to load decklist. Please try again.', 'error')
    }
  }

  const handleSaveDeck = async () => {
    if (!deckName.trim()) {
      pushToast('Provide a deck name before saving.', 'error')
      return
    }

    if (!userId) {
      pushToast('You must be signed in to save decks.', 'error')
      return
    }

    if (!legendCard || !leaderCard) {
      pushToast('Select both a champion legend and leader before saving.', 'error')
      return
    }

    if (totalRunes !== MAX_RUNE_TOTAL) {
      pushToast(`Rune decks must contain exactly ${MAX_RUNE_TOTAL} runes.`, 'error')
      return
    }

    if (totalCards !== MIN_DECK_CARDS) {
      pushToast(`Main decks must contain exactly ${MIN_DECK_CARDS} cards.`, 'error')
      return
    }

    if (battlefields.filter(Boolean).length !== BATTLEFIELD_SLOTS) {
      pushToast(`Assign all ${BATTLEFIELD_SLOTS} battlefield slots before saving.`, 'error')
      return
    }

    if (totalSideDeckCards > SIDE_DECK_MAX) {
      pushToast(`Side decks can include at most ${SIDE_DECK_MAX} cards.`, 'error')
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
        cardSnapshot: createCardSnapshot(entry.card),
      })),
      runeDeck: runeDeckCards.map((entry) => ({
        cardId: entry.card.id,
        slug: entry.card.slug,
        quantity: entry.quantity,
        cardSnapshot: createCardSnapshot(entry.card),
      })),
      battlefields: battlefields
        .filter((slot): slot is CatalogCard => Boolean(slot))
        .map((card) => ({
          cardId: card.id,
          slug: card.slug,
          quantity: 1,
          cardSnapshot: createCardSnapshot(card),
        })),
      sideDeck: sideDeckCards.map((entry) => ({
        cardId: entry.card.id,
        slug: entry.card.slug,
        quantity: entry.quantity,
        cardSnapshot: createCardSnapshot(entry.card),
      })),
      championLegend: legendCard
        ? {
            cardId: legendCard.id,
            slug: legendCard.slug,
            quantity: 1,
            cardSnapshot: createCardSnapshot(legendCard),
          }
        : undefined,
      championLeader: leaderCard
        ? {
            cardId: leaderCard.id,
            slug: leaderCard.slug,
            quantity: 1,
            cardSnapshot: createCardSnapshot(leaderCard),
          }
        : undefined,
      isPublic: false,
    }

    try {
      pushToast('Saving deck...', 'info')
      const result = await saveDecklist({
        variables: { input: payload },
      })
      const persistedDeck = result.data?.saveDecklist as SavedDeck | undefined
      if (persistedDeck?.deckId) {
        setActiveDeckId(persistedDeck.deckId)
        setSavedDecks((prev) => {
          const next = prev.some((deck) => deck.deckId === persistedDeck.deckId)
            ? prev.map((deck) => (deck.deckId === persistedDeck.deckId ? persistedDeck : deck))
            : [...prev, persistedDeck]
          return next.sort((a, b) => a.name.localeCompare(b.name))
        })
      }
      await refetchDecklists?.()
      pushToast('Deck saved!', 'success')
    } catch (error: any) {
      pushToast(error.message || 'Failed to save deck', 'error')
    }
  }

  const handleDeleteDeck = async (deck: SavedDeck) => {
    const confirmed = window.confirm(`Delete deck "${deck.name}"?`)
    if (!confirmed) {
      return
    }

    try {
      pushToast('Deleting deck...', 'info')
      await deleteDecklist({
        variables: {
          userId: deck.userId,
          deckId: deck.deckId,
        },
      })
      if (deck.deckId === activeDeckId) {
        handleResetDeck()
      } else {
        pushToast('Deck deleted', 'success')
      }
      setSavedDecks((prev) => prev.filter((entry) => entry.deckId !== deck.deckId))
      await refetchDecklists?.()
    } catch (error: any) {
      pushToast(error.message || 'Failed to delete deck', 'error')
    }
  }

  const handleDeckSelect = (deckId: string) => {
    if (!deckId) {
      return
    }
    const selectedDeck = savedDecks.find((deck) => deck.deckId === deckId)
    if (selectedDeck) {
      void handleLoadDeck(selectedDeck)
    }
  }

  return (
    <>
      <Header />
      <main className="deckbuilder container">
        <div className="toast-stack" aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast--${toast.tone}`}>
              <span>{toast.message}</span>
              <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="deck-control-bar deck-control-bar--top">
          <label className="deck-control-item">
            <span>Deck name</span>
            <input
              type="text"
              placeholder="Name this deck"
              value={deckName}
              onChange={(event) => setDeckName(event.target.value)}
            />
          </label>
          <button className="cta" disabled={!canSaveDeck || savingDeck} onClick={handleSaveDeck}>
            {savingDeck ? 'Saving…' : activeDeckId ? 'Update deck' : 'Save deck'}
          </button>
          <label className="deck-control-item">
            <span>Saved decks</span>
            <select
              value={activeDeckId ?? ''}
              onChange={(event) => handleDeckSelect(event.target.value)}
              disabled={!userId || !savedDecks.length || decklistsLoading}
            >
              <option value="">{!userId ? 'Sign in to load decks' : 'Select a saved deck'}</option>
              {savedDecks.map((deck) => (
                <option key={deck.deckId} value={deck.deckId}>
                  {deck.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-link deck-control-new" onClick={handleResetDeck}>
            New deck
          </button>
        </div>
        <section className="deckbuilder-shell">
          <aside className="champion-column">
            <div className="champion-track" {...commonDropProps} onDrop={handleChampionDrop}>
              <div className="panel-heading">
                <h3>Champion lineup</h3>
              </div>
              <div className="champion-card-row">
                <div className="champion-card-slot">
                  <span className="champion-slot-label">Legend</span>
                  {legendCard ? (
                    <div className={`champion-card-shell ${rarityClass(legendCard)}`}>
                      {legendCard.assets?.remote ? (
                        <Image
                          src={legendCard.assets.remote}
                          alt={legendCard.name}
                          fill
                          sizes="150px"
                          className="champion-card-image"
                          unoptimized
                        />
                      ) : (
                        <div className="image-fallback">{legendCard.name.slice(0, 1)}</div>
                      )}
                      <button type="button" className="champion-clear" onClick={() => handleAssignLegend(null)}>
                        Clear
                      </button>
                    </div>
                  ) : (
                    <div className="champion-placeholder">Drop a legend card</div>
                  )}
                </div>
                <div className="champion-card-slot">
                  <span className="champion-slot-label">Leader</span>
                  {leaderCard ? (
                    <div className={`champion-card-shell ${rarityClass(leaderCard)}`}>
                      {leaderCard.assets?.remote ? (
                        <Image
                          src={leaderCard.assets.remote}
                          alt={leaderCard.name}
                          fill
                          sizes="150px"
                          className="champion-card-image"
                          unoptimized
                        />
                      ) : (
                        <div className="image-fallback">{leaderCard.name.slice(0, 1)}</div>
                      )}
                      <button type="button" className="champion-clear" onClick={() => handleAssignLeader(null)}>
                        Clear
                      </button>
                    </div>
                  ) : (
                    <div className="champion-placeholder">
                      Drop a leader that matches your legend&apos;s name
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="deck-track rune-track">
              <div className="panel-heading">
                <h3>Rune deck</h3>
                <span className="muted small">
                  {totalRunes} / {MAX_RUNE_TOTAL}
                </span>
              </div>
              <p className="muted small">Drag rune cards aligned with your legend.</p>
              <div className="rune-grid" {...commonDropProps} onDrop={handleRuneDrop}>
                {runeSlots.map((slot, index) => (
                  <div key={index} className="deck-slot rune-slot">
                    {slot ? (
                      <article
                        className={`deck-card ${rarityClass(slot.card)}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setFocusedCard(slot.card)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setFocusedCard(slot.card)
                          }
                        }}
                      >
                        {slot.card.assets?.remote ? (
                          <Image
                            src={slot.card.assets.remote}
                            alt={slot.card.name}
                            fill
                            sizes="120px"
                            className="deck-card-image"
                            unoptimized
                          />
                        ) : (
                          <div className="image-fallback">{slot.card.name.slice(0, 1)}</div>
                        )}
                        <span className="deck-card-qty">{slot.quantity}x</span>
                        <div className="deck-card-controls">
                          <button
                            onClick={(event) => {
                              event.stopPropagation()
                              handleRemoveRuneCard(slot.card.id)
                            }}
                          >
                            −
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation()
                              handleAddCard(slot.card, 'rune')
                            }}
                          >
                            +
                          </button>
                        </div>
                      </article>
                    ) : (
                      <div className="deck-card empty-slot" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="deck-track battlefield-track">
              <div className="panel-heading">
                <h3>Battlefields</h3>
                <span className="muted small">Assign up to three battleground cards.</span>
              </div>
              <div className="battlefield-grid">
                {battlefields.map((slot, index) => (
                  <div
                    key={index}
                    className={`battlefield-slot${slot ? ' has-card' : ''}`}
                    {...commonDropProps}
                    onDrop={handleBattlefieldDrop(index)}
                  >
                    {slot ? (
                      <div className="battlefield-card">
                        <div className="battlefield-card-media">
                          {slot.assets?.remote ? (
                            <Image
                              src={slot.assets.remote}
                              alt={slot.name}
                              fill
                              sizes="320px"
                              className="battlefield-card-image"
                              unoptimized
                            />
                          ) : (
                            <div className="image-fallback image-fallback--lg">{slot.name.slice(0, 1)}</div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="battlefield-clear"
                          onClick={() => handleClearBattlefield(index)}
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <>
                        <header>Field {index + 1}</header>
                        <p className="muted small">Drop a card to set this battlefield.</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </aside>
          <section className="deck-canvas" {...commonDropProps} onDrop={handleChampionDrop}>

            <div className="deck-track deck-track-main" {...commonDropProps} onDrop={handleMainDrop}>
              <div className="panel-heading deck-panel-heading">
                <h3>Main deck</h3>
                <div className="deck-heading-meta">
                  {deckCountStatus && <span className="deck-count-note muted small">{deckCountStatus}</span>}
                  <div className="deck-count-badges">
                    <div className="deck-count-badge">
                      <span>Main</span>
                      <strong>{totalCards}</strong>
                    </div>
                    <div className="deck-count-badge">
                      <span>Runes</span>
                      <strong>{totalRunes}</strong>
                    </div>
                  </div>
                  <span className="muted small deck-count-pill">
                    {totalCards} / {MIN_DECK_CARDS}
                  </span>
                </div>
              </div>
              <div className="deck-grid-scroller" {...commonDropProps} onDrop={handleMainDrop}>
                <div className="deck-grid">
                  {mainDeckSlots.map((slot, index) => (
                    <div key={index} className="deck-slot">
                      {slot ? (
                        <article
                          className={`deck-card ${rarityClass(slot.card)}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setFocusedCard(slot.card)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setFocusedCard(slot.card)
                            }
                          }}
                        >
                          {slot.card.assets?.remote ? (
                            <Image
                              src={slot.card.assets.remote}
                              alt={slot.card.name}
                              fill
                              sizes="120px"
                              className="deck-card-image"
                              unoptimized
                            />
                          ) : (
                            <div className="image-fallback">{slot.card.name.slice(0, 1)}</div>
                          )}
                          <span className="deck-card-qty">{slot.quantity}x</span>
                          <div className="deck-card-controls">
                            <button
                              onClick={(event) => {
                                event.stopPropagation()
                                handleRemoveCard(slot.card.id)
                              }}
                            >
                              −
                            </button>
                            <button
                              onClick={(event) => {
                                event.stopPropagation()
                                handleAddCard(slot.card)
                              }}
                            >
                              +
                            </button>
                          </div>
                        </article>
                      ) : (
                        <div className="deck-card empty-slot" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="side-deck-section" {...commonDropProps} onDrop={handleSideDrop}>
                <div className="panel-heading compact">
                  <h4>Side deck</h4>
                  <span className="muted small">
                    {totalSideDeckCards} / {SIDE_DECK_MAX}
                  </span>
                </div>
                <div className="deck-grid-scroller">
                  <div className="side-grid">
                    {sideDeckSlots.map((slot, index) => (
                      <div key={index} className="deck-slot">
                        {slot ? (
                          <article
                            className={`deck-card ${rarityClass(slot.card)}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => setFocusedCard(slot.card)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                setFocusedCard(slot.card)
                              }
                            }}
                          >
                            {slot.card.assets?.remote ? (
                              <Image
                                src={slot.card.assets.remote}
                                alt={slot.card.name}
                                fill
                                sizes="120px"
                                className="deck-card-image"
                                unoptimized
                              />
                            ) : (
                              <div className="image-fallback">{slot.card.name.slice(0, 1)}</div>
                            )}
                            <span className="deck-card-qty">{slot.quantity}x</span>
                            <div className="deck-card-controls">
                              <button
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleRemoveSideCard(slot.card.id)
                                }}
                              >
                                −
                              </button>
                            </div>
                          </article>
                        ) : (
                          <div className="deck-card empty-slot" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
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
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', card.id)
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => handleAddCard(card)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleAddCard(card)
                    }
                  }}
                >
                  <div className="search-card-content">
                    <div className="search-card-media">
                      {card.assets?.remote ? (
                        <Image
                          src={card.assets.remote}
                          alt={card.name}
                          fill
                          sizes="80px"
                          className="search-card-image"
                          unoptimized
                        />
                      ) : (
                        <div className="image-fallback image-fallback--sm">{card.name.slice(0, 1)}</div>
                      )}
                    </div>
                    <div className="search-card-info">
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
                    </div>
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
const accumulateEntry = (
  collection: Record<string, DeckEntry>,
  card: CatalogCard,
  quantity: number,
  limit = MAX_COPIES
) => {
  const existing = collection[card.id]
  const total = Math.min(limit, (existing?.quantity ?? 0) + quantity)
  collection[card.id] = {
    card,
    quantity: total,
  }
}

const normalizeRuneEntries = (entries: Record<string, DeckEntry>): Record<string, DeckEntry> => {
  const ordered = Object.values(entries).sort((a, b) => a.card.name.localeCompare(b.card.name))
  const limited: Record<string, DeckEntry> = {}
  let total = 0
  for (const entry of ordered) {
    if (Object.keys(limited).length >= RUNE_SLOT_COUNT) {
      break
    }
    const remaining = MAX_RUNE_TOTAL - total
    if (remaining <= 0) {
      break
    }
    const allowedQuantity = Math.min(entry.quantity, MAX_RUNE_COPIES, remaining)
    if (allowedQuantity <= 0) {
      continue
    }
    limited[entry.card.id] = {
      card: entry.card,
      quantity: allowedQuantity,
    }
    total += allowedQuantity
  }
  return limited
}

const normalizeSideEntries = (entries: Record<string, DeckEntry>): Record<string, DeckEntry> => {
  const ordered = Object.values(entries).sort((a, b) => a.card.name.localeCompare(b.card.name))
  const limited: Record<string, DeckEntry> = {}
  let total = 0
  for (const entry of ordered) {
    if (total >= SIDE_DECK_MAX) {
      break
    }
    const remaining = SIDE_DECK_MAX - total
    const allowedQuantity = Math.min(entry.quantity, MAX_COPIES, remaining)
    if (allowedQuantity <= 0) {
      continue
    }
    limited[entry.card.id] = {
      card: entry.card,
      quantity: allowedQuantity,
    }
    total += allowedQuantity
  }
  return limited
}
