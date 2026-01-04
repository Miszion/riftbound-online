'use client';

import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import Image, { StaticImageData } from 'next/image';
import type { ApolloError } from '@apollo/client';
import {
  useMatch,
  usePlayerMatch,
  useGameStateSubscription,
  usePlayerGameStateSubscription,
  usePlayCard,
  useMoveUnit,
  useNextPhase,
  useConcedeMatch,
  useSubmitMulligan,
  useSelectBattlefield,
  useSubmitInitiativeChoice,
  useCardPlayedSubscription,
  useAttackDeclaredSubscription,
  usePhaseChangedSubscription,
  useRecordDuelLogEntry,
  useSendChatMessage,
} from '@/hooks/useGraphQL';
import type { ToastTone } from '@/components/ui/ToastStack';
import useToasts from '@/hooks/useToasts';
import doransBladeImg from '@/public/images/dorans-blade.jpg';
import doransShieldImg from '@/public/images/dorans-shield.jpg';
import doransRingImg from '@/public/images/dorans-ring.jpg';
import cardBackImg from '@/public/images/card-back.png';

type CardAsset = {
  remote?: string | null;
  localPath?: string | null;
};

type BaseCard = {
  cardId?: string | null;
  instanceId?: string | null;
  name?: string | null;
  slug?: string | null;
  type?: string | null;
  rarity?: string | null;
  cost?: number | null;
  powerCost?: Record<string, number | null> | null;
  power?: number | null;
  toughness?: number | null;
  currentToughness?: number | null;
  keywords?: string[] | null;
  tags?: string[] | null;
  text?: string | null;
  isTapped?: boolean | null;
  tapped?: boolean | null;
  assets?: CardAsset | null;
  location?: {
    zone: 'base' | 'battlefield';
    battlefieldId?: string | null;
  } | null;
};

type RuneState = {
  runeId: string;
  name: string;
  domain?: string | null;
  energyValue?: number | null;
  powerValue?: number | null;
  isTapped?: boolean | null;
  tapped?: boolean | null;
  slug?: string | null;
  assets?: CardAsset | null;
  card?: CardSnapshotLike | BaseCard | null;
  cardSnapshot?: CardSnapshotLike | null;
};

type PlayerBoardState = {
  creatures: BaseCard[];
  artifacts: BaseCard[];
  enchantments: BaseCard[];
};

type PlayerStateData = {
  playerId: string;
  name: string;
  victoryPoints: number;
  victoryScore: number;
  mana: number;
  maxMana: number;
  handSize?: number;
  deckCount?: number;
  runeDeckSize?: number;
  hand: BaseCard[];
  board: PlayerBoardState;
  graveyard: BaseCard[];
  exile: BaseCard[];
  channeledRunes: RuneState[];
  runeDeck?: RuneState[];
  resources: {
    energy: number;
    universalPower: number;
    power: Record<string, number | undefined>;
  };
  championLegend?: CardSnapshotLike | null;
  championLeader?: CardSnapshotLike | null;
};

type RecycledRuneEvent = {
  id: string;
  owner: 'self' | 'opponent';
  rune: RuneState;
  addedAt: number;
};

type OpponentSummary = {
  playerId?: string | null;
  victoryPoints?: number | null;
  victoryScore?: number | null;
  handSize?: number | null;
  deckCount?: number | null;
  runeDeckSize?: number | null;
  board?: PlayerBoardState | null;
  championLegend?: CardSnapshotLike | null;
  championLeader?: CardSnapshotLike | null;
};

type GameStateView = {
  matchId: string;
  currentPhase: string;
  turnNumber: number;
  currentPlayerIndex: number;
  canAct: boolean;
};

type PlayerMatchView = {
  matchId: string;
  currentPlayer: PlayerStateData | null;
  opponent?: OpponentSummary | null;
  gameState?: GameStateView | null;
};

const normalizeDomainKey = (value?: string | null) => {
  if (!value) {
    return '';
  }
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const normalizePowerPool = (pool?: Record<string, number | undefined> | null) => {
  const normalized: Record<string, number> = {};
  if (!pool) {
    return normalized;
  }
  Object.entries(pool).forEach(([domain, amount]) => {
    const key = normalizeDomainKey(domain);
    const numeric = resolvePositiveNumber(amount);
    if (!key || numeric <= 0) {
      return;
    }
    normalized[key] = (normalized[key] ?? 0) + numeric;
  });
  return normalized;
};

const normalizePowerCost = (cost?: Record<string, number | null> | null) => {
  const normalized: Record<string, number> = {};
  if (!cost) {
    return normalized;
  }
  Object.entries(cost).forEach(([domain, amount]) => {
    const key = normalizeDomainKey(domain);
    const numeric = resolvePositiveNumber(amount);
    if (!key || numeric <= 0) {
      return;
    }
    normalized[key] = (normalized[key] ?? 0) + numeric;
  });
  return normalized;
};

const resolvePositiveNumber = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, numeric);
};

const isRuneExhausted = (rune: RuneState) => Boolean(rune.isTapped ?? rune.tapped);

const STANDARD_RUNE_DOMAINS = new Set(['fury', 'calm', 'mind', 'body', 'chaos', 'order']);

const resolveRunePowerValue = (rune?: RuneState | null) => Math.max(1, rune?.powerValue ?? 1);

const isStandardDomainValue = (value?: string | null) => {
  if (!value) {
    return false;
  }
  const normalized = normalizeDomainKey(value);
  return Boolean(normalized && STANDARD_RUNE_DOMAINS.has(normalized));
};

const isUniversalRune = (rune: RuneState) => !isStandardDomainValue(rune.domain);

const runeInstanceKey = (rune: RuneState | undefined, index: number) => {
  if (!rune) {
    return null;
  }
  return (
    rune.runeId ??
    rune.card?.cardId ??
    rune.cardSnapshot?.cardId ??
    `${normalizeDomainKey(rune.domain) || 'rune'}-${index}`
  );
};

type RunePaymentPlan = {
  canPay: boolean;
  runeIndices: number[];
};

const evaluateRunePayment = (
  card?: BaseCard | null,
  runes: RuneState[] = []
): RunePaymentPlan => {
  if (!card) {
    return { canPay: false, runeIndices: [] };
  }
  const rawEnergyCost = typeof card.cost === 'number' ? card.cost : Number(card.cost ?? 0);
  const energyRequirement = Number.isFinite(rawEnergyCost) ? Math.max(0, Math.ceil(rawEnergyCost)) : 0;
  const availableEntries = runes.map((rune, index) => ({ rune, index }));
  if (energyRequirement > availableEntries.length) {
    return { canPay: false, runeIndices: [] };
  }
  const domainDemand = new Map<string, number>();
  Object.entries(card.powerCost ?? {}).forEach(([domainKey, rawValue]) => {
    const normalized = normalizeDomainKey(domainKey);
    if (!normalized || !STANDARD_RUNE_DOMAINS.has(normalized)) {
      return;
    }
    const numeric = Number(rawValue ?? 0);
    const requirement = Number.isFinite(numeric) ? Math.max(0, Math.ceil(numeric)) : 0;
    if (requirement > 0) {
      domainDemand.set(normalized, requirement);
    }
  });
  const reserved = new Set<number>();
  const energySelections: { rune: RuneState; index: number }[] = [];
  const powerAssigned = new Set<number>();

  const claimEntry = (
    predicate: (entry: { rune: RuneState; index: number }) => boolean,
    options?: { allowExhausted?: boolean }
  ): { rune: RuneState; index: number } | null => {
    const allowExhausted = Boolean(options?.allowExhausted);
    for (const entry of availableEntries) {
      if (reserved.has(entry.index)) {
        continue;
      }
      if (!allowExhausted && isRuneExhausted(entry.rune)) {
        continue;
      }
      if (predicate(entry)) {
        reserved.add(entry.index);
        return entry;
      }
    }
    return null;
  };

  const runeDomainDemand = (rune: RuneState) => {
    const normalized = normalizeDomainKey(rune.domain);
    if (!normalized) {
      return 0;
    }
    return domainDemand.get(normalized) ?? 0;
  };

  const useEnergySelectionForPower = (domain: string) => {
    for (const entry of energySelections) {
      if (powerAssigned.has(entry.index)) {
        continue;
      }
      if (
        normalizeDomainKey(entry.rune.domain) === domain &&
        resolveRunePowerValue(entry.rune) > 0
      ) {
        powerAssigned.add(entry.index);
        return entry;
      }
    }
    for (const entry of energySelections) {
      if (powerAssigned.has(entry.index)) {
        continue;
      }
      if (isUniversalRune(entry.rune) && resolveRunePowerValue(entry.rune) > 0) {
        powerAssigned.add(entry.index);
        return entry;
      }
    }
    return null;
  };

  let energyRemaining = energyRequirement;
  while (energyRemaining > 0) {
    const selection =
      claimEntry((entry) => isStandardDomainValue(entry.rune.domain) && runeDomainDemand(entry.rune) > 0) ??
      claimEntry((entry) => isUniversalRune(entry.rune)) ??
      claimEntry((_entry) => true);
    if (!selection) {
      return { canPay: false, runeIndices: [] };
    }
    energySelections.push(selection);
    energyRemaining -= 1;
  }

  for (const [domainKey, requirement] of domainDemand.entries()) {
    let remaining = requirement;
    while (remaining > 0) {
      let selection = useEnergySelectionForPower(domainKey);
      if (!selection) {
        selection = claimEntry(
          (entry) =>
            normalizeDomainKey(entry.rune.domain) === domainKey &&
            resolveRunePowerValue(entry.rune) > 0,
          { allowExhausted: true }
        );
        if (!selection) {
          selection = claimEntry(
            (entry) => isUniversalRune(entry.rune) && resolveRunePowerValue(entry.rune) > 0,
            { allowExhausted: true }
          );
        }
        if (!selection) {
          return { canPay: false, runeIndices: [] };
        }
        energySelections.push(selection);
        powerAssigned.add(selection.index);
      }
      remaining -= resolveRunePowerValue(selection.rune);
    }
  }

  const runeIndices = Array.from(new Set(energySelections.map((entry) => entry.index)));
  return { canPay: true, runeIndices };
};

const convertChampionSnapshot = (
  snapshot?: CardSnapshotLike | null,
  defaults: Partial<BaseCard> = {}
): BaseCard | null => {
  if (!snapshot) {
    return null;
  }
  return snapshotToBaseCard(snapshot, defaults);
};

