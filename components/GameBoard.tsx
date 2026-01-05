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
import { useRouter } from 'next/navigation';
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
  usePassPriority,
  useActivateChampionPower,
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
  effect?: string | null;
  isTapped?: boolean | null;
  tapped?: boolean | null;
  summoned?: boolean | null;
  assets?: CardAsset | null;
  location?: {
    zone: 'base' | 'battlefield';
    battlefieldId?: string | null;
  } | null;
};

type CardHoverOptions = {
  displayUntapped?: boolean;
};

type CardHoverHandler = (card: BaseCard | null, options?: CardHoverOptions) => void;

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

type ChampionAbilityStateData = {
  canActivate: boolean;
  reason?: string | null;
  costSummary?: string | null;
  cost?: {
    energy?: number | null;
    runes?: Record<string, number | null> | null;
    exhausts?: boolean | null;
  } | null;
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
  championLegendState?: ChampionAbilityStateData | null;
  championLeaderState?: ChampionAbilityStateData | null;
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
  championLegendState?: ChampionAbilityStateData | null;
  championLeaderState?: ChampionAbilityStateData | null;
};

type GameStateView = {
  matchId: string;
  currentPhase: string;
  turnNumber: number;
  currentPlayerIndex: number;
  canAct: boolean;
  focusPlayerId?: string | null;
  combatContext?: CombatContextState | null;
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
const isTokenCardEntity = (card?: BaseCard | null) =>
  Boolean(
    card &&
      ((card.tags ?? []).some((tag) => tag?.toLowerCase() === 'token') ||
        /token/i.test(card.name ?? '') ||
        /token/i.test(card.text ?? ''))
  );
const resolveCardEffectText = (card?: BaseCard | null) => {
  if (!card) {
    return null;
  }
  return card.text ?? card.effect ?? null;
};
const normalizeCardType = (card?: BaseCard | null) => (card?.type ?? '').toUpperCase();
const isCreatureCard = (card?: BaseCard | null) => normalizeCardType(card) === 'CREATURE';
const isCardAtBase = (card?: BaseCard | null) => {
  const zone = card?.location?.zone;
  return !zone || zone === 'base';
};
const isCardOnBattlefield = (card?: BaseCard | null) => card?.location?.zone === 'battlefield';
const filterBaseCards = (cards?: BaseCard[] | null) => (cards ?? []).filter(isCardAtBase);
const filterBattlefieldCards = (cards?: BaseCard[] | null) => (cards ?? []).filter(isCardOnBattlefield);

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

type CombatContextState = {
  battlefieldId: string;
  initiatedBy: string;
  priorityStage: 'action' | 'reaction';
};

type BattlefieldPresence = {
  playerId: string;
  totalMight: number;
  unitCount: number;
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
  lastHoldScoreTurn?: number | null;
  card?: CardSnapshotLike | BaseCard | null;
  presence?: BattlefieldPresence[] | null;
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
  winner?: string | null;
  endReason?: string | null;
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
  focusPlayerId?: string | null;
  combatContext?: CombatContextState | null;
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
const TOKEN_CARD_ART =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560" viewBox="0 0 400 560"><defs><linearGradient id="tokenGradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23325675"/><stop offset="100%" stop-color="%2314283c"/></linearGradient></defs><rect width="100%" height="100%" rx="26" fill="url(%23tokenGradient)" stroke="%23fbbf24" stroke-width="6"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Verdana" font-size="64" fill="%23fbbf24" opacity="0.85">TOKEN</text><text x="50%" y="70%" dominant-baseline="middle" text-anchor="middle" font-family="Verdana" font-size="28" fill="%23fcd34d" opacity="0.75">Unit</text></svg>';

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
  if (isTokenCardEntity(card)) {
    return TOKEN_CARD_ART;
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

const cardHasKeyword = (card?: BaseCard | null, keyword?: string | null) => {
  if (!card || !keyword) {
    return false;
  }
  const normalized = keyword.toLowerCase();
  return card.keywords?.some((entry) => entry?.toLowerCase() === normalized) ?? false;
};

const cardSupportsCombatTiming = (
  card?: BaseCard | null,
  timing?: 'action' | 'reaction' | null
) => {
  if (!card || !timing) {
    return false;
  }
  const normalized = timing === 'reaction' ? 'reaction' : 'action';
  return (
    card.keywords?.some((entry) => entry?.toLowerCase().includes(normalized)) ??
    cardHasKeyword(card, normalized)
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
  summoned?: boolean | null;
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
  effect: snapshot?.effect ?? defaults.effect ?? undefined,
  isTapped: snapshot?.isTapped ?? defaults.isTapped ?? null,
  tapped: snapshot?.tapped ?? defaults.tapped ?? null,
  summoned: snapshot?.summoned ?? defaults.summoned ?? null,
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
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: React.DragEvent<HTMLDivElement>) => void;
  title?: string;
  onHover?: CardHoverHandler;
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
  draggable,
  onDragStart,
  onDragEnd,
  title,
  onHover,
}) => {
  const image = getCardImage(card);
  const rarityColor =
    RARITY_COLORS[card?.rarity?.toLowerCase() ?? ''] ?? '#475569';
  const statsAvailable =
    card?.power !== undefined && card?.toughness !== undefined;
  const isTapped = Boolean(card?.isTapped ?? card?.tapped);
  const isTokenCard = isTokenCardEntity(card);
  const hoverOptions = isTapped ? { displayUntapped: true } : undefined;
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
        isTokenCard ? 'card-tile--token' : '',
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
      title={title}
      draggable={draggable && !disabled}
      onDragStart={
        draggable && !disabled
          ? (event) => {
              event.dataTransfer.effectAllowed = 'move';
              onDragStart?.(event);
            }
          : undefined
      }
      onDragEnd={
        draggable && !disabled
          ? (event) => {
              onDragEnd?.(event);
            }
          : undefined
      }
      onMouseEnter={() => onHover?.(card ?? null, hoverOptions)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(card ?? null, hoverOptions)}
      onBlur={() => onHover?.(null)}
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
  disableCard?: (card: BaseCard) => boolean;
  dragEnabled?: (card: BaseCard) => boolean;
  onCardDragStart?: (card: BaseCard, event: React.DragEvent<HTMLDivElement>) => void;
  onCardDragEnd?: (card: BaseCard, event: React.DragEvent<HTMLDivElement>) => void;
  onCardHover?: CardHoverHandler;
};

const BaseGrid = ({
  title,
  cards,
  onCardSelect,
  selectable,
  selectedCardId,
  disableCard,
  dragEnabled,
  onCardDragStart,
  onCardDragEnd,
  onCardHover,
}: BaseGridProps) => (
  <div className="base-grid">
    <div className="section-title">{title}</div>
    <div className="card-row">
      {cards.length !== 0 && (
        cards.map((card) => {
          const instanceId = card.instanceId ?? undefined;
          const isSelected = Boolean(instanceId && selectedCardId === instanceId);
          const isDisabled = Boolean(disableCard?.(card));
          const canDrag = !isDisabled && (dragEnabled?.(card) ?? false);
          return (
            <CardTile
              key={cardIdValue(card)}
              card={card}
              compact
              selectable={selectable}
              isSelected={isSelected}
              disabled={isDisabled}
              onClick={
                selectable && onCardSelect && !isDisabled ? () => onCardSelect(card) : undefined
              }
              draggable={canDrag}
              onDragStart={
                canDrag && onCardDragStart
                  ? (event) => onCardDragStart(card, event)
                  : undefined
              }
              onDragEnd={
                canDrag && onCardDragEnd
                  ? (event) => onCardDragEnd(card, event)
                  : undefined
              }
              onHover={onCardHover}
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
  focusStates?: ('action' | 'reaction' | null)[];
  onCardHover?: CardHoverHandler;
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
  focusStates = [],
  onCardHover,
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
            const focusTiming = focusStates?.[index] ?? null;
            const focusClass = focusTiming ? `hand-card--focus-${focusTiming}` : '';
            return (
              <div
                key={cardKey}
                className={[
                  'hand-card',
                  isSelected ? 'selected' : '',
                  canInteract ? 'hand-card--active' : '',
                  isPlayable ? 'hand-card--playable' : '',
                  isPlaying ? 'hand-card--playing' : '',
                  focusTiming ? 'hand-card--focus' : '',
                  focusClass,
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
                    onHover={onCardHover}
                  />
                  {focusTiming ? (
                    <span
                      className={[
                        'hand-card__focus-badge',
                        `hand-card__focus-badge--${focusTiming}`,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {focusTiming === 'reaction' ? 'Reaction' : 'Action'}
                    </span>
                  ) : null}
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
  onHover,
}: {
  runes: RuneState[];
  optimisticTaps?: Set<string>;
  onHover?: CardHoverHandler;
}) => {
  if (!runes.length) {
    return <div className="rune-token-strip rune-token-strip--empty" aria-hidden="true" />;
  }
  return (
    <div className="rune-token-strip">
      {runes.map((rune, index) => {
        const { art, card } = resolveRuneArt(rune);
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
            onMouseEnter={() => onHover?.(card)}
            onMouseLeave={() => onHover?.(null)}
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
              <span className="rune-token__name">{rune.name.split(' ')[0]}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const RuneRecycleLayer = ({
  events,
  onHover,
}: {
  events: RecycledRuneEvent[];
  onHover?: CardHoverHandler;
}) => {
  if (!events.length) {
    return null;
  }
  return (
    <div className="rune-recycle-layer" aria-hidden="true">
      {events.map((event) => {
        const { art, card } = resolveRuneArt(event.rune);
        return (
          <div
            key={event.id}
            className="rune-recycle-token"
            onMouseEnter={() => onHover?.(card)}
            onMouseLeave={() => onHover?.(null)}
          >
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

type HiddenHandProps = {
  count: number;
};

const HiddenHand = ({ count }: HiddenHandProps) => {
  const constrainedCount = Math.max(count, 0);
  const maxVisible = 7;
  const displayCount = Math.min(Math.max(constrainedCount, 1), maxVisible);
  const overflowCount = Math.max(constrainedCount - maxVisible, 0);
  return (
    <div className="hidden-hand hidden-hand--compact" aria-label="Opponent hand">
      <span className="hidden-hand__count hidden-hand__count--top">
        {count} card{count === 1 ? '' : 's'}
      </span>
      <div className="hidden-hand__cards hidden-hand__cards--compact">
        {Array.from({ length: displayCount }).map((_, index) => (
          <Image
            key={`hidden-hand-${index}`}
            src={cardBackImg}
            alt="Hidden card"
            width={56}
            height={84}
            draggable={false}
            className="hidden-hand__card hidden-hand__card--compact"
          />
        ))}
        {overflowCount > 0 ? (
          <div className="hidden-hand__card hidden-hand__card--compact hidden-hand__card--overflow">
            +{overflowCount}
          </div>
        ) : null}
      </div>
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
      {waitingMessage ? (
        <div className="mulligan-waiting" role="status">
          <span className="phase-spinner" aria-hidden="true" />
          <p>{waitingMessage}</p>
        </div>
      ) : (
        <>
          <div className="mulligan-modal__header">
            <div>
              <p className="mulligan-modal__eyebrow">Hand smoothing</p>
              <h3>Mulligan Selection</h3>
            </div>
            <div className="mulligan-modal__limit">
              Up to {limit} card{limit === 1 ? '' : 's'}
            </div>
          </div>
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
                <button
                  key={resolveHandCardKey(card, index)}
                  type="button"
                  className={[
                    'mulligan-card-button',
                    isSelected ? 'mulligan-card-button--selected' : '',
                    disabled ? 'mulligan-card-button--disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={handleClick}
                  disabled={disabled}
                >
                  <CardTile
                    card={card}
                    widthPx={165}
                    selectable={!disabled}
                    isSelected={isSelected}
                  />
                  <span className="mulligan-card-button__tag">
                    {isSelected ? 'Swap' : 'Keep'}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mulligan-actions">
            <button
              type="button"
              className="mulligan-action-button mulligan-action-button--ghost"
              onClick={onSkip}
              disabled={loading}
            >
              Keep My Hand
            </button>
            <button
              type="button"
              className="mulligan-action-button mulligan-action-button--accent"
              onClick={onConfirm}
              disabled={loading || selection.length === 0}
            >
              {loading ? 'Submitting…' : 'Confirm Mulligan'}
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

const ConcedeConfirmModal = ({
  loading,
  onConfirm,
  onCancel,
}: {
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <div className="modal-backdrop">
    <div className="concede-modal" role="dialog" aria-modal="true">
      <h3>Concede Match?</h3>
      <p>Conceding immediately ends the duel and awards the win to your opponent.</p>
      <div className="concede-actions">
        <button
          type="button"
          className="prompt-button secondary"
          onClick={onCancel}
          disabled={loading}
        >
          Keep Playing
        </button>
        <button
          type="button"
          className="prompt-button danger"
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Conceding…' : 'Yes, Concede'}
        </button>
      </div>
    </div>
  </div>
);

const CONFETTI_COLORS = ['#F87171', '#34D399', '#60A5FA', '#FBBF24', '#F472B6', '#FCD34D'];

const ConfettiBurst = () => (
  <div className="match-confetti" aria-hidden="true">
    {Array.from({ length: 24 }).map((_, index) => {
      const left = (index / 24) * 100;
      const delay = (index % 6) * 0.15;
      const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
      return (
        <span
          key={`confetti-${index}`}
          className="match-confetti__piece"
          style={{
            left: `${left}%`,
            animationDelay: `${delay}s`,
            backgroundColor: color,
          }}
        />
      );
    })}
  </div>
);

const formatVictoryReason = (reason?: string | null) => {
  if (!reason) {
    return 'Unknown';
  }
  switch (reason) {
    case 'victory_points':
      return 'Victory Points';
    case 'concede':
      return 'Opponent Conceded';
    default:
      return reason
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
};

const MatchResultOverlay = ({
  didWin,
  opponentName,
  reasonLabel,
  onReturn,
}: {
  didWin: boolean;
  opponentName: string;
  reasonLabel: string;
  onReturn: () => void;
}) => (
  <div
    className={[
      'match-result-overlay',
      didWin ? 'match-result-overlay--win' : 'match-result-overlay--loss',
    ]
      .filter(Boolean)
      .join(' ')}
  >
    {didWin ? <ConfettiBurst /> : null}
    <div className="match-result-overlay__panel" role="dialog" aria-modal="true">
      <h3>{didWin ? 'Victory!' : 'Defeat'}</h3>
      <p>
        {didWin
          ? `You triumphed over ${opponentName}.`
          : `${opponentName} has claimed this duel.`}
      </p>
      <p className="match-result-overlay__reason">Reason: {reasonLabel}</p>
      <button type="button" className="prompt-button primary" onClick={onReturn}>
        Return to Queue
      </button>
    </div>
  </div>
);

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
  const [passPriority, { loading: passingPriority }] = usePassPriority();
  const [activateChampionPower, { loading: activatingChampion }] = useActivateChampionPower();

  const router = useRouter();
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
  const [pendingLeaderDeployment, setPendingLeaderDeployment] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [sawMulliganPhase, setSawMulliganPhase] = useState(false);
  const [mulliganCompleteNotified, setMulliganCompleteNotified] = useState(false);
  const [showConcedeConfirm, setShowConcedeConfirm] = useState(false);
  const [concedingMatch, setConcedingMatch] = useState(false);
  const [draggingUnitId, setDraggingUnitId] = useState<string | null>(null);
  const [dragOverBattlefieldId, setDragOverBattlefieldId] = useState<string | null>(null);
  const { pushToast } = useToasts();
  const [duelLog, setDuelLog] = useState<DuelLogEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessageEntry[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [draggingHandIndex, setDraggingHandIndex] = useState<number | null>(null);
  const [draggingCardKey, setDraggingCardKey] = useState<string | null>(null);
  const [boardDragHover, setBoardDragHover] = useState(false);
  const [draggingLeader, setDraggingLeader] = useState(false);
  const [handPlayAnimations, setHandPlayAnimations] = useState<Set<string>>(new Set());
  const [spotlightCard, setSpotlightCard] = useState<BaseCard | null>(null);
  const [spotlightForceUpright, setSpotlightForceUpright] = useState(false);
  const hoveredSpotlightCard = useMemo(() => {
    if (!spotlightCard) {
      return null;
    }
    if (spotlightForceUpright) {
      return {
        ...spotlightCard,
        isTapped: false,
        tapped: false,
      };
    }
    return spotlightCard;
  }, [spotlightCard, spotlightForceUpright]);
  const [championFocus, setChampionFocus] = useState<'opponent' | 'self'>('opponent');
  const handAnimationTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [optimisticRuneTaps, setOptimisticRuneTaps] = useState<Set<string>>(new Set());
  const runeTapTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const duelLogCounter = useRef(0);
  const autoMulliganRef = useRef(false);
  const selfZoneRef = useRef<HTMLElement | null>(null);
  const opponentZoneRef = useRef<HTMLElement | null>(null);
  const playerHandRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    return () => {
      Object.values(handAnimationTimeouts.current).forEach((timeout) => clearTimeout(timeout));
      handAnimationTimeouts.current = {};
      Object.values(runeTapTimeouts.current).forEach((timeout) => clearTimeout(timeout));
      runeTapTimeouts.current = {};
    };
  }, []);
  useEffect(() => {
    const evaluateChampionView = () => {
      if (typeof window === 'undefined') {
        return;
      }
      const viewportMid = window.innerHeight / 2;
      const playerRect = selfZoneRef.current?.getBoundingClientRect();
      if (playerRect && playerRect.top < viewportMid) {
        setChampionFocus('self');
        return;
      }
      const opponentRect = opponentZoneRef.current?.getBoundingClientRect();
      if (opponentRect && opponentRect.top < viewportMid) {
        setChampionFocus('opponent');
      }
    };
    evaluateChampionView();
    window.addEventListener('scroll', evaluateChampionView, { passive: true });
    window.addEventListener('resize', evaluateChampionView);
    return () => {
      window.removeEventListener('scroll', evaluateChampionView);
      window.removeEventListener('resize', evaluateChampionView);
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
  const handleCardHover = useCallback<CardHoverHandler>((card, options) => {
    setSpotlightCard(card);
    setSpotlightForceUpright(Boolean(card && options?.displayUntapped));
  }, []);

  const getMobilizationRestriction = useCallback((card?: BaseCard | null) => {
    if (!card) {
      return 'Select a unit to move.';
    }
    if (Boolean(card.isTapped ?? card.tapped)) {
      return 'Exhausted units must finish the Awaken step before moving.';
    }
    if (card.summoned) {
      return 'Units cannot move on the turn they enter play.';
    }
    return null;
  }, []);

  const canMobilizeUnit = useCallback(
    (card?: BaseCard | null) => {
      if (!card?.instanceId || !isCreatureCard(card)) {
        return false;
      }
      return !getMobilizationRestriction(card);
    },
    [getMobilizationRestriction]
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
  const lastPriorityHolderRef = useRef<string | null>(null);
  const lastOpponentTurnHolderRef = useRef<string | null>(null);
  const lastOpponentPriorityHolderRef = useRef<string | null>(null);
  const combatFocusRef = useRef(false);
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
  const moveUnitToLocation = useCallback(
    async (unitId: string, destinationId: string) => {
      const unitCard = playerCreatures.find((card) => card.instanceId === unitId);
      if (!unitCard) {
        notify('Unable to locate that unit.', 'error', { banner: true });
        setSelectedUnit((prev) => (prev === unitId ? null : prev));
        return;
      }
      if (!canMobilizeUnit(unitCard)) {
        notify('That unit cannot move right now.', 'warning', { banner: true });
        return;
      }
      try {
        await moveUnit({
          variables: {
            matchId,
            playerId,
            creatureInstanceId: unitId,
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
    [canMobilizeUnit, matchId, moveUnit, notify, playerCreatures, playerId, setSelectedUnit]
  );
  const playerDeckCount = rawCurrentPlayer?.deckCount ?? 0;
  const handleUnitDragStart = useCallback(
    (card: BaseCard, _event?: React.DragEvent<HTMLDivElement>) => {
      if (!card.instanceId || !canMobilizeUnit(card)) {
        return;
      }
      setDraggingUnitId(card.instanceId);
      setSelectedUnit(card.instanceId);
    },
    [canMobilizeUnit]
  );
  const handleUnitDragEnd = useCallback(
    (_card?: BaseCard, _event?: React.DragEvent<HTMLDivElement>) => {
      setDraggingUnitId(null);
      setDragOverBattlefieldId(null);
    },
    []
  );
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
  const priorityWindow = spectatorState?.priorityWindow;
  const focusPlayerIdState = spectatorState?.focusPlayerId ?? null;
  const combatContext = spectatorState?.combatContext ?? null;
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
  const combatPriorityHolderName = resolvePlayerLabel(focusPlayerIdState, 'Opponent');
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
    if (selectedUnitCard && !canMobilizeUnit(selectedUnitCard)) {
      setSelectedUnit(null);
    }
  }, [canMobilizeUnit, selectedUnitCard]);

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
        selectedUnitCard.location.zone === 'battlefield' &&
        canMobilizeUnit(selectedUnitCard)
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
  const playerLeaderReady = Boolean(
    leaderCard && currentPlayer.championLeaderState?.canActivate
  );

  const battlefields = spectatorState?.battlefields ?? [];
  const controlledBattlefields = useMemo(
    () => battlefields.filter((field) => field.controller === playerId),
    [battlefields, playerId]
  );
  const combatBattlefield = combatContext
    ? battlefields.find((field) => field.battlefieldId === combatContext.battlefieldId) ?? null
    : null;
  const combatStage = combatContext?.priorityStage ?? null;
  const hasCombatPriority = Boolean(combatContext && focusPlayerIdState === playerId);
  const isCombatPromptActive =
    Boolean(priorityWindow?.type === 'combat' && priorityWindow?.event === 'battlefield-engagement') &&
    Boolean(combatContext);
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
  useEffect(() => {
    if (pendingLeaderDeployment && !canPlayCards) {
      setPendingLeaderDeployment(false);
    }
  }, [canPlayCards, pendingLeaderDeployment]);
  useEffect(() => {
    if (pendingLeaderDeployment && !playerLeaderReady) {
      setPendingLeaderDeployment(false);
    }
  }, [pendingLeaderDeployment, playerLeaderReady]);
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

  const handleChampionLeaderDeploy = useCallback(
    async (destinationId?: string | null) => {
      if (!canPlayCards) {
        notify('You cannot deploy your leader right now.', 'info', { banner: true });
        return;
      }
      if (!leaderCard || !playerLeaderReady) {
        notify('Champion leader is unavailable.', 'info', { banner: true });
        return;
      }
      const runePlan = evaluateRunePayment(leaderCard, playerRunes);
      if (!runePlan.canPay) {
        notify('Insufficient runes to deploy your leader.', 'warning', { banner: true });
        return;
      }
      if (runePlan.runeIndices.length) {
        registerOptimisticRuneTaps(runePlan.runeIndices);
      }
      try {
        await activateChampionPower({
          variables: {
            matchId,
            playerId,
            target: 'leader',
            destinationId: destinationId ?? null,
          },
        });
        notify('Champion leader deployed.', 'success', { banner: true });
        setPendingLeaderDeployment(false);
        await refreshArenaState();
      } catch (error) {
        console.error('Failed to deploy champion leader', error);
        notify('Unable to deploy champion leader right now.', 'error', { banner: true });
      }
    },
    [
      activateChampionPower,
      canPlayCards,
      leaderCard,
      matchId,
      notify,
      playerId,
      playerLeaderReady,
      playerRunes,
      refreshArenaState,
      registerOptimisticRuneTaps,
    ]
  );

  const handleSelectUnit = useCallback(
    (card: BaseCard) => {
      if (!card.instanceId || !isCreatureCard(card)) {
        return;
      }
      if (selectedUnit === card.instanceId) {
        setSelectedUnit(null);
        return;
      }
      const restriction = getMobilizationRestriction(card);
      if (restriction) {
        notify(restriction, 'warning', { banner: true });
        return;
      }
      setSelectedUnit(card.instanceId);
    },
    [getMobilizationRestriction, notify, selectedUnit]
  );

  const handleMoveSelected = useCallback(
    async (destinationId: string) => {
      if (!selectedUnit) {
        return;
      }
      await moveUnitToLocation(selectedUnit, destinationId);
    },
    [moveUnitToLocation, selectedUnit]
  );

  const handleBattlefieldDragOver = useCallback(
    (battlefieldId: string, event: React.DragEvent<HTMLDivElement>) => {
      if (!draggingUnitId && !draggingLeader) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDragOverBattlefieldId((previous) => (previous === battlefieldId ? previous : battlefieldId));
    },
    [draggingLeader, draggingUnitId]
  );

  const handleBattlefieldDragLeave = useCallback(
    (battlefieldId: string, event: React.DragEvent<HTMLDivElement>) => {
      if (!draggingUnitId && !draggingLeader) {
        return;
      }
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && event.currentTarget.contains(nextTarget)) {
        return;
      }
      setDragOverBattlefieldId((previous) => (previous === battlefieldId ? null : previous));
    },
    [draggingLeader, draggingUnitId]
  );

  const handleBattlefieldDrop = useCallback(
    (battlefieldId: string, event: React.DragEvent<HTMLDivElement>) => {
      if (!draggingUnitId && !draggingLeader) {
        setDragOverBattlefieldId(null);
        return;
      }
      event.preventDefault();
      if (draggingUnitId) {
        const unitId = draggingUnitId;
        setDraggingUnitId(null);
        setDragOverBattlefieldId(null);
        void moveUnitToLocation(unitId, battlefieldId);
        return;
      }
      if (draggingLeader) {
        setDraggingLeader(false);
        setPendingLeaderDeployment(false);
        setDragOverBattlefieldId(null);
        void handleChampionLeaderDeploy(battlefieldId);
      }
    },
    [draggingLeader, draggingUnitId, handleChampionLeaderDeploy, moveUnitToLocation]
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
  const handFocusStates = useMemo(
    () => {
      if (!hasCombatPriority || !combatStage) {
        return currentPlayer.hand.map(() => null);
      }
      return currentPlayer.hand.map((card) =>
        cardSupportsCombatTiming(card, combatStage) ? combatStage : null
      );
    },
    [combatStage, currentPlayer.hand, hasCombatPriority]
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
      if (draggingHandIndex === null && !draggingLeader) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (!boardDragHover) {
        setBoardDragHover(true);
      }
    },
    [boardDragHover, draggingHandIndex, draggingLeader]
  );

  const handleBoardDragLeave = useCallback(
    (event: React.DragEvent) => {
      if (draggingHandIndex === null && !draggingLeader) {
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
    [draggingHandIndex, draggingLeader]
  );

  const handleBoardDrop = useCallback(
    (event: React.DragEvent) => {
      if (draggingHandIndex === null && !draggingLeader) {
        return;
      }
      event.preventDefault();
      if (draggingHandIndex !== null) {
        const index = draggingHandIndex;
        setDraggingHandIndex(null);
        const animationKey = draggingCardKey;
        setDraggingCardKey(null);
        setBoardDragHover(false);
        void handlePlayCard(index, 'base', { animateKey: animationKey ?? null });
        return;
      }
      if (draggingLeader) {
        setDraggingLeader(false);
        setPendingLeaderDeployment(false);
        setBoardDragHover(false);
        void handleChampionLeaderDeploy('base');
      }
    },
    [draggingCardKey, draggingHandIndex, draggingLeader, handleChampionLeaderDeploy, handlePlayCard]
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

  const handlePassPriority = useCallback(async () => {
    if (!combatContext || focusPlayerIdState !== playerId) {
      return;
    }
    try {
      await passPriority({
        variables: {
          matchId,
          playerId,
        },
      });
      notify('Priority passed.', 'info', { banner: true });
    } catch (error) {
      console.error('Failed to pass priority', error);
      notify('Unable to pass priority right now.', 'error', { banner: true });
    }
  }, [combatContext, focusPlayerIdState, matchId, notify, passPriority, playerId]);

  const handleChampionLegendActivate = useCallback(async () => {
    if (!matchId || !playerId) {
      return;
    }
    try {
      await activateChampionPower({
        variables: {
          matchId,
          playerId,
          target: 'legend',
          destinationId: null,
        },
      });
      notify('Champion power activated.', 'success', { banner: true });
    } catch (error) {
      console.error('Failed to activate champion ability', error);
      notify('Unable to activate champion right now.', 'error', { banner: true });
    }
  }, [activateChampionPower, matchId, notify, playerId]);

  const handleChampionLeaderClick = useCallback(() => {
    if (!playerLeaderReady || activatingChampion) {
      return;
    }
    if (controlledBattlefields.length > 0) {
      setPendingLeaderDeployment(true);
      return;
    }
    void handleChampionLeaderDeploy(null);
  }, [activatingChampion, controlledBattlefields, handleChampionLeaderDeploy, playerLeaderReady]);

  const handleChampionLeaderDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!playerLeaderReady || activatingChampion) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.setData('text/plain', 'champion-leader');
      setDraggingLeader(true);
      setPendingLeaderDeployment(false);
    },
    [activatingChampion, playerLeaderReady]
  );

  const handleChampionLeaderDragEnd = useCallback(() => {
    setDraggingLeader(false);
    setBoardDragHover(false);
  }, []);

  const handleConcede = () => {
    setShowConcedeConfirm(true);
  };

  const confirmConcede = useCallback(async () => {
    if (concedingMatch) {
      return;
    }
    setConcedingMatch(true);
    try {
      await concedeMatch({
        variables: {
          matchId,
          playerId,
        },
      });
      setShowConcedeConfirm(false);
    } catch (error) {
      console.error('Failed to concede', error);
      notify('Unable to concede right now.', 'error', { banner: true });
    } finally {
      setConcedingMatch(false);
    }
  }, [concedingMatch, concedeMatch, matchId, notify, playerId]);

  const cancelConcedePrompt = useCallback(() => {
    if (concedingMatch) {
      return;
    }
    setShowConcedeConfirm(false);
  }, [concedingMatch]);

  const handleReturnToQueue = useCallback(() => {
    router.push('/matchmaking');
  }, [router]);

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
  const renderBattlefieldArtPreview = (
    card?: BaseCard | null,
    label?: string,
    variant: 'default' | 'large' = 'default'
  ) => {
    if (!card) {
      return null;
    }
    const art =
      getCardImage(card) ??
      buildCardArtUrl(card.slug ?? card.cardId ?? null);
    if (!art) {
      return (
        <CardTile
          card={card}
          label={label}
          compact
          widthPx={variant === 'large' ? 220 : 150}
          onHover={handleCardHover}
        />
      );
    }
    const previewClasses = ['battlefield-art-preview'];
    if (variant === 'large') {
      previewClasses.push('battlefield-art-preview--large');
    }
    return (
      <div className={previewClasses.join(' ')}>
        <img
          src={art}
          alt={label ?? card.name ?? 'Battlefield'}
          loading="lazy"
          draggable={false}
        />
        {label ? <span className="battlefield-art-preview__label">{label}</span> : null}
      </div>
    );
  };
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
              width={520}
              height={320}
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
  useEffect(() => {
    if (!opponentZoneRef.current) {
      lastOpponentTurnHolderRef.current = activeTurnPlayerId ?? null;
      return;
    }
    if (
      activeTurnPlayerId &&
      activeTurnPlayerId !== playerId &&
      lastOpponentTurnHolderRef.current !== activeTurnPlayerId
    ) {
      opponentZoneRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    lastOpponentTurnHolderRef.current = activeTurnPlayerId ?? null;
  }, [activeTurnPlayerId, playerId]);
  useEffect(() => {
    const holder = priorityWindow?.holder ?? null;
    if (!selfZoneRef.current) {
      lastPriorityHolderRef.current = holder;
      return;
    }
    if (holder === playerId && lastPriorityHolderRef.current !== holder) {
      selfZoneRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    lastPriorityHolderRef.current = holder;
  }, [playerId, priorityWindow?.holder]);
  useEffect(() => {
    const holder = priorityWindow?.holder ?? null;
    if (!opponentZoneRef.current) {
      lastOpponentPriorityHolderRef.current = holder;
      return;
    }
    if (holder && holder !== playerId && lastOpponentPriorityHolderRef.current !== holder) {
      opponentZoneRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    lastOpponentPriorityHolderRef.current = holder;
  }, [playerId, priorityWindow?.holder]);
  useEffect(() => {
    if (hasCombatPriority && !combatFocusRef.current && playerHandRef.current) {
      playerHandRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    combatFocusRef.current = hasCombatPriority;
  }, [hasCombatPriority]);

  const opponentHeading = resolvePlayerLabel(opponentPlayerId, 'Opponent');
  const selfHeading = resolvePlayerLabel(playerId, 'You');
  const playerVictoryPoints =
    currentPlayer?.victoryPoints ??
    spectatorSelf?.victoryPoints ??
    0;
  const playerVictoryTarget =
    currentPlayer?.victoryScore ??
    spectatorSelf?.victoryScore ??
    0;
  const opponentVictoryPoints =
    opponent?.victoryPoints ??
    spectatorOpponent?.victoryPoints ??
    0;
  const opponentVictoryTarget =
    opponent?.victoryScore ??
    spectatorOpponent?.victoryScore ??
    playerVictoryTarget ??
    0;
  const [playerVictoryFlash, setPlayerVictoryFlash] = useState(false);
  const [opponentVictoryFlash, setOpponentVictoryFlash] = useState(false);
  const playerVictoryPrev = useRef(playerVictoryPoints);
  const opponentVictoryPrev = useRef(opponentVictoryPoints);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (opponentVictoryPoints > opponentVictoryPrev.current) {
      setOpponentVictoryFlash(true);
      notify(`${opponentHeading} gained a victory point.`, 'warning');
      timeout = setTimeout(() => setOpponentVictoryFlash(false), 2200);
    }
    opponentVictoryPrev.current = opponentVictoryPoints;
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [notify, opponentHeading, opponentVictoryPoints]);
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (playerVictoryPoints > playerVictoryPrev.current) {
      setPlayerVictoryFlash(true);
      notify('You gained a victory point!', 'success', { banner: true });
      timeout = setTimeout(() => setPlayerVictoryFlash(false), 2200);
    }
    playerVictoryPrev.current = playerVictoryPoints;
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [playerVictoryPoints, notify]);

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
  const opponentCreatures = opponentBoardState.creatures ?? [];
  const playerBaseUnits = filterBaseCards(playerCreatures);
  const opponentBaseUnits = filterBaseCards(opponentCreatures);
  const playerBaseArtifacts = filterBaseCards(currentPlayer.board?.artifacts ?? []);
  const playerBaseEnchantments = filterBaseCards(currentPlayer.board?.enchantments ?? []);
  const opponentBaseArtifacts = filterBaseCards(opponentBoardState.artifacts ?? []);
  const opponentBaseEnchantments = filterBaseCards(opponentBoardState.enchantments ?? []);
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
  const matchWinnerId = spectatorState?.winner ?? null;
  const matchEnded = rawStatus === 'winner_determined';
  const playerWonMatch = matchEnded && matchWinnerId === playerId;
  const opponentNameForResult = playerWonMatch
    ? opponentHeading
    : resolvePlayerLabel(matchWinnerId, opponentHeading);
  const matchResultReasonLabel = formatVictoryReason(spectatorState?.endReason ?? null);
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
                          {renderBattlefieldArtPreview(selectionCard)}
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
              renderBattlefieldArtPreview(playerBattlefieldCard, 'Your battlefield', 'large')
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
                    {renderBattlefieldArtPreview(selectionCard)}
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
    const baseArtifacts = isSelf ? playerBaseArtifacts : opponentBaseArtifacts;
    const baseEnchantments = isSelf
      ? playerBaseEnchantments
      : opponentBaseEnchantments;
    const legendRef = isSelf ? legendCard : opponentLegend;
    const leaderRef = isSelf ? leaderCard : opponentLeader;
    const handCount = isSelf ? currentPlayer.hand.length : opponentHandSize;
    const championExclude = buildExcludeSet(legendRef ?? undefined, leaderRef ?? undefined);
    const formationCards = combineBoardCards(baseUnits, baseArtifacts, baseEnchantments).filter(
      (card) => !championExclude.has(cardIdValue(card))
    );
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
      <section className={zoneClass} ref={isSelf ? selfZoneRef : opponentZoneRef}>
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
                            onHover={handleCardHover}
                          />
                          <RuneRecycleLayer
                            events={isSelf ? playerRecycleEvents : opponentRecycleEvents}
                            onHover={handleCardHover}
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
                    disableCard={
                      isSelf && canAct
                        ? (card) => isCreatureCard(card) && !canMobilizeUnit(card)
                        : undefined
                    }
                    dragEnabled={
                      isSelf && canAct
                        ? (card) =>
                            isCreatureCard(card) &&
                            isCardAtBase(card) &&
                            canMobilizeUnit(card)
                        : undefined
                    }
                    onCardDragStart={isSelf && canAct ? handleUnitDragStart : undefined}
                    onCardDragEnd={isSelf && canAct ? handleUnitDragEnd : undefined}
                    onCardHover={handleCardHover}
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
          <div className="player-zone__hand" ref={playerHandRef}>
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
              focusStates={handFocusStates}
              onCardHover={handleCardHover}
            />
          </div>
        )}
      </section>
    );
  };

  const selectedUnitCanMobilize = canMobilizeUnit(selectedUnitCard);
  const selectedUnitAtBase = isCardAtBase(selectedUnitCard);
  const mobilizationReady = Boolean(
    selectedUnitCard &&
      selectedUnitAtBase &&
      selectedUnitCanMobilize &&
      canAct &&
      matchStatus === 'IN_PROGRESS'
  );
  const shouldHighlightBattlefieldTargets = mobilizationReady && battlefields.length > 0;

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
            const selectedUnitIsHere =
              selectedUnitCard?.location?.zone === 'battlefield' &&
              selectedUnitCard.location?.battlefieldId === field.battlefieldId;
            const highlightTarget = shouldHighlightBattlefieldTargets && !selectedUnitIsHere;
            const isDragHovering = highlightTarget && dragOverBattlefieldId === field.battlefieldId;
            const battlefieldActive = combatContext?.battlefieldId === field.battlefieldId;
            const presence = field.presence ?? [];
            const selfPresence =
              presence.find((entry) => entry.playerId === playerId)?.totalMight ?? 0;
            const opponentPresence =
              opponentPlayerId
                ? presence.find((entry) => entry.playerId === opponentPlayerId)?.totalMight ?? 0
                : 0;
            const showPresence = presence.length > 0 || battlefieldActive;
            const battlefieldCardClass = [
              'battlefield-stage__card',
              highlightTarget ? 'battlefield-stage__card--mobilize-ready' : '',
              isDragHovering ? 'battlefield-stage__card--mobilize-hover' : '',
              battlefieldActive ? 'battlefield-stage__card--combat-active' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const flattenedCreatures =
              spectatorPlayers
                .flatMap((player) => {
                  const ownerSlot = player.playerId === playerId ? 'self' : 'opponent';
                  const boardState = player.board?.creatures ?? [];
                  return boardState
                    .filter(
                      (card) =>
                        card.location?.zone === 'battlefield' &&
                        card.location?.battlefieldId === field.battlefieldId
                    )
                    .map((card) => ({
                      ownerSlot,
                      card
                    }));
                }) ?? [];
            return (
              <div
                className={battlefieldCardClass}
                key={field.battlefieldId}
                onDragOver={(event) => handleBattlefieldDragOver(field.battlefieldId, event)}
                onDragLeave={(event) => handleBattlefieldDragLeave(field.battlefieldId, event)}
                onDrop={(event) => handleBattlefieldDrop(field.battlefieldId, event)}
              >
                <div className="battlefield-stage__art-wrapper">
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
                    <CardTile
                      card={battlefieldCard}
                      label={field.name ?? 'Battlefield'}
                      onHover={handleCardHover}
                    />
                  )}
                  {showPresence && (
                    <div className="battlefield-stage__presence">
                      <div className="battlefield-stage__presence-value battlefield-stage__presence-value--opponent">
                        <span>{opponentHeading}</span>
                        <strong>{opponentPresence}</strong>
                      </div>
                      <div className="battlefield-stage__presence-value battlefield-stage__presence-value--self">
                        <span>You</span>
                        <strong>{selfPresence}</strong>
                      </div>
                    </div>
                  )}
                  {flattenedCreatures.length > 0 && (
                    <div className="battlefield-stage__unit-layer">
                      <div className="battlefield-stage__unit-lane battlefield-stage__unit-lane--opponent">
                        {flattenedCreatures
                          .filter((entry) => entry.ownerSlot === 'opponent')
                          .map((entry) => (
                            <div key={entry.card.instanceId} className="battlefield-stage__unit">
                              <CardTile card={entry.card} compact onHover={handleCardHover} />
                            </div>
                          ))}
                      </div>
                      <div className="battlefield-stage__unit-lane battlefield-stage__unit-lane--self">
                        {flattenedCreatures
                          .filter((entry) => entry.ownerSlot === 'self')
                          .map((entry) => (
                            <div key={entry.card.instanceId} className="battlefield-stage__unit battlefield-stage__unit--self">
                              <CardTile card={entry.card} compact onHover={handleCardHover} />
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
                {selectedUnitCard && (
                  <button
                    className="prompt-button secondary"
                    onClick={() => handleMoveSelected(field.battlefieldId)}
                    disabled={
                      !canAct ||
                      movingUnit ||
                      !selectedUnitCard ||
                      !selectedUnitCanMobilize ||
                      selectedUnitIsHere
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

  const opponentHandStrip =
    opponentHandSize > 0 ? (
      <div className="opponent-hand-strip">
        <HiddenHand count={opponentHandSize} />
      </div>
    ) : null;

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
      <div>
        <span>Your Victory Points</span>
        <strong>
          {playerVictoryPoints}/{playerVictoryTarget || '—'}
        </strong>
      </div>
      <div>
        <span>Opponent Victory Points</span>
        <strong>
          {opponentVictoryPoints}/{opponentVictoryTarget || '—'}
        </strong>
      </div>
      <div className="match-info-panel__hint">
        Gain 1 point each time you conquer or hold a battlefield.
      </div>
    </div>
  );
  const opponentHandBanner = opponentHandStrip ? (
    <div className="opponent-hand-banner">
      <div className="opponent-hand-banner__label">{opponentHeading}'s Hand</div>
      {opponentHandStrip}
    </div>
  ) : null;
  const matchStatusRow = <div className="match-status-row">{matchInfoPanel}</div>;
  const matchStatusClusterSticky = (
    <div className="match-status-cluster">
      <div className="match-status-row-wrapper">{matchStatusRow}</div>
      {opponentHandBanner}
    </div>
  );
  const combatPriorityBanner =
    isCombatPromptActive && combatContext ? (
      <div className="combat-priority-banner" role="status">
        <div className="combat-priority-banner__info">
          <span>Battlefield Engagement</span>
          <strong>{combatBattlefield?.name ?? 'Contested battlefield'}</strong>
          <div className="combat-priority-banner__details">
            <span>Stage: {combatStage === 'reaction' ? 'Reaction' : 'Action'}</span>
            <span>
              {hasCombatPriority ? 'You have priority' : `${combatPriorityHolderName} has priority`}
            </span>
          </div>
        </div>
        <div className="combat-priority-banner__actions">
          {hasCombatPriority ? (
            <button
              type="button"
              className="prompt-button secondary"
              onClick={handlePassPriority}
              disabled={passingPriority}
            >
              {passingPriority ? 'Passing…' : 'Pass Priority'}
            </button>
          ) : (
            <span className="combat-priority-banner__waiting">
              Waiting for {combatPriorityHolderName}
            </span>
          )}
        </div>
      </div>
    ) : null;

  const renderChampionPanel = (
    title: string,
    legend: BaseCard | null,
    leader: BaseCard | null,
    points: number,
    target: number,
    legendState?: ChampionAbilityStateData | null,
    leaderState?: ChampionAbilityStateData | null,
    isSelfPanel = false,
    highlightVictory = false
  ) => {
    const legendReady = Boolean(isSelfPanel && legendState?.canActivate && legend);
    const leaderReady = Boolean(isSelfPanel && leaderState?.canActivate && leader);
    const legendStatusText = legendState
      ? legendState.canActivate
        ? `Ready${legendState.costSummary ? ` — ${legendState.costSummary}` : ''}`
        : legendState.reason ?? 'Unavailable'
      : null;
    const leaderStatusText = leaderState
      ? leaderState.canActivate
        ? `Ready${leaderState.costSummary ? ` — ${leaderState.costSummary}` : ''}`
        : leaderState.reason ?? 'Unavailable'
      : null;
    return (
      <div className="sidebar-champions">
        <div className="champion-header">
          <h4>{title}</h4>
          <div
            className={[
              'champion-victory',
              highlightVictory ? 'champion-victory--flash' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span>Victory</span>
            <strong>
              {points}/{target || '—'}
            </strong>
          </div>
        </div>
        <div className="champion-focus-group">
          <div className={`champion-slot${legendReady ? ' champion-slot--ready' : ''}`}>
            <CardTile
              card={legend ?? undefined}
              label="Legend"
              compact
              widthPx={125}
              selectable={legendReady}
              disabled={!legendReady || activatingChampion}
              onClick={legendReady ? handleChampionLegendActivate : undefined}
              title={legendState?.costSummary ?? legendState?.reason ?? undefined}
              onHover={handleCardHover}
            />
            {isSelfPanel && legendStatusText ? (
              <div
                className={`champion-ability-status${
                  legendState?.canActivate ? ' champion-ability-status--ready' : ' champion-ability-status--blocked'
                }`}
              >
                {legendStatusText}
              </div>
            ) : null}
          </div>
          <div className={`champion-slot${leaderReady ? ' champion-slot--ready' : ''}`}>
            <CardTile
              card={leader ?? undefined}
              label="Leader"
              compact
              widthPx={125}
              selectable={leaderReady}
              disabled={!leaderReady || activatingChampion}
              draggable={Boolean(isSelfPanel && leaderReady && !activatingChampion)}
              onDragStart={isSelfPanel ? handleChampionLeaderDragStart : undefined}
              onDragEnd={isSelfPanel ? handleChampionLeaderDragEnd : undefined}
              onClick={isSelfPanel && leaderReady ? handleChampionLeaderClick : undefined}
              title={leaderState?.costSummary ?? leaderState?.reason ?? undefined}
              onHover={handleCardHover}
            />
            {isSelfPanel && leaderStatusText ? (
              <div
                className={`champion-ability-status${
                  leaderState?.canActivate ? ' champion-ability-status--ready' : ' champion-ability-status--blocked'
                }`}
              >
                {leaderStatusText}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const playerChampionPanel = renderChampionPanel(
    'Your Champions',
    legendCard ?? null,
    leaderCard ?? null,
    playerVictoryPoints,
    playerVictoryTarget,
    currentPlayer.championLegendState ?? null,
    currentPlayer.championLeaderState ?? null,
    true,
    playerVictoryFlash
  );
  const opponentChampionPanel = renderChampionPanel(
    `${opponentHeading}'s Champions`,
    opponentLegend ?? null,
    opponentLeader ?? null,
    opponentVictoryPoints,
    opponentVictoryTarget,
    resolvedOpponent.championLegendState ?? null,
    resolvedOpponent.championLeaderState ?? null,
    false,
    opponentVictoryFlash
  );

  const spotlightDisplayCard = hoveredSpotlightCard;
  const spotlightEffectText = resolveCardEffectText(spotlightDisplayCard);
  const cardSpotlightPanel = (
    <div className="card-spotlight-panel">
      <div className="card-spotlight-panel__art">
        {spotlightDisplayCard ? (
          <CardTile
            card={spotlightDisplayCard}
            widthPx={260}
            onHover={handleCardHover}
          />
        ) : (
          <div className="card-spotlight-panel__placeholder" />
        )}
      </div>
      <div className="card-spotlight-panel__details">
        {spotlightDisplayCard ? (
          <>
            <div className="card-spotlight-panel__name">
              {spotlightDisplayCard.name ?? 'Unknown Card'}
            </div>
            <div className="card-spotlight-panel__meta">
              {spotlightDisplayCard.type ?? '—'}{' '}
              {spotlightDisplayCard.keywords?.length
                ? `• ${spotlightDisplayCard.keywords.join(', ')}`
                : ''}
            </div>
            {spotlightEffectText ? (
              <div
                className="card-spotlight-panel__text"
                dangerouslySetInnerHTML={{ __html: spotlightEffectText }}
              />
            ) : (
              <div className="card-spotlight-panel__text card-spotlight-panel__text--empty">
                No rules text
              </div>
            )}
          </>
        ) : (
          <div className="card-spotlight-panel__text card-spotlight-panel__text--empty">
            Hover a card to inspect details
          </div>
        )}
      </div>
    </div>
  );
  const championSpotlightSticky = (
    <div className="card-spotlight-sticky">{cardSpotlightPanel}</div>
  );
  const championDock = (
    <section className="champion-dock" aria-label="Champion panels">
      {championFocus === 'self' ? playerChampionPanel : opponentChampionPanel}
    </section>
  );

  const renderDeploymentModal = (
    card: BaseCard,
    onDeploy: (destinationId: string | null) => void,
    onCancel: () => void
  ) => (
    <div className="deploy-overlay">
      <div className="deploy-modal">
        <h4>Deploy {card.name ?? 'Unit'}</h4>
        <p>Select where you would like to deploy this unit.</p>
        <div className="deploy-options">
          <button
            type="button"
            className="prompt-button secondary"
            onClick={() => onDeploy(null)}
          >
            Base
          </button>
          {controlledBattlefields.map((field) => (
            <button
              type="button"
              key={field.battlefieldId}
              className="prompt-button primary"
              onClick={() => onDeploy(field.battlefieldId)}
            >
              {field.name}
            </button>
          ))}
        </div>
        <button type="button" className="prompt-button danger" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );

  const deploymentOverlay =
    pendingDeploymentCard && pendingDeployment != null
      ? renderDeploymentModal(
          pendingDeploymentCard,
          (destinationId) => {
            void handlePlayCard(pendingDeployment, destinationId, {
              animateKey: pendingDeploymentKey,
            });
            setPendingDeployment(null);
          },
          () => setPendingDeployment(null)
        )
      : pendingLeaderDeployment && leaderCard
        ? renderDeploymentModal(
            leaderCard,
            (destinationId) => {
              void handleChampionLeaderDeploy(destinationId);
              setPendingLeaderDeployment(false);
            },
            () => setPendingLeaderDeployment(false)
          )
        : null;

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
        <div className="arena-layout__column arena-layout__column--dock">
          {championSpotlightSticky}
          {championDock}
        </div>
        <div className="arena-layout__main">
          {matchStatusClusterSticky}
          {combatPriorityBanner}
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
      {deploymentOverlay}
      {actionMessage && (
        <AnnouncementModal
          message={actionMessage}
          onClose={() => setActionMessage(null)}
        />
      )}
    </>
  );

  const matchResultOverlay =
    matchEnded && opponentNameForResult ? (
      <MatchResultOverlay
        didWin={playerWonMatch}
        opponentName={opponentNameForResult}
        reasonLabel={matchResultReasonLabel}
        onReturn={handleReturnToQueue}
      />
    ) : null;

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
      {showConcedeConfirm && (
        <ConcedeConfirmModal
          loading={concedingMatch}
          onConfirm={confirmConcede}
          onCancel={cancelConcedePrompt}
        />
      )}
      {matchResultOverlay}
    </div>
  );
}
