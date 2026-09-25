# Multiplayer Tic-Tac-Toe — Design

**Date:** 2026-09-25 · **Status:** Approved

## Goal

A free-forever, real-time online tic-tac-toe for 2–4 players with a modern, clean UI.
Players share a private room link; anyone else who opens it can watch.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, `motion` | Deploys free on Vercel Hobby |
| Backend | Convex (free plan) | Reactive queries push state instantly; no WebSocket server needed (Vercel can't host one); never pauses |
| Presence | `@convex-dev/presence` | Heartbeats don't re-run queries, so it's cheap on the free quota |
| Tests | Vitest + `convex-test` | Pure game logic + backend mutations |

## Modes

| Preset | Players | Board | Win length |
|---|---|---|---|
| Classic | 2 | 3×3 | 3 |
| Trio | 3 | 4×4 | 3 |
| Squad | 4 | 5×5 | 4 |
| Custom | 2–4 | 3–7 | 3–min(size, 5) |

Turn timer: 15 / 30 / 60 s (always on, so a vanished player can't stall a room).
Seat symbols: 0 = X, 1 = O, 2 = △, 3 = □, each with its own colour.

## Identity

No accounts. On first visit the browser generates a random secret `token` (localStorage)
and the player picks a nickname. `players` table maps token → public player `_id`.
Mutations take the token; queries only ever return public ids and names, never tokens.

## Data model (Convex)

- **players** — `token` (indexed), `name`.
- **rooms** — `code` (4 chars, indexed, unambiguous alphabet), `hostId`, `settings {maxPlayers, size, winLength, turnSeconds}`,
  `seats: {playerId, name, score}[]` (array index = seat), `status: lobby | playing | finished`,
  `board: (seat | null)[]`, `turn`, `startingSeat`, `round`, `moveCount`, `lastMove`,
  `turnEndsAt`, `timerId`, `winner`, `winLine`, `draws`, `rematch: playerId[]`, `updatedAt`.
- **reactions** — `roomId`, `playerId`, `name`, `emoji`, `createdAt` (index by room+time, room+player+time).

## Room lifecycle

1. Host creates a room with settings → seated at seat 0, status `lobby`.
2. Visitors open `/r/CODE`, pick a nickname, press **Join** → take the next free seat. No free seat → spectator.
3. When all seats are filled the round starts automatically (`playing`).
4. On each move the server validates (seated, your turn, cell empty, status playing), applies it,
   checks for a win / draw, advances the turn, and (re)schedules the turn-timeout job.
5. Timeout job: if the room is still on the same `round` + `moveCount`, it plays a random empty cell for the current player.
6. On win/draw → `finished`, score updated. Each seated player presses **Play again**;
   when all have, a new round starts and `startingSeat` rotates.
7. **Leave**: frees the seat. If mid-round, the round is cancelled (no score) and the room returns to `lobby`.
   The host role passes to the next seated player. Host can **remove** an offline player the same way.
8. Daily cron deletes rooms idle for 24 h and their reactions.

## Reactions

8 fixed emojis, rate-limited to 1/second per player, shown as floating bubbles to everyone in the room.
Clients subscribe to the latest 20 and animate only ones they haven't seen.

## Presence

`usePresence(api.presence, roomId, playerId)`. Online state is display-only (seat dot, "offline" badge);
it never affects game rules, so the unauthenticated heartbeat the component requires is acceptable.

## UI

- **Home** `/`: hero with animated mini board, nickname, mode picker cards, timer picker, "Create room", "Join with code".
- **Room** `/r/[code]`: header with code + copy/share; player strip (symbol, name, score, online dot, host crown,
  active-turn highlight + timer ring); responsive N×N board with spring animations, hover ghost of your symbol,
  win line drawn across winning cells; status line; reaction bar; spectator count; lobby panel with big share link;
  round-over panel with rematch readiness.
- Clean minimal aesthetic, automatic light/dark, keyboard accessible (arrow keys + Enter on board), reduced-motion respected,
  optional subtle sound (muted toggle).

## Error handling

Mutations throw `ConvexError` with user-facing messages ("Not your turn", "Cell taken", "Room not found", "Slow down").
The client shows them as toasts. Unknown room code → friendly not-found screen with "Create a room" CTA.

## Testing

- Vitest unit tests for `checkWinner` (rows, columns, both diagonals, win lengths < size, no false positives) and turn rotation.
- `convex-test` for create/join/auto-start, move validation, win + score, draw, timeout auto-move, rematch rotation, leave mid-round.
- Manual end-to-end in the browser with multiple tabs against a local Convex backend.

## Out of scope (v1)

Accounts, public matchmaking, chat text, AI opponent, match history.
