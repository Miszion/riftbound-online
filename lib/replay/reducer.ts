/**
 * Replay frame helpers.
 *
 * The pre-persistent-frame-store version of this module shipped a
 * client-side mini-engine that reverse-applied and forward-applied moves on
 * top of `finalState`. That is gone. With the backend persisting per-move
 * `SerializedFrame`s to DynamoDB (see `replay-frame-store.ts` in the backend
 * and the `matchFrames` GraphQL query), the replay page feeds authoritative
 * engine frames straight into GameBoard's `setSpectatorOverride` - the same
 * setter used by the live `gameStateChanged` subscription. No client reducer
 * path remains.
 *
 * What lives here now is minimal:
 *   - Public type aliases (`ReplaySpectatorState`, `ReplayPlayer`, `ReplayMove`)
 *     that other code imports to describe the shape of a replay frame.
 *   - `hydrateStateAssets`: CDN-URL back-fill for cards missing `assets`.
 *     Still necessary because persisted snapshots from older code paths can
 *     be missing `assets.remote`, and without it GameBoard's `getCardImage`
 *     cannot resolve art.
 *   - `frameAt`: pure index lookup that returns a clone of the selected
 *     frame (so React state comparisons stay correct) with assets hydrated.
 *   - `buildPlayerMatchView`: projects a spectator-shape frame onto a
 *     player-scoped view so the board can render a perspective without
 *     touching the engine.
 */

// Use a permissive type for the spectator state; the real shape is defined in
// GameBoard.tsx and this module must tolerate missing fields on older replays.
export type ReplaySpectatorState = {
  matchId: string;
  status: string;
  currentPhase: string;
  turnNumber: number;
  currentPlayerIndex?: number | null;
  players: ReplayPlayer[];
  battlefields?: any[];
  duelLog?: any[];
  chatLog?: any[];
  moveHistory?: ReplayMove[];
  winner?: string | null;
  endReason?: string | null;
  focusPlayerId?: string | null;
  [key: string]: any;
};

export type ReplayPlayer = {
  playerId: string;
  name?: string;
  hand?: any[];
  board?: {
    creatures?: any[];
    artifacts?: any[];
    enchantments?: any[];
  };
  graveyard?: any[];
  exile?: any[];
  victoryPoints?: number;
  [key: string]: any;
};

export type ReplayMove = {
  playerIndex?: number;
  turn?: number;
  phase?: string;
  action?: string;
  cardId?: string;
  targetId?: string;
  timestamp?: number;
};

type CardLike = { cardId?: string; instanceId?: string; [key: string]: any };

const clone = <T>(value: T): T => {
  // structuredClone handles Map/Set/Date; JSON fallback handles older runtimes.
  // Both can throw on pathological input (circular refs, BigInt, functions).
  // A clone failure must not tear down the whole replay page, so fall through
  // to a shallow copy as a last resort.
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  } catch {
    if (Array.isArray(value)) return [...(value as any)] as T;
    if (value && typeof value === 'object') return { ...(value as any) } as T;
    return value;
  }
};

// CDN base for card art. Kept in sync with GameBoard.tsx CARD_ART_CDN - if
// that constant changes, update here too. Duplicated intentionally (tiny,
// stable, avoids pulling the huge GameBoard module into this bundle).
const CARD_ART_CDN = 'https://static.dotgg.gg/riftbound/cards';