const parseTimestampMs = (value?: string | null) => {
  if (!value) {
    return 0;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
};

const shouldApplySpectatorOverride = (
  current: SpectatorGameState | undefined,
  incoming: SpectatorGameState | null
) => {
  if (!incoming) {
    return false;
  }
  if (!current) {
    return true;
  }
  const currentRank = resolveStatusRank(current.status);
  const nextRank = resolveStatusRank(incoming.status);
  if (nextRank < currentRank) {
    return false;
  }
  if (nextRank > currentRank) {
    return true;
  }
  const currentTime = parseTimestampMs(current.updatedAt ?? current.timestamp);
  const nextTime = parseTimestampMs(incoming.updatedAt ?? incoming.timestamp);
  return nextTime >= currentTime;
};

type GamePrompt = {
  id: string;
  type: string;
  playerId: string;
  data?: Record<string, any> | null;
  resolved: boolean;
  createdAt?: string | null;
  resolvedAt?: string | null;
  resolution?: Record<string, any> | null;
};

type PriorityWindow = {
  id: string;
  type: string;
  holder: string;
  event?: string | null;
};

type BattlefieldState = {
  battlefieldId: string;
  slug?: string | null;
  name: string;
  ownerId: string;
  controller?: string | null;
  contestedBy: string[];
  lastConqueredTurn?: number | null;
  lastHoldTurn?: number | null;
  lastCombatTurn?: number | null;
  card?: CardSnapshotLike | BaseCard | null;
};

type BattlefieldPromptOption = {
  cardId?: string;
  slug?: string | null;
  name?: string;
  battlefieldId?: string;
  description?: string | null;
  cardSnapshot?: CardSnapshotLike | null;
  card?: CardSnapshotLike | null;
};

type BattlefieldSelectionStatus = {
  playerId: string;
  name?: string;
  isSelf: boolean;
  locked: boolean;
  source: 'final' | 'prompt' | 'pending';
  card: BaseCard | null;
};

type DuelLogEntry = {
  id: string;
  message: string;
  tone: ToastTone;
  timestamp: string;
  playerId?: string | null;
  actorName?: string | null;
  persisted?: boolean;
};

type ChatMessageEntry = {
  id: string;
  message: string;
  playerId?: string | null;
  playerName?: string | null;
  timestamp: string;
  optimistic?: boolean;
};

type NotifyOptions = {
  banner?: boolean;
  persist?: boolean;
  persistKey?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  timestamp?: string | null;
};

const INITIATIVE_RESULT_DELAY_MS = 5000;
const INITIATIVE_SYNC_INTERVAL_MS = 2000;
const BATTLEFIELD_REVEAL_COUNTDOWN_SECONDS = 5;

type SpectatorGameState = {
  matchId: string;
  status: string;
  currentPhase: string;
  turnNumber: number;
  timestamp?: string | null;
  updatedAt?: string | null;
  players: PlayerStateData[];
  prompts: GamePrompt[];
  priorityWindow?: PriorityWindow | null;
  battlefields: BattlefieldState[];
  initiativeWinner?: string | null;
  initiativeLoser?: string | null;
  initiativeSelections?: Record<string, number | null> | null;
  initiativeDecidedAt?: string | null;
  duelLog?: DuelLogEntry[];
  chatLog?: ChatMessageEntry[];
};

interface GameBoardProps {
  matchId: string;
  playerId: string;
}

export default GameBoard;

const RARITY_COLORS: Record<string, string> = {
  common: '#94a3b8',
  uncommon: '#34d399',
  rare: '#fcd34d',
  legendary: '#f472b6',
  epic: '#c084fc',
  promo: '#22d3ee',
};

const GAME_STATUS_PRIORITY: Record<string, number> = {
  waiting_for_players: 0,
  setup: 1,
  coin_flip: 2,
  battlefield_selection: 3,
  mulligan: 4,
  in_progress: 5,
  winner_determined: 6,
  completed: 7,
};

const resolveStatusRank = (status?: string | null) => {
  if (!status) {
    return -1;
  }
  const normalized = status.toLowerCase();
  return GAME_STATUS_PRIORITY[normalized] ?? -1;
};

const DOMAIN_COLORS: Record<string, string> = {
  fury: '#f87171',
  calm: '#38bdf8',
  mind: '#a78bfa',
  order: '#fde047',
  chaos: '#fb923c',
  nature: '#4ade80',
  shadow: '#c084fc',
  tech: '#22d3ee',
  neutral: '#e2e8f0',
};

const MATCH_INIT_RETRY_DELAY = 1500;
const MATCH_INIT_MAX_RETRIES = 20;
const ARENA_SYNC_INTERVAL_MS = 2500;
const CARD_ART_CDN = 'https://static.dotgg.gg/riftbound/cards';
const RUNE_RECYCLE_DURATION_MS = 2600;

const normalizeTone = (value?: string | null): ToastTone => {
  const tone = (value ?? '').toLowerCase();
  if (tone === 'success' || tone === 'warning' || tone === 'error') {
    return tone;
  }
  return 'info';
};

const slugifySegment = (value?: string | null) => {
  if (!value) {
    return null;
  }
  return value
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const normalizeSlugValue = (value?: string | null) => {
  if (!value) {
    return null;
  }
  return value.replace(/\.(png|jpe?g|webp)$/i, '').trim();
};

const deriveAssetSlug = (
  card?: BaseCard | null,
  fallbackId?: string | null,
  fallbackName?: string | null
) => {
  if (card?.slug) {
    return normalizeSlugValue(card.slug);
  }
  if (card?.cardId) {
    return normalizeSlugValue(card.cardId);
  }
  if (fallbackId) {
    return normalizeSlugValue(fallbackId);
  }
  const namePart = slugifySegment(card?.name ?? fallbackName);
  return namePart ?? null;
};

const buildCardArtUrl = (slug?: string | null) => {
  if (!slug) {
    return null;
  }
  const normalizedSlug = normalizeSlugValue(slug);
  if (!normalizedSlug) {
    return null;
  }
  return `${CARD_ART_CDN}/${normalizedSlug}.webp`;
};

const INITIATIVE_OPTIONS: {
  value: number;
  label: string;
  image: StaticImageData;
  description: string;
}[] = [
  {
    value: 0,
    label: "Doran's Blade",
    image: doransBladeImg,
    description: 'Aggressive opening',
  },
  {
    value: 1,
    label: "Doran's Shield",
    image: doransShieldImg,
    description: 'Defensive posture',
  },
  {
    value: 2,
    label: "Doran's Ring",
    image: doransRingImg,
    description: 'Arcane insight',
  },
];

const parseInitiativeChoice = (value: unknown): number | null => {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
  }
  return null;
};

const friendlyStatus = (status?: string) => {
  if (!status) return 'Unknown';
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getCardImage = (
  card?: BaseCard | null,
  options?: { fallbackId?: string | null; fallbackName?: string | null }
) => {
  if (!card) {
    return null;
  }
  const assets = card.assets;
  if (assets?.remote) {
    return assets.remote;
  }
  if (assets?.localPath) {
    if (/^https?:\/\//i.test(assets.localPath)) {
      return assets.localPath;
    }
    const normalized = assets.localPath.replace(/^\/+/, '');
    return `/${normalized}`;
  }
  const slug = deriveAssetSlug(card, options?.fallbackId, options?.fallbackName);
  if (slug) {
    return buildCardArtUrl(slug);
  }
  return null;
};

const formatPowerPool = (pool?: Record<string, number | undefined>) => {
  if (!pool) {
    return 'None';
  }
  const entries = Object.entries(pool).filter(
    ([, value]) => (value ?? 0) > 0
  );
  if (entries.length === 0) {
    return 'None';
  }
  return entries
    .map(([domain, value]) => `${domain}: ${value ?? 0}`)
    .join(', ');
};

const runeSignature = (rune?: RuneState | null) => {
  if (!rune) {
    return 'unknown';
  }
  const snapshot = (rune.cardSnapshot ?? rune.card) as CardSnapshotLike | null;
  const parts = [
    rune.runeId ?? 'unknown',
    rune.slug ?? snapshot?.slug ?? '',
    rune.domain ?? '',
    snapshot?.cardId ?? '',
    snapshot && 'instanceId' in snapshot ? (snapshot as any)?.instanceId ?? '' : '',
  ];
  return parts.join('|');
};

const diffRuneCollections = (prev: RuneState[], next: RuneState[]) => {
  if (prev === next) {
    return [];
  }
  const nextCounts = new Map<string, number>();
  next.forEach((rune) => {
    const key = runeSignature(rune);
    nextCounts.set(key, (nextCounts.get(key) ?? 0) + 1);
  });
  const removed: RuneState[] = [];
  prev.forEach((rune) => {
    const key = runeSignature(rune);
    const current = nextCounts.get(key) ?? 0;
    if (current > 0) {
      nextCounts.set(key, current - 1);
    } else {
      removed.push(rune);
    }
  });
  return removed;
};

const cardIdValue = (card?: BaseCard | null) =>
  card?.instanceId ?? card?.cardId ?? card?.name ?? '';

const resolveHandCardKey = (card?: BaseCard | null, index?: number | null) => {
  if (card?.instanceId) {
    return `hand-${card.instanceId}`;
  }
  const baseId = cardIdValue(card) || 'card';
  if (typeof index === 'number') {
    return `hand-${baseId}-${index}`;
  }
  return `hand-${baseId}`;
};

const combineBoardCards = (...sections: (BaseCard[] | undefined)[]) => {
  const combined: BaseCard[] = [];
  const seen = new Set<string>();
  sections.forEach((group) => {
    group?.forEach((card) => {
      const key = cardIdValue(card);
      if (key && seen.has(key)) {
        return;
      }
      if (key) {
        seen.add(key);
      }
      combined.push(card);
    });
  });
  return combined;
};

const cardMatchesMarker = (card: BaseCard, marker: string) => {
  const normalized = marker.toLowerCase();
  const listMatches = (list?: (string | null | undefined)[] | null) =>
    list?.some((entry) => entry?.toLowerCase().includes(normalized)) ?? false;
  return (
    listMatches(card.tags) ||
    listMatches(card.keywords) ||
    (card.type?.toLowerCase().includes(normalized) ?? false) ||
    (card.name?.toLowerCase().includes(normalized) ?? false)
  );
};

const findCardWithTag = (
  cards: BaseCard[],
  tag: string,
  exclude?: Set<string>
) => {
  return cards.find((card) => {
    const id = cardIdValue(card);
    if (exclude && id && exclude.has(id ?? '')) {
      return false;
    }
    return cardMatchesMarker(card, tag);
  });
};

const buildExcludeSet = (...cards: (BaseCard | undefined)[]) => {
  const ids = new Set<string>();
  cards.forEach((card) => {
    const id = cardIdValue(card);
    if (id) {
      ids.add(id);
    }
  });
  return ids;
};

const randomKey = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const buildDeckOrder = (count: number, prefix: string) => {
  const base = Array.from({ length: count }, (_, index) => `${prefix}-${index}-${randomKey()}`);
  for (let i = base.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base;
};

const alignDeckOrder = (existing: string[], desired: number, prefix: string) => {
  if (desired <= 0) {
    return [];
  }
  if (existing.length === desired) {
    return existing;
  }
  if (existing.length === 0) {
    return buildDeckOrder(desired, prefix);
  }
  if (desired > existing.length) {
    const additions = buildDeckOrder(desired - existing.length, `${prefix}-${existing.length}`);
    return [...existing, ...additions];
  }
  return existing.slice(0, desired);
};

type DrawAnimation = {
  id: string;
  owner: 'self' | 'opponent';
};

type CardSnapshotLike = {
  cardId?: string | null;
  slug?: string | null;
  name?: string | null;
  type?: string | null;
  rarity?: string | null;
  keywords?: string[] | null;
  effect?: string | null;
  assets?: CardAsset | null;
  isTapped?: boolean | null;
  tapped?: boolean | null;
  location?: BaseCard['location'] | null;
};

const snapshotToBaseCard = (
  snapshot?: CardSnapshotLike | null,
  defaults: Partial<BaseCard> = {}
): BaseCard => ({
  cardId: snapshot?.cardId ?? defaults.cardId ?? null,
  instanceId: defaults.instanceId ?? null,
  name: snapshot?.name ?? defaults.name ?? 'Unknown',
  slug: snapshot?.slug ?? defaults.slug ?? null,
  type: snapshot?.type ?? defaults.type ?? 'BATTLEFIELD',
  rarity: snapshot?.rarity ?? defaults.rarity ?? undefined,
  keywords: snapshot?.keywords ?? defaults.keywords ?? undefined,
  text: snapshot?.effect ?? defaults.text ?? undefined,
  isTapped: snapshot?.isTapped ?? defaults.isTapped ?? null,
  tapped: snapshot?.tapped ?? defaults.tapped ?? null,
  assets: snapshot?.assets ?? defaults.assets ?? null,
  location: snapshot?.location ?? defaults.location ?? null,
});

const EMPTY_PLAYER_STATE: PlayerStateData = {
  playerId: '',
  name: '',
  victoryPoints: 0,
  victoryScore: 0,
  mana: 0,
  maxMana: 0,
  handSize: 0,
  deckCount: 0,
  runeDeckSize: 0,
  hand: [],
  board: {
    creatures: [],
    artifacts: [],
    enchantments: [],
  },
  graveyard: [],
  exile: [],
  channeledRunes: [],
  runeDeck: [],
  resources: {
    energy: 0,
    universalPower: 0,
    power: {},
  },
};

interface CardTileProps {
  card?: BaseCard | null;
  label?: string;
  onClick?: () => void;
  selectable?: boolean;
  isSelected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  widthPx?: number;
}

const CardTile: React.FC<CardTileProps> = ({
  card,
  label,
  onClick,
  selectable,
  isSelected,
  disabled,
  compact,
  widthPx,
}) => {
  const image = getCardImage(card);
  const rarityColor =
    RARITY_COLORS[card?.rarity?.toLowerCase() ?? ''] ?? '#475569';
  const statsAvailable =
    card?.power !== undefined && card?.toughness !== undefined;
  const isTapped = Boolean(card?.isTapped ?? card?.tapped);
  const inlineStyle = useMemo<React.CSSProperties>(() => {
    const style: React.CSSProperties = {
      borderColor: rarityColor,
    };
    if (widthPx) {
      style.width = `${widthPx}px`;
    }
    return style;
  }, [rarityColor, widthPx]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || disabled) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={[
        'card-tile',
        compact ? 'card-tile--compact' : '',
        selectable ? 'card-tile--selectable' : '',
        isSelected ? 'card-tile--selected' : '',
        isTapped ? 'card-tile--tapped' : '',
        !card ? 'card-tile--empty' : '',
        disabled ? 'card-tile--disabled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={inlineStyle}
      onClick={disabled ? undefined : onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {image && (
        <div className="card-image">
          <img
            src={image}
            alt={card?.name ?? label ?? 'Card art'}
            loading="lazy"
            draggable={false}
          />
        </div>
      )}
      {label && <div className="card-label">{label}</div>}
      {card?.cost !== undefined && (
        <div className="card-cost">{card.cost ?? 0}</div>
      )}
      {statsAvailable && (
        <div className="card-stats">
          {card?.power ?? 0}/{card?.currentToughness ?? card?.toughness ?? 0}
        </div>
      )}
    </div>
  );
};

const GraveyardPile = ({
  cards,
  compact,
}: {
  cards: BaseCard[];
  compact?: boolean;
}) => {
  const topCard = cards[cards.length - 1] ?? null;
  const total = cards.length;
  const label = `Graveyard (${total})`;
  const topArt = topCard ? getCardImage(topCard) : null;
  const isEmpty = total === 0;
  return (
    <div className={`graveyard-stack ${compact ? 'graveyard-stack--compact' : ''}`}>
      <div className="graveyard-stack__pile">
        {topArt ? (
          <img
            src={topArt}
            alt={topCard?.name ?? 'Top graveyard card'}
            className="graveyard-stack__art"
            width={125}
            height={185}
            draggable={false}
          />
        ) : (
          <div className="graveyard-stack__empty">No cards</div>
        )}
        {!isEmpty && (
          <span className="graveyard-stack__overlay-count">
            {total} {total === 1 ? 'card' : 'cards'}
          </span>
        )}
      </div>
      <div className="section-title">{label}</div>
    </div>
  );
};

type DeckStackProps = {
  label: string;
  count: number;
  owner: 'self' | 'opponent';
  drawAnimations: DrawAnimation[];
  onAnimationComplete: (id: string) => void;
};

const DeckStack = ({
  label,
  count,
  owner,
  drawAnimations,
  onAnimationComplete,
}: DeckStackProps) => {
  const displayCount = Math.max(count, 0);
  return (
    <div className="deck-stack" data-owner={owner}>
      <div className="deck-stack__pile">
        <Image
          src={cardBackImg}
          alt={label}
          width={125}
          height={185}
          draggable={false}
        />
        <span className="deck-stack__overlay-count">
          {displayCount} {displayCount === 1 ? 'card' : 'cards'}
        </span>
        {drawAnimations.map((animation) => (
          <div
            key={animation.id}
            className={`card-draw-animation card-draw-animation--${owner}`}
            onAnimationEnd={() => onAnimationComplete(animation.id)}
            style={{ backgroundImage: `url(${cardBackImg.src})` }}
          />
        ))}
      </div>
      <div className="section-title">{label}</div>
    </div>
  );
};

type BaseGridProps = {
  title: string;
  cards: BaseCard[];
  onCardSelect?: (card: BaseCard) => void;
  selectable?: boolean;
  selectedCardId?: string | null;
};

const BaseGrid = ({
  title,
  cards,
  onCardSelect,
  selectable,
  selectedCardId,
}: BaseGridProps) => (
  <div className="base-grid">
    <div className="section-title">{title}</div>
    <div className="card-row">
      {cards.length !== 0 && (
        cards.map((card) => {
          const instanceId = card.instanceId ?? undefined;
          const isSelected = Boolean(instanceId && selectedCardId === instanceId);
          return (
            <CardTile
              key={cardIdValue(card)}
              card={card}
              compact
              selectable={selectable}
              isSelected={isSelected}
              onClick={
                selectable && onCardSelect ? () => onCardSelect(card) : undefined
              }
            />
          );
        })
      )}
    </div>
  </div>
);

type HandRowProps = {
  isSelf: boolean;
  cards: BaseCard[];
  handSize: number;
  onCardClick?: (index: number) => void;
  onCardDragStart?: (
    index: number,
    card: BaseCard,
    event: React.DragEvent<HTMLDivElement>
  ) => void;
  onCardDragEnd?: () => void;
  mulliganSelection: number[];
  canInteract: boolean;
  idleLabel?: string;
  controls?: ReactNode;
  cardWidth?: number;
  playableStates?: boolean[];
  playingCardKeys?: Set<string>;
};

const HandRow = ({
  isSelf,
  cards,
  handSize,
  onCardClick,
  onCardDragStart,
  onCardDragEnd,
  mulliganSelection,
  canInteract,
  idleLabel,
  controls,
  cardWidth = 125,
  playableStates = [],
  playingCardKeys,
}: HandRowProps) => {
  const displayHand = isSelf ? cards : [];
  const placeholderCount = isSelf ? 0 : handSize;
  return (
    <div className="hand-row__body">
      <div className={`hand-cards ${isSelf ? '' : 'hand-cards--opponent'}`}>
        {isSelf ? (
          displayHand.length === 0 ? (
            <div className="empty-slot wide">{idleLabel ?? 'No cards in hand'}</div>
          ) : (
            displayHand.map((card, index) => {
              const isSelected = mulliganSelection.includes(index);
              const isPlayable = playableStates[index];
              const cardKey = resolveHandCardKey(card, index);
              const isPlaying = playingCardKeys?.has(cardKey) ?? false;
              return (
                <div
                  key={cardKey}
                  className={[
                    'hand-card',
                    isSelected ? 'selected' : '',
                    canInteract ? 'hand-card--active' : '',
                    isPlayable ? 'hand-card--playable' : '',
                    isPlaying ? 'hand-card--playing' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  draggable={Boolean(canInteract && onCardClick)}
                  onDragStart={(event) => {
                    if (!canInteract || !onCardClick) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.effectAllowed = 'move';
                    onCardDragStart?.(index, card, event);
                  }}
                  onDragEnd={() => {
                    onCardDragEnd?.();
                  }}
                  onClick={
                    canInteract && onCardClick
                      ? () => onCardClick(index)
                      : undefined
                  }
                >
                  <CardTile
                    card={card}
                    compact
                    widthPx={cardWidth}
                    selectable={canInteract}
                    isSelected={isSelected}
                  />
                </div>
              );
            })
          )
        ) : (
          placeholderCount === 0 ? (
            <div className="empty-slot wide">{idleLabel ?? 'No cards in hand'}</div>
          ) : (
            Array.from({ length: placeholderCount }).map((_, index) => (
              <div className="hand-card hand-card--back" key={`opp-card-${index}`}>
                <div className="card-back" />
              </div>
            ))
          )
        )}
      </div>
      {controls ? <div className="hand-controls">{controls}</div> : null}
    </div>
  );
};

const resolveRuneCard = (rune: RuneState): BaseCard => {
  const baseSnapshot = (rune.cardSnapshot ?? rune.card) as CardSnapshotLike | null;
  return snapshotToBaseCard(baseSnapshot, {
    cardId: rune.runeId,
    name: rune.name ?? baseSnapshot?.name ?? 'Rune',
    type: baseSnapshot?.type ?? 'Rune',
    slug: rune.slug ?? baseSnapshot?.slug ?? undefined,
    assets: rune.assets ?? baseSnapshot?.assets ?? null,
  });
};

const resolveRuneArt = (rune: RuneState) => {
  const card = resolveRuneCard(rune);
  const slugSource =
    rune.slug ??
    card.slug ??
    ((rune.card ?? rune.cardSnapshot) as CardSnapshotLike | null)?.slug ??
    null;
  const art = getCardImage(card) ?? (slugSource ? buildCardArtUrl(slugSource) : null);
  return { card, art };
};

const RuneTokens = ({
  runes,
  optimisticTaps,
}: {
  runes: RuneState[];
  optimisticTaps?: Set<string>;
}) => {
  if (!runes.length) {
    return <div className="rune-token-strip rune-token-strip--empty" aria-hidden="true" />;
  }
  return (
    <div className="rune-token-strip">
      {runes.map((rune, index) => {
        const { art } = resolveRuneArt(rune);
        const instanceKey = runeInstanceKey(rune, index) ?? `${index}-${rune.runeId ?? rune.slug ?? 'rune'}`;
        const exhausted =
          Boolean(rune.isTapped ?? rune.tapped) || (instanceKey ? optimisticTaps?.has(instanceKey) : false);
        const title = `${rune.name ?? 'Rune'} · ${rune.domain ?? 'Unknown'}`;
        return (
          <div
            className={[
              'rune-token',
              exhausted ? 'rune-token--exhausted' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={`${instanceKey}-${index}`}
            style={{ zIndex: runes.length - index }}
            title={title}
          >
            <div className="rune-token__art-wrapper">
              {art ? (
                <img
                  src={art}
                  alt={rune.name ?? 'Rune'}
                  className="rune-token__art"
                  width={110}
                  height={160}
                  draggable={false}
                />
              ) : (
                <div className="rune-token__placeholder">
                  <span>{rune.name ?? 'Rune'}</span>
                  <small>{rune.domain ?? '—'}</small>
                </div>
              )}
            </div>
            <div className="rune-token__meta">
              <span className="rune-token__name">{rune.name}</span>
              <span className="rune-token__domain">
                {rune.domain ?? '—'} · E{rune.energyValue ?? 0}/P{rune.powerValue ?? 0}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const RuneRecycleLayer = ({ events }: { events: RecycledRuneEvent[] }) => {
  if (!events.length) {
    return null;
  }
  return (
    <div className="rune-recycle-layer" aria-hidden="true">
      {events.map((event) => {
        const { art } = resolveRuneArt(event.rune);
        return (
          <div key={event.id} className="rune-recycle-token">
            <div className="rune-recycle-token__art-wrapper">
              {art ? (
                <img
                  src={art}
                  alt={event.rune.name ?? 'Rune'}
                  className="rune-recycle-token__art"
                  width={110}
                  height={160}
                />
              ) : (
                <div className="rune-token__placeholder">
                  <span>{event.rune.name ?? 'Rune'}</span>
                  <small>{event.rune.domain ?? '—'}</small>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CardBackStack = ({
  label,
  count,
  inline,
}: {
  label: string;
  count: number;
  inline?: boolean;
}) => {
  const displayCount = Math.max(count, 0);
  return (
    <div
      className={['card-back-stack', inline ? 'card-back-stack--inline' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className="card-back-stack__image">
        <Image
          src={cardBackImg}
          alt={label}
          width={125}
          height={185}
          draggable={false}
        />
        <span className="card-back-stack__count">{displayCount} cards</span>
      </div>
      <div className="card-back-stack__label section-title">{label}</div>
    </div>
  );
};

const HiddenHand = ({ count }: { count: number }) => {
  const displayCount = Math.max(count, 4);
  return (
      <div className="hidden-hand__cards">
        {Array.from({ length: displayCount }).map((_, index) => (
          <Image
            key={`hidden-hand-${index}`}
            src={cardBackImg}
            alt="Hidden card"
            width={125}
            height={185}
            draggable={false}
            className="hidden-hand__card"
          />
        ))}
      </div>
  );
};

type MulliganModalProps = {
  cards: BaseCard[];
  selection: number[];
  limit: number;
  loading: boolean;
  waitingMessage?: string | null;
  onToggle: (index: number) => void;
  onConfirm: () => void;
  onSkip: () => void;
};

const MulliganModal = ({
  cards,
  selection,
  limit,
  loading,
  onToggle,
  onConfirm,
  onSkip,
  waitingMessage,
}: MulliganModalProps) => (
  <div className="modal-backdrop">
    <div className="mulligan-modal" role="dialog" aria-modal="true">
      <h3>Mulligan</h3>
      {waitingMessage ? (
        <div className="mulligan-waiting" role="status">
          <span className="phase-spinner" aria-hidden="true" />
          <p>{waitingMessage}</p>
        </div>
      ) : (
        <>
          <p>Select up to {limit} card{limit === 1 ? '' : 's'} to replace.</p>
          <p className="mulligan-count">
            Selected {selection.length} / {limit}
            {selection.length === limit ? ' · Ready to submit' : ''}
          </p>
          <div className="mulligan-card-grid">
            {cards.map((card, index) => {
              const isSelected = selection.includes(index);
              const disabled = loading;
              const handleClick = () => {
                if (disabled) {
                  return;
                }
                onToggle(index);
              };
              return (
                <div
                  key={resolveHandCardKey(card, index)}
                  className={[
                    'mulligan-card-button',
                    isSelected ? 'mulligan-card-button--selected' : '',
                    disabled ? 'mulligan-card-button--disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={handleClick}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleClick();
                    }
                  }}
                >
                  <CardTile card={card} compact widthPx={125} isSelected={isSelected} />
                </div>
              );
            })}
          </div>
          <div className="mulligan-actions">
            <button
              type="button"
              className="prompt-button secondary"
              onClick={onSkip}
              disabled={loading}
            >
              No Mulligan
            </button>
            <button
              type="button"
              className="prompt-button primary mulligan-button"
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? 'Submitting…' : 'Confirm Selection'}
            </button>
          </div>
        </>
      )}
    </div>
  </div>
);

const AnnouncementModal = ({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div className="announcement-modal">
      <div className="announcement-card">
        <p>{message}</p>
      </div>
    </div>
  );
};

type BattlefieldChoice = {
  id: string;
  label: string;
  description?: string;
  card: BaseCard;
  art?: string | null;
};

const isMatchNotFoundError = (error?: ApolloError | null) => {
  if (!error) {
    return false;
  }
  const normalized = (error.message ?? '').toLowerCase();
  if (normalized.includes('match not found')) {
    return true;
  }
  return error.graphQLErrors?.some((graphError) =>
    graphError.message.toLowerCase().includes('match not found')
  );
};

export function GameBoard({ matchId, playerId }: GameBoardProps) {
  const {
    data: basePlayerData,
    loading: playerLoading,
    error: playerError,
    refetch: refetchPlayerMatch,
  } = usePlayerMatch(matchId, playerId);
  const {
    data: baseSpectatorData,
    loading: spectatorLoading,
    error: spectatorError,
    refetch: refetchMatch,
  } = useMatch(matchId);

  const { data: playerSubData } = usePlayerGameStateSubscription(
    matchId,
    playerId
  );
  const { data: spectatorSubData } = useGameStateSubscription(matchId);
  const { data: cardPlayedData } = useCardPlayedSubscription(matchId);
  const { data: attackDeclaredData } = useAttackDeclaredSubscription(matchId);
  const { data: phaseChangedData } = usePhaseChangedSubscription(matchId);

  const [playCard, { loading: playingCard }] = usePlayCard();
  const [moveUnit, { loading: movingUnit }] = useMoveUnit();
  const [nextPhase, { loading: advancingPhase }] = useNextPhase();
  const [concedeMatch] = useConcedeMatch();
  const [submitMulligan, { loading: submittingMulligan }] =
    useSubmitMulligan();
  const [selectBattlefield, { loading: selectingBattlefield }] =
    useSelectBattlefield();
  const [
    submitInitiativeChoice,
    { loading: submittingInitiativeChoice },
  ] = useSubmitInitiativeChoice();
  const [recordDuelLogEntryMutation] = useRecordDuelLogEntry();
  const [sendChatMessageMutation] = useSendChatMessage();

  const [playerOverride, setPlayerOverride] = useState<PlayerMatchView | null>(null);
  const [spectatorOverride, setSpectatorOverride] = useState<SpectatorGameState | null>(null);
  const [battlefieldCountdown, setBattlefieldCountdown] = useState<number | null>(null);
  const [battlefieldAdvanceTriggered, setBattlefieldAdvanceTriggered] = useState(false);
  const [battlefieldAdvanceComplete, setBattlefieldAdvanceComplete] = useState(false);
  useEffect(() => {
    setBattlefieldCountdown(null);
    setBattlefieldAdvanceTriggered(false);
    setBattlefieldAdvanceComplete(false);
    runeCountRefs.current = { self: 0, opponent: 0 };
    runeInitRefs.current = { self: false, opponent: false };
    setOptimisticRuneTaps(new Set());
    Object.values(runeTapTimeouts.current).forEach((timeout) => clearTimeout(timeout));
    runeTapTimeouts.current = {};
  }, [matchId]);
  const [mulliganSelection, setMulliganSelection] = useState<number[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [pendingDeployment, setPendingDeployment] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [sawMulliganPhase, setSawMulliganPhase] = useState(false);
  const [mulliganCompleteNotified, setMulliganCompleteNotified] = useState(false);
  const { pushToast } = useToasts();
  const [duelLog, setDuelLog] = useState<DuelLogEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessageEntry[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [draggingHandIndex, setDraggingHandIndex] = useState<number | null>(null);
  const [draggingCardKey, setDraggingCardKey] = useState<string | null>(null);
  const [boardDragHover, setBoardDragHover] = useState(false);
  const [handPlayAnimations, setHandPlayAnimations] = useState<Set<string>>(new Set());
  const handAnimationTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [optimisticRuneTaps, setOptimisticRuneTaps] = useState<Set<string>>(new Set());
  const runeTapTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const duelLogCounter = useRef(0);
  const autoMulliganRef = useRef(false);
  const selfZoneRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    return () => {
      Object.values(handAnimationTimeouts.current).forEach((timeout) => clearTimeout(timeout));
      handAnimationTimeouts.current = {};
      Object.values(runeTapTimeouts.current).forEach((timeout) => clearTimeout(timeout));
      runeTapTimeouts.current = {};
    };
  }, []);
  const appendLog = useCallback(
    (
      message: string,
      tone: ToastTone = 'info',
      metadata?: {
        id?: string | null;
        playerId?: string | null;
        actorName?: string | null;
        timestamp?: string | null;
        persisted?: boolean;
      }
    ) => {
      setDuelLog((prev) => {
        const entry: DuelLogEntry = {
          id: metadata?.id ?? `${Date.now()}-${duelLogCounter.current++}`,
          message,
          tone,
          timestamp: metadata?.timestamp ?? new Date().toISOString(),
          playerId: metadata?.playerId ?? null,
          actorName: metadata?.actorName ?? null,
          persisted: metadata?.persisted ?? false,
        };
        const next = [entry, ...prev.filter((existing) => existing.id !== entry.id)];
        return next.slice(0, 200);
      });
    },
    []
  );
  const persistDuelLogEntry = useCallback(
    async ({
      id,
      message,
      tone,
      playerId: actorId,
      actorName,
    }: {
      id: string;
      message: string;
      tone: ToastTone;
      playerId?: string | null;
      actorName?: string | null;
    }) => {
      if (!matchId || !id) {
        return;
      }
      try {
        await recordDuelLogEntryMutation({
          variables: {
            matchId,
            playerId: actorId ?? playerId,
            message,
            tone,
            entryId: id,
            actorName: actorName ?? undefined,
          },
          context: { skipNetworkActivity: true },
        });
      } catch (error) {
        console.warn('Failed to persist duel log entry', error);
      }
    },
    [matchId, playerId, recordDuelLogEntryMutation]
  );
  const notify = useCallback(
    (message: string, tone: ToastTone = 'info', options?: NotifyOptions) => {
      pushToast(message, tone);
      appendLog(message, tone, {
        id: options?.persistKey ?? undefined,
        playerId: options?.actorId ?? null,
        actorName: options?.actorName ?? null,
        timestamp: options?.timestamp ?? undefined,
        persisted: Boolean(options?.persistKey),
      });
      if (options?.banner) {
        setActionMessage(message);
      }
      if (options?.persist && options?.persistKey) {
        persistDuelLogEntry({
          id: options.persistKey,
          message,
          tone,
          playerId: options.actorId ?? null,
          actorName: options.actorName ?? undefined,
        });
      }
    },
    [appendLog, persistDuelLogEntry, pushToast, setActionMessage]
  );
  const triggerHandAnimation = useCallback((key?: string | null) => {
    if (!key) {
      return;
    }
    setHandPlayAnimations((prev) => {
      if (prev.has(key)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    const pendingTimeout = handAnimationTimeouts.current[key];
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
    }
    handAnimationTimeouts.current[key] = setTimeout(() => {
      setHandPlayAnimations((prev) => {
        if (!prev.has(key)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      delete handAnimationTimeouts.current[key];
    }, 420);
  }, []);
  const runeCountRefs = useRef({ self: 0, opponent: 0 });
  const runeInitRefs = useRef({ self: false, opponent: false });
  const lastTurnHolderRef = useRef<string | null>(null);
  const [matchInitRetries, setMatchInitRetries] = useState(0);
  const [playerDeckOrder, setPlayerDeckOrder] = useState<string[]>([]);
  const [opponentDeckOrder, setOpponentDeckOrder] = useState<string[]>([]);
  const [drawQueue, setDrawQueue] = useState<DrawAnimation[]>([]);
  const previousPlayerDeckCount = useRef(0);
  const previousOpponentDeckCount = useRef(0);
  const matchSeedRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const [initiativeRevealActive, setInitiativeRevealActive] = useState(false);
  const [pendingInitiativeChoice, setPendingInitiativeChoice] = useState<number | null>(null);
  const [tieMessage, setTieMessage] = useState<string | null>(null);
  const lastResolvedRoundRef = useRef<{ player?: number | null; opponent?: number | null } | null>(
    null
  );
  const lastCoinFlipPromptIdRef = useRef<string | null>(null);
  const queueDrawAnimations = useCallback(
    (owner: 'self' | 'opponent', amount: number) => {
      if (amount <= 0) {
        return;
      }
      setDrawQueue((prev) => [
        ...prev,
        ...Array.from({ length: amount }).map(() => ({
          id: `${matchId}-${owner}-${randomKey()}`,
          owner,
        })),
      ]);
    },
    [matchId]
  );
  const handleDrawAnimationComplete = useCallback((animationId: string) => {
    setDrawQueue((prev) => prev.filter((entry) => entry.id !== animationId));
  }, []);
  const playerDrawAnimations = useMemo(
    () => drawQueue.filter((entry) => entry.owner === 'self'),
    [drawQueue]
  );
  const opponentDrawAnimations = useMemo(
    () => drawQueue.filter((entry) => entry.owner === 'opponent'),
    [drawQueue]
  );

  const latestPlayerView =
    playerOverride ??
    playerSubData?.playerGameStateChanged ??
    basePlayerData?.playerMatch;
  const latestSpectatorState =
    spectatorOverride ??
    spectatorSubData?.gameStateChanged ??
    baseSpectatorData?.match;
  const [playerSnapshot, setPlayerSnapshot] = useState<PlayerMatchView | null>(null);
  const [spectatorSnapshot, setSpectatorSnapshot] = useState<SpectatorGameState | null>(null);
  useEffect(() => {
    if (latestPlayerView) {
      setPlayerSnapshot(latestPlayerView);
    }
  }, [latestPlayerView]);
  useEffect(() => {
    if (latestSpectatorState) {
      setSpectatorSnapshot(latestSpectatorState);
    }
  }, [latestSpectatorState]);
  const playerView =
    latestPlayerView ??
    playerSnapshot ??
    null;
  const spectatorState: SpectatorGameState | undefined =
    latestSpectatorState ??
    spectatorSnapshot ??
    undefined;
  const refreshArenaState = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }
    const refreshPromise = (async () => {
      try {
        const result = await refetchMatch();
        const nextState = (result.data?.match ?? null) as SpectatorGameState | null;
        if (shouldApplySpectatorOverride(spectatorState, nextState)) {
          setSpectatorOverride(nextState);
        }
      } catch (error) {
        console.error('Failed to refresh match snapshot', error);
      }
      try {
        const playerResult = await refetchPlayerMatch();
        if (playerResult.data?.playerMatch) {
          setPlayerOverride(playerResult.data.playerMatch as PlayerMatchView);
        }
      } catch (error) {
        console.error('Failed to refresh player snapshot', error);
      }
    })();
    refreshInFlightRef.current = refreshPromise.finally(() => {
      refreshInFlightRef.current = null;
    });
    return refreshInFlightRef.current;
  }, [refetchMatch, refetchPlayerMatch, spectatorState]);
  const rawCurrentPlayer = (playerView?.currentPlayer ?? null) as
    | PlayerStateData
    | null;
  const hasCurrentPlayer = Boolean(rawCurrentPlayer);
  const currentPlayer: PlayerStateData =
    rawCurrentPlayer ?? EMPTY_PLAYER_STATE;
  const playerCreatures: BaseCard[] =
    rawCurrentPlayer?.board?.creatures ?? [];
  const playerDeckCount = rawCurrentPlayer?.deckCount ?? 0;
  const selectedUnitCard = useMemo(
    () =>
      playerCreatures.find((card) => card.instanceId === selectedUnit) ?? null,
    [playerCreatures, selectedUnit]
  );

  const opponent: OpponentSummary | undefined = playerView?.opponent ?? undefined;
  const flow: GameStateView | undefined = playerView?.gameState;
  const spectatorPlayers = spectatorState?.players ?? [];
  const spectatorSelf = spectatorPlayers.find(
    (p) => p.playerId === playerId
  );
  const spectatorOpponent = spectatorPlayers.find(
    (p) => p.playerId !== playerId
  );
  const playerNameLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    spectatorPlayers.forEach((entry) => {
      if (entry.playerId && entry.name) {
        lookup.set(entry.playerId, entry.name);
      }
    });
    return lookup;
  }, [spectatorPlayers]);
  const selfDisplayName = currentPlayer?.name ?? spectatorSelf?.name ?? null;
  const syncChatMessages = useCallback(
    (serverChat?: (ChatMessageEntry | null)[] | null) => {
      if (!serverChat) {
        return;
      }
      setChatMessages((prev) => {
        const merged = new Map<string, ChatMessageEntry>();
        serverChat.forEach((entry) => {
          if (!entry?.id) {
            return;
          }
          merged.set(entry.id, {
            id: entry.id,
            message: entry.message ?? '',
            playerId: entry.playerId ?? null,
            playerName: entry.playerName ?? null,
            timestamp: entry.timestamp ?? new Date().toISOString(),
            optimistic: false,
          });
        });
        prev.forEach((entry) => {
          if (!entry.id) {
            return;
          }
          if (!merged.has(entry.id)) {
            merged.set(entry.id, entry);
          }
        });
        return Array.from(merged.values()).sort(
          (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
        );
      });
    },
    []
  );
  useEffect(() => {
    const serverLog = spectatorState?.duelLog ?? null;
    if (!serverLog) {
      return;
    }
    setDuelLog((prev) => {
      const merged = new Map<string, DuelLogEntry>();
      serverLog.forEach((entry) => {
        if (!entry?.id) {
          return;
        }
        merged.set(entry.id, {
          id: entry.id,
          message: entry.message,
          tone: normalizeTone(entry.tone),
          timestamp: entry.timestamp ?? new Date().toISOString(),
          playerId: entry.playerId ?? null,
          actorName: entry.actorName ?? null,
          persisted: true,
        });
      });
      prev.forEach((entry) => {
        if (!entry.persisted || !merged.has(entry.id)) {
          merged.set(entry.id, entry);
        }
      });
      return Array.from(merged.values()).sort(
        (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
      );
    });
  }, [spectatorState?.duelLog]);
  useEffect(() => {
    const serverChat = spectatorState?.chatLog ?? null;
    if (!serverChat) {
      return;
    }
    syncChatMessages(serverChat);
  }, [spectatorState?.chatLog, syncChatMessages]);
  const resolvePlayerLabel = useCallback(
    (id?: string | null, fallback = 'Unknown duelist') => {
      if (!id) {
        return fallback;
      }
      if (id === playerId) {
        return selfDisplayName ?? 'You';
      }
      return playerNameLookup.get(id) ?? fallback;
    },
    [playerId, playerNameLookup, selfDisplayName]
  );
  const opponentPlayerId = spectatorOpponent?.playerId ?? opponent?.playerId ?? null;
  const opponentDeckCount = spectatorOpponent?.deckCount ?? 0;

  const isLoading =
    (!playerView && playerLoading) || (!spectatorState && spectatorLoading);
  const matchInitializing =
    isMatchNotFoundError(playerError) || isMatchNotFoundError(spectatorError);
  const hasMatchInitTimedOut =
    matchInitializing && matchInitRetries >= MATCH_INIT_MAX_RETRIES;

  useEffect(() => {
    if (!matchInitializing) {
      setMatchInitRetries(0);
      return;
    }
    if (hasMatchInitTimedOut) {
      return;
    }
    const retryTimer = setTimeout(() => {
      setMatchInitRetries((prev) => prev + 1);
      refetchPlayerMatch();
      refetchMatch();
    }, MATCH_INIT_RETRY_DELAY);
    return () => clearTimeout(retryTimer);
  }, [
    hasMatchInitTimedOut,
    matchInitializing,
    matchInitRetries,
    refetchMatch,
    refetchPlayerMatch,
  ]);

  useEffect(() => {
    if (!actionMessage) {
      return;
    }
    const timeout = setTimeout(() => setActionMessage(null), 4000);
    return () => clearTimeout(timeout);
  }, [actionMessage]);

  useEffect(() => {
    if (!matchId) {
      return;
    }
    if (matchSeedRef.current === matchId) {
      return;
    }
    matchSeedRef.current = matchId;
    setPlayerDeckOrder(buildDeckOrder(playerDeckCount, `self-${matchId}`));
    setOpponentDeckOrder(buildDeckOrder(opponentDeckCount, `opponent-${matchId}`));
    previousPlayerDeckCount.current = playerDeckCount;
    previousOpponentDeckCount.current = opponentDeckCount;
    setDrawQueue([]);
  }, [matchId, playerDeckCount, opponentDeckCount]);

  useEffect(() => {
    if (!matchId) {
      return;
    }
    const syncInterval = setInterval(() => {
      void refreshArenaState();
    }, ARENA_SYNC_INTERVAL_MS);
    return () => clearInterval(syncInterval);
  }, [matchId, refreshArenaState]);

  useEffect(() => {
    setPlayerOverride(null);
    setSpectatorOverride(null);
  }, [matchId]);
  useEffect(() => {
    setPlayerSnapshot(null);
    setSpectatorSnapshot(null);
    refreshInFlightRef.current = null;
  }, [matchId]);

  useEffect(() => {
    if (playerSubData?.playerGameStateChanged) {
      setPlayerOverride(null);
      void refreshArenaState();
    }
  }, [playerSubData?.playerGameStateChanged, refreshArenaState]);

  useEffect(() => {
    if (spectatorSubData?.gameStateChanged) {
      setSpectatorOverride(null);
      void refreshArenaState();
    }
  }, [refreshArenaState, spectatorSubData?.gameStateChanged]);

  useEffect(() => {
    setPlayerDeckOrder((prev) => alignDeckOrder(prev, playerDeckCount, `self-${matchId}`));
  }, [playerDeckCount, matchId]);

  useEffect(() => {
    setOpponentDeckOrder((prev) =>
      alignDeckOrder(prev, opponentDeckCount, `opponent-${matchId}`)
    );
  }, [opponentDeckCount, matchId]);

  useEffect(() => {
    const previous = previousPlayerDeckCount.current;
    if (playerDeckCount < previous) {
      queueDrawAnimations('self', previous - playerDeckCount);
    }
    previousPlayerDeckCount.current = playerDeckCount;
  }, [playerDeckCount, queueDrawAnimations]);

  useEffect(() => {
    const previous = previousOpponentDeckCount.current;
    if (opponentDeckCount < previous) {
      queueDrawAnimations('opponent', previous - opponentDeckCount);
    }
    previousOpponentDeckCount.current = opponentDeckCount;
  }, [opponentDeckCount, queueDrawAnimations]);

  const cardPlayedEvent = cardPlayedData?.cardPlayed ?? null;
  useEffect(() => {
    if (!cardPlayedEvent) {
      return;
    }
    const actor = resolvePlayerLabel(cardPlayedEvent.playerId, 'A duelist');
    const cardName = cardPlayedEvent.card?.name ?? 'a card';
    const persistKey = [
      'card',
      cardPlayedEvent.timestamp,
      cardPlayedEvent.playerId,
      cardPlayedEvent.card?.cardId ?? cardPlayedEvent.card?.name ?? ''
    ]
      .filter(Boolean)
      .join(':');
    notify(`${actor} played ${cardName}.`, 'info', {
      persist: true,
      persistKey,
      actorId: cardPlayedEvent.playerId,
      actorName: actor,
      timestamp: cardPlayedEvent.timestamp,
    });
  }, [cardPlayedEvent, notify, resolvePlayerLabel]);

  const attackDeclaredEvent = attackDeclaredData?.attackDeclared ?? null;
  useEffect(() => {
    if (!attackDeclaredEvent) {
      return;
    }
    const actor = resolvePlayerLabel(attackDeclaredEvent.playerId, 'A duelist');
    const destinationLabel =
      attackDeclaredEvent.destinationId === 'base' ? 'the base' : 'a battlefield';
    const persistKey = [
      'attack',
      attackDeclaredEvent.timestamp,
      attackDeclaredEvent.playerId,
      attackDeclaredEvent.creatureInstanceId,
      attackDeclaredEvent.destinationId
    ]
      .filter(Boolean)
      .join(':');
    notify(`${actor} launched an attack on ${destinationLabel}.`, 'warning', {
      persist: true,
      persistKey,
      actorId: attackDeclaredEvent.playerId,
      actorName: actor,
      timestamp: attackDeclaredEvent.timestamp,
    });
  }, [attackDeclaredEvent, notify, resolvePlayerLabel]);

  const phaseChangedEvent = phaseChangedData?.phaseChanged ?? null;
  useEffect(() => {
    if (!phaseChangedEvent) {
      return;
    }
    const phaseLabel = friendlyStatus(phaseChangedEvent.newPhase);
    const persistKey = ['phase', phaseChangedEvent.timestamp, phaseChangedEvent.newPhase]
      .filter(Boolean)
      .join(':');
    notify(`Turn ${phaseChangedEvent.turnNumber}: ${phaseLabel} phase`, 'info', {
      persist: true,
      persistKey,
      actorId: null,
      timestamp: phaseChangedEvent.timestamp,
    });
  }, [friendlyStatus, notify, phaseChangedEvent]);

  const prompts = spectatorState?.prompts ?? [];
  const myPrompts = prompts.filter(
    (prompt) => prompt.playerId === playerId && !prompt.resolved
  );
  const coinFlipPrompt = myPrompts.find(
    (prompt) => prompt.type === 'coin_flip'
  );
  const battlefieldPrompt = myPrompts.find(
    (prompt) => prompt.type === 'battlefield'
  );
  const mulliganPrompt = myPrompts.find(
    (prompt) => prompt.type === 'mulligan'
  );
  const mulliganLimit =
    typeof mulliganPrompt?.data?.maxReplacements === 'number'
      ? mulliganPrompt.data.maxReplacements
      : 2;
  const unresolvedMulliganPrompts = useMemo(
    () => prompts.filter((prompt) => prompt.type === 'mulligan' && !prompt.resolved),
    [prompts]
  );
  const playerMulliganPending = Boolean(mulliganPrompt);
  const opponentMulliganPending = useMemo(
    () =>
      Boolean(
        opponentPlayerId &&
          unresolvedMulliganPrompts.some((prompt) => prompt.playerId === opponentPlayerId)
      ),
    [opponentPlayerId, unresolvedMulliganPrompts]
  );

  const battlefieldPrompts = useMemo(
    () => prompts.filter((prompt) => prompt.type === 'battlefield'),
    [prompts]
  );
  const coinFlipPrompts = useMemo(
    () => prompts.filter((prompt) => prompt.type === 'coin_flip'),
    [prompts]
  );
  const opponentCoinFlipPrompt = useMemo(() => {
    if (!opponentPlayerId) {
      return null;
    }
    return (
      coinFlipPrompts.find(
        (prompt) => prompt.playerId === opponentPlayerId && !prompt.resolved
      ) ?? null
    );
  }, [coinFlipPrompts, opponentPlayerId]);
  const playerInitiativeLocked = useMemo(
    () =>
      coinFlipPrompts.some(
        (prompt) => prompt.playerId === playerId && prompt.resolved
      ),
    [coinFlipPrompts, playerId]
  );
  const opponentInitiativeLocked = useMemo(
    () =>
      Boolean(
        opponentPlayerId &&
          coinFlipPrompts.some(
            (prompt) => prompt.playerId === opponentPlayerId && prompt.resolved
          )
      ),
    [coinFlipPrompts, opponentPlayerId]
  );

  const selectionLookup = useMemo(() => {
    const lookup: Record<string, number> = {};
    if (spectatorState?.initiativeSelections) {
      Object.entries(spectatorState.initiativeSelections).forEach(([id, choice]) => {
        if (typeof choice === 'number' && !Number.isNaN(choice)) {
          lookup[id] = choice;
        }
      });
    }
    coinFlipPrompts.forEach((prompt) => {
      const choice =
        parseInitiativeChoice(prompt.resolution?.choice) ??
        parseInitiativeChoice(prompt.resolution?.value) ??
        parseInitiativeChoice(prompt.resolution?.cardId);
      if (choice != null) {
        lookup[prompt.playerId] = choice;
      }
    });
    return lookup;
  }, [coinFlipPrompts, spectatorState?.initiativeSelections]);

  const playerSelectionChoice = selectionLookup[playerId] ?? null;
  const opponentSelectionChoice = opponentPlayerId
    ? selectionLookup[opponentPlayerId] ?? null
    : null;
  const highlightedChoice = pendingInitiativeChoice ?? playerSelectionChoice ?? null;
  const playerDisplayedChoice = playerSelectionChoice ?? pendingInitiativeChoice ?? null;
  const playerChoiceMeta =
    playerDisplayedChoice != null
      ? INITIATIVE_OPTIONS.find((option) => option.value === playerDisplayedChoice) ?? null
      : null;
  const bothInitiativeSelectionsSubmitted =
    playerSelectionChoice != null && opponentSelectionChoice != null;
  const canRevealOpponentChoice =
    bothInitiativeSelectionsSubmitted || Boolean(spectatorState?.initiativeWinner);
  const awaitingOpponentSelection =
    !canRevealOpponentChoice && Boolean(playerDisplayedChoice);
  const opponentChoiceMeta =
    canRevealOpponentChoice && opponentSelectionChoice != null
      ? INITIATIVE_OPTIONS.find((option) => option.value === opponentSelectionChoice) ?? null
      : null;

  useEffect(() => {
    if (!mulliganPrompt) {
      setMulliganSelection([]);
    }
  }, [mulliganPrompt?.id]);

  useEffect(() => {
    setSawMulliganPhase(false);
    setMulliganCompleteNotified(false);
  }, [matchId]);

  useEffect(() => {
    if (!sawMulliganPhase && prompts.some((prompt) => prompt.type === 'mulligan')) {
      setSawMulliganPhase(true);
    }
  }, [prompts, sawMulliganPhase]);

  useEffect(() => {
    const mulliganStillPending = prompts.some(
      (prompt) => prompt.type === 'mulligan' && !prompt.resolved
    );
    if (sawMulliganPhase && !mulliganStillPending && !mulliganCompleteNotified) {
      notify('Mulligan phase completed', 'success', { banner: true });
      setMulliganCompleteNotified(true);
    } else if (mulliganStillPending && mulliganCompleteNotified) {
      setMulliganCompleteNotified(false);
    }
  }, [mulliganCompleteNotified, notify, prompts, sawMulliganPhase]);

  useEffect(() => {
    if (selectedUnit && !selectedUnitCard) {
      setSelectedUnit(null);
    }
  }, [selectedUnit, selectedUnitCard]);

  useEffect(() => {
    if (playerSelectionChoice != null) {
      setPendingInitiativeChoice(null);
    }
  }, [playerSelectionChoice]);

  useEffect(() => {
    const currentPromptId = coinFlipPrompt?.id ?? null;
    if (
      lastCoinFlipPromptIdRef.current &&
      currentPromptId &&
      lastCoinFlipPromptIdRef.current !== currentPromptId
    ) {
      setPendingInitiativeChoice(null);
    }
    if (!currentPromptId && !playerInitiativeLocked) {
      setPendingInitiativeChoice(null);
    }
    lastCoinFlipPromptIdRef.current = currentPromptId;
  }, [coinFlipPrompt?.id, playerInitiativeLocked]);

  const canMoveSelectedToBase =
    Boolean(
      selectedUnitCard &&
        selectedUnitCard.location &&
        selectedUnitCard.location.zone === 'battlefield'
    );

  const [legendCard, leaderCard] = useMemo(() => {
    const snapshotLegend = convertChampionSnapshot(rawCurrentPlayer?.championLegend, {
      type: 'CREATURE',
    });
    const legend = snapshotLegend ?? findCardWithTag(playerCreatures, 'legend');
    const leaderExcludeSet = buildExcludeSet(legend ?? undefined);
    const snapshotLeader = convertChampionSnapshot(rawCurrentPlayer?.championLeader, {
      type: 'CREATURE',
    });
    const leader = snapshotLeader ?? findCardWithTag(playerCreatures, 'leader', leaderExcludeSet);
    return [legend, leader];
  }, [playerCreatures, rawCurrentPlayer?.championLeader, rawCurrentPlayer?.championLegend]);

  const [opponentLegend, opponentLeader] = useMemo(() => {
    const opponentCreatures =
      spectatorOpponent?.board?.creatures ?? playerView?.opponent?.board?.creatures ?? [];
    const snapshotLegend = convertChampionSnapshot(
      spectatorOpponent?.championLegend ?? playerView?.opponent?.championLegend,
      {
        type: 'CREATURE',
      }
    );
    const legend = snapshotLegend ?? findCardWithTag(opponentCreatures, 'legend');
    const leaderExcludeSet = buildExcludeSet(legend ?? undefined);
    const snapshotLeader = convertChampionSnapshot(
      spectatorOpponent?.championLeader ?? playerView?.opponent?.championLeader,
      {
        type: 'CREATURE',
      }
    );
    const leader = snapshotLeader ?? findCardWithTag(opponentCreatures, 'leader', leaderExcludeSet);
    return [legend, leader];
  }, [
    playerView?.opponent?.board?.creatures,
    playerView?.opponent?.championLeader,
    playerView?.opponent?.championLegend,
    spectatorOpponent?.board?.creatures,
    spectatorOpponent?.championLeader,
    spectatorOpponent?.championLegend,
  ]);

  const battlefields = spectatorState?.battlefields ?? [];
  const controlledBattlefields = useMemo(
    () => battlefields.filter((field) => field.controller === playerId),
    [battlefields, playerId]
  );
  const priorityWindow = spectatorState?.priorityWindow;
  const rawStatus = spectatorState?.status ?? 'in_progress';
  const matchStatus = rawStatus.toUpperCase();
  const isCoinFlipPhase = rawStatus === 'coin_flip';
  const isBattlefieldPhaseActive = rawStatus === 'battlefield_selection';
  const canAct = Boolean(flow?.canAct);
  const activeTurnPlayerId = useMemo(() => {
    if (
      typeof flow?.currentPlayerIndex === 'number' &&
      spectatorPlayers.length > flow.currentPlayerIndex
    ) {
      return spectatorPlayers[flow.currentPlayerIndex]?.playerId ?? null;
    }
    return priorityWindow?.holder ?? null;
  }, [flow?.currentPlayerIndex, priorityWindow?.holder, spectatorPlayers]);
  const canPlayCards =
    canAct &&
    rawStatus === 'in_progress' &&
    !mulliganPrompt &&
    !battlefieldPrompt;
  useEffect(() => {
    if (
      pendingDeployment != null &&
      (!canPlayCards || pendingDeployment >= currentPlayer.hand.length)
    ) {
      setPendingDeployment(null);
    }
  }, [canPlayCards, currentPlayer.hand.length, pendingDeployment]);
  const canAdvancePhase = canAct && rawStatus === 'in_progress';
  const awaitingInitiativeResolution =
    rawStatus === 'coin_flip' &&
    !coinFlipPrompt &&
    !opponentCoinFlipPrompt &&
    (playerInitiativeLocked || opponentInitiativeLocked);
  const shouldPollInitiative =
    rawStatus === 'coin_flip' && playerInitiativeLocked && !spectatorState?.initiativeWinner;

  useEffect(() => {
    if (!shouldPollInitiative) {
      return;
    }
    let cancelled = false;
    const triggerSync = () => {
      if (cancelled) {
        return;
      }
      void Promise.allSettled([refetchMatch(), refetchPlayerMatch()]);
    };
    triggerSync();
    const pollingInterval = setInterval(triggerSync, INITIATIVE_SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(pollingInterval);
    };
  }, [refetchMatch, refetchPlayerMatch, shouldPollInitiative]);

  const initiativeOutcome = useMemo(() => {
    if (!spectatorState?.initiativeWinner) {
      return null;
    }
    const selections = spectatorState.initiativeSelections ?? null;
    const winnerChoice = selections
      ? selections[spectatorState.initiativeWinner] ?? null
      : null;
    const choiceLabel =
      INITIATIVE_OPTIONS.find((option) => option.value === winnerChoice)?.label ?? null;
    return {
      winnerId: spectatorState.initiativeWinner,
      loserId: spectatorState.initiativeLoser ?? null,
      winnerLabel: resolvePlayerLabel(spectatorState.initiativeWinner, 'Unknown duelist'),
      loserLabel: spectatorState.initiativeLoser
        ? resolvePlayerLabel(spectatorState.initiativeLoser, 'Unknown duelist')
        : null,
      winnerIsSelf: spectatorState.initiativeWinner === playerId,
      winnerChoiceLabel: choiceLabel,
    };
  }, [
    spectatorState?.initiativeWinner,
    spectatorState?.initiativeLoser,
    spectatorState?.initiativeSelections,
    playerId,
    resolvePlayerLabel,
  ]);
  useEffect(() => {
    if (!spectatorState?.initiativeWinner) {
      setInitiativeRevealActive(false);
      return;
    }
    if (rawStatus === 'coin_flip') {
      return;
    }
    setInitiativeRevealActive(true);
    const timeout = setTimeout(() => setInitiativeRevealActive(false), INITIATIVE_RESULT_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [rawStatus, spectatorState?.initiativeWinner]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const bothChosen =
      playerSelectionChoice != null && opponentSelectionChoice != null;
    if (bothChosen && !spectatorState?.initiativeWinner) {
      lastResolvedRoundRef.current = {
        player: playerSelectionChoice,
        opponent: opponentSelectionChoice,
      };
    } else if (
      !bothChosen &&
      !spectatorState?.initiativeWinner &&
      lastResolvedRoundRef.current &&
      lastResolvedRoundRef.current.player != null &&
      lastResolvedRoundRef.current.player === lastResolvedRoundRef.current.opponent
    ) {
      const label =
        INITIATIVE_OPTIONS.find(
          (option) => option.value === lastResolvedRoundRef.current?.player
        )?.label ?? 'the same artifact';
      setTieMessage(`Both duelists selected ${label}. Replaying the duel...`);
      timeout = setTimeout(() => setTieMessage(null), 3600);
      lastResolvedRoundRef.current = null;
    }
    if (spectatorState?.initiativeWinner) {
      lastResolvedRoundRef.current = null;
    }
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [opponentSelectionChoice, playerSelectionChoice, spectatorState?.initiativeWinner]);

  const playerChanneledRunes = rawCurrentPlayer?.channeledRunes ?? [];
  const opponentChanneledRunes = spectatorOpponent?.channeledRunes ?? [];

  const playerRunes = playerChanneledRunes;
  const opponentRunes = opponentChanneledRunes;

  const registerOptimisticRuneTaps = useCallback(
    (indices: number[]) => {
      if (!indices.length) {
        return;
      }
      const tapKeys = indices
        .map((index) => runeInstanceKey(playerRunes[index], index))
        .filter((key): key is string => Boolean(key));
      if (!tapKeys.length) {
        return;
      }
      setOptimisticRuneTaps((prev) => {
        const next = new Set(prev);
        tapKeys.forEach((key) => next.add(key));
        return next;
      });
      tapKeys.forEach((key) => {
        if (!key) {
          return;
        }
        const existing = runeTapTimeouts.current[key];
        if (existing) {
          clearTimeout(existing);
        }
        runeTapTimeouts.current[key] = setTimeout(() => {
          setOptimisticRuneTaps((prev) => {
            if (!prev.has(key)) {
              return prev;
            }
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
          delete runeTapTimeouts.current[key];
        }, 1200);
      });
    },
    [playerRunes]
  );

  const [recycledRunes, setRecycledRunes] = useState<RecycledRuneEvent[]>([]);
  const registerRuneRecycling = useCallback(
    (owner: 'self' | 'opponent', runes: RuneState[]) => {
      if (!runes.length) {
        return;
      }
      const timestamp = Date.now();
      setRecycledRunes((previous) => [
        ...previous,
        ...runes.map((rune, index) => ({
          id: `${owner}-${rune.runeId}-${timestamp}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          owner,
          rune,
          addedAt: timestamp,
        })),
      ]);
    },
    []
  );

  const previousRuneListsRef = useRef<{ self: RuneState[]; opponent: RuneState[] }>({
    self: playerRunes,
    opponent: opponentRunes,
  });

  useEffect(() => {
    const removed = diffRuneCollections(previousRuneListsRef.current.self ?? [], playerRunes);
    if (removed.length) {
      registerRuneRecycling('self', removed);
    }
    previousRuneListsRef.current.self = playerRunes;
  }, [playerRunes, registerRuneRecycling]);

  useEffect(() => {
    const removed = diffRuneCollections(previousRuneListsRef.current.opponent ?? [], opponentRunes);
    if (removed.length) {
      registerRuneRecycling('opponent', removed);
    }
    previousRuneListsRef.current.opponent = opponentRunes;
  }, [opponentRunes, registerRuneRecycling]);

  useEffect(() => {
    if (!recycledRunes.length) {
      return;
    }
    const timer = window.setInterval(() => {
      const now = Date.now();
      setRecycledRunes((previous) =>
        previous.filter((event) => now - event.addedAt < RUNE_RECYCLE_DURATION_MS)
      );
    }, 350);
    return () => {
      window.clearInterval(timer);
    };
  }, [recycledRunes.length]);

  const playerRecycleEvents = useMemo(
    () => recycledRunes.filter((event) => event.owner === 'self'),
    [recycledRunes]
  );
  const opponentRecycleEvents = useMemo(
    () => recycledRunes.filter((event) => event.owner === 'opponent'),
    [recycledRunes]
  );

  useEffect(() => {
    const current = playerRunes.length;
    if (!battlefieldAdvanceComplete) {
      runeCountRefs.current.self = current;
      return;
    }
    if (!runeInitRefs.current.self) {
      runeCountRefs.current.self = current;
      runeInitRefs.current.self = true;
      return;
    }
    const previous = runeCountRefs.current.self;
    if (current > previous) {
      const delta = current - previous;
      const label = delta === 1 ? 'You channeled 1 rune.' : `You channeled ${delta} runes.`;
      notify(label, 'success');
    }
    runeCountRefs.current.self = current;
  }, [battlefieldAdvanceComplete, notify, playerRunes.length]);

  useEffect(() => {
    const current = opponentRunes.length;
    if (!battlefieldAdvanceComplete) {
      runeCountRefs.current.opponent = current;
      return;
    }
    if (!runeInitRefs.current.opponent) {
      runeCountRefs.current.opponent = current;
      runeInitRefs.current.opponent = true;
      return;
    }
    const previous = runeCountRefs.current.opponent;
    if (current > previous) {
      const delta = current - previous;
      const label =
        delta === 1
          ? `${resolvePlayerLabel(opponentPlayerId, 'Opponent')} channeled 1 rune.`
          : `${resolvePlayerLabel(opponentPlayerId, 'Opponent')} channeled ${delta} runes.`;
      notify(label, 'info');
    }
    runeCountRefs.current.opponent = current;
  }, [
    battlefieldAdvanceComplete,
    notify,
    opponentPlayerId,
    opponentRunes.length,
    resolvePlayerLabel,
  ]);

  const handlePlayCard = useCallback(
    async (
      cardIndex: number,
      destinationId?: string | null,
      options?: { animateKey?: string | null }
    ) => {
      if (!canPlayCards) {
        return;
      }
      const card = currentPlayer.hand[cardIndex];
      if (!card) {
        return;
      }
      const runePlan = evaluateRunePayment(card, playerRunes);
      if (!runePlan.canPay) {
        notify('Insufficient runes to play this card.', 'warning', { banner: true });
        return;
      }
      if (options?.animateKey) {
        triggerHandAnimation(options.animateKey);
      }
      if (runePlan.runeIndices.length) {
        registerOptimisticRuneTaps(runePlan.runeIndices);
      }
      try {
        await playCard({
          variables: {
            matchId,
            playerId,
            cardIndex,
            destinationId: destinationId ?? null,
          },
        });
        notify('Card played.', 'success', { banner: true });
        await refreshArenaState();
      } catch (error) {
        console.error('Failed to play card', error);
        notify('Failed to play card.', 'error', { banner: true });
      }
    },
    [
      canPlayCards,
      currentPlayer.hand,
      matchId,
      notify,
      playCard,
      playerId,
      playerRunes,
      refreshArenaState,
      registerOptimisticRuneTaps,
      triggerHandAnimation,
    ]
  );

  const handleSelectUnit = useCallback(
    (card: BaseCard) => {
      if (!card.instanceId || card.type !== 'CREATURE') {
        return;
      }
      const instanceId = card.instanceId;
      setSelectedUnit((prev) => (prev === instanceId ? null : instanceId));
    },
    []
  );

  const handleMoveSelected = useCallback(
    async (destinationId: string) => {
      if (!selectedUnit) {
        return;
      }
      try {
        await moveUnit({
          variables: {
            matchId,
            playerId,
            creatureInstanceId: selectedUnit,
            destinationId
          }
        });
        const moveMessage =
          destinationId === 'base' ? 'Unit returned to base.' : 'Unit moved to battlefield.';
        notify(moveMessage, 'success', { banner: true });
        setSelectedUnit(null);
      } catch (error) {
        console.error('Failed to move unit', error);
        notify('Unable to move unit.', 'error', { banner: true });
      }
    },
    [matchId, moveUnit, notify, playerId, selectedUnit]
  );

  const handleInitiativeChoice = useCallback(
    async (choiceValue: number) => {
      if (playerInitiativeLocked || awaitingInitiativeResolution) {
        return;
      }
      setPendingInitiativeChoice(choiceValue);
      try {
        await submitInitiativeChoice({
          variables: {
            matchId,
            playerId,
            choice: choiceValue,
          },
        });
        notify('Initiative choice locked in.', 'success', { banner: true });
        await Promise.allSettled([refetchMatch(), refetchPlayerMatch()]);
      } catch (error) {
        console.error('Failed to submit initiative choice', error);
        notify('Unable to lock initiative choice.', 'error', { banner: true });
      }
    },
    [
      awaitingInitiativeResolution,
      matchId,
      playerId,
      playerInitiativeLocked,
      refetchMatch,
      refetchPlayerMatch,
      notify,
      submitInitiativeChoice,
    ]
  );

  const canAffordCard = useCallback(
    (card?: BaseCard | null) => {
      if (!card) {
        return false;
      }
      return evaluateRunePayment(card, playerRunes).canPay;
    },
    [playerRunes]
  );
  const playableCardFlags = useMemo(
    () =>
      currentPlayer.hand.map((card) => {
        if (!canPlayCards) {
          return false;
        }
        return canAffordCard(card);
      }),
    [canAffordCard, canPlayCards, currentPlayer.hand]
  );

  const toggleMulliganSelection = (index: number) => {
    if (!mulliganPrompt) {
      return;
    }
    const limit = mulliganLimit;
    setMulliganSelection((prev) => {
      if (prev.includes(index)) {
        return prev.filter((value) => value !== index);
      }
      if (prev.length >= limit) {
        return prev;
      }
      return [...prev, index];
    });
  };

  const handleHandCardClick = (index: number) => {
    if (mulliganPrompt) {
      toggleMulliganSelection(index);
      return;
    }
    const card = currentPlayer.hand[index];
    if (!card) {
      return;
    }
    const cardKey = resolveHandCardKey(card, index);
    if (!canPlayCards) {
      notify('You cannot play cards right now.', 'info', { banner: true });
      return;
    }
    if (!playableCardFlags[index]) {
      notify('Insufficient runes to play this card.', 'warning', { banner: true });
      return;
    }
    const cardType = (card.type ?? '').toUpperCase();
    if (cardType === 'CREATURE' && controlledBattlefields.length > 0) {
      setPendingDeployment(index);
      return;
    }
    void handlePlayCard(index, null, { animateKey: cardKey });
  };

  const handleHandCardDragStart = useCallback(
    (index: number, card: BaseCard, event: React.DragEvent<HTMLDivElement>) => {
      if (!canPlayCards || mulliganPrompt) {
        event.preventDefault();
        return;
      }
      if (!playableCardFlags[index]) {
        event.preventDefault();
        return;
      }
      const cardType = (card.type ?? '').toUpperCase();
      if (!['CREATURE', 'ARTIFACT', 'ENCHANTMENT'].includes(cardType)) {
        event.preventDefault();
        return;
      }
      setDraggingHandIndex(index);
      setDraggingCardKey(resolveHandCardKey(card, index));
    },
    [canPlayCards, mulliganPrompt, playableCardFlags]
  );

  const handleHandCardDragEnd = useCallback(() => {
    setDraggingHandIndex(null);
    setBoardDragHover(false);
    setDraggingCardKey(null);
  }, []);

  const handleBoardDragOver = useCallback(
    (event: React.DragEvent) => {
      if (draggingHandIndex === null) {
        return;
      }
      event.preventDefault();
       event.dataTransfer.dropEffect = 'move';
      if (!boardDragHover) {
        setBoardDragHover(true);
      }
    },
    [boardDragHover, draggingHandIndex]
  );

  const handleBoardDragLeave = useCallback(
    (event: React.DragEvent) => {
      if (draggingHandIndex === null) {
        return;
      }
      if (
        event.currentTarget &&
        event.relatedTarget &&
        event.currentTarget.contains(event.relatedTarget as Node)
      ) {
        return;
      }
      setBoardDragHover(false);
    },
    [draggingHandIndex]
  );

  const handleBoardDrop = useCallback(
    (event: React.DragEvent) => {
      if (draggingHandIndex === null) {
        return;
      }
      event.preventDefault();
      const index = draggingHandIndex;
      setDraggingHandIndex(null);
      const animationKey = draggingCardKey;
      setDraggingCardKey(null);
      setBoardDragHover(false);
      void handlePlayCard(index, 'base', { animateKey: animationKey ?? null });
    },
    [draggingCardKey, draggingHandIndex, handlePlayCard]
  );

  const submitMulliganChoice = useCallback(
    async (selection: number[]) => {
      try {
        await submitMulligan({
          variables: {
            matchId,
            playerId,
            indices: [...selection].sort((a, b) => b - a),
          },
        });
        const mulliganMessage = selection.length
          ? `Replaced ${selection.length} card(s)`
          : 'Keeping current hand';
        notify(mulliganMessage, 'info', { banner: true });
        setMulliganSelection([]);
        await refreshArenaState();
      } catch (error) {
        console.error('Failed to submit mulligan', error);
        notify('Mulligan failed.', 'error', { banner: true });
      }
    },
    [matchId, notify, playerId, refreshArenaState, submitMulligan]
  );

  useEffect(() => {
    if (!mulliganPrompt) {
      autoMulliganRef.current = false;
      return;
    }
    if (
      submittingMulligan ||
      mulliganSelection.length === 0 ||
      mulliganLimit <= 0 ||
      mulliganSelection.length < mulliganLimit ||
      autoMulliganRef.current
    ) {
      return;
    }
    autoMulliganRef.current = true;
    void submitMulliganChoice([...mulliganSelection]);
  }, [
    mulliganLimit,
    mulliganPrompt,
    mulliganSelection,
    submitMulliganChoice,
    submittingMulligan,
  ]);

  useEffect(() => {
    if (!submittingMulligan) {
      autoMulliganRef.current = false;
    }
  }, [submittingMulligan]);

  const handleKeepHand = () => {
    void submitMulliganChoice([]);
  };

  const handleConfirmMulligan = () => {
    void submitMulliganChoice(mulliganSelection);
  };

  const handleSelectBattlefield = async (battlefieldId: string) => {
    if (!battlefieldId) {
      return;
    }
    try {
      await selectBattlefield({
        variables: {
          matchId,
          playerId,
          battlefieldId,
        },
      });
      notify('Battlefield locked in.', 'success', { banner: true });
      await refreshArenaState();
    } catch (error) {
      console.error('Failed to select battlefield', error);
      notify('Unable to select battlefield.', 'error', { banner: true });
    }
  };

  const handleNextPhase = async () => {
    try {
      await nextPhase({
        variables: {
          matchId,
          playerId,
        },
      });
      notify('Phase advanced.', 'success', { banner: true });
      await refreshArenaState();
    } catch (error) {
      console.error('Failed to advance phase', error);
      notify('Unable to advance phase.', 'error', { banner: true });
    }
  };

  const handleConcede = async () => {
    if (!confirm('Concede the match?')) {
      return;
    }
    try {
      await concedeMatch({
        variables: {
          matchId,
          playerId,
        },
      });
    } catch (error) {
      console.error('Failed to concede', error);
      notify('Unable to concede right now.', 'error', { banner: true });
    }
  };

  const handleChatSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      const trimmed = chatInput.trim();
      if (!trimmed) {
        return;
      }
      const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimisticEntry: ChatMessageEntry = {
        id: optimisticId,
        message: trimmed,
        playerId,
        playerName: selfDisplayName ?? 'You',
        timestamp: new Date().toISOString(),
        optimistic: true,
      };
      setChatMessages((prev) => [...prev, optimisticEntry]);
      setChatInput('');
      try {
        const response = await sendChatMessageMutation({
          variables: {
            matchId,
            playerId,
            message: trimmed,
          },
        });
        setChatMessages((prev) => prev.filter((entry) => entry.id !== optimisticId));
        const serverLog = response.data?.sendChatMessage?.gameState?.chatLog ?? null;
        if (serverLog) {
          syncChatMessages(serverLog);
        }
        await refreshArenaState();
      } catch (error) {
        setChatMessages((prev) => prev.filter((entry) => entry.id !== optimisticId));
        setChatInput(trimmed);
        console.error('Failed to send chat message', error);
        const apolloError = error as ApolloError;
        const detail = apolloError?.message ?? 'Unable to deliver your message.';
        notify(`Failed to send message: ${detail}`, 'error');
      }
    },
    [
      chatInput,
      matchId,
      notify,
      playerId,
      refreshArenaState,
      sendChatMessageMutation,
      selfDisplayName,
      syncChatMessages,
    ]
  );

  const battlefieldOptions =
    (battlefieldPrompt?.data &&
    Array.isArray(battlefieldPrompt.data.options)
      ? (battlefieldPrompt.data.options as BattlefieldPromptOption[])
      : []) ?? [];
  const normalizedBattlefieldChoices = useMemo<BattlefieldChoice[]>(() => {
    if (!battlefieldOptions.length) {
      return [];
    }
    return battlefieldOptions.map((option, index) => {
      const optionId =
        option.cardId ??
        option.slug ??
        option.battlefieldId ??
        option.name ??
        `battlefield-${index}`;
      const snapshot = option.cardSnapshot ?? option.card ?? null;
      const label = option.name ?? snapshot?.name ?? `Battlefield ${index + 1}`;
      const description =
        option.description ??
        snapshot?.effect ??
        'Bring this battlefield into the arena.';
      const card = snapshotToBaseCard(snapshot, {
        cardId: optionId,
        name: label,
        type: snapshot?.type ?? 'Battlefield',
        text: snapshot?.effect ?? undefined,
        slug: snapshot?.slug ?? option.slug ?? undefined,
      });
      const art =
        getCardImage(card) ??
        buildCardArtUrl(snapshot?.slug ?? option.slug ?? null);
      return {
        id: optionId,
        label,
        description,
        card,
        art,
      };
    });
  }, [battlefieldOptions]);
  const renderBattlefieldChoice = (
    choice: BattlefieldChoice,
    options?: { spotlight?: boolean; selected?: boolean }
  ) => {
    const disabled = selectingBattlefield;
    const activateSelection = () => {
      if (disabled) {
        return;
      }
      void handleSelectBattlefield(choice.id);
    };
    const imageClasses = [
      'battlefield-art-img',
      options?.spotlight ? 'battlefield-art-img--spotlight' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <div
        key={choice.id}
        className={[
          'battlefield-choice',
          options?.spotlight ? 'battlefield-choice--screen' : '',
          options?.selected ? 'battlefield-choice--selected' : '',
          disabled ? 'battlefield-choice--disabled' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {choice.art ? (
          <button
            type="button"
            className={['battlefield-art-button', imageClasses].filter(Boolean).join(' ')}
            onClick={activateSelection}
            disabled={disabled}
            aria-label={choice.label}
            title={choice.description ?? choice.label}
          >
            <img
              src={choice.art}
              alt={choice.label}
              width={270}
              height={400}
              style={{ width: '270px', height: 'auto' }}
              loading="lazy"
              draggable={false}
            />
          </button>
        ) : (
          <button
            type="button"
            className="battlefield-art-placeholder"
            onClick={activateSelection}
            disabled={disabled}
            aria-label={choice.label}
            title={choice.description ?? choice.label}
          >
            {choice.label}
          </button>
        )}
      </div>
    );
  };

  const playerGraveyard =
    spectatorSelf?.graveyard ?? rawCurrentPlayer?.graveyard ?? [];
  const opponentGraveyard = spectatorOpponent?.graveyard ?? [];
  const showIdlePrompt = !coinFlipPrompt && !battlefieldPrompt && !mulliganPrompt;
  const battlefieldStatus = useMemo<BattlefieldSelectionStatus[]>(() => {
    if (!spectatorPlayers.length) {
      return [];
    }
    const selectionMap = new Map<string, BattlefieldSelectionStatus>();

    battlefields.forEach((field) => {
      const card = snapshotToBaseCard(field.card, {
        cardId: field.battlefieldId,
        name: field.name,
        type: 'Battlefield',
        slug: field.card?.slug ?? field.slug ?? undefined,
      });
      selectionMap.set(field.ownerId, {
        playerId: field.ownerId,
        name: playerNameLookup.get(field.ownerId) ?? undefined,
        isSelf: field.ownerId === playerId,
        locked: true,
        source: 'final',
        card,
      });
    });

    battlefieldPrompts.forEach((prompt) => {
      const existing = selectionMap.get(prompt.playerId);
      if (existing?.source === 'final') {
        return;
      }
      const promptResolved = Boolean(prompt.resolved);
      const resolutionId =
        (prompt.resolution?.battlefieldId ??
          prompt.resolution?.cardId ??
          prompt.resolution?.slug ??
          null) as string | null;
      if (!resolutionId) {
        if (!existing) {
          selectionMap.set(prompt.playerId, {
            playerId: prompt.playerId,
            name: playerNameLookup.get(prompt.playerId) ?? undefined,
            isSelf: prompt.playerId === playerId,
            locked: promptResolved,
            source: promptResolved ? 'prompt' : 'pending',
            card: null,
          });
        }
        return;
      }
      const options = Array.isArray(prompt.data?.options)
        ? (prompt.data.options as BattlefieldPromptOption[])
        : [];
      const matchedOption =
        options.find((option) => {
          const candidate =
            option.cardId ??
            option.slug ??
            option.battlefieldId ??
            option.name ??
            null;
          return candidate === resolutionId;
        }) ?? null;
      const card = snapshotToBaseCard(
        matchedOption?.cardSnapshot ?? matchedOption?.card ?? null,
        {
          cardId: resolutionId,
          name: matchedOption?.name ?? 'Battlefield',
          type: 'Battlefield',
          slug:
            matchedOption?.cardSnapshot?.slug ??
            matchedOption?.card?.slug ??
            matchedOption?.slug ??
            undefined,
          text:
            matchedOption?.description ??
            matchedOption?.cardSnapshot?.effect ??
            matchedOption?.card?.effect ??
            undefined,
        }
      );
      selectionMap.set(prompt.playerId, {
        playerId: prompt.playerId,
        name: playerNameLookup.get(prompt.playerId) ?? undefined,
        isSelf: prompt.playerId === playerId,
        locked: true,
        source: 'prompt',
        card,
      });
    });

    return spectatorPlayers.map((playerEntry) => {
      const existing = selectionMap.get(playerEntry.playerId);
      if (existing) {
        return existing;
      }
      return {
        playerId: playerEntry.playerId,
        name: playerEntry.name,
        isSelf: playerEntry.playerId === playerId,
        locked: false,
        source: 'pending',
        card: null,
      };
    });
  }, [battlefields, battlefieldPrompts, playerId, playerNameLookup, spectatorPlayers]);
  const totalBattlefieldEntries = battlefieldStatus.length;
  const lockedBattlefieldCount = battlefieldStatus.filter((entry) => entry.locked).length;
  const allBattlefieldsLocked =
    totalBattlefieldEntries > 0 && lockedBattlefieldCount === totalBattlefieldEntries;
  const playerBattlefieldStatus =
    battlefieldStatus.find((entry) => entry.playerId === playerId) ??
    battlefieldStatus.find((entry) => entry.isSelf) ??
    null;
  const opponentBattlefieldStatus =
    (opponentPlayerId
      ? battlefieldStatus.find((entry) => entry.playerId === opponentPlayerId)
      : null) ??
    battlefieldStatus.find((entry) => entry.playerId && entry.playerId !== playerId) ??
    null;
  const playerBattlefieldLocked = playerBattlefieldStatus?.locked ?? false;
  const opponentBattlefieldLocked = opponentBattlefieldStatus?.locked ?? false;
  const bothBattlefieldsLocked = playerBattlefieldLocked && opponentBattlefieldLocked;
  const canRevealOpponentBattlefieldChoices = playerBattlefieldLocked && opponentBattlefieldLocked;
  const playerBattlefieldSelectionId = cardIdValue(playerBattlefieldStatus?.card ?? undefined);
  const playerBattlefieldCard = playerBattlefieldStatus?.card ?? null;
  const pendingDeploymentCard =
    pendingDeployment != null ? currentPlayer.hand[pendingDeployment] ?? null : null;
  const pendingDeploymentKey =
    pendingDeploymentCard != null
      ? resolveHandCardKey(pendingDeploymentCard, pendingDeployment)
      : pendingDeployment != null
        ? resolveHandCardKey(null, pendingDeployment)
        : null;
  const trackedBattlefieldStatuses = battlefieldStatus.filter((entry) => {
    if (!entry.playerId) {
      return false;
    }
    return entry.playerId === playerId || (opponentPlayerId && entry.playerId === opponentPlayerId);
  });
  const pendingBattlefieldPlayers = (trackedBattlefieldStatuses.length
    ? trackedBattlefieldStatuses
    : battlefieldStatus
  ).filter((entry) => !entry.locked);
  const pendingBattlefieldNames = pendingBattlefieldPlayers.map((entry) =>
    entry.playerId === playerId ? 'you' : entry.name ?? 'opponent'
  );
  const pendingBattlefieldMessage = (() => {
    if (pendingBattlefieldNames.length === 0) {
      return 'Waiting for battlefield data...';
    }
    if (pendingBattlefieldNames.length === 1) {
      return pendingBattlefieldNames[0] === 'you'
        ? 'Waiting for you to lock your battlefield.'
        : `Waiting for ${pendingBattlefieldNames[0]} to lock their battlefield.`;
    }
    const formatted =
      pendingBattlefieldNames.length === 2
        ? pendingBattlefieldNames.join(' and ')
        : `${pendingBattlefieldNames.slice(0, -1).join(', ')}, and ${
            pendingBattlefieldNames[pendingBattlefieldNames.length - 1]
          }`;
    return `Waiting for ${formatted} to lock their battlefields.`;
  })();
  const waitingForBattlefieldData = bothBattlefieldsLocked && battlefields.length === 0;
  useEffect(() => {
    if (!bothBattlefieldsLocked || battlefieldAdvanceTriggered) {
      return;
    }
    setBattlefieldAdvanceTriggered(true);
    setBattlefieldCountdown(BATTLEFIELD_REVEAL_COUNTDOWN_SECONDS);
  }, [bothBattlefieldsLocked, battlefieldAdvanceTriggered]);
  useEffect(() => {
    if (battlefieldCountdown === null || battlefieldCountdown <= 0) {
      return;
    }
    const timer = setTimeout(() => {
      setBattlefieldCountdown((prev) => {
        if (prev == null) {
          return null;
        }
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [battlefieldCountdown]);
  useEffect(() => {
    if (!battlefieldAdvanceTriggered || battlefieldAdvanceComplete) {
      return;
    }
    if (
      battlefieldCountdown !== null &&
      battlefieldCountdown <= 0 &&
      !isBattlefieldPhaseActive &&
      !waitingForBattlefieldData
    ) {
      setBattlefieldAdvanceComplete(true);
    }
  }, [
    battlefieldAdvanceComplete,
    battlefieldAdvanceTriggered,
    battlefieldCountdown,
    isBattlefieldPhaseActive,
    waitingForBattlefieldData,
  ]);
  useEffect(() => {
    if (!waitingForBattlefieldData) {
      return;
    }
    let cancelled = false;
    const triggerRefresh = () => {
      if (cancelled) {
        return;
      }
      void refreshArenaState();
    };
    triggerRefresh();
    const interval = setInterval(triggerRefresh, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [waitingForBattlefieldData, refreshArenaState]);

  useEffect(() => {
    if (!isBattlefieldPhaseActive) {
      return;
    }
    let cancelled = false;
    const triggerRefresh = () => {
      if (cancelled) {
        return;
      }
      void refreshArenaState();
    };
    triggerRefresh();
    const interval = setInterval(triggerRefresh, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isBattlefieldPhaseActive, refreshArenaState]);

  useEffect(() => {
    if (!battlefieldAdvanceComplete) {
      return;
    }
    void refreshArenaState();
  }, [battlefieldAdvanceComplete, refreshArenaState]);

  const initiativeChoices = useMemo(() => {
    if (coinFlipPrompt?.data?.options && Array.isArray(coinFlipPrompt.data.options)) {
      return (coinFlipPrompt.data.options as Array<Record<string, any>>).map((option) => {
        const parsedValue =
          typeof option.value === 'number'
            ? option.value
            : Number(option.value ?? option.cardId ?? option.slug ?? 0);
        const fallback =
          INITIATIVE_OPTIONS.find((entry) => entry.value === parsedValue) ??
          INITIATIVE_OPTIONS[0];
        const normalizedValue = Number.isNaN(parsedValue) ? fallback.value : parsedValue;
        return {
          value: normalizedValue,
          label: option.label ?? fallback.label,
          image: fallback.image,
          description: option.description ?? fallback.description,
        };
      });
    }
    return INITIATIVE_OPTIONS;
  }, [coinFlipPrompt]);

  useEffect(() => {
    if (!selfZoneRef.current) {
      lastTurnHolderRef.current = activeTurnPlayerId ?? null;
      return;
    }
    if (
      activeTurnPlayerId &&
      activeTurnPlayerId === playerId &&
      lastTurnHolderRef.current !== activeTurnPlayerId
    ) {
      selfZoneRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    lastTurnHolderRef.current = activeTurnPlayerId ?? null;
  }, [activeTurnPlayerId, playerId]);

  if (matchInitializing && !hasMatchInitTimedOut) {
    return (
      <div className="game-board">
        <div className="status-bar">
          <span>
            Match found! Waiting for the server to finish initializing the
            arena…
          </span>
        </div>
      </div>
    );
  }
  if (hasMatchInitTimedOut) {
    return (
      <div className="game-board">
        <div className="status-bar">
          <span>
            Match is taking longer than expected to initialize. Try leaving
            and rejoining the queue.
          </span>
        </div>
      </div>
    );
  }
  if (playerError || spectatorError) {
    return (
      <div className="game-board">
        <div className="status-bar">
          <span>
            Unable to load match: {playerError?.message ?? spectatorError?.message}
          </span>
        </div>
      </div>
    );
  }
  if (isLoading || !playerView || !spectatorState || !hasCurrentPlayer || !opponent) {
    return (
      <div className="game-board">
        <div className="status-bar">
          <span>Loading arena...</span>
        </div>
      </div>
    );
  }
  const resolvedOpponent = opponent as OpponentSummary;
  const opponentHandSize =
    resolvedOpponent.handSize ?? spectatorOpponent?.hand?.length ?? 0;
  const opponentBoardState: PlayerBoardState =
    spectatorOpponent?.board ?? {
      creatures: [],
      artifacts: [],
      enchantments: [],
    };
  const playerBaseUnits = playerCreatures.filter(
    (card) => card.location?.zone === 'base'
  );
  const opponentBaseUnits = (opponentBoardState.creatures ?? []).filter(
    (card) => card.location?.zone === 'base'
  );
  const playerFrontlineBoard: PlayerBoardState = {
    ...currentPlayer.board,
    creatures: playerCreatures.filter(
      (card) => card.location?.zone !== 'base'
    ),
  };
  const opponentFrontlineBoard: PlayerBoardState = {
    ...opponentBoardState,
    creatures: (opponentBoardState.creatures ?? []).filter(
      (card) => card.location?.zone !== 'base'
    ),
  };
  const handInteractable = Boolean(mulliganPrompt || canPlayCards);
  const holdBattlefieldReveal = battlefieldAdvanceTriggered && !battlefieldAdvanceComplete;
  const showInitiativeScreen =
    !battlefieldAdvanceTriggered &&
    (rawStatus === 'coin_flip' || (initiativeOutcome && initiativeRevealActive));
  const showBattlefieldScreen =
    !showInitiativeScreen &&
    (isBattlefieldPhaseActive || waitingForBattlefieldData || holdBattlefieldReveal);
  const showingInitiativeResult = Boolean(
    initiativeOutcome && !isCoinFlipPhase && initiativeRevealActive
  );
  const opponentHeading = resolvePlayerLabel(opponentPlayerId, 'Opponent');
  const selfHeading = resolvePlayerLabel(playerId, 'You');
  const mulliganPromptPending = playerMulliganPending || opponentMulliganPending;
  const showMulliganModal =
    mulliganPromptPending && !showInitiativeScreen && !showBattlefieldScreen;
  const mulliganWaitingMessage =
    !playerMulliganPending && opponentMulliganPending
      ? `Waiting for ${opponentHeading}'s mulligan choice`
      : null;
  const selfBoardTitle = selfHeading === 'You' ? 'Your Board' : `${selfHeading}'s Board`;
  const initiativeWinnerDisplay = initiativeOutcome
    ? resolvePlayerLabel(initiativeOutcome.winnerId, 'Unknown duelist')
    : null;
  const initiativeLoserDisplay = initiativeOutcome?.loserId
    ? resolvePlayerLabel(initiativeOutcome.loserId, opponentHeading)
    : opponentHeading;

  const boardPrompts = (
    <div className="prompt-panel board-prompts">
        {battlefieldPrompt && !showBattlefieldScreen && (
          <div className="prompt-card battlefield-prompt">
            <div className="prompt-title">Battlefield Selection</div>
            <p>Select one of your battlefields to bring into the arena.</p>
            <div className="battlefield-choice-grid">
              {normalizedBattlefieldChoices.length === 0 && (
                <span className="muted-text">Waiting on available options...</span>
              )}
              {normalizedBattlefieldChoices.map((choice) => renderBattlefieldChoice(choice))}
            </div>
            <div className="battlefield-status-grid">
              {battlefieldStatus.map((entry) => {
                const selectionCard = entry.card;
                const maskSelection =
                  Boolean(selectionCard) &&
                  !entry.isSelf &&
                  !canRevealOpponentBattlefieldChoices;
                return (
                  <div
                    key={entry.playerId}
                    className={[
                      'selection-pill',
                      entry.isSelf ? 'selection-pill--self' : '',
                      entry.locked ? 'selection-pill--ready' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div className="pill-header">
                      <span className="pill-player">
                        {entry.isSelf ? 'You' : entry.name ?? 'Opponent'}
                      </span>
                      <span className="pill-status">
                        {entry.locked
                          ? 'Battlefield locked in'
                          : entry.isSelf
                            ? 'Choose a battlefield'
                            : 'Waiting on selection'}
                      </span>
                    </div>
                    {selectionCard ? (
                      maskSelection ? (
                        <div className="selection-card selection-card--hidden">
                          <div className="card-back card-back--small" aria-hidden="true" />
                          <span>Hidden until both duelists lock in.</span>
                        </div>
                      ) : (
                        <div className="selection-card">
                          <CardTile card={selectionCard} compact />
                        </div>
                      )
                    ) : (
                      <div className="pill-empty">No battlefield selected</div>
                    )}
                  </div>
                );
              })}
            </div>
            <div
              className={[
                'battlefield-progress',
                allBattlefieldsLocked ? 'battlefield-progress--ready' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {allBattlefieldsLocked
                ? 'Both battlefields are locked in. Finalizing arena setup…'
                : 'Waiting for all players to lock in their battlefields.'}
            </div>
          </div>
        )}
    </div>
  );

  const initiativeView = (
    <div className="initiative-screen">
      <div className="duel-intro">
        <h2>Initiative Duel</h2>
        <p>
          Choose a Doran artifact. Blade beats Shield, Shield beats Ring, and Ring beats Blade.
          Matching selections trigger a rematch until initiative is resolved.
        </p>
      </div>
      <div className="initiative-help">
        <span>Blade ▶ Shield ▶ Ring ▶ Blade</span>
        <span className="muted-text">
          Win the matchup to act first; matching artifacts force another roll.
        </span>
      </div>
      {tieMessage && <div className="tie-callout">{tieMessage}</div>}
      {coinFlipPrompt && isCoinFlipPhase ? (
        <div className="initiative-grid initiative-grid--full">
          {initiativeChoices.map((option) => (
            <button
              key={`initiative-${option.value}`}
              type="button"
              className={[
                'initiative-button',
                highlightedChoice === option.value ? 'initiative-button--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => handleInitiativeChoice(option.value)}
              aria-label={option.label}
              title={option.label}
              disabled={
                submittingInitiativeChoice ||
                playerInitiativeLocked ||
                awaitingInitiativeResolution
              }
            >
              <Image
                src={option.image}
                alt={option.label}
                width={140}
                height={140}
                className="initiative-art"
                priority={false}
              />
            </button>
          ))}
        </div>
      ) : showingInitiativeResult && initiativeOutcome ? (
        <div className="prompt-card success duel-result">
          <div className="prompt-title">Initiative Resolved</div>
          <p>
            {initiativeOutcome.winnerIsSelf
              ? 'You gained the initiative advantage.'
              : `${initiativeOutcome.winnerLabel} gained the initiative advantage.`}
          </p>
          <p className="muted-text">
            {initiativeOutcome.winnerIsSelf
              ? 'Prepare to select battlefields and take the opening turn.'
              : 'Channel your bonus rune while your opponent leads the first assault.'}
          </p>
        </div>
      ) : (
        <div className="prompt-card muted duel-wait">
          <p>
            {awaitingInitiativeResolution
              ? 'Both choices are locked in. Determining the initiative winner…'
              : `Waiting for ${opponentHeading} to finalize their artifact choice…`}
          </p>
        </div>
      )}
      <div className="selected-artifacts">
        <div className="artifact-panel">
          <div className="section-title">Your pick</div>
          {playerChoiceMeta ? (
            <div className="artifact-card">
              <Image
                src={playerChoiceMeta.image}
                alt={playerChoiceMeta.label}
                width={140}
                height={140}
              />
              <span>{playerChoiceMeta.label}</span>
            </div>
          ) : (
            <div className="artifact-placeholder">Choose an artifact to continue.</div>
          )}
        </div>
        <div className="artifact-panel">
          <div className="section-title">{opponentHeading}'s pick</div>
          {canRevealOpponentChoice ? (
            opponentChoiceMeta ? (
              <div className="artifact-card opponent">
                <Image
                  src={opponentChoiceMeta.image}
                  alt={`${opponentHeading} choice`}
                  width={140}
                  height={140}
                />
                <span>{opponentChoiceMeta.label}</span>
              </div>
            ) : (
              <div className="artifact-placeholder">Awaiting reveal…</div>
            )
          ) : awaitingOpponentSelection ? (
            <div className="artifact-placeholder">Waiting for opponent&apos;s selection…</div>
          ) : (
            <div className="artifact-placeholder">Choose an artifact to reveal their pick.</div>
          )}
        </div>
      </div>
      {showingInitiativeResult && (
        <div className="phase-progress">
          <div className="phase-spinner" />
          <span>Proceeding to battlefield selection phase…</span>
        </div>
      )}
      <div className="duel-status-row">
        <div className="duel-player-card">
          <h3>You</h3>
          <p>
            {showingInitiativeResult && initiativeOutcome
              ? initiativeOutcome.winnerIsSelf
                ? 'You will lead the first turn.'
                : 'You gain the bonus rune while the opponent opens.'
              : coinFlipPrompt
                  ? 'Make your selection to continue.'
                  : awaitingInitiativeResolution
                    ? 'Both choices locked. Determining winner…'
                    : playerInitiativeLocked
                      ? 'Choice locked in.'
                      : 'Standing by…'}
          </p>
        </div>
        <div className="duel-player-card">
          <h3>{opponentHeading}</h3>
          <p>
            {showingInitiativeResult && initiativeOutcome
              ? initiativeOutcome.winnerIsSelf
                ? `${opponentHeading} receives a bonus rune channel.`
                : `${opponentHeading} takes the first turn.`
              : opponentCoinFlipPrompt
                  ? 'Awaiting their response…'
                  : awaitingInitiativeResolution
                    ? 'Both choices locked. Determining winner…'
                    : opponentInitiativeLocked
                      ? 'Choice locked in.'
                      : `Waiting for ${opponentHeading}…`}
          </p>
        </div>
      </div>
    </div>
  );

  const battlefieldView = (
    <div className="battlefield-screen">
      <div className="duel-intro">
        <h2>Battlefield Selection</h2>
        <p>
          Each duelist must commit one of their prepared battlefields before the match begins.
          Your choice remains hidden until both players lock in.
        </p>
      </div>
      <div className="battlefield-choice-wrapper">
        {playerBattlefieldLocked ? (
          <div className="locked-card-callout">
            <div className="prompt-title">Battlefield locked</div>
            {playerBattlefieldCard ? (
              <CardTile card={playerBattlefieldCard} label="Your battlefield" />
            ) : (
              <div className="pill-empty">Awaiting confirmation…</div>
            )}
            <p className="muted-text">
              {opponentBattlefieldLocked
                ? 'Both battlefields are locked. Finalizing the arena…'
                : `Waiting for ${opponentHeading} to finish their selection.`}
            </p>
          </div>
        ) : normalizedBattlefieldChoices.length === 0 ? (
          <div className="prompt-card muted duel-wait">
            <p>Loading your battlefield cards…</p>
          </div>
        ) : (
          <div className="battlefield-choice-grid battlefield-choice-grid--spotlight">
            {normalizedBattlefieldChoices.map((choice) => {
              const choiceId = cardIdValue(choice.card) || choice.id;
              const isLockedSelection =
                Boolean(playerBattlefieldSelectionId) &&
                Boolean(choiceId) &&
                playerBattlefieldSelectionId === choiceId;
              return renderBattlefieldChoice(choice, {
                spotlight: true,
                selected: isLockedSelection,
              });
            })}
          </div>
        )}
      </div>
      <div className="battlefield-status-grid battlefield-status-grid--full">
        {battlefieldStatus.map((entry) => {
          const selectionCard = entry.card;
          const maskSelection =
            Boolean(selectionCard) &&
            !entry.isSelf &&
            !canRevealOpponentBattlefieldChoices;
          return (
            <div
              key={`battlefield-status-${entry.playerId}`}
              className={[
                'selection-pill',
                entry.isSelf ? 'selection-pill--self' : '',
                entry.locked ? 'selection-pill--ready' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="pill-header">
                <span className="pill-player">
                  {entry.isSelf ? 'You' : entry.name ?? 'Opponent'}
                </span>
                <span className="pill-status">
                  {entry.locked
                    ? 'Battlefield locked in'
                    : entry.isSelf
                      ? 'Choose a battlefield'
                      : 'Waiting on selection'}
                </span>
              </div>
              {selectionCard ? (
                maskSelection ? (
                  <div className="selection-card selection-card--hidden">
                    <div className="card-back card-back--small" aria-hidden="true" />
                    <span>Hidden until both duelists lock in.</span>
                  </div>
                ) : (
                  <div className="selection-card">
                    <CardTile card={selectionCard} compact />
                  </div>
                )
              ) : (
                <div className="pill-empty">No battlefield selected</div>
              )}
            </div>
          );
        })}
      </div>
      <div
        className={[
          'battlefield-progress',
          (battlefieldAdvanceTriggered || allBattlefieldsLocked) ? 'battlefield-progress--ready' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {battlefieldAdvanceTriggered ? (
          <div className="battlefield-countdown">
            <span className="phase-spinner" aria-hidden="true" />
            <span>
              Arena launching in {Math.max(battlefieldCountdown ?? 0, 0)}s…
            </span>
          </div>
        ) : waitingForBattlefieldData ? (
          <div className="battlefield-countdown">
            <span className="phase-spinner" aria-hidden="true" />
            <span>Deploying selected battlefields…</span>
          </div>
        ) : allBattlefieldsLocked ? (
          'Both battlefields are locked in. Finalizing the arena…'
        ) : (
          pendingBattlefieldMessage
        )}
      </div>
    </div>
  );
  const renderPlayerZone = (side: 'self' | 'opponent') => {
    const isSelf = side === 'self';
    const zoneClass = ['player-zone', isSelf ? 'player-zone--self' : 'player-zone--opponent']
      .filter(Boolean)
      .join(' ');
    const sideKey = isSelf ? 'self' : 'opponent';
    const runeTokensList = isSelf ? playerRunes : opponentRunes;
    const runeDeckCount = isSelf
      ? currentPlayer.runeDeck?.length ?? 0
      : spectatorOpponent?.runeDeck?.length ??
        spectatorOpponent?.runeDeckSize ??
        resolvedOpponent.runeDeckSize ??
        0;
    const deckCount = isSelf ? playerDeckOrder.length : opponentDeckOrder.length;
    const graveyardCards = isSelf ? playerGraveyard : opponentGraveyard;
    const baseUnits = isSelf ? playerBaseUnits : opponentBaseUnits;
    const frontlineBoard = isSelf ? playerFrontlineBoard : opponentFrontlineBoard;
    const legendRef = isSelf ? legendCard : opponentLegend;
    const leaderRef = isSelf ? leaderCard : opponentLeader;
    const handCount = isSelf ? currentPlayer.hand.length : opponentHandSize;
    const championExclude = buildExcludeSet(legendRef ?? undefined, leaderRef ?? undefined);
    const formationCards = combineBoardCards(
      baseUnits,
      frontlineBoard?.creatures,
      frontlineBoard?.artifacts,
      frontlineBoard?.enchantments
    ).filter((card) => !championExclude.has(cardIdValue(card)));
    const handControls = isSelf
      ? (
        <>
          <button
            type="button"
            className="prompt-button primary end-phase-button"
            onClick={handleNextPhase}
            disabled={!canAdvancePhase || advancingPhase}
          >
            {advancingPhase ? 'Advancing…' : 'End Phase'}
          </button>
          <button
            type="button"
            className="prompt-button danger"
            onClick={handleConcede}
          >
            Concede
          </button>
        </>
      )
      : null;
    const matClasses = [
      'player-mat',
      isSelf ? 'player-mat--self' : 'player-mat--opponent',
      isSelf && boardDragHover ? 'player-mat--drag-hover' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const matDragHandlers = isSelf
      ? {
          onDragOver: handleBoardDragOver,
          onDragEnter: handleBoardDragOver,
          onDragLeave: handleBoardDragLeave,
          onDrop: handleBoardDrop,
        }
      : {};
    const formationClasses = [
      'player-lane',
      'player-lane--formation',
      isSelf && boardDragHover ? 'player-lane--drag-hover' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <section className={zoneClass} ref={isSelf ? selfZoneRef : undefined}>
        {(!isSelf && (
          <div className="player-zone__hand player-zone__hand--opponent">
            <HiddenHand count={handCount} />
          </div>
        )) || null}
        <div className={matClasses} {...matDragHandlers}>
          <div className="player-mat__core">
            {(
              isSelf
                ? ['formation', 'runes']
                : ['runes', 'formation']
            ).map((lane) => {
              if (lane === 'runes') {
                return (
                  <div key={`${sideKey}-runes`} className="player-lane player-lane--runes">
                    <div className="base-grid rune-base-grid">
                      <div className="section-title">Channeled Runes</div>
                      <div className="card-row rune-card-row">
                        {isSelf && (
                        <div className="rune-deck-slot">
                          <CardBackStack label="Rune Deck" count={runeDeckCount} />
                        </div>
                      )}
                        <div className="rune-token-strip-wrapper">
                          <RuneTokens
                            runes={runeTokensList}
                            optimisticTaps={isSelf ? optimisticRuneTaps : undefined}
                          />
                          <RuneRecycleLayer
                            events={isSelf ? playerRecycleEvents : opponentRecycleEvents}
                          />
                        </div>
                        {!isSelf && (
                          <div className="rune-deck-slot">
                            <CardBackStack label="Rune Deck" count={runeDeckCount} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={`${sideKey}-formation`} className={formationClasses}>
                  <BaseGrid
                    title="Base"
                    cards={formationCards}
                    onCardSelect={isSelf && canAct ? handleSelectUnit : undefined}
                    selectable={isSelf && canAct}
                    selectedCardId={isSelf ? selectedUnit : undefined}
                  />
                </div>
              );
            })}
          </div>
          <div className="player-mat__support">
            {!isSelf && (
              <div className="player-mat__stack player-mat__stack--opponent">
                <DeckStack
                  label="Deck"
                  count={deckCount}
                  owner="opponent"
                  drawAnimations={opponentDrawAnimations}
                  onAnimationComplete={handleDrawAnimationComplete}
                />
                <GraveyardPile cards={graveyardCards} compact />
              </div>
            )}
            {isSelf && (
              <div className="player-mat__stack">
                <GraveyardPile cards={graveyardCards} compact />
                <DeckStack
                  label="Deck"
                  count={deckCount}
                  owner="self"
                  drawAnimations={playerDrawAnimations}
                  onAnimationComplete={handleDrawAnimationComplete}
                />
              </div>
            )}
          </div>
        </div>
        {isSelf && (
          <div className="player-zone__hand">
            <HandRow
              isSelf
              cards={currentPlayer.hand}
              handSize={currentPlayer.hand.length}
              onCardClick={handleHandCardClick}
              onCardDragStart={handleHandCardDragStart}
              onCardDragEnd={handleHandCardDragEnd}
              mulliganSelection={mulliganSelection}
              canInteract={handInteractable}
              idleLabel="Awaiting commands"
              controls={handControls}
              cardWidth={125}
              playableStates={playableCardFlags}
              playingCardKeys={handPlayAnimations}
            />
          </div>
        )}
      </section>
    );
  };

  const battlefieldStage = (
    <div className="battlefield-stage">
      <div className="battlefield-stage__cards">
        {battlefields.length === 0 ? (
          <div className="empty-slot wide">Deploying selected battlefields…</div>
        ) : (
          battlefields.map((field) => {
            const battlefieldCard = snapshotToBaseCard(field.card, {
              cardId: field.battlefieldId,
              name: field.name,
              type: 'Battlefield',
              slug: field.card?.slug ?? field.slug ?? undefined,
            });
            const art =
              getCardImage(battlefieldCard) ??
              buildCardArtUrl(field.slug ?? field.card?.slug ?? null);
            return (
              <div className="battlefield-stage__card" key={field.battlefieldId}>
                {art ? (
                  <img
                    src={art}
                    alt={field.name ?? 'Battlefield'}
                    className="battlefield-stage__art"
                    width={200}
                    height={280}
                    loading="lazy"
                    draggable={false}
                  />
                ) : (
                  <CardTile card={battlefieldCard} label={field.name ?? 'Battlefield'} />
                )}
                {selectedUnitCard && (
                  <button
                    className="prompt-button secondary"
                    onClick={() => handleMoveSelected(field.battlefieldId)}
                    disabled={
                      !canAct ||
                      movingUnit ||
                      !selectedUnitCard ||
                      (selectedUnitCard.location?.zone === 'battlefield' &&
                        selectedUnitCard.location?.battlefieldId === field.battlefieldId)
                    }
                  >
                    {movingUnit ? 'Deploying…' : `Deploy to ${field.name ?? 'battlefield'}`}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const matchInfoPanel = (
    <div className="match-info-panel">
      <div>
        <span>Status</span>
        <strong>{friendlyStatus(matchStatus)}</strong>
      </div>
      <div>
        <span>Phase</span>
        <strong>{flow?.currentPhase ?? 'Unknown'}</strong>
      </div>
      <div>
        <span>Turn</span>
        <strong>{flow?.turnNumber ?? spectatorState.turnNumber}</strong>
      </div>
      <div>
        <span>Priority</span>
        <strong>
          {priorityWindow
            ? priorityWindow.holder === playerId
              ? 'You'
              : 'Opponent'
            : 'Open'}
        </strong>
      </div>
    </div>
  );

  const renderChampionPanel = (
    title: string,
    legend: BaseCard | null,
    leader: BaseCard | null
  ) => (
    <div className="sidebar-champions">
      <h4>{title}</h4>
      <div className="champion-focus-group">
        <CardTile card={legend ?? undefined} label="Legend" compact widthPx={125} />
        <CardTile card={leader ?? undefined} label="Leader" compact widthPx={125} />
      </div>
    </div>
  );

  const playerChampionPanel = renderChampionPanel('Your Champions', legendCard ?? null, leaderCard ?? null);
  const opponentChampionPanel = renderChampionPanel(
    `${opponentHeading}'s Champions`,
    opponentLegend ?? null,
    opponentLeader ?? null
  );

  const championSidebar = (
    <aside className="arena-sidebar arena-sidebar--champions">
      <div className="champion-stack">{opponentChampionPanel}</div>
      <div className="champion-stack">{playerChampionPanel}</div>
    </aside>
  );

  const duelLogSidebar = (
    <aside className="arena-log-panel">
      <div className="duel-log">
        <h4>Duel Log</h4>
        <div className="duel-log__list">
          {duelLog.length === 0 ? (
            <div className="duel-log__empty">Awaiting actions…</div>
          ) : (
            duelLog.map((entry) => (
              <div
                key={entry.id}
                className={['duel-log__entry', `duel-log__entry--${entry.tone}`]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="duel-log__message">{entry.message}</div>
                <div className="duel-log__timestamp">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="chat-panel">
        <h4>Match Chat</h4>
        <div className="chat-panel__messages">
          {chatMessages.length === 0 ? (
            <div className="chat-panel__empty">No messages yet.</div>
          ) : (
            chatMessages.map((entry) => (
              <div
                key={entry.id}
                className={[
                  'chat-message',
                  entry.optimistic ? 'chat-message--pending' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="chat-message__meta">
                  <span className="chat-message__author">
                    {entry.playerName ?? resolvePlayerLabel(entry.playerId, 'Unknown duelist')}
                  </span>
                  <span className="chat-message__timestamp">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="chat-message__body">{entry.message}</div>
                {entry.optimistic ? (
                  <div className="chat-message__pending">Delivering…</div>
                ) : null}
              </div>
            ))
          )}
        </div>
        <form className="chat-panel__form" onSubmit={handleChatSubmit}>
          <input
            type="text"
            className="chat-panel__input"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder="Send a message…"
          />
          <button
            type="submit"
            className="chat-panel__send"
            disabled={chatInput.trim().length === 0}
          >
            Send
          </button>
        </form>
      </div>
    </aside>
  );

  const boardView = (
    <>
      <div className="arena-layout">
        {championSidebar}
        <div className="arena-layout__main">
          {matchInfoPanel}
          <div className="duel-stage">
            {renderPlayerZone('opponent')}
            <div className="arena-divider">
              {battlefieldStage}
              {boardPrompts}
            </div>
            {renderPlayerZone('self')}
          </div>
        </div>
        {duelLogSidebar}
      </div>
      {selectedUnitCard && (
        <section className="selection-banner">
          <div>
            Selected Unit:{' '}
            <strong>{selectedUnitCard.name ?? selectedUnitCard.cardId}</strong>
          </div>
          <div className="selection-actions">
            <button
              className="prompt-button"
              onClick={() => setSelectedUnit(null)}
            >
              Clear
            </button>
            <button
              className="prompt-button primary"
              onClick={() => handleMoveSelected('base')}
              disabled={
                !canMoveSelectedToBase ||
                movingUnit ||
                !canAct ||
                matchStatus !== 'IN_PROGRESS'
              }
            >
              {movingUnit ? 'Moving...' : 'Return to Base'}
            </button>
          </div>
        </section>
      )}
      {pendingDeploymentCard && pendingDeployment != null && (
        <div className="deploy-overlay">
          <div className="deploy-modal">
            <h4>Deploy {pendingDeploymentCard.name ?? 'Unit'}</h4>
            <p>Select where you would like to deploy this unit.</p>
            <div className="deploy-options">
              <button
                type="button"
                className="prompt-button secondary"
                onClick={() => {
                  void handlePlayCard(pendingDeployment, null, {
                    animateKey: pendingDeploymentKey,
                  });
                  setPendingDeployment(null);
                }}
              >
                Base
              </button>
              {controlledBattlefields.map((field) => (
                  <button
                    type="button"
                    key={field.battlefieldId}
                    className="prompt-button primary"
                    onClick={() => {
                      void handlePlayCard(pendingDeployment, field.battlefieldId, {
                        animateKey: pendingDeploymentKey,
                      });
                      setPendingDeployment(null);
                    }}
                  >
                    {field.name}
                  </button>
              ))}
            </div>
            <button
              type="button"
              className="prompt-button danger"
              onClick={() => setPendingDeployment(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {actionMessage && (
        <AnnouncementModal
          message={actionMessage}
          onClose={() => setActionMessage(null)}
        />
      )}
    </>
  );

  const boardModeClass = showInitiativeScreen
    ? 'duel-mode'
    : showBattlefieldScreen
      ? 'battlefield-mode'
      : 'board-mode';
  const activeView = showInitiativeScreen
    ? initiativeView
    : showBattlefieldScreen
      ? battlefieldView
      : boardView;

  return (
    <div className={`game-board ${boardModeClass}`}>
      {activeView}
      {showMulliganModal && (
        <MulliganModal
          cards={currentPlayer.hand}
          selection={mulliganSelection}
          limit={mulliganLimit}
          loading={submittingMulligan}
          waitingMessage={mulliganWaitingMessage}
          onToggle={toggleMulliganSelection}
          onConfirm={handleConfirmMulligan}
          onSkip={handleKeepHand}
        />
      )}
    </div>
  );
}
