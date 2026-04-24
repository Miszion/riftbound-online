# QA Test Plan — Replay Viewer Fix

Scope: verify the two Frontend Engineer fixes without regressing the live game board.

**Fix 1 (CSS):** `.game-screen__board` was undefined in `styles/game-board.css`, causing a squished viewport on `/replay/[matchId]`. The same wrapper is also used by `/game/[matchId]`, so any new rule impacts both.

**Fix 2 (State):** replay state reconstruction in `lib/replay/reducer.ts` was dropping the `assets` field on cards. Without `assets.remote` / `assets.localPath`, `GameBoard.getCardImage()` (GameBoard.tsx:932) can't resolve art and cards render blank.

Keep this checklist tight and runnable. Tick boxes as you go.

---

## 0. Setup

- [ ] Backend running: `cd /Users/miszion/workplace/riftbound-online-backend && npm run dev` (defaults to port 3000 per README).
- [ ] Frontend running: `cd /Users/miszion/workplace/riftbound-online && npm run dev` (Next dev, port 3000 — may need to run backend on a different port or set `NEXT_PUBLIC_API_BASE_URL` / `NEXT_PUBLIC_WS_BASE_URL` in `.env.local`).
- [ ] Signed in (replay page is wrapped in `RequireAuth`, see `app/replay/[matchId]/page.tsx:26`).
- [ ] Get a `matchId` one of three ways:
  1. Easiest: go to `/spectate`, click "Watch Bots Play", let it finish, then click one of the recent matches — this routes to `/replay/<matchId>` (see `app/spectate/page.tsx:93`).
  2. Self-play CLI: `cd riftbound-online-backend && npm run self-play` generates `selfplay-<gameIndex>-<seed>` matchIds that `replay-reconstructor.ts` can rehydrate on demand.
  3. Any recorded match from the recent matches list on `/spectate`.
- [ ] Keep DevTools open on Console + Network + Elements tabs.
- [ ] Have a known-good reference open: `/game/<matchId>` (live) or a recent screenshot of the live board for visual comparison.

---

## 1. Visual regression — replay viewport "not squished"

Definition of "not squished" (must all be true):
- Replay page layout matches `/game/<matchId>` at the same viewport width (same `.arena-layout` column widths, same board width, same card sizes). Compare side-by-side.
- `.game-screen.container` still applies (`width: min(95vw, 1800px)` — see `styles/game-board.css:13`).
- `.arena-layout__column--dock` still pins at `min(260px, 25vw)` on the left, and `.arena-layout__main` fills remaining width with no clipped content.
- No horizontal scrollbar at any breakpoint (unless also present on `/game/<matchId>` at the same width).
- Cards in hand and on battlefield render at the same pixel dimensions as live mode — eyeball against a live match; a card in hand should be tall enough that name + art + stats are all legible.

Breakpoints to check (resize Chrome or use DevTools device toolbar):

- [ ] **Desktop wide — 1920x1080.** `.game-screen.container` caps at 1800px, centered with auto margins. Dock column 260px, main column fills. No dead space on sides beyond the intended gutter.
- [ ] **Desktop narrow — 1366x768.** Container becomes ~1298px (95vw). Still two columns, no overlap between dock and main.
- [ ] **Tablet landscape — 1024x768.** Dock column 25vw ≈ 256px. Verify hand/board doesn't overflow.
- [ ] **Tablet portrait — 768x1024.** Dock shrinks; check that main content area is usable. If the live game already has a known limitation here, replay should match — not differ.
- [ ] **Mobile landscape — 812x375.** Accept whatever live game does; replay must not be worse.
- [ ] **Mobile portrait — 375x812.** Same rule: parity with live.
- [ ] **Inspect `.game-screen__board` in DevTools** on each breakpoint. It should have a computed rule (not "no matching selectors"). Confirm it is a block/flex container with 100% width so the inner `GameBoard` takes full width. If `.game-screen__board` has no rule or `display: inline`, fix #1 regressed.
- [ ] **No overflow surprises.** `body` shouldn't scroll horizontally on any breakpoint (unless live has the same). Vertical scroll inside the board is expected for long hands/logs.
- [ ] **Aspect ratio check.** Screenshot `/replay/<matchId>` and `/game/<matchId>` at 1440x900. Overlay them (or toggle between tabs). Board aspect + card sizes should be identical.

---

## 2. Card rendering checks