const normalizeSlugValue = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = String(value).replace(/\.(png|jpe?g|webp)$/i, '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

const deriveCardSlug = (card: CardLike): string | null => {
  return (
    normalizeSlugValue(card?.slug) ??
    normalizeSlugValue(card?.cardId) ??
    normalizeSlugValue(card?.id) ??
    null
  );
};

/**
 * Ensure a card-shaped object has enough metadata for GameBoard.getCardImage()
 * to resolve its art even if the persisted snapshot dropped `assets`.
 */
const hydrateCardAssets = (card: CardLike): void => {
  if (!card || typeof card !== 'object') return;
  const existing = (card as any).assets;
  if (existing && (existing.remote || existing.localPath)) {
    if (!card.slug) {
      const slug = deriveCardSlug(card);
      if (slug) (card as any).slug = slug;
    }
    return;
  }
  const slug = deriveCardSlug(card);
  if (!slug) return;
  if (!card.slug) (card as any).slug = slug;
  // URL-encode the slug before interpolation: defends against corrupted
  // catalog rows where `slug` could contain `?`, `#`, `/`, or whitespace that
  // would break the resulting URL or smuggle query-string params.
  (card as any).assets = {
    remote: `${CARD_ART_CDN}/${encodeURIComponent(slug)}.webp`,
    localPath: null,
  };
};

const hydrateCardList = (cards: unknown): void => {
  if (!Array.isArray(cards)) return;
  for (const card of cards) {
    if (card && typeof card === 'object') {
      hydrateCardAssets(card as CardLike);
    }
  }
};

/**
 * Walk the spectator state and back-fill card art on every known zone.
 * Mutates in place - caller should pass a cloned state.
 */
export const hydrateStateAssets = (state: ReplaySpectatorState): void => {
  const players = Array.isArray(state.players) ? state.players : [];
  for (const player of players) {
    if (!player) continue;
    hydrateCardList(player.hand);
    hydrateCardList(player.graveyard);
    hydrateCardList(player.exile);
    if (player.board) {
      hydrateCardList(player.board.creatures);
      hydrateCardList(player.board.artifacts);
      hydrateCardList(player.board.enchantments);
    }
    const anyPlayer = player as any;
    hydrateCardList(anyPlayer.channeledRunes);
    hydrateCardList(anyPlayer.runeDeck);
    if (anyPlayer.championLegend) hydrateCardAssets(anyPlayer.championLegend);
    if (anyPlayer.championLeader) hydrateCardAssets(anyPlayer.championLeader);
  }
  const battlefields = Array.isArray(state.battlefields) ? state.battlefields : [];
  for (const bf of battlefields) {
    if (!bf) continue;
    const anyBf = bf as any;
    if (anyBf.card) hydrateCardAssets(anyBf.card);
    if (Array.isArray(anyBf.hiddenCards)) {
      for (const hidden of anyBf.hiddenCards) {
        if (hidden?.card) hydrateCardAssets(hidden.card);
      }
    }
  }
};

/**
 * Pick a frame by index from an ordered list of persisted frames.
 *
 * Returns a freshly cloned + art-hydrated copy so that React setState sees a
 * new reference even when `index` re-selects the same frame, and mutations by
 * the caller cannot reach back into the original frames array.
 *
 * `index` is clamped to `[0, frames.length - 1]`. Returns null when frames is
 * empty so the caller can decide what to render for "no frames yet".
 */
export const frameAt = (
  frames: ReplaySpectatorState[],
  index: number
): ReplaySpectatorState | null => {
  if (!Array.isArray(frames) || frames.length === 0) return null;
  const clamped = Math.max(0, Math.min(index, frames.length - 1));
  const picked = frames[clamped];
  if (!picked) return null;
  const cloned = clone(picked);
  hydrateStateAssets(cloned);
  return cloned;
};

/**
 * Build a minimal PlayerMatchView for a given perspective player so the real
 * GameBoard renders hand/board/graveyard just like in live play.
 *
 * The spectator frame contains both players' full card lists (backend serializes
 * the complete state). This helper picks the perspective player, falls back to
 * the first player otherwise, and synthesizes an opponent summary from the
 * counterpart.
 */
export const buildPlayerMatchView = (
  spectator: ReplaySpectatorState,
  perspectivePlayerId: string | null
) => {
  const players = Array.isArray(spectator.players) ? spectator.players : [];
  if (players.length === 0) {
    return null;
  }
  const self =
    players.find((p) => p.playerId === perspectivePlayerId) ?? players[0];
  const other = players.find((p) => p.playerId !== self.playerId) ?? null;

  return {
    matchId: spectator.matchId,
    currentPlayer: self,
    opponent: other
      ? {
          playerId: other.playerId,
          victoryPoints: other.victoryPoints ?? 0,
          victoryScore: (other as any).victoryScore ?? null,
          handSize: Array.isArray(other.hand)
            ? other.hand.length
            : (other as any).handSize ?? 0,
          deckCount: (other as any).deckCount ?? 0,
          runeDeckSize: (other as any).runeDeckSize ?? 0,
          board: other.board ?? {
            creatures: [],
            artifacts: [],
            enchantments: [],
          },
          championLegend: (other as any).championLegend ?? null,
          championLeader: (other as any).championLeader ?? null,
          championLegendState: (other as any).championLegendState ?? null,
          championLeaderState: (other as any).championLeaderState ?? null,
        }
      : null,
    gameState: {
      matchId: spectator.matchId,
      currentPhase: spectator.currentPhase,
      turnNumber: spectator.turnNumber,
      currentPlayerIndex: spectator.currentPlayerIndex ?? 0,
      canAct: false, // replay / spectator viewers never have priority
      focusPlayerId: spectator.focusPlayerId ?? null,
      combatContext: (spectator as any).combatContext ?? null,
    },
  };
};
