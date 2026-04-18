/**
 * Lightweight replay reducer for Riftbound match playback.
 *
 * Context:
 * - The backend (DynamoDB match records) persists a `finalState` snapshot of the
 *   game and an ordered `moveHistory` array. It does NOT persist per-move
 *   snapshots, so we cannot time-travel to the exact state at move K.
 * - To keep the browser bundle small we do NOT import the full Node.js game
 *   engine. Instead this reducer applies small, well-scoped zone transitions
 *   derived from the `action`, `cardId` and `targetId` on each move.
 * - The reducer walks forward from an approximate "initial state" that we
 *   derive by *reverse-applying* the moves to `finalState`. Because reverse
 *   reconstruction is best-effort (we don't know where every card came from),
 *   cards we cannot classify are left where `finalState` last saw them.
 *
 * Correctness notes:
 * - The `phase`, `turn`, and `currentPlayerIndex` carried on each move are
 *   authoritative. We overwrite those on every step.
 * - We render a visible "pulse" flag on the card targeted by the current move
 *   via the `replayHighlight` metadata field so the GameBoard UI can emphasize
 *   it without any other wiring.
 * - For unknown actions we still advance turn/phase so the replay feels live.
 * - TODO(backend): add `perMoveSnapshots` to the match record for true
 *   fidelity. This reducer becomes a fallback once that lands.
 */

// Use a permissive type for the spectator state; the real shape is defined in
// GameBoard.tsx and this reducer must tolerate missing fields on older replays.
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

// CDN base for card art. Kept in sync with GameBoard.tsx CARD_ART_CDN — if
// that constant changes, update here too. Duplicated intentionally (tiny,
// stable, avoids pulling the huge GameBoard module into the reducer bundle).
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
 * to resolve its art even if the DynamoDB-persisted snapshot dropped `assets`.
 *
 * getCardImage prefers `assets.remote` → `assets.localPath` → token fallback
 * → slug fallback (buildCardArtUrl). This helper guarantees the slug fallback
 * works end-to-end by back-filling a CDN `assets.remote` whenever it's
 * missing but we have enough identity (slug / cardId / id) to synthesize one.
 *
 * Runtime hydration (this approach) is preferred over extending the backend
 * serializer because:
 *   1. Old persisted matches in DynamoDB already have missing-asset snapshots
 *      and will NOT be re-serialized — only new writes would benefit from a
 *      backend fix. Runtime hydration heals historical replays too.
 *   2. The CDN URL is deterministic from the slug, so we don't need a catalog
 *      lookup or extra network call.
 *   3. It's defensive: if a future code path strips assets (e.g., a new bot
 *      engine pathway, compression layer), replays still render.
 */