Card types to verify (from `riftbound-online-backend/src/game-engine.ts:51` enum):
- `creature` (units) — live on battlefields and in hand.
- `spell` — in hand, on stack during a reaction, in graveyard after resolution.
- `artifact` (gear) — on board in the artifacts zone.
- `enchantment` — on board in the enchantments zone.
- `rune` — channeled runes dock, rune deck counter.
- Champion legend + champion leader — top-of-board portraits.
- Token cards (summoned) — these resolve via `TOKEN_CARD_ART` in `GameBoard.tsx:950`.

For each zone × card type:

- [ ] **Hand — perspective player.** Every card shows art, not a blank frame. Open DevTools and confirm the `<img>` `src` resolves (200, not 404). If a card shows blank, inspect its React props: `card.assets` should be present (`{ remote: "…" }` or `{ localPath: "…" }`). If `assets` is `null`/undefined on a card that clearly has art live, fix #2 regressed.
- [ ] **Hand — opponent.** Usually rendered as card-backs in replay perspective; confirm they show a consistent back, not a broken image icon.
- [ ] **Battlefield — creatures.** Tapped and untapped creatures both render art and stats.
- [ ] **Battlefield — artifacts.** Render in the artifacts slot with art.
- [ ] **Battlefield — enchantments.** Render in enchantments slot with art.
- [ ] **Graveyard / discard.** Scrub to the end of a match where cards have died; click into the graveyard, confirm art + name.
- [ ] **Exile zone.** Same check if any card was exiled during the recorded match.
- [ ] **Deck / rune deck counters.** Numeric counts are correct (not zero when cards exist).
- [ ] **Channeled runes dock.** Rune tiles render with art + domain color.
- [ ] **Champion legend / leader portraits.** Top-of-board champion art shows for both players.
- [ ] **Token/summoned card.** If the recorded match summoned any tokens, confirm the token art loads. Falls back to `TOKEN_CARD_ART` — verify no broken image.
- [ ] **Hidden / facedown cards.** Replay reconstructs `hide_card` / `activate_hidden` actions (reducer.ts:213, 227). Facedown cards should show card-back; revealing should swap to art without a flash of broken image.
- [ ] **Missing / broken asset fallback.** Temporarily block one card art request in the Network tab (right-click → Block request URL) and reload. UI must not crash; graceful fallback or placeholder acceptable — no white screen, no React error boundary.
- [ ] **Art variants.** If any card in the match has a showcase/alt-art variant (check `rarity` for `showcase` or `promo` in catalog), verify the correct variant resolves, not a default.
- [ ] **DevTools sanity: `card.assets` propagation.** Pick a card on the battlefield, React DevTools → find the component → confirm the `card` prop still carries `assets: { remote?, localPath? }` after a scrub (see step 3). If `assets` is dropped on re-render, fix #2 regressed.

---

## 3. Replay-specific behaviors

- [ ] **Scrub forward one move at a time.** Use `ReplayControls`. Cards move between zones without flicker; art persists.
- [ ] **Scrub backward.** Rewind from end to start. Cards reappear in hand as expected (reducer.ts:258 `reverseMove`). Art still renders after every reverse step.
- [ ] **Jump to move 0 then to end.** Large index jumps should not lose card `assets`. Inspect a card before and after — `assets` field must survive.
- [ ] **Auto-play.** Press play; watch full match. Frame rate is smooth, no runaway re-renders, no art flashing.
- [ ] **Change playback speed.** 0.25x, 1x, 2x, 4x. No cards go blank at high speed.
- [ ] **Perspective switch.** Toggle perspective between player A and player B. Hand shows the correct player's cards; opponent's hand shows backs; art loads for both perspectives.
- [ ] **Fresh page navigation.** Open `/replay/<matchId>` in a new tab directly (not via `/spectate` router push). Viewport + cards render identically.
- [ ] **In-game-UI navigation.** From `/spectate`, click a recent match → verify it lands on the replay page with full gameboard UI (same layout as live match), NOT a stripped-down page.
- [ ] **Very short match.** Replay a bot match that ended on turn 1–2. Scrubbing works with tiny move count; no off-by-one on the slider end.
- [ ] **Long match.** Replay a match with 40+ moves (self-play typically produces these). Scrubbing remains responsive; no memory leak visible in DevTools Memory tab after full scrub.
- [ ] **Replay with `initialState` absent.** The reducer falls back to `deriveInitialState` (reducer.ts:288). Confirm the initial scrubbing position shows a plausible pre-game board (not finalState-looking).
- [ ] **Replay with missing `moves`.** `replayRecord.moves ?? []` handles null (`page.tsx:104`). Confirm "No replay selected" / "Replay not available" messaging renders when backend returns empty/missing data.
- [ ] **Invalid matchId.** Navigate to `/replay/does-not-exist`. Error banner displays cleanly ("Unable to load replay." or "Replay not available."), not a crash.
- [ ] **Highlight pulse.** Reducer attaches `replayHighlight` metadata (reducer.ts:326). Confirm the affected card visually pulses on the current move.

