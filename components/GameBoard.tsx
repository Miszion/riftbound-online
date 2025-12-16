'use client';

import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
} from 'react';
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
  hand: BaseCard[];
  board: PlayerBoardState;
  graveyard: BaseCard[];
  exile: BaseCard[];
  channeledRunes: RuneState[];
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
  card?: BaseCard | null;
};

type SpectatorGameState = {
  matchId: string;
  status: string;
  currentPhase: string;
  turnNumber: number;
  players: PlayerStateData[];
  prompts: GamePrompt[];
  priorityWindow?: PriorityWindow | null;
  battlefields: BattlefieldState[];
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

const INITIATIVE_OPTIONS = [
  {
    value: 0,
    label: "Doran's Blade",
    image: '/images/Dorans%20Blade.jpg',
    description: 'Aggressive opening',
  },
  {
    value: 1,
    label: "Doran's Shield",
    image: '/images/Dorans%20Shield.jpg',
    description: 'Defensive posture',
  },
  {
    value: 2,
    label: "Doran's Ring",
    image: '/images/Dorans%20Ring.jpg',
    description: 'Arcane insight',
  },
];

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

export function GameBoard({ matchId, playerId }: GameBoardProps) {
  const {
    data: basePlayerData,
    loading: playerLoading,
    error: playerError,
  } = usePlayerMatch(matchId, playerId);
  const {
    data: baseSpectatorData,
    loading: spectatorLoading,
    error: spectatorError,
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

  const playerView =
    playerSubData?.playerGameStateChanged ?? basePlayerData?.playerMatch;
  const spectatorState: SpectatorGameState | undefined =
    spectatorSubData?.gameStateChanged ?? baseSpectatorData?.match;
  const currentPlayer = (playerView?.currentPlayer ?? null) as
    | PlayerStateData
    | null;
  const playerCreatures: BaseCard[] = currentPlayer?.board?.creatures ?? [];
  const selectedUnitCard = useMemo(
    () =>
      playerCreatures.find((card) => card.instanceId === selectedUnit) ?? null,
    [playerCreatures, selectedUnit]
  );

  const isLoading =
    (!playerView && playerLoading) || (!spectatorState && spectatorLoading);

  useEffect(() => {
    if (!actionMessage) {
      return;
    }
    const timeout = setTimeout(() => setActionMessage(null), 4000);
    return () => clearTimeout(timeout);
  }, [actionMessage]);

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
  if (isLoading || !playerView || !spectatorState || !currentPlayer) {
    return (
      <div className="game-board">
        <div className="status-bar">
          <span>Loading arena...</span>
        </div>
      </div>
    );
  }
  const canMoveSelectedToBase =
    Boolean(
      selectedUnitCard &&
        selectedUnitCard.location &&
        selectedUnitCard.location.zone === 'battlefield'
    );

  const opponent: OpponentSummary = playerView.opponent;
  const flow: GameStateView | undefined = playerView.gameState;
  const spectatorPlayers = spectatorState.players ?? [];
  const spectatorSelf = spectatorPlayers.find(
    (p) => p.playerId === playerId
  );
  const spectatorOpponent = spectatorPlayers.find(
    (p) => p.playerId !== playerId
  );

  const battlefields = spectatorState.battlefields ?? [];
  const priorityWindow = spectatorState.priorityWindow;
  const rawStatus = spectatorState.status ?? 'in_progress';
  const matchStatus = rawStatus.toUpperCase();
  const isCoinFlipPhase = rawStatus === 'coin_flip';
  const canAct = Boolean(flow?.canAct);
  const canPlayCards =
    canAct &&
    rawStatus === 'in_progress' &&
    !mulliganPrompt &&
    !battlefieldPrompt;

  const legendCard = useMemo(
    () => findCardWithTag(playerCreatures, 'legend'),
    [playerCreatures]
  );
  const leaderExclude = useMemo(
    () => buildExcludeSet(legendCard),
    [legendCard]
  );
  const leaderCard = useMemo(
    () => findCardWithTag(playerCreatures, 'leader', leaderExclude),
    [playerCreatures, leaderExclude]
  );
  const exclusionSet = useMemo(
    () => buildExcludeSet(legendCard, leaderCard),
    [legendCard, leaderCard]
  );

  const opponentCreatures = spectatorOpponent?.board?.creatures ?? [];
  const opponentLegend = useMemo(
    () => findCardWithTag(opponentCreatures, 'legend'),
    [opponentCreatures]
  );
  const opponentLeaderExclude = useMemo(
    () => buildExcludeSet(opponentLegend),
    [opponentLegend]
  );
  const opponentLeader = useMemo(
    () => findCardWithTag(opponentCreatures, 'leader', opponentLeaderExclude),
    [opponentCreatures, opponentLeaderExclude]
  );
  const opponentExclude = useMemo(
    () => buildExcludeSet(opponentLegend, opponentLeader),
    [opponentLegend, opponentLeader]
  );

  const playerRunes = useMemo(
    () => createRuneSlots(currentPlayer.channeledRunes),
    [currentPlayer.channeledRunes]
  );
  const opponentRunes = useMemo(
    () => createRuneSlots(spectatorOpponent?.channeledRunes ?? []),
    [spectatorOpponent?.channeledRunes]
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
      try {
        await submitInitiativeChoice({
          variables: {
            matchId,
            playerId,
            choice: choiceValue,
          },
        });
        setActionMessage('Initiative choice locked in.');
      } catch (error) {
        console.error('Failed to submit initiative choice', error);
        setActionMessage('Unable to lock initiative choice.');
      }
    },
    [matchId, playerId, submitInitiativeChoice]
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
      ? (battlefieldPrompt.data.options as {
          cardId?: string;
          slug?: string | null;
          name?: string;
        }[])
      : []) ?? [];

  const mulliganLimit =
    typeof mulliganPrompt?.data?.maxReplacements === 'number'
      ? mulliganPrompt?.data?.maxReplacements
      : 2;

  const playerGraveyard = spectatorSelf?.graveyard ?? currentPlayer.graveyard ?? [];
  const opponentGraveyard = spectatorOpponent?.graveyard ?? [];
  const showIdlePrompt = !coinFlipPrompt && !battlefieldPrompt && !mulliganPrompt;
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

  return (
    <div className="game-board">
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
      </div>

      <div className="prompt-panel">
        {coinFlipPrompt && (
          <div className="prompt-card">
            <div className="prompt-title">Initiative Duel</div>
            <p>
              Choose a Doran artifact. Doran&apos;s Blade beats Doran&apos;s Shield,
              Doran&apos;s Shield beats Doran&apos;s Ring, and Doran&apos;s Ring beats
              Doran&apos;s Blade. Matching choices force a rematch.
            </p>
            <div className="initiative-grid">
              {initiativeChoices.map((option) => (
                <button
                  key={`initiative-${option.value}`}
                  type="button"
                  className="initiative-button"
                  onClick={() => handleInitiativeChoice(option.value)}
                  disabled={submittingInitiativeChoice}
                >
                  <div
                    className="initiative-art"
                    style={{ backgroundImage: `url(${option.image})` }}
                  />
                  <div className="initiative-info">
                    <span className="initiative-label">{option.label}</span>
                    <span className="initiative-desc">{option.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        {battlefieldPrompt && (
          <div className="prompt-card">
            <div className="prompt-title">Battlefield Selection</div>
            <p>Select one of your battlefields to bring into the arena.</p>
            <div className="prompt-options">
              {battlefieldOptions.length === 0 && (
                <span className="muted-text">Waiting on available options...</span>
              )}
              {battlefieldOptions.map((option) => (
                <button
                  key={option.cardId ?? option.slug ?? option.name ?? 'bf-option'}
                  className="prompt-button"
                  disabled={selectingBattlefield}
                  onClick={() =>
                    handleSelectBattlefield(option.cardId ?? option.slug ?? '')
                  }
                >
                  {option.name ?? option.slug ?? option.cardId ?? 'Battlefield'}
                </button>
              ))}
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
        {showIdlePrompt && (
          <div className="prompt-card muted">
            <div className="prompt-title">
              {isCoinFlipPhase ? 'Awaiting opponent selection' : 'No pending prompts'}
            </div>
            <p>
              {isCoinFlipPhase
                ? 'You have locked your sigil. Waiting for your opponent to decide.'
                : 'The system will notify you when new decisions are required.'}
            </p>
          </div>
        )}
      </div>

      <div className="arena">
        <section className="zone opponent-zone">
          <div className="zone-header">
            <div>
              <h2>Opponent</h2>
              <div className="score-pill">
                Score: {opponent.victoryPoints ?? 0}/
                {opponent.victoryScore ?? currentPlayer.victoryScore}
              </div>
            </div>
            <div>
              <span>Hand: {opponent.handSize ?? 0}</span>
            </div>
          </div>
          <div className="champion-lineup">
            <CardTile card={opponentLegend} label="Legend" />
            <CardTile card={opponentLeader} label="Leader" />
          </div>
          <BoardGrid
            board={spectatorOpponent?.board}
            excludeIds={opponentExclude}
            compact
          />
          <div className="opponent-hand">
            {Array.from({ length: opponent.handSize ?? 0 }).map((_, index) => (
              <div className="hand-back" key={`opp-card-${index}`} />
            ))}
          </div>
          <RuneGrid
            title="Opponent Runes"
            slots={opponentRunes}
            compact
          />
          <GraveyardPile cards={opponentGraveyard} compact />
        </section>

        <section className="battlefield-zone">
          <h2>Battlefields</h2>
          <div className="battlefield-row">
            {battlefields.length === 0 ? (
              <div className="empty-slot wide">
                Waiting for battlefield draft...
              </div>
            ) : (
              battlefields.map((field, index) => (
                <div className="battlefield-card" key={field.battlefieldId}>
                  <CardTile
                    card={field.card ?? { name: field.name }}
                    label={`Field ${index + 1}`}
                  />
                  <div className="battlefield-meta">
                    <span>Owner: {field.ownerId}</span>
                    <span>
                      Controller:{' '}
                      {field.controller ? field.controller : 'Unclaimed'}
                    </span>
                    {field.contestedBy.length > 0 && (
                      <span>Contested by: {field.contestedBy.join(', ')}</span>
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
        </section>

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

        <section className="zone player-zone">
          <div className="zone-header">
            <div>
              <h2>Your Board</h2>
              <div className="score-pill">
                Score: {currentPlayer.victoryPoints}/{currentPlayer.victoryScore}
              </div>
            </div>
            <div className="resource-block">
              <span>
                Mana: {currentPlayer.mana}/{currentPlayer.maxMana}
              </span>
              <span>Energy: {currentPlayer.resources.energy}</span>
              <span>
                Universal: {currentPlayer.resources.universalPower}
              </span>
              <span>Power: {formatPowerPool(currentPlayer.resources.power)}</span>
            </div>
          </div>
          <div className="champion-lineup">
            <CardTile card={legendCard} label="Legend" />
            <CardTile card={leaderCard} label="Leader" />
          </div>
          <BoardGrid
            board={currentPlayer.board}
            excludeIds={exclusionSet}
            onCardSelect={canAct ? handleSelectUnit : undefined}
            selectableFilter={(card) => card.type === 'CREATURE'}
            selectedCardId={selectedUnit}
          />
          <RuneGrid title="Channeled Runes" slots={playerRunes} />
          <GraveyardPile cards={playerGraveyard} />
          <div className="hand-section">
            <div className="section-title">Hand ({currentPlayer.hand.length})</div>
            <div className="hand-cards">
              {currentPlayer.hand.length === 0 ? (
                <div className="empty-slot wide">No cards in hand</div>
              ) : (
                currentPlayer.hand.map((card, index) => (
                  <div
                    key={cardIdValue(card) || `hand-${index}`}
                    className={[
                      'hand-card',
                      mulliganSelection.includes(index) ? 'selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handleHandCardClick(index)}
                  >
                    <CardTile
                      card={card}
                      compact
                      selectable={Boolean(mulliganPrompt)}
                      isSelected={mulliganSelection.includes(index)}
                      disabled={!canPlayCards && !mulliganPrompt}
                    />
                    <div className="hand-actions">
                      <span>Type: {card.type}</span>
                      <span>Cost: {card.cost ?? 0}</span>
                      <button
                        className="prompt-button primary"
                        onClick={(event) => {
                          event.stopPropagation();
                          handlePlayCard(index);
                        }}
                        disabled={!canPlayCards || playingCard}
                      >
                        {playingCard ? 'Playing...' : 'Play Card'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="action-panel">
            <button
              className="primary"
              onClick={handleNextPhase}
              disabled={!canAct || advancingPhase || matchStatus !== 'IN_PROGRESS'}
            >
              {advancingPhase ? 'Advancing...' : 'End Phase'}
            </button>
            <button className="secondary" onClick={handleConcede}>
              Concede
            </button>
            <div className="phase-indicator">
              {canAct
                ? 'It is your turn.'
                : 'Waiting for opponent or system actions.'}
            </div>
          </div>
          {actionMessage && <div className="message-line">{actionMessage}</div>}
        </section>
      </div>

      <style jsx>{`
        .game-board {
          min-height: 100vh;
          background: radial-gradient(circle at top, #1e2761, #0d101d 65%);
          color: #e2e8f0;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .status-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          align-items: center;
          padding: 12px 16px;
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 8px;
          background: rgba(15, 23, 42, 0.8);
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
          transition: background 0.2s, color 0.2s;
        }

        .prompt-button.primary {
          border-color: rgba(34, 197, 94, 0.6);
          background: rgba(34, 197, 94, 0.15);
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

        .initiative-grid {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .initiative-button {
          flex: 1;
          min-width: 180px;
          border: 1px solid rgba(226, 232, 240, 0.4);
          border-radius: 10px;
          background: rgba(15, 23, 42, 0.6);
          color: inherit;
          cursor: pointer;
          padding: 10px;
          display: flex;
          gap: 12px;
          align-items: center;
          transition: border 0.2s, transform 0.2s;
        }

        .initiative-button:hover:not(:disabled) {
          border-color: rgba(34, 197, 94, 0.8);
          transform: translateY(-2px);
        }

        .initiative-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .initiative-art {
          width: 64px;
          height: 64px;
          border-radius: 8px;
          background-size: cover;
          background-position: center;
          border: 1px solid rgba(148, 163, 184, 0.4);
        }

        .initiative-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .initiative-label {
          font-weight: 600;
        }

        .initiative-desc {
          font-size: 12px;
          color: rgba(226, 232, 240, 0.7);
        }

        .arena {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .zone {
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 12px;
          padding: 16px;
          background: rgba(15, 23, 42, 0.85);
        }

        .opponent-zone {
          background: rgba(118, 75, 162, 0.1);
        }

        .player-zone {
          background: rgba(37, 99, 235, 0.08);
        }

        .zone-header {
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 12px;
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

        .champion-lineup {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
          margin-bottom: 16px;
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
          min-height: 90px;
        }

        .card-tile {
          position: relative;
          width: 120px;
          height: 170px;
          border: 2px solid rgba(148, 163, 184, 0.6);
          border-radius: 10px;
          overflow: hidden;
          cursor: default;
          background: rgba(51, 65, 85, 0.5);
          transition: transform 0.25s ease, box-shadow 0.25s ease,
            border-color 0.25s ease;
          transform-origin: center center;
        }

        .card-tile--compact {
          width: 90px;
          height: 130px;
        }

        .card-tile--selectable {
          cursor: pointer;
          box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.6);
        }

        .card-tile--selected {
          box-shadow: 0 0 12px rgba(250, 204, 21, 0.8);
        }

        .card-tile--disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .card-tile--tapped {
          transform: rotate(-90deg);
        }

        .card-image {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.5));
        }

        .card-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px;
          text-align: center;
          font-size: 14px;
          color: rgba(226, 232, 240, 0.7);
        }

        .card-label {
          position: absolute;
          top: 6px;
          left: 6px;
          background: rgba(0, 0, 0, 0.6);
          padding: 2px 6px;
          font-size: 12px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .card-cost {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(15, 118, 110, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
        }

        .card-stats {
          position: absolute;
          bottom: 6px;
          right: 6px;
          background: rgba(0, 0, 0, 0.65);
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 600;
        }

        .battlefield-zone {
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 12px;
          padding: 16px;
          background: rgba(15, 23, 42, 0.85);
        }

        .battlefield-row {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          margin-top: 12px;
        }

        .battlefield-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 10px;
          border-radius: 10px;
          border: 1px dashed rgba(148, 163, 184, 0.4);
          min-width: 160px;
        }

        .battlefield-meta {
          font-size: 12px;
          text-align: center;
          color: rgba(226, 232, 240, 0.8);
        }

        .selection-banner {
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 10px;
          padding: 12px 16px;
          background: rgba(15, 23, 42, 0.75);
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          justify-content: space-between;
          align-items: center;
        }

        .selection-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .rune-section {
          margin-top: 16px;
        }

        .section-title {
          font-weight: 600;
          margin-bottom: 8px;
        }

        .rune-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 8px;
        }

        .rune-grid--compact {
          grid-template-columns: repeat(6, minmax(0, 1fr));
        }

        .rune-cell {
          border: 2px dashed rgba(148, 163, 184, 0.3);
          border-radius: 8px;
          min-height: 90px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          text-align: center;
          font-size: 12px;
          transition: transform 0.25s ease, border-color 0.25s ease;
          transform-origin: center center;
        }

        .rune-cell.filled {
          border-style: solid;
        }

        .rune-cell--tapped {
          transform: rotate(-90deg);
        }

        .rune-name {
          font-weight: 600;
        }

        .rune-values {
          font-size: 11px;
          opacity: 0.7;
        }

        .graveyard-pile {
          margin-top: 16px;
        }

        .graveyard-cards {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .hand-section {
          margin-top: 16px;
        }

        .hand-cards {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .hand-card {
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 8px;
          padding: 8px;
          display: flex;
          gap: 10px;
          align-items: center;
          background: rgba(15, 23, 42, 0.6);
          cursor: pointer;
        }

        .hand-card.selected {
          border-color: rgba(250, 204, 21, 0.8);
          box-shadow: 0 0 12px rgba(250, 204, 21, 0.5);
        }

        .hand-actions {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 150px;
        }

        .opponent-hand {
          display: flex;
          gap: 6px;
          margin-top: 10px;
          flex-wrap: wrap;
        }

        .hand-back {
          width: 48px;
          height: 70px;
          border-radius: 6px;
          border: 1px solid rgba(148, 163, 184, 0.4);
          background: linear-gradient(135deg, #0f172a, #1e293b);
        }

        .action-panel {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          margin-top: 16px;
        }

        .action-panel button {
          padding: 10px 16px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-weight: 600;
        }

        .action-panel .primary {
          background: rgba(34, 197, 94, 0.2);
          border: 1px solid rgba(34, 197, 94, 0.6);
          color: #e2e8f0;
        }

        .action-panel .secondary {
          background: rgba(248, 113, 113, 0.2);
          border: 1px solid rgba(248, 113, 113, 0.6);
          color: #fee2e2;
        }

        .phase-indicator {
          margin-left: auto;
          font-style: italic;
          color: rgba(226, 232, 240, 0.8);
        }

        .message-line {
          margin-top: 8px;
          font-weight: 600;
          color: rgba(248, 250, 252, 0.9);
        }

        .empty-slot {
          border: 1px dashed rgba(148, 163, 184, 0.4);
          border-radius: 8px;
          padding: 12px;
          text-align: center;
          width: 100%;
          color: rgba(226, 232, 240, 0.7);
        }

        .empty-slot.wide {
          min-height: 90px;
        }

        @media (max-width: 960px) {
          .rune-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
          .card-tile {
            width: 100px;
            height: 150px;
          }
        }
      `}</style>
    </div>
  );
}

export default GameBoard;
