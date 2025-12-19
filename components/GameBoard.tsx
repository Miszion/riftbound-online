'use client';

import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
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
} from '@/hooks/useGraphQL';
import doransBladeImg from '@/public/images/dorans-blade.jpg';
import doransShieldImg from '@/public/images/dorans-shield.jpg';
import doransRingImg from '@/public/images/dorans-ring.jpg';

type CardAsset = {
  remote?: string | null;
  localPath?: string | null;
};

type BaseCard = {
  cardId?: string | null;
  instanceId?: string | null;
  name?: string | null;
  type?: string | null;
  rarity?: string | null;
  cost?: number | null;
  power?: number | null;
  toughness?: number | null;
  currentToughness?: number | null;
  keywords?: string[] | null;
  tags?: string[] | null;
  text?: string | null;
  isTapped?: boolean | null;
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
};

type OpponentSummary = {
  playerId?: string | null;
  victoryPoints?: number | null;
  victoryScore?: number | null;
  handSize?: number | null;
  deckCount?: number | null;
  runeDeckSize?: number | null;
  board?: PlayerBoardState | null;
};

type GameStateView = {
  matchId: string;
  currentPhase: string;
  turnNumber: number;
  currentPlayerIndex: number;
  canAct: boolean;
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

const INITIATIVE_RESULT_DELAY_MS = 3000;
const INITIATIVE_SYNC_INTERVAL_MS = 2000;

type SpectatorGameState = {
  matchId: string;
  status: string;
  currentPhase: string;
  turnNumber: number;
  players: PlayerStateData[];
  prompts: GamePrompt[];
  priorityWindow?: PriorityWindow | null;
  battlefields: BattlefieldState[];
  initiativeWinner?: string | null;
  initiativeLoser?: string | null;
  initiativeSelections?: Record<string, number | null> | null;
  initiativeDecidedAt?: string | null;
};

interface GameBoardProps {
  matchId: string;
  playerId: string;
}

const RARITY_COLORS: Record<string, string> = {
  common: '#94a3b8',
  uncommon: '#34d399',
  rare: '#fcd34d',
  legendary: '#f472b6',
  epic: '#c084fc',
  promo: '#22d3ee',
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

const MAX_RUNE_SLOTS = 12;
const MATCH_INIT_RETRY_DELAY = 1500;
const MATCH_INIT_MAX_RETRIES = 20;

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

const getCardImage = (card?: BaseCard | null) => {
  if (!card?.assets) {
    return null;
  }
  if (card.assets.remote) {
    return card.assets.remote;
  }
  if (card.assets.localPath) {
    const normalized = card.assets.localPath.replace(/^\/+/, '');
    return `/${normalized}`;
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

const getDomainColor = (domain?: string | null) => {
  if (!domain) {
    return '#475569';
  }
  return DOMAIN_COLORS[domain.toLowerCase()] ?? '#a5b4fc';
};

const createRuneSlots = (runes: RuneState[] = []) => {
  return Array.from({ length: MAX_RUNE_SLOTS }, (_, index) => runes[index] ?? null);
};

const cardIdValue = (card?: BaseCard | null) =>
  card?.instanceId ?? card?.cardId ?? card?.name ?? '';

const findCardWithTag = (
  cards: BaseCard[],
  tag: string,
  exclude?: Set<string>
) => {
  return cards.find((card) => {
    const id = cardIdValue(card);
    if (exclude && id && exclude.has(id)) {
      return false;
    }
  return (
      card.tags?.some((entry) =>
        entry.toLowerCase().includes(tag.toLowerCase())
      ) ?? false
    );
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
};

const snapshotToBaseCard = (
  snapshot?: CardSnapshotLike | null,
  defaults: Partial<BaseCard> = {}
): BaseCard => ({
  cardId: snapshot?.cardId ?? defaults.cardId ?? null,
  instanceId: defaults.instanceId ?? null,
  name: snapshot?.name ?? defaults.name ?? 'Unknown',
  type: snapshot?.type ?? defaults.type ?? 'BATTLEFIELD',
  rarity: snapshot?.rarity ?? defaults.rarity ?? undefined,
  keywords: snapshot?.keywords ?? defaults.keywords ?? undefined,
  text: snapshot?.effect ?? defaults.text ?? undefined,
  assets: snapshot?.assets ?? defaults.assets ?? null,
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
}

const CardTile: React.FC<CardTileProps> = ({
  card,
  label,
  onClick,
  selectable,
  isSelected,
  disabled,
  compact,
}) => {
  const image = getCardImage(card);
  const rarityColor =
    RARITY_COLORS[card?.rarity?.toLowerCase() ?? ''] ?? '#475569';
  const statsAvailable =
    card?.power !== undefined && card?.toughness !== undefined;
  const isTapped = Boolean(card?.isTapped);

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
      style={{ borderColor: rarityColor }}
      onClick={disabled ? undefined : onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {image ? (
        <div
          className="card-image"
          style={{ backgroundImage: `url(${image})` }}
        />
      ) : (
        <div className="card-placeholder">
          <span>{card?.name ?? 'Empty Slot'}</span>
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

const RuneGrid = ({
  title,
  slots,
  compact,
}: {
  title: string;
  slots: (RuneState | null)[];
  compact?: boolean;
}) => (
  <div className={`rune-section ${compact ? 'rune-section--compact' : ''}`}>
    <div className="section-title">{title}</div>
    <div className={`rune-grid ${compact ? 'rune-grid--compact' : ''}`}>
      {slots.map((slot, index) => {
        const runeClasses = [
          'rune-cell',
          slot ? 'filled' : '',
          slot && (slot.isTapped ?? slot.tapped) ? 'rune-cell--tapped' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div
            key={`${title}-${index}`}
            className={runeClasses}
            style={
              slot
                ? {
                    borderColor: getDomainColor(slot.domain),
                    backgroundColor: 'rgba(255,255,255,0.04)',
                  }
                : undefined
            }
          >
            {slot ? (
              <>
                <span className="rune-name">{slot.name}</span>
                <span className="rune-domain">{slot.domain ?? '—'}</span>
                <span className="rune-values">
                  E:{slot.energyValue ?? 0} P:{slot.powerValue ?? 0}
                </span>
              </>
            ) : (
              <span className="rune-empty">Empty</span>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

const GraveyardPile = ({
  cards,
  compact,
}: {
  cards: BaseCard[];
  compact?: boolean;
}) => {
  const topCards = cards.slice(-3);
  return (
    <div className={`graveyard-pile ${compact ? 'graveyard-pile--compact' : ''}`}>
      <div className="section-title">Graveyard ({cards.length})</div>
      <div className="graveyard-cards">
        {topCards.length === 0 ? (
          <div className="empty-slot">No cards</div>
        ) : (
          topCards.map((card) => (
            <CardTile
              key={cardIdValue(card)}
              card={card}
              compact
            />
          ))
        )}
      </div>
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
  const visibleCards = Math.min(count, 5);
  return (
    <div className="deck-stack" data-owner={owner}>
      <div className="section-title">{label}</div>
      <div className="deck-stack__pile">
        {visibleCards === 0 && <div className="empty-slot">No cards</div>}
        {Array.from({ length: visibleCards }).map((_, index) => (
          <div
            key={`${label}-${index}`}
            className="deck-card-back"
            style={{ transform: `translateY(${index * 4}px)` }}
          />
        ))}
        {drawAnimations.map((animation) => (
          <div
            key={animation.id}
            className={`card-draw-animation card-draw-animation--${owner}`}
            onAnimationEnd={() => onAnimationComplete(animation.id)}
          />
        ))}
      </div>
      <div className="deck-count">{count} {count === 1 ? 'card' : 'cards'}</div>
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
      {cards.length === 0 ? (
        <div className="empty-slot wide">Base is clear</div>
      ) : (
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
  mulliganSelection: number[];
  canInteract: boolean;
  idleLabel?: string;
};

const HandRow = ({
  isSelf,
  cards,
  handSize,
  onCardClick,
  mulliganSelection,
  canInteract,
  idleLabel,
}: HandRowProps) => {
  const displayHand = isSelf ? cards : [];
  const placeholderCount = isSelf ? 0 : handSize;
  return (
    <div className={`hand-row ${isSelf ? 'hand-row--self' : 'hand-row--opponent'}`}>
      <div className="section-title">
        Hand ({handSize})
      </div>
      <div className={`hand-cards ${isSelf ? '' : 'hand-cards--opponent'}`}>
        {isSelf ? (
          displayHand.length === 0 ? (
            <div className="empty-slot wide">{idleLabel ?? 'No cards in hand'}</div>
          ) : (
            displayHand.map((card, index) => {
              const isSelected = mulliganSelection.includes(index);
              return (
                <div
                  key={cardIdValue(card) || `hand-${index}`}
                  className={[
                    'hand-card',
                    isSelected ? 'selected' : '',
                    canInteract ? 'hand-card--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={
                    canInteract && onCardClick
                      ? () => onCardClick(index)
                      : undefined
                  }
                >
                  <CardTile
                    card={card}
                    compact
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
    </div>
  );
};

type BattlefieldChoice = {
  id: string;
  label: string;
  description?: string;
  card: BaseCard;
};

const BoardGrid = ({
  board,
  excludeIds,
  compact,
  onCardSelect,
  selectableFilter,
  selectedCardId,
}: {
  board?: PlayerBoardState | null;
  excludeIds?: Set<string>;
  compact?: boolean;
  onCardSelect?: (card: BaseCard) => void;
  selectableFilter?: (card: BaseCard) => boolean;
  selectedCardId?: string | null;
}) => {
  const sections = [
    { label: 'Units', cards: board?.creatures ?? [] },
    { label: 'Gear', cards: board?.artifacts ?? [] },
    { label: 'Enchantments', cards: board?.enchantments ?? [] },
  ];
  return (
    <div className="board-columns">
      {sections.map((section) => {
        const visibleCards = section.cards.filter((card) => {
          const id = cardIdValue(card);
          return !excludeIds?.has(id);
        });
        return (
          <div className="board-column" key={section.label}>
            <div className="column-title">{section.label}</div>
            <div className="card-row">
              {visibleCards.length === 0 ? (
                <div className="empty-slot">Empty</div>
              ) : (
                visibleCards.map((card) => {
                  const selectable =
                    Boolean(onCardSelect) &&
                    (!selectableFilter || selectableFilter(card));
                  const instanceId = card.instanceId ?? undefined;
                  return (
                    <CardTile
                      key={cardIdValue(card)}
                      card={card}
                      compact={compact}
                      selectable={selectable}
                      isSelected={
                        Boolean(instanceId) && selectedCardId === instanceId
                      }
                      onClick={
                        selectable && onCardSelect
                          ? () => onCardSelect(card)
                          : undefined
                      }
                    />
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
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

  const [mulliganSelection, setMulliganSelection] = useState<number[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [matchInitRetries, setMatchInitRetries] = useState(0);
  const [playerDeckOrder, setPlayerDeckOrder] = useState<string[]>([]);
  const [opponentDeckOrder, setOpponentDeckOrder] = useState<string[]>([]);
  const [drawQueue, setDrawQueue] = useState<DrawAnimation[]>([]);
  const previousPlayerDeckCount = useRef(0);
  const previousOpponentDeckCount = useRef(0);
  const matchSeedRef = useRef<string | null>(null);
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

  const playerView =
    playerSubData?.playerGameStateChanged ?? basePlayerData?.playerMatch;
  const spectatorState: SpectatorGameState | undefined =
    spectatorSubData?.gameStateChanged ?? baseSpectatorData?.match;
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
  const highlightedChoice = playerSelectionChoice ?? pendingInitiativeChoice;
  const playerChoiceMeta =
    highlightedChoice != null
      ? INITIATIVE_OPTIONS.find((option) => option.value === highlightedChoice) ?? null
      : null;
  const opponentChoiceMeta =
    opponentSelectionChoice != null
      ? INITIATIVE_OPTIONS.find((option) => option.value === opponentSelectionChoice) ?? null
      : null;

  useEffect(() => {
    if (!mulliganPrompt) {
      setMulliganSelection([]);
    }
  }, [mulliganPrompt?.id]);

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

  const [legendCard, leaderCard, exclusionSet] = useMemo(() => {
    const legend = findCardWithTag(playerCreatures, 'legend');
    const leaderExcludeSet = buildExcludeSet(legend);
    const leader = findCardWithTag(playerCreatures, 'leader', leaderExcludeSet);
    return [legend, leader, buildExcludeSet(legend, leader)];
  }, [playerCreatures]);

  const [opponentLegend, opponentLeader, opponentExclude] = useMemo(() => {
    const opponentCreatures = spectatorOpponent?.board?.creatures ?? [];
    const legend = findCardWithTag(opponentCreatures, 'legend');
    const leaderExcludeSet = buildExcludeSet(legend);
    const leader = findCardWithTag(opponentCreatures, 'leader', leaderExcludeSet);
    return [legend, leader, buildExcludeSet(legend, leader)];
  }, [spectatorOpponent?.board?.creatures]);

  const battlefields = spectatorState?.battlefields ?? [];
  const priorityWindow = spectatorState?.priorityWindow;
  const rawStatus = spectatorState?.status ?? 'in_progress';
  const matchStatus = rawStatus.toUpperCase();
  const isCoinFlipPhase = rawStatus === 'coin_flip';
  const canAct = Boolean(flow?.canAct);
  const canPlayCards =
    canAct &&
    rawStatus === 'in_progress' &&
    !mulliganPrompt &&
    !battlefieldPrompt;
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

  const playerRunes = useMemo(
    () => createRuneSlots(playerChanneledRunes),
    [playerChanneledRunes]
  );
  const opponentRunes = useMemo(
    () => createRuneSlots(opponentChanneledRunes),
    [opponentChanneledRunes]
  );

  const handlePlayCard = useCallback(
    async (cardIndex: number) => {
      if (!canPlayCards) {
        return;
      }
      try {
        await playCard({
          variables: {
            matchId,
            playerId,
            cardIndex,
          },
        });
        setActionMessage('Card played.');
      } catch (error) {
        console.error('Failed to play card', error);
        setActionMessage('Failed to play card.');
      }
    },
    [canPlayCards, matchId, playCard, playerId]
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
        setActionMessage(
          destinationId === 'base' ? 'Unit returned to base.' : 'Unit moved to battlefield.'
        );
        setSelectedUnit(null);
      } catch (error) {
        console.error('Failed to move unit', error);
        setActionMessage('Unable to move unit.');
      }
    },
    [matchId, moveUnit, playerId, selectedUnit]
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
        setActionMessage('Initiative choice locked in.');
        await Promise.allSettled([refetchMatch(), refetchPlayerMatch()]);
      } catch (error) {
        console.error('Failed to submit initiative choice', error);
        setActionMessage('Unable to lock initiative choice.');
      }
    },
    [
      awaitingInitiativeResolution,
      matchId,
      playerId,
      playerInitiativeLocked,
      refetchMatch,
      refetchPlayerMatch,
      submitInitiativeChoice,
    ]
  );

  const toggleMulliganSelection = (index: number) => {
    if (!mulliganPrompt) {
      return;
    }
    const limit =
      typeof mulliganPrompt.data?.maxReplacements === 'number'
        ? mulliganPrompt.data.maxReplacements
        : 2;
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
    handlePlayCard(index);
  };

  const handleSubmitMulligan = async () => {
    try {
      await submitMulligan({
        variables: {
          matchId,
          playerId,
          indices: [...mulliganSelection].sort((a, b) => b - a),
        },
      });
      setActionMessage(
        mulliganSelection.length
          ? `Replaced ${mulliganSelection.length} card(s)`
          : 'Keeping current hand'
      );
      setMulliganSelection([]);
    } catch (error) {
      console.error('Failed to submit mulligan', error);
      setActionMessage('Mulligan failed.');
    }
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
      setActionMessage('Battlefield locked in.');
    } catch (error) {
      console.error('Failed to select battlefield', error);
      setActionMessage('Unable to select battlefield.');
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
      setActionMessage('Phase advanced.');
    } catch (error) {
      console.error('Failed to advance phase', error);
      setActionMessage('Unable to advance phase.');
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
      setActionMessage('Unable to concede right now.');
    }
  };

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
      });
      return {
        id: optionId,
        label,
        description,
        card,
      };
    });
  }, [battlefieldOptions]);

  const mulliganLimit =
    typeof mulliganPrompt?.data?.maxReplacements === 'number'
      ? mulliganPrompt?.data?.maxReplacements
      : 2;

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
            locked: false,
            source: 'pending',
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
  const allBattlefieldsLocked = battlefieldStatus.every((entry) => entry.locked);
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
  const showInitiativeScreen =
    rawStatus === 'coin_flip' || !spectatorState?.initiativeWinner || initiativeRevealActive;
  const showingInitiativeResult = Boolean(
    initiativeOutcome && !isCoinFlipPhase && initiativeRevealActive
  );
  const opponentHeading = resolvePlayerLabel(opponentPlayerId, 'Opponent');
  const selfHeading = resolvePlayerLabel(playerId, 'You');
  const selfBoardTitle = selfHeading === 'You' ? 'Your Board' : `${selfHeading}'s Board`;
  const initiativeWinnerDisplay = initiativeOutcome
    ? resolvePlayerLabel(initiativeOutcome.winnerId, 'Unknown duelist')
    : null;
  const initiativeLoserDisplay = initiativeOutcome?.loserId
    ? resolvePlayerLabel(initiativeOutcome.loserId, opponentHeading)
    : opponentHeading;

  const boardPrompts = (
    <div className="prompt-panel board-prompts">
        {battlefieldPrompt && (
          <div className="prompt-card battlefield-prompt">
            <div className="prompt-title">Battlefield Selection</div>
            <p>Select one of your battlefields to bring into the arena.</p>
            <div className="battlefield-choice-grid">
              {normalizedBattlefieldChoices.length === 0 && (
                <span className="muted-text">Waiting on available options...</span>
              )}
              {normalizedBattlefieldChoices.map((choice) => (
                <button
                  key={choice.id}
                  className="battlefield-choice"
                  disabled={selectingBattlefield}
                  onClick={() => handleSelectBattlefield(choice.id)}
                >
                  <CardTile card={choice.card} label={choice.label} />
                  <span className="choice-note">{choice.description}</span>
                </button>
              ))}
            </div>
            <div className="battlefield-status-grid">
              {battlefieldStatus.map((entry) => {
                const selectionCard = entry.card;
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
                      <div className="selection-card">
                        <CardTile card={selectionCard} compact />
                      </div>
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
      {mulliganPrompt && (
        <div className="prompt-card">
          <div className="prompt-title">Mulligan Window</div>
          <p>Select up to {mulliganLimit} card(s) to redraw before the duel begins.</p>
          <div className="prompt-actions">
            <span>
              Selected: {mulliganSelection.length}/{mulliganLimit}
            </span>
            <button
              className="prompt-button primary"
              onClick={handleSubmitMulligan}
              disabled={submittingMulligan}
            >
              {submittingMulligan ? 'Submitting...' : 'Lock Mulligan'}
            </button>
          </div>
        </div>
      )}
      {!battlefieldPrompt && !mulliganPrompt && (
        <div className="prompt-card muted">
          <div className="prompt-title">Awaiting Next Phase</div>
          <p>
            The arena will highlight this area whenever decisions are required.
            Monitor the priority indicator above to stay in sync.
          </p>
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
          {opponentChoiceMeta ? (
            <div className="artifact-card opponent">
              <Image
                src={opponentChoiceMeta.image}
                alt={`${opponentHeading} choice`}
                width={140}
                height={140}
              />
              <span>{opponentChoiceMeta.label}</span>
            </div>
          ) : opponentInitiativeLocked ? (
            <div className="artifact-placeholder">Awaiting reveal…</div>
          ) : (
            <div className="artifact-placeholder">Waiting for selection…</div>
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


  const opponentMat = (
    <section className="player-mat opponent-panel">
      <div className="mat-header">
        <div>
          <h2>{opponentHeading}</h2>
          <div className="score-pill">
            Score: {resolvedOpponent.victoryPoints ?? 0}/
            {resolvedOpponent.victoryScore ?? currentPlayer.victoryScore}
          </div>
        </div>
        <span className="muted small">Hand: {opponentHandSize}</span>
      </div>
      <div className="mat-upper">
        <div className="mat-zone">
          <DeckStack
            label="Deck"
            count={opponentDeckOrder.length}
            owner="opponent"
            drawAnimations={opponentDrawAnimations}
            onAnimationComplete={handleDrawAnimationComplete}
          />
        </div>
        <div className="mat-zone">
          <RuneGrid title="Runes" slots={opponentRunes} compact />
        </div>
        <div className="mat-zone champion-stack">
          <CardTile card={opponentLegend} label="Legend" />
          <CardTile card={opponentLeader} label="Leader" />
        </div>
        <div className="mat-zone">
          <GraveyardPile cards={opponentGraveyard} compact />
        </div>
      </div>
      <div className="mat-center">
        <BoardGrid board={opponentFrontlineBoard} excludeIds={opponentExclude} compact />
      </div>
      <div className="mat-lower">
        <BaseGrid title="Base" cards={opponentBaseUnits} />
        <HandRow
          isSelf={false}
          cards={[]}
          handSize={opponentHandSize}
          onCardClick={undefined}
          mulliganSelection={[]}
          canInteract={false}
          idleLabel="Opponent hand hidden"
        />
      </div>
    </section>
  );

  const selfMat = (
    <section className="player-mat self-panel">
      <div className="mat-header">
        <div>
          <h2>{selfBoardTitle}</h2>
          <div className="score-pill">
            Score: {currentPlayer.victoryPoints}/{currentPlayer.victoryScore}
          </div>
        </div>
        <div className="resource-block">
          <span>
            Mana: {currentPlayer.mana}/{currentPlayer.maxMana}
          </span>
          <span>Energy: {currentPlayer.resources.energy}</span>
          <span>Universal: {currentPlayer.resources.universalPower}</span>
          <span>Power: {formatPowerPool(currentPlayer.resources.power)}</span>
        </div>
      </div>
      <div className="mat-upper">
        <div className="mat-zone">
          <DeckStack
            label="Deck"
            count={playerDeckOrder.length}
            owner="self"
            drawAnimations={playerDrawAnimations}
            onAnimationComplete={handleDrawAnimationComplete}
          />
        </div>
        <div className="mat-zone">
          <RuneGrid title="Runes" slots={playerRunes} />
        </div>
        <div className="mat-zone champion-stack">
          <CardTile card={legendCard} label="Legend" />
          <CardTile card={leaderCard} label="Leader" />
        </div>
        <div className="mat-zone">
          <GraveyardPile cards={playerGraveyard} />
        </div>
      </div>
      <div className="mat-center">
        <BoardGrid
          board={playerFrontlineBoard}
          excludeIds={exclusionSet}
          onCardSelect={canAct ? handleSelectUnit : undefined}
          selectableFilter={(card) => card.type === 'CREATURE'}
          selectedCardId={selectedUnit}
        />
      </div>
      <div className="mat-lower">
        <BaseGrid
          title="Base"
          cards={playerBaseUnits}
          onCardSelect={canAct ? handleSelectUnit : undefined}
          selectable={canAct}
          selectedCardId={selectedUnit}
        />
        <HandRow
          isSelf
          cards={currentPlayer.hand}
          handSize={currentPlayer.hand.length}
          onCardClick={handleHandCardClick}
          mulliganSelection={mulliganSelection}
          canInteract={handInteractable}
          idleLabel="Draw cards or await next phase"
        />
      </div>
    </section>
  );

  const boardView = (
    <>
      <div className="status-bar">
        <div>
          <strong>Match:</strong> {matchId}
        </div>
        <div>
          <strong>Status:</strong> {friendlyStatus(matchStatus)}
        </div>
        <div>
          <strong>Phase:</strong> {flow?.currentPhase ?? 'Unknown'}
        </div>
        <div>
          <strong>Turn:</strong> {flow?.turnNumber ?? spectatorState.turnNumber}
        </div>
        <div className="priority-pill">
          {priorityWindow
            ? priorityWindow.holder === playerId
              ? 'You have priority'
              : 'Awaiting opponent priority'
            : 'Priority open'}
        </div>
        <div className="control-buttons">
          <button
            className="primary"
            onClick={handleNextPhase}
            disabled={!canAct || advancingPhase || matchStatus !== 'IN_PROGRESS'}
          >
            {advancingPhase ? 'Advancing…' : 'End Phase'}
          </button>
          <button className="secondary" onClick={handleConcede}>
            Concede
          </button>
        </div>
      </div>
      <div className="phase-indicator">
        {canAct
          ? 'You currently have priority.'
          : 'Waiting for opponent or resolving effects.'}
      </div>
      {initiativeOutcome && initiativeWinnerDisplay && (
        <div className="initiative-banner">
          <strong>{`${initiativeWinnerDisplay} won the initiative duel.`}</strong>
          <span>
            {initiativeOutcome.winnerIsSelf
              ? `${initiativeWinnerDisplay} takes the first turn.`
              : `${initiativeWinnerDisplay} takes the first turn while ${initiativeLoserDisplay} receives the bonus rune channel.`}
            {initiativeOutcome.winnerChoiceLabel
              ? ` (${initiativeWinnerDisplay} chose ${initiativeOutcome.winnerChoiceLabel}.)`
              : null}
          </span>
        </div>
      )}
      <div className="mat-layout">
        {opponentMat}
        <section className="arena-column">
          <div className="arena-panel battlefield-panel">
            <h2>Battlefields</h2>
            <div className="battlefield-row">
              {battlefields.length === 0 ? (
                <div className="empty-slot wide">Waiting for battlefield draft...</div>
              ) : (
                battlefields.map((field, index) => (
                  <div className="battlefield-card" key={field.battlefieldId}>
                    <CardTile
                      card={snapshotToBaseCard(field.card, {
                        cardId: field.battlefieldId,
                        name: field.name,
                        type: 'Battlefield',
                      })}
                      label={`Field ${index + 1}`}
                    />
                    <div className="battlefield-meta">
                      <span>Owner: {resolvePlayerLabel(field.ownerId, 'Unclaimed')}</span>
                      <span>Controller: {resolvePlayerLabel(field.controller, 'Unclaimed')}</span>
                      {field.contestedBy.length > 0 && (
                        <span>
                          Contested by:{' '}
                          {field.contestedBy
                            .map((contender) => resolvePlayerLabel(contender, 'Unknown duelist'))
                            .join(', ')}
                        </span>
                      )}
                    </div>
                    {selectedUnit && (
                      <button
                        className="prompt-button"
                        onClick={() => handleMoveSelected(field.battlefieldId)}
                        disabled={
                          !canAct ||
                          movingUnit ||
                          !selectedUnitCard ||
                          (selectedUnitCard.location?.zone === 'battlefield' &&
                            selectedUnitCard.location?.battlefieldId === field.battlefieldId)
                        }
                      >
                        {movingUnit ? 'Moving...' : 'Move Selected Here'}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          {boardPrompts}
        </section>
        {selfMat}
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
      {actionMessage && <div className="message-line">{actionMessage}</div>}
    </>
  );

  return (
    <div className={`game-board ${showInitiativeScreen ? 'duel-mode' : 'board-mode'}`}>
      {showInitiativeScreen ? initiativeView : boardView}
      <style jsx>{`

        .game-board {
          min-height: 100vh;
          background: radial-gradient(circle at top, #1e2761, #0d101d 70%);
          color: #e2e8f0;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .status-bar {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
          align-items: center;
          padding: 14px 18px;
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.85);
        }

        .control-buttons {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          flex-wrap: wrap;
        }

        .priority-pill {
          margin-left: auto;
          background: rgba(59, 130, 246, 0.2);
          border: 1px solid rgba(59, 130, 246, 0.6);
          padding: 4px 10px;
          border-radius: 999px;
          font-weight: 600;
        }

        .prompt-panel {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }

        .board-prompts {
          margin-top: -4px;
        }

        .prompt-card {
          flex: 1;
          min-width: 240px;
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 10px;
          background: rgba(15, 23, 42, 0.75);
          padding: 16px;
        }

        .prompt-card.muted {
          opacity: 0.8;
        }

        .battlefield-prompt {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .prompt-title {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .prompt-options {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .battlefield-choice-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
        }

        .battlefield-choice {
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.65);
          padding: 10px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: transform 0.2s ease, border-color 0.2s ease;
        }

        .battlefield-choice:hover:not(:disabled) {
          border-color: rgba(34, 197, 94, 0.7);
          transform: translateY(-3px);
        }

        .battlefield-choice:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .choice-note {
          font-size: 12px;
          color: rgba(226, 232, 240, 0.75);
          text-align: center;
        }

        .muted-text {
          color: rgba(226, 232, 240, 0.6);
          font-style: italic;
        }

        .prompt-button {
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid rgba(226, 232, 240, 0.4);
          background: rgba(148, 163, 184, 0.2);
          color: inherit;
          cursor: pointer;
          transition: background 0.2s, color 0.2s, transform 0.2s;
        }

        .prompt-button.primary {
          border-color: rgba(34, 197, 94, 0.6);
          background: rgba(34, 197, 94, 0.15);
        }

        .prompt-button:hover:not(:disabled) {
          transform: translateY(-2px);
        }

        .prompt-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .prompt-actions {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-top: 8px;
        }

        .initiative-help {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: space-between;
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 10px;
          padding: 10px 14px;
          background: rgba(15, 23, 42, 0.65);
          font-weight: 600;
        }

        .tie-callout {
          margin: 10px 0;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid rgba(251, 191, 36, 0.6);
          background: rgba(245, 158, 11, 0.1);
          color: #fcd34d;
        }

        .initiative-grid {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .initiative-grid--full {
          width: 100%;
        }

        .initiative-button {
          flex: 1;
          min-width: 240px;
          border: none;
          border-radius: 20px;
          background: transparent;
          color: inherit;
          cursor: pointer;
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          align-items: center;
          transition: transform 0.2s;
        }

        .initiative-button:hover:not(:disabled) {
          transform: translateY(-6px);
        }

        .initiative-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .initiative-button--selected {
          transform: translateY(-6px);
        }

        .initiative-button--selected .initiative-art {
          border-color: rgba(34, 197, 94, 0.9);
          box-shadow: 0 16px 35px rgba(34, 197, 94, 0.25);
        }

        .initiative-art {
          width: 200px;
          height: 200px;
          border-radius: 28px;
          object-fit: cover;
          border: 3px solid rgba(148, 163, 184, 0.45);
          background: rgba(2, 6, 23, 0.92);
          box-shadow: 0 12px 35px rgba(5, 10, 25, 0.65);
        }

        .selected-artifacts {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin: 16px 0;
          justify-content: center;
          align-items: flex-start;
        }

        .artifact-panel {
          flex: 1;
          min-width: 200px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 12px;
          padding: 12px;
          background: rgba(15, 23, 42, 0.6);
        }

        .artifact-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 10px;
        }

        .artifact-card img {
          border-radius: 12px;
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.35);
        }

        .artifact-card.opponent img {
          border-color: rgba(248, 113, 113, 0.6);
        }

        .artifact-placeholder {
          min-height: 120px;
          border: 1px dashed rgba(148, 163, 184, 0.3);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 12px;
          color: rgba(226, 232, 240, 0.75);
          font-size: 14px;
        }

        .phase-progress {
          margin-top: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          justify-content: center;
          font-size: 14px;
          color: rgba(226, 232, 240, 0.85);
        }

        .phase-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(148, 163, 184, 0.5);
          border-top-color: rgba(34, 197, 94, 0.9);
          border-radius: 50%;
          animation: spin 0.9s linear infinite;
        }

        .phase-indicator {
          text-align: center;
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 8px;
          padding: 8px 12px;
          background: rgba(15, 23, 42, 0.7);
          font-size: 14px;
        }

        .initiative-banner {
          margin: 0.85rem 0;
          padding: 0.85rem 1.1rem;
          border-radius: 10px;
          border: 1px solid rgba(34, 197, 94, 0.45);
          background: rgba(16, 185, 129, 0.12);
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .initiative-banner strong {
          font-size: 0.95rem;
        }

        .initiative-banner span {
          font-size: 0.85rem;
          color: rgba(226, 232, 240, 0.9);
        }

        .board-layout {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
          align-items: flex-start;
        }

        .player-panel {
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 14px;
          padding: 16px;
          background: rgba(15, 23, 42, 0.85);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-height: 100%;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }

        .score-pill {
          margin-top: 4px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          padding: 4px 12px;
          border: 1px solid rgba(226, 232, 240, 0.4);
          background: rgba(226, 232, 240, 0.08);
        }

        .resource-block {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          font-size: 14px;
        }

        .player-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .section-title {
          font-size: 14px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 6px;
          color: rgba(226, 232, 240, 0.8);
        }

        .deck-stack {
          border: 1px dashed rgba(148, 163, 184, 0.4);
          border-radius: 10px;
          padding: 12px;
          background: rgba(15, 23, 42, 0.6);
        }

        .deck-stack__pile {
          position: relative;
          min-height: 110px;
        }

        .deck-card-back,
        .card-back {
          width: 64px;
          height: 90px;
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(94, 234, 212, 0.5), rgba(59, 130, 246, 0.5));
          border: 1px solid rgba(226, 232, 240, 0.3);
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.3);
        }

        .deck-count {
          margin-top: 8px;
          font-size: 13px;
          color: rgba(226, 232, 240, 0.75);
        }

        .card-draw-animation {
          position: absolute;
          top: 0;
          left: 0;
          width: 64px;
          height: 90px;
          border-radius: 8px;
          border: 1px solid rgba(226, 232, 240, 0.4);
          background: rgba(59, 130, 246, 0.4);
          opacity: 0;
          pointer-events: none;
        }

        .card-draw-animation--self {
          animation: drawCardSelf 0.9s ease-out forwards;
        }

        .card-draw-animation--opponent {
          animation: drawCardOpponent 0.9s ease-out forwards;
        }

        .champion-lineup {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
        }

        .grid-panel {
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 14px;
          padding: 16px;
          background: rgba(15, 23, 42, 0.85);
        }

        .battlefield-zone h2 {
          margin-bottom: 12px;
        }

        .battlefield-row {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .battlefield-card {
          border: 1px dashed rgba(148, 163, 184, 0.4);
          border-radius: 12px;
          padding: 12px;
          background: rgba(15, 23, 42, 0.65);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .battlefield-status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }

        .selection-pill {
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 10px;
          padding: 10px;
          background: rgba(15, 23, 42, 0.55);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .selection-pill--self {
          border-color: rgba(34, 197, 94, 0.4);
          background: rgba(22, 163, 74, 0.08);
        }

        .selection-pill--ready {
          box-shadow: 0 0 12px rgba(34, 197, 94, 0.4);
        }

        .pill-header {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .pill-player {
          font-weight: 600;
        }

        .pill-status {
          font-size: 12px;
          color: rgba(226, 232, 240, 0.7);
        }

        .selection-card {
          display: flex;
          justify-content: center;
        }

        .selection-card .card-tile {
          width: 90px;
          height: 130px;
        }

        .pill-empty {
          font-size: 12px;
          color: rgba(226, 232, 240, 0.6);
        }

        .battlefield-progress {
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px dashed rgba(148, 163, 184, 0.4);
          font-size: 13px;
          text-align: center;
          color: rgba(226, 232, 240, 0.8);
        }

        .battlefield-progress--ready {
          border-style: solid;
          border-color: rgba(34, 197, 94, 0.6);
          background: rgba(34, 197, 94, 0.08);
          color: rgba(16, 185, 129, 0.9);
        }

        .battlefield-meta {
          font-size: 12px;
          color: rgba(226, 232, 240, 0.8);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .board-columns {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .board-column {
          border: 1px dashed rgba(148, 163, 184, 0.3);
          border-radius: 10px;
          padding: 10px;
          background: rgba(15, 23, 42, 0.6);
        }

        .column-title {
          font-weight: 600;
          margin-bottom: 6px;
        }

        .card-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          min-height: 96px;
        }

        .empty-slot {
          flex: 1;
          min-height: 80px;
          border: 1px dashed rgba(148, 163, 184, 0.4);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(226, 232, 240, 0.7);
        }

        .empty-slot.wide {
          min-height: 100px;
        }

        .card-tile {
          position: relative;
          border: 1px solid rgba(148, 163, 184, 0.5);
          border-radius: 12px;
          overflow: hidden;
          width: 140px;
          height: 196px;
          background: rgba(15, 23, 42, 0.7);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          animation: cardFloat 14s ease-in-out infinite;
        }

        .card-tile--compact {
          width: 100px;
          height: 140px;
        }

        .card-tile--selectable {
          cursor: pointer;
        }

        .card-tile--selectable:hover {
          transform: translateY(-6px) scale(1.02);
          box-shadow: 0 12px 20px rgba(0, 0, 0, 0.35);
        }

        .card-tile--selected {
          box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.8);
        }

        .card-tile--tapped {
          filter: grayscale(0.6);
          opacity: 0.8;
        }

        .card-image {
          width: 100%;
          height: 100%;
          background-size: cover;
          background-position: center;
        }

        .card-placeholder {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
          text-align: center;
          font-size: 13px;
        }

        .card-label {
          position: absolute;
          bottom: 6px;
          left: 6px;
          right: 6px;
          padding: 4px 6px;
          border-radius: 6px;
          background: rgba(2, 6, 23, 0.65);
          font-size: 12px;
          text-align: center;
        }

        .card-cost {
          position: absolute;
          top: 6px;
          left: 6px;
          background: rgba(15, 23, 42, 0.85);
          border-radius: 6px;
          padding: 4px 6px;
          font-weight: 600;
        }

        .card-stats {
          position: absolute;
          top: 6px;
          right: 6px;
          background: rgba(15, 23, 42, 0.85);
          border-radius: 6px;
          padding: 4px 6px;
          font-weight: 600;
        }

        .rune-section {
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 10px;
          padding: 10px;
          background: rgba(15, 23, 42, 0.6);
        }

        .rune-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }

        .rune-grid--compact {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .rune-cell {
          border: 1px dashed rgba(148, 163, 184, 0.4);
          border-radius: 8px;
          min-height: 70px;
          padding: 6px;
          font-size: 11px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
        }

        .rune-cell.filled {
          border-style: solid;
        }

        .rune-cell--tapped {
          opacity: 0.6;
        }

        .graveyard-pile {
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 10px;
          padding: 10px;
          background: rgba(15, 23, 42, 0.6);
        }

        .graveyard-cards {
          display: flex;
          gap: 8px;
        }

        .hand-row {
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 12px;
          padding: 12px;
          background: rgba(15, 23, 42, 0.55);
        }

        .hand-cards {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .hand-card {
          cursor: default;
          transition: transform 0.25s ease, filter 0.2s ease;
        }

        .hand-card--active {
          cursor: pointer;
        }

        .hand-card--active:hover {
          transform: translateY(-6px);
        }

        .hand-card.selected .card-tile {
          box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.9);
        }

        .selection-banner {
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 10px;
          padding: 12px;
          background: rgba(2, 6, 23, 0.7);
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }

        .selection-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .message-line {
          margin-top: 8px;
          text-align: center;
          font-size: 14px;
          color: rgba(226, 232, 240, 0.85);
        }

        .initiative-screen {
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 16px;
          padding: 24px;
          background: rgba(9, 9, 22, 0.85);
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.45);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .duel-intro {
          text-align: center;
          max-width: 560px;
          margin: 0 auto;
        }

        .duel-status-row {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .duel-player-card {
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 10px;
          padding: 12px 16px;
          min-width: 200px;
          background: rgba(15, 23, 42, 0.7);
        }

        @keyframes cardFloat {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-6px);
          }
          100% {
            transform: translateY(0px);
          }
        }

        @keyframes drawCardSelf {
          0% {
            opacity: 0;
            transform: translate(-10px, 20px) scale(0.9);
          }
          60% {
            opacity: 1;
            transform: translate(20px, -30px) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(160px, -80px) scale(0.9);
          }
        }

        @keyframes drawCardOpponent {
          0% {
            opacity: 0;
            transform: translate(10px, -20px) scale(0.9);
          }
          60% {
            opacity: 1;
            transform: translate(-20px, 20px) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-140px, 60px) scale(0.95);
          }
        }

        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

export default GameBoard;