---

## 4. Regression checks — live game must still work

Both fixes touch shared surfaces:
- `styles/game-board.css` is imported once by `app/layout.tsx:6` and applies everywhere.
- `.game-screen__board` wraps both `/game` and `/replay`.
- `RiftboundCard` / `GameBoard` card rendering is shared.

- [ ] **Live game loads.** Start a bot or live match via `/matchmaking` or `/spectate` → `/game/<matchId>`. Board renders, no CSS shifts compared to pre-fix.
- [ ] **Live card art.** Same card-art spot-check as section 2, but on the live board.
- [ ] **Live tapping / exhaustion visuals.** Rotated tapped cards still rotate correctly (CSS change must not break rotation transforms).
- [ ] **Dorans + battlefield selection screens.** These live in `styles/game-board.css` per README:105; confirm they still look right.
- [ ] **Mulligan modal.** Opens, cards render with art, accept/reject works.
- [ ] **Live spectate.** `/spectate` with a running bot match, load via "Watch Live". Cards render with art for spectators too.
- [ ] **Deckbuilder.** `/deckbuilder` card grid still renders art (shares `RiftboundCard`).
- [ ] **No new CSS console warnings.** Check browser console for "unknown selector" / CSS parse errors after the fix.
- [ ] **No new React errors.** Console should be clean on `/game`, `/replay`, `/spectate`, `/deckbuilder`.

---

## 5. Troubleshooting pointers (for whoever runs this)

If something looks wrong, check these files in this order:

| Symptom | File to check |
|---|---|
| Viewport squished / no width on replay | `/Users/miszion/workplace/riftbound-online/styles/game-board.css` — look for `.game-screen__board` rule. Should exist and set `width: 100%` (or similar) + a display that doesn't collapse height. |
| Cards blank in replay but fine live | `/Users/miszion/workplace/riftbound-online/lib/replay/reducer.ts` — `pluckCardById`, `applyMoveForward`, `reverseMove`, `deriveInitialState`, `stateAtMove` must preserve the `assets` field when cloning / moving cards between zones. Also check `buildPlayerMatchView` (reducer.ts:346) — `self.hand` / `self.board` card objects need `assets` intact. |
| Card image resolution logic | `/Users/miszion/workplace/riftbound-online/components/GameBoard.tsx:932` (`getCardImage`). Consumes `card.assets.remote` → `card.assets.localPath` → slug → token art fallback. |
| Replay page wiring | `/Users/miszion/workplace/riftbound-online/app/replay/[matchId]/page.tsx`. Compare structure to `/Users/miszion/workplace/riftbound-online/app/game/page.tsx` — both should use `<main className="game-screen container"><div className="game-screen__board">…</div></main>`. |
| GraphQL payload shape | `/Users/miszion/workplace/riftbound-online/lib/graphql/queries.ts` `GET_MATCH_REPLAY` — confirm `assets { remote localPath }` is part of the selection set for every card field in `finalState`. |
| Backend replay data source | `/Users/miszion/workplace/riftbound-online-backend/src/replay-reconstructor.ts` + `/Users/miszion/workplace/riftbound-online-backend/src/game-state-serializer.ts`. If `assets` is missing at the API response level, the problem is upstream of the reducer fix. |
| Card catalog / types enum | `/Users/miszion/workplace/riftbound-online-backend/src/game-engine.ts:51` (`CardType`) + `/Users/miszion/workplace/riftbound-online-backend/data/cards.enriched.json`. |

Quick Network-tab confirmation: in DevTools, find the `matchReplay` GraphQL response. Expand `data.matchReplay.finalState.players[].hand[0]`. If `assets: { remote: "https://..." }` is present in the payload but missing after reducer runs, fix #2 regressed. If `assets` is null in the payload itself, the issue is backend-side, not reducer-side.

---

## 6. Sign-off

- [ ] All of section 1 passes on at least 3 breakpoints (wide, narrow, tablet).
- [ ] All of section 2 passes for every card type present in the sample replay.
- [ ] All of section 3 passes.
- [ ] All of section 4 passes (live game not regressed).
- [ ] Screenshots captured: replay board at 1440x900, live board at 1440x900 (for the record).
- [ ] Filed any new bugs found with a link to this checklist item.
