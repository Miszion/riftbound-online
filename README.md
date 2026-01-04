# Riftbound Online UI

A Next.js 14 front-end for the Riftbound Online experience. It delivers the landing page, sign-in workflow, deckbuilder, matchmaking queue, in-game board, and spectator/replay views, all powered by the backend GraphQL API.

## Feature Highlights

- **Modern App Router** – `/app` directory with shared providers (`app/providers.tsx`) wiring Apollo Client, Auth context, and global UI state.
- **Landing & Auth** – `/` recreates the hero/feature layout with responsive hero art; `/sign-in` offers full sign-in/sign-up flows that talk to Cognito via the backend `/auth/*` endpoints.
- **Deckbuilder** – `/deckbuilder` streams the card catalog, enforces deck constraints (min 40 cards, max 3 copies) and persists user decklists through GraphQL mutations.
- **Matchmaking** – `/matchmaking` lets authenticated users enter free/ranked queues, displays live status/polling, and reacts to queue updates via subscriptions.
- **Game Board** – `/game` renders the turn structure, rune channeling, cards in hand/board, Dorans & battlefield selection prompts, phase transitions, and “End Phase” controls with the new tapping/exhaustion visuals.
- **Spectate & Replay** – `/spectate` connects to `gameStateChanged` subscriptions for live matches and can replay recent games by scrubbing move logs.
- **Shared Components** – `components/` includes `GameBoard`, `GameViewer`, `RiftboundCard`, reusable auth widgets, toast system, headers/footers, etc.
- **Responsive Styling** – `css/styles.css` contains the landing/sign-in look & feel, while `styles/` and component-level styles cover the richer in-game layouts.

## Project Structure

```
app/
  layout.tsx          # Root HTML + font/css imports
  page.tsx            # Landing page (home)
  sign-in/page.tsx    # Auth portal (sign-in & sign-up toggle)
  deckbuilder/        # Deckbuilder router segment
  matchmaking/        # Matchmaking UI flow
  game/               # In-game board + prompts
  spectate/           # Live/replay viewer
  providers.tsx       # ApolloProvider, AuthProvider, ToastProvider, etc.

components/
  Header.tsx, Footer.tsx
  GameBoard.tsx, GameViewer.tsx
  RiftboundCard.tsx and UI primitives (buttons, toasts, etc.)
  auth/               # Auth-specific widgets
  ui/                 # Shared UI atoms

hooks/
  useAuth.ts          # Cognito-backed auth helpers
  useGraphQL.ts       # Query/mutation/subscription wrappers
  useToasts.ts        # Global toast queue

lib/
  apiConfig.ts        # Builds API/WS URLs from env vars
  apolloClient.ts     # Apollo client w/ auth + network activity tracking
  graphql/            # Queries, mutations, subscriptions
  networkActivity.ts  # Broadcast channel for in-flight operations

css/styles.css        # Landing + sign-in look and feel
styles/               # Gameboard + app-wide styles
public/images/        # Hero art (Viktor, Falling Star, Mind Rune, etc.)
scripts/deploy-ui.sh  # S3/CloudFront deployment helper
```

## Environment Variables

All variables are prefixed with `NEXT_PUBLIC_` so they can be used by the client:

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Full HTTP URL for REST/GraphQL requests (`https://alb.example.com`) | `http://localhost:3000` derived from host/port |
| `NEXT_PUBLIC_API_HOST` / `NEXT_PUBLIC_API_PORT` | Override host/port if you prefer splitting rather than full URL | `localhost` / `3000` |
| `NEXT_PUBLIC_WS_BASE_URL` | Full WebSocket URL when not sharing host/port | `ws://{host}:{port}/graphql` |
| `NEXT_PUBLIC_WS_HOST` / `NEXT_PUBLIC_WS_PORT` | Host/port for GraphQL WebSockets | mirrors API host/port |

Set these in `.env.local` (used automatically by Next.js):

