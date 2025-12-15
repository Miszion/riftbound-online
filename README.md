# riftbound-online

A Next.js-powered fan-made landing page and sign-in screen inspired by the Riftbound card game from League of Legends.

## Features

- **Homepage** with hero section, feature cards, and navigation
- **Sign-in screen** with form validation and mock authentication
- **Deckbuilder** that consumes the Riftbound GraphQL API, streams the card catalog, and persists decklists per user
- **Matchmaking queue** for free play and ranked (MMR) matches integrated with the backend GraphQL API
- **Spectator & Replay viewer** with animated card renders and rarity-based effects
- **Responsive design** with card-game inspired aesthetics
- **TypeScript** support and modern React patterns
- **Next.js 14** with App Router

## Project Structure

```
app/
  layout.tsx          # Root layout with global styles
  page.tsx            # Homepage
  sign-in/
    page.tsx          # Sign-in page
components/
  Header.tsx          # Navigation header
  Footer.tsx          # Footer component
styles/
  globals.css         # Global styles and design tokens
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn

### Installation

```bash
npm install
```

### Environment Configuration

Create or update `.env` in the project root to point the UI at your backend:

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-backend-alb-or-cloudfront
NEXT_PUBLIC_WS_BASE_URL=wss://your-backend-alb-or-cloudfront/graphql
# Optional granular overrides:
# NEXT_PUBLIC_API_HOST=your-backend-hostname
# NEXT_PUBLIC_API_PORT=80
# NEXT_PUBLIC_WS_HOST=your-backend-hostname
# NEXT_PUBLIC_WS_PORT=80
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build & Deploy

Static export:

```bash
npm run build:static    # next build (with output: 'export') → ./out
```

Deploy to S3/CloudFront with the helper script (`npm run deploy:dev` calls `npm run build:static`, syncs `./out` to S3, then invalidates CloudFront):

```bash
# prerequisites: AWS CLI configured with access to your bucket/distribution
export DEPLOY_BUCKET=s3://your-ui-bucket
export CLOUDFRONT_DISTRIBUTION_ID=YOUR_DIST_ID
npm run deploy:dev
```

## Deckbuilder

- Requires sign-in (use `/sign-in` to create a local session stored in your browser). All GraphQL calls include your `x-user-id` header.
- Available at [`/deckbuilder`](http://localhost:3000/deckbuilder).
- Streams the full card catalog via GraphQL, supports search, filters, and quick add/remove interactions.
- Saving decks requires the Riftbound backend to expose the new `decklists` DynamoDB table and GraphQL mutations (`saveDecklist`, `deleteDecklist`). Configure API endpoints with `NEXT_PUBLIC_API_HOST`, `NEXT_PUBLIC_API_PORT`, `NEXT_PUBLIC_WS_HOST`, and `NEXT_PUBLIC_WS_PORT` if your backend lives outside of `localhost:3000`.
- Deck requirements match the Riftbound rules (min 40 cards, max 3 copies each). Saved decks can be loaded and edited once a `userId` is supplied.

## Matchmaking

- Requires sign-in. The logged-in user ID is injected into every queue call automatically.
- Available at [`/matchmaking`](http://localhost:3000/matchmaking).
- Lets a player enter their user ID, optional deck ID, and choose between ranked (MMR-driven) or free play queues.
- Uses the backend `matchmakingStatus`, `joinMatchmakingQueue`, and `leaveMatchmakingQueue` GraphQL operations plus the DynamoDB-backed queue table.
- Ranked queue widens acceptable MMR deltas the longer you wait; free play prioritizes speed. Status polling updates every ~4 seconds.

## Spectator & Replays

- Requires sign-in so the WebSocket subscription attaches your user identity.
- Available at [`/spectate`](http://localhost:3000/spectate).
- Live mode subscribes to the backend `gameStateChanged` feed and renders the entire board with animated card panels and rarity glows.
- Replay mode lists the most recent completed matches (persisted via DynamoDB) and lets you step through recorded move history.
- Requires the backend to have the new `matchReplay`/`recentMatches` GraphQL queries plus recorded move history (`MATCH_TABLE` entries now include `Moves` and `FinalState`).

## Notes

- This is a static mockup with mock authentication. The sign-in form shows a client-side alert and does not persist credentials or communicate with a backend.
- The `/deckbuilder` route expects the Riftbound backend GraphQL service to be running with the `cardCatalog`, `decklists`, `saveDecklist`, and `deleteDecklist` operations available. Configure `NEXT_PUBLIC_API_HOST`/`NEXT_PUBLIC_API_PORT` to point at that server.
- All League of Legends and Riftbound trademarks are property of Riot Games. This is an unofficial fan project.

## License

This project is open source. All League of Legends intellectual property belongs to Riot Games.