const hydrateCardAssets = (card: CardLike): void => {
  if (!card || typeof card !== 'object') return;
  const existing = (card as any).assets;
  if (existing && (existing.remote || existing.localPath)) {
    // Already has a usable image source. Still backfill slug for consistency.
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
 * Mutates in place — caller should pass a cloned state.
 */
const hydrateStateAssets = (state: ReplaySpectatorState): void => {
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

const boardZones: Array<'creatures' | 'artifacts' | 'enchantments'> = [
  'creatures',
  'artifacts',
  'enchantments',
];

const cardMatches = (cardId: string) => (card: CardLike) =>
  card?.cardId === cardId || card?.instanceId === cardId;

/**
 * Remove the first card matching `cardId` across hand/board/graveyard/exile.
 * Returns the removed card (or null) so the caller can re-insert it elsewhere.
 */
const pluckCardById = (
  player: ReplayPlayer,
  cardId: string
): CardLike | null => {
  const matches = cardMatches(cardId);

  if (Array.isArray(player.hand)) {
    const idx = player.hand.findIndex(matches);
    if (idx >= 0) {
      return player.hand.splice(idx, 1)[0] ?? null;
    }
  }

  if (player.board) {
    for (const zone of boardZones) {
      const list = player.board[zone];
      if (Array.isArray(list)) {
        const idx = list.findIndex(matches);
        if (idx >= 0) {
          return list.splice(idx, 1)[0] ?? null;
        }
      }
    }
  }

  for (const zoneKey of ['graveyard', 'exile'] as const) {
    const list = player[zoneKey];
    if (Array.isArray(list)) {
      const idx = list.findIndex(matches);
      if (idx >= 0) {
        return list.splice(idx, 1)[0] ?? null;
      }
    }
  }

  return null;
};

/**
 * Non-destructive lookup across the actor's zones. Used to detect tokens /
 * pre-synthesized cards already present in finalState so we don't accidentally
 * stub over them or drop the move silently.
 */
const findCardAnywhere = (
  player: ReplayPlayer,
  cardId: string
): CardLike | null => {
  const matches = cardMatches(cardId);
  if (Array.isArray(player.hand)) {
    const found = player.hand.find(matches);
    if (found) return found;
  }
  if (player.board) {
    for (const zone of boardZones) {
      const list = player.board[zone];
      if (Array.isArray(list)) {
        const found = list.find(matches);
        if (found) return found;
      }
    }
  }
  for (const zoneKey of ['graveyard', 'exile'] as const) {
    const list = player[zoneKey];
    if (Array.isArray(list)) {
      const found = list.find(matches);
      if (found) return found;
    }
  }
  const anyPlayer = player as any;
  for (const zoneKey of ['channeledRunes', 'runeDeck'] as const) {
    const list = anyPlayer[zoneKey];
    if (Array.isArray(list)) {
      const found = list.find(matches);
      if (found) return found;
    }
  }
  if (anyPlayer.championLegend && matches(anyPlayer.championLegend)) {
    return anyPlayer.championLegend;
  }
  if (anyPlayer.championLeader && matches(anyPlayer.championLeader)) {
    return anyPlayer.championLeader;
  }
  return null;
};

/**
 * Classify a card by its `type` metadata. Returned `kind` tells the caller how
 * to route the card on a `play_card` action:
 *   - `permanent`: place in the named board zone (creatures/artifacts/enchantments)
 *   - `spell`: resolves straight to the graveyard (no persistent battlefield presence)
 *   - `none`: runes and battlefield cards — handled outside the player's board
 *     (runes live on `player.channeledRunes`; battlefield cards live on the
 *     shared `state.battlefields`). For the replay reducer these are no-ops.
 */
type CardRouting =
  | { kind: 'permanent'; zone: 'creatures' | 'artifacts' | 'enchantments' }
  | { kind: 'spell' }
  | { kind: 'none' };

const routeCardForPlay = (card: CardLike): CardRouting => {
  const type = String(card?.type ?? '').toLowerCase();
  if (type.includes('spell')) return { kind: 'spell' };
  if (type.includes('rune') || type.includes('battlefield')) {
    return { kind: 'none' };
  }
  if (type.includes('artifact') || type.includes('gear')) {
    return { kind: 'permanent', zone: 'artifacts' };
  }
  if (type.includes('enchant') || type.includes('aura')) {
    return { kind: 'permanent', zone: 'enchantments' };
  }
  // Creatures (and any unknown permanent-looking type) default to creatures.
  return { kind: 'permanent', zone: 'creatures' };
};

/**
 * Build a minimal renderable card stub when `play_card` fires for a card that
 * isn't in hand (e.g., a token the engine summoned mid-move). We synthesize
 * enough identity for `hydrateCardAssets` to attach a CDN art URL so the UI
 * renders the token even without a full catalog entry.
 */
const synthesizeCardStub = (cardId: string): CardLike => {
  const stub: CardLike = {
    cardId,
    instanceId: cardId,
    name: cardId,
    type: 'creature', // best guess — tokens are almost always creatures
    token: true,
  };
  hydrateCardAssets(stub);
  return stub;
};

const ensurePlayer = (
  state: ReplaySpectatorState,
  index: number | undefined
): ReplayPlayer | null => {
  if (index === undefined || index === null) return null;
  return state.players?.[index] ?? null;
};

/**
 * Apply ONE move to a (mutable) cloned state. Forward direction.
 *
 * We keep this intentionally small: the main UX goal is "cards leave the hand
 * and appear on the board/graveyard as the replay plays". Granular rules
 * (stat changes, mana costs, rune channels) rely on finalState already being
 * close enough for the UI to look plausible.
 *
 * Action routing (must stay in sync with backend recordMove calls + self-play
 * event taxonomy — QA confirmed the canonical `recordMove` signature is
 * `recordMove(action, cardIdOrIndex?, targetId?)` at game-engine.ts:9375).
 *
 *   - `play_card`: hand → (board zone | graveyard) based on card `type`. Runes
 *     and battlefield cards are no-ops here (they live outside the player board).
 *   - `move_unit` (aka legacy `move`): update `location` on an existing board
 *     card. Older match records (engine `recordMove('move', ...)`) and newer
 *     self-play event records (`move_unit`) both land here.
 *   - `hide_card`: hand → creatures (facedown) attached to a battlefield.
 *   - `activate_hidden`: flip a facedown creature face-up in place.
 *   - `activate_ability`: champion / permanent ability fires; no zone change,
 *     highlight only (turn/phase updated above).
 *   - `advance_phase`: silent phase tick. No cardId expected. We rely on
 *     move.phase / move.turn / move.playerIndex (set at top of function).
 *   - `pass_priority`: priority window closes. No cardId expected. Same
 *     turn/phase update behavior as advance_phase.
 *   - `respond_chain`: opponent/reactor responds to the chain. If a spell
 *     cardId is present, the reactor added a spell to the chain from hand →
 *     treat as spell resolution (hand → graveyard). If cardId is absent,
 *     the reactor passed — no zone change.
 *   - `resolve_prompt_target`: target-selection prompt resolution. No zone
 *     change; turn/phase metadata handles everything.
 *   - Runes are channeled but NOT recorded to moveHistory, so we don't see
 *     them here. If a future move references one, the `none` routing keeps us
 *     from crashing.
 *
 * Important: the `if (!cardId) return` guard used to live at the top of this
 * function, but several of the above actions legitimately carry no cardId
 * (advance_phase, pass_priority, resolve_prompt_target, and respond_chain when
 * the reactor passes). The guard is now scoped to the individual cases that
 * genuinely require one.
 */
const applyMoveForward = (
  state: ReplaySpectatorState,
  move: ReplayMove
): void => {
  if (move.turn) state.turnNumber = move.turn;
  if (move.phase) state.currentPhase = move.phase;
  if (typeof move.playerIndex === 'number') {
    state.currentPlayerIndex = move.playerIndex;
  }

  const actor = ensurePlayer(state, move.playerIndex);
  if (!actor) return;

  const action = move.action;
  const cardId = move.cardId;
  const targetId = move.targetId;

  switch (action) {
    case 'play_card': {
      if (!cardId) return;
      // Move the card from hand to its destination. Route by card type:
      // creatures/artifacts/enchantments land on the board; spells resolve to
      // the graveyard; runes/battlefield cards are no-ops in this reducer.
      let card = pluckCardById(actor, cardId);
      if (!card) {
        // Token / synthesized card path: the engine summoned a card that was
        // never in hand. If finalState already has a copy parked somewhere on
        // the actor (e.g., a token that survived to end of game), trust that
        // snapshot and skip. Otherwise stub one so the UI still renders.
        const existing = findCardAnywhere(actor, cardId);
        if (existing) return;
        card = synthesizeCardStub(cardId);
      }

      const routing = routeCardForPlay(card);
      if (routing.kind === 'none') {
        // Rune / battlefield card: nothing to place on the player board.
        return;
      }
      if (routing.kind === 'spell') {
        // Spells resolve then immediately go to the graveyard — they don't
        // sit on the battlefield.
        (card as any).location = { zone: 'graveyard', battlefieldId: null };
        actor.graveyard = actor.graveyard ?? [];
        actor.graveyard.push(card);
        return;
      }
      // permanent → board zone
      actor.board = actor.board ?? {};
      const list = (actor.board[routing.zone] = actor.board[routing.zone] ?? []);
      if (targetId) {
        (card as any).location = {
          zone: 'battlefield',
          battlefieldId: targetId,
        };
      } else {
        (card as any).location = { zone: 'base', battlefieldId: null };
      }
      list.push(card);
      break;
    }
    // `move_unit` is the canonical self-play / current-engine action name for
    // a unit repositioning on/off a battlefield. Older match records (before
    // the rename) emitted `'move'` via engine.recordMove, so we accept both
    // for backward-compat with historical replays in DynamoDB.
    case 'move_unit':
    case 'move': {
      if (!cardId) return;
      // Battlefield move: update location field on the existing card.
      if (!actor.board) return;
      for (const zone of boardZones) {
        const list = actor.board[zone];
        if (!Array.isArray(list)) continue;
        const found = list.find(cardMatches(cardId));
        if (found) {
          (found as any).location =
            targetId && targetId !== 'base'
              ? { zone: 'battlefield', battlefieldId: targetId }
              : { zone: 'base', battlefieldId: null };
          break;
        }
      }
      break;
    }
    case 'hide_card': {
      if (!cardId) return;
      // Hidden cards go from hand to the targeted battlefield facedown.
      const card = pluckCardById(actor, cardId);
      if (!card) return;
      (card as any).hidden = true;
      (card as any).location = {
        zone: 'battlefield',
        battlefieldId: targetId ?? null,
      };
      actor.board = actor.board ?? {};
      const list = (actor.board.creatures = actor.board.creatures ?? []);
      list.push(card);
      break;
    }
    case 'activate_hidden': {
      if (!cardId) return;
      // Reveal a previously hidden card.
      if (!actor.board) return;
      for (const zone of boardZones) {
        const list = actor.board[zone];
        if (!Array.isArray(list)) continue;
        const found = list.find(cardMatches(cardId));
        if (found) {
          (found as any).hidden = false;
          break;
        }
      }
      break;
    }
    case 'activate_ability': {
      // Champion / permanent ability activation. The backend emits this for
      // champion legend/leader powers (game-engine.ts:3641). No zone change is
      // needed — we rely on the top-of-function turn/phase/currentPlayerIndex
      // updates plus the replayHighlight metadata attached by stateAtMove()
      // to pulse the affected card in the UI.
      break;
    }
    case 'advance_phase': {
      // Silent phase tick. The backend carries authoritative phase/turn/
      // currentPlayerIndex on the move itself; those were applied above.
      // No zone changes, no card highlight (this is not a card event).
      // cardId is expected to be absent for this action.
      break;
    }
    case 'pass_priority': {
      // Priority window closed by the current holder. Like advance_phase,
      // turn/phase metadata drives the UI; no zone change. cardId is
      // typically absent.
      break;
    }
    case 'resolve_prompt_target': {
      // A target-selection prompt was resolved. The actual game effect
      // (damage, destroy, etc.) is reflected in finalState; at the replay
      // level there is nothing deterministic to mutate here beyond the
      // turn/phase metadata already applied above.
      break;
    }
    case 'respond_chain': {
      // Reactor responded to the chain. Two sub-cases:
      //   1. cardId present → reactor added a spell/ability from hand onto
      //      the chain. Treat it like a spell resolution: hand → graveyard.
      //      Mirrors the `play_card` spell path so reverseMove can undo it.
      //   2. cardId absent → reactor passed. No zone change.
      if (!cardId) return;
      let card = pluckCardById(actor, cardId);
      if (!card) {
        // If the card is nowhere to be found (already on the chain or
        // pre-resolved in finalState), synthesize a stub so the graveyard
        // doesn't lose the card visually.
        const existing = findCardAnywhere(actor, cardId);
        if (existing) return;
        card = synthesizeCardStub(cardId);
      }
      (card as any).location = { zone: 'graveyard', battlefieldId: null };
      actor.graveyard = actor.graveyard ?? [];
      actor.graveyard.push(card);
      break;
    }
    default:
      // Unknown action: only phase/turn/currentPlayerIndex were updated above.
      break;
  }
};

/**
 * Reverse one move. Used when we do not have the true initial state and must
 * "rewind" from the final state down to move zero.
 *
 * This is necessarily lossy. We only undo actions we know how to undo; others
 * are ignored. The bigger the gap between moves undone and perfect reversal,
 * the more "static" the early-replay view will look (cards sitting in
 * roughly their final positions).
 *
 * Note: since forward `play_card` now routes spells to graveyard, the reverse
 * still works — `pluckCardById` searches graveyard/exile in addition to board
 * and hand, so the card is found and pushed back to hand regardless of
 * whether it was a permanent (board) or spell (graveyard).
 *
 * Actions that are no-ops on rewind:
 *   - `move` / `move_unit`: we don't track the previous location precisely;
 *     the forward walk will overwrite location anyway.
 *   - `activate_hidden`, `activate_ability`: no zone change to undo.
 *   - `advance_phase`, `pass_priority`, `resolve_prompt_target`: phase/turn
 *     is re-derived by the forward walk, so nothing to rewind here.
 *
 * `respond_chain` mirrors `play_card` (spell path): if the forward case
 * pushed the card to graveyard, rewind pulls it back into hand. If cardId
 * was absent (reactor passed), there's nothing to undo.
 */
const reverseMove = (state: ReplaySpectatorState, move: ReplayMove): void => {
  const actor = ensurePlayer(state, move.playerIndex);
  if (!actor) return;
  const cardId = move.cardId;

  switch (move.action) {
    case 'play_card':
    case 'hide_card':
    case 'respond_chain': {
      if (!cardId) return;
      // Undo: find the card wherever it ended up (board / graveyard / exile)
      // and push it back into hand.
      const card = pluckCardById(actor, cardId);
      if (!card) return;
      (card as any).location = null;
      (card as any).hidden = false;
      actor.hand = actor.hand ?? [];
      actor.hand.push(card);
      break;
    }
    // `move`, `move_unit`, `activate_hidden`, `activate_ability`,
    // `advance_phase`, `pass_priority`, `resolve_prompt_target` do not change
    // zones in a way we track; leaving them is harmless for UI purposes and
    // the forward walk re-derives phase/turn state.
    default:
      break;
  }
};

/**
 * Derive an approximate starting state by reverse-applying every move on top
 * of finalState. The result is what the board "probably" looked like before
 * move 0.
 */
export const deriveInitialState = (
  finalState: ReplaySpectatorState,
  moves: ReplayMove[]
): ReplaySpectatorState => {
  const base = clone(finalState);
  // Clear transient UI affordances that don't make sense at move 0.
  base.currentPhase = 'setup';
  base.turnNumber = 0;
  base.winner = null;
  base.endReason = null;
  base.focusPlayerId = null;
  base.status = 'in_progress';

  for (let i = moves.length - 1; i >= 0; i -= 1) {
    reverseMove(base, moves[i]!);
  }

  // Back-fill card art on the approximate initial state so the reducer's
  // forward walk starts from a fully-renderable snapshot. Subsequent clones
  // via stateAtMove() carry these fields forward.
  hydrateStateAssets(base);

  return base;
};

/**
 * Build the state visible at move index `index` (0 = before any moves).
 * Returns a fresh deep clone so React state comparisons stay correct.
 */
export const stateAtMove = (
  initialState: ReplaySpectatorState,
  moves: ReplayMove[],
  index: number
): ReplaySpectatorState => {
  const state = clone(initialState);
  const clamped = Math.max(0, Math.min(index, moves.length));
  for (let i = 0; i < clamped; i += 1) {
    applyMoveForward(state, moves[i]!);
  }

  // Re-hydrate after forward play in case the incoming `initialState` came
  // from an external path (e.g., `replay.initialState` provided by the caller
  // bypassing deriveInitialState) and had bare cards.
  hydrateStateAssets(state);

  // Attach the last-applied move as highlight metadata so the GameBoard can
  // (optionally) render a pulse on the affected card without new props.
  const lastMove = clamped > 0 ? moves[clamped - 1] : null;
  (state as any).replayHighlight = lastMove
    ? {
        cardId: lastMove.cardId ?? null,
        action: lastMove.action ?? null,
        targetId: lastMove.targetId ?? null,
      }
    : null;

  (state as any).moveHistory = moves.slice(0, clamped);
  return state;
};

/**
 * Build a minimal PlayerMatchView for a given perspective player so the real
 * GameBoard renders hand/board/graveyard just like in live play.
 *
 * If the replay includes both players' hands (spectator finalState does),
 * we pick the one whose playerId matches `perspectivePlayerId`. Otherwise we
 * fall back to the first player in the list.
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
      canAct: false, // replay viewers never have priority
      focusPlayerId: spectator.focusPlayerId ?? null,
      combatContext: (spectator as any).combatContext ?? null,
    },
  };
};