```bash
NEXT_PUBLIC_API_BASE_URL=https://my-backend.example.com
NEXT_PUBLIC_WS_BASE_URL=wss://my-backend.example.com/graphql
# or granular overrides
NEXT_PUBLIC_API_HOST=localhost
NEXT_PUBLIC_API_PORT=4000
NEXT_PUBLIC_WS_HOST=localhost
NEXT_PUBLIC_WS_PORT=4000
```

## Scripts

```bash
npm install        # Install dependencies
npm run dev        # Launch Next dev server (http://localhost:3000)
npm run build      # Production build
npm run start      # Serve the production build
npm run lint       # Run Next lint rules
npm run build:static  # Alias to `next build` (for static hosting)
npm run deploy:dev    # scripts/deploy-ui.sh → build + sync ./out to S3 + CDN invalidate
```

> **Note:** `build:static` performs a standard `next build`. If you need `next export`, set `"output": "export"` in `next.config.js` or adjust the script accordingly.

## Route Overview

| Route | Description | Backend requirements |
|-------|-------------|----------------------|
| `/` | Marketing hero page mirroring the original static HTML with responsive card art. | None |
| `/sign-in` | Email/password sign-in & sign-up toggle. Uses `useAuth()` to call backend `/auth/sign-in`, `/auth/sign-up`, `/auth/refresh`. Displays loading states + toasts. | Cognito-enabled backend |
| `/deckbuilder` | Auth-gated deckbuilder with catalog search/filter, deck rules, save/load decklists. | `cardCatalog`, `decklists`, `saveDecklist`, `deleteDecklist` GraphQL ops |
| `/matchmaking` | Queue for ranked/free matches, live status polling + subscription updates, ability to leave queue. | Matchmaking GraphQL queries/mutations/subscriptions |
| `/game` | Full turn-based board UI (Dorans selection, battlefield reveal, mulligan modal, ABCD turn flow, tapping/exhaustion visuals, rune channeling, chat/log controls). | Player/spectator match GraphQL endpoints + action mutations |
| `/spectate` | Live match view and replay browser with move-by-move playback. | `gameStateChanged`, `recentMatches`, `matchReplay` GraphQL APIs |

## Styling

- Global typography/layout lives in `app/layout.tsx` (imports `css/styles.css` + `styles/game-board.css`).
- Landing/sign-in styles live in `css/styles.css` (the same look as the original `index.html`/`sign-in.html` pages, now rendered via React).
- Gameboard-specific rules (rotated tapped cards, rune exhaustion, Dorans/battlefield screens) live in `styles/game-board.css`.
- Components use semantic class names (`hero`, `card-slab`, `sign-card`, etc.) to keep the CSS readable.

## Authentication Flow

- `useAuth` reads/writes tokens to `localStorage`.
- Requests go through `lib/apolloClient.ts`, which injects the `Authorization` header when a session is present.
- Refresh tokens are requested via `/auth/refresh` when access tokens expire; logout clears all storage and notifies the `AuthProvider`.
- Toast notifications (`useToasts`) inform the user about success/error states.

## Match & Spectator Flows

- All gameplay data flows through `useGraphQL` hooks: queries (`GET_MATCH`, `GET_PLAYER_MATCH`, etc.), mutations (play card, attack, move, next phase, battlefield selection, Dorans initiative, mulligan), and subscriptions (phase changes, match completion, matchmaking status).
- `components/GameBoard.tsx` handles Dorans/battlefield selections, manual/automatic phase progression, card tapping visuals, rune exhaustion, and board layout.
- `components/GameViewer.tsx` renders spectator/replay views and handles timers between Dorans/battlefield/mulligan screens so players can view both selections before moving on.

## Deployment Notes

1. Configure AWS credentials (`aws configure`) with access to your UI bucket/distribution.
2. Set `DEPLOY_BUCKET` and `CLOUDFRONT_DISTRIBUTION_ID`.
3. Run `npm run deploy:dev` (or adapt the script for staging/prod).

The script builds the Next.js app, syncs `./out` to the bucket, and invalidates the CloudFront cache so new assets propagate immediately.

## License & Attribution

This UI is an unofficial fan project. All League of Legends / Riftbound intellectual property belongs to Riot Games. The code in this repository is open source under the repository’s root license.
