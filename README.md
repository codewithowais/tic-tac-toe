# tic tac toe

Live, multiplayer tic-tac-toe for 2–4 players. Create a room, share the link, play in real time. Anyone else with the link can watch.

- **Modes:** Classic (2 players, 3×3), Trio (3 players, 4×4), Squad (4 players, 5×5, four in a row) or Custom (2–4 players, 3×3 to 7×7, 3–5 in a row)
- Nicknames and a running score per room, online presence, emoji reactions, and a turn timer (15/30/60s; if it runs out, the server makes a random move for you)
- Light (“paper”) and dark (“chalkboard”) themes, sound effects, keyboard play (arrow keys + Enter), works on phones

**Stack:** Next.js 16 + React 19 + Tailwind v4 + Motion on **Vercel**, with **Convex** as the real-time backend. Both have free plans that don't expire.

## Run it locally

```bash
npm install
npm run dev:backend   # terminal 1: Convex dev backend (npx convex login first)
npm run dev           # terminal 2: http://localhost:3000
```

To play against yourself, open `http://localhost:3000` in one window and `http://127.0.0.1:3000` in another. They count as different players.

```bash
npm test          # game rules + backend tests (Vitest + convex-test)
npm run lint
npm run typecheck
```

## Live

**https://tic-tac-toe-kohl-pi-15.vercel.app**

## Deploy (free)

Already set up: every push to `main` deploys the Convex backend and the Next.js frontend together.
The build command lives in [`vercel.json`](vercel.json) (`npx convex deploy --cmd 'npm run build'`), and Vercel has
`CONVEX_DEPLOY_KEY` set for Production.

To set it up again from scratch:

1. `npx convex login`, then `npx convex dev` once to create the Convex project.
2. `npx convex deployment token create vercel-prod --prod` to create a production deploy key.
3. Import the GitHub repo on [Vercel](https://vercel.com/new) and add `CONVEX_DEPLOY_KEY` (Production) with that key.

## How it works

```
convex/
  lib/game.ts      pure rules: win detection, settings validation (shared with the UI)
  lib/rounds.ts    state transitions: start round, apply move, remove seat
  rooms.ts         create / join / leave / kick / get, daily cleanup of idle rooms
  game.ts          move, rematch, turn-timeout job
  reactions.ts     emoji reactions (rate-limited)
  presence.ts      online status via @convex-dev/presence
src/
  app/             home page and /r/[code] room page
  components/      Board, Mark (drawn SVG strokes), room UI
  lib/session.tsx  anonymous player identity (secret token in localStorage)
```

All game rules run on the server, so nobody can cheat from the browser. Rooms are deleted after 24 hours without play.

Design spec: [`docs/superpowers/specs/2026-09-25-multiplayer-tic-tac-toe-design.md`](docs/superpowers/specs/2026-09-25-multiplayer-tic-tac-toe-design.md)
