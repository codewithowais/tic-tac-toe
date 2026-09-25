# Leaderboard and Admin — Design

**Date:** 2026-09-25 · **Status:** Approved

## Leaderboard

- One board. Every win counts the same, whether against people or computers.
- Two periods: **this week** (resets Monday 00:00 UTC) and **all time**.
- Computer players never appear on the board.
- Rounds cancelled because someone left don't count. Timer auto-moves count normally.
- Past games weren't recorded, so the board starts from zero.

### Data

`stats` table, one row per (player, period):
`playerId`, `name`, `period` (`"all"` or `"week:YYYY-MM-DD"`, the Monday in UTC), `wins`, `draws`, `games`, `updatedAt`.
Indexes: `by_period_wins [period, wins]`, `by_player_period [playerId, period]`.

`dailyGames` table: `day` (`YYYY-MM-DD` UTC), `games`. Used by the admin overview.

When `applyMove` finishes a round (win or draw), in the same mutation: for each human seat, upsert both
period rows (`games + 1`, and `wins + 1` for the winner or `draws + 1` for everyone on a draw), then bump `dailyGames`.

`players.ensure` renaming also renames the player's `all` and current-week rows.
A daily cron deletes weekly rows older than 8 weeks and `dailyGames` rows older than 60 days.

### UI

`/leaderboard`: tabs This week / All time; top 25 with rank (ties share a rank), name, wins, games, win rate;
top 3 styled; own row highlighted, or pinned below if outside the top 25. Trophy link in the header and on the round-over panel.

## Admin

### Auth

- `ADMIN_PASSCODE` Convex environment variable (never in the repo). Generated randomly and copied to the owner's clipboard.
- `admin.login({ passcode })` → constant-time compare → creates an `adminSessions` row storing the SHA-256 of a random
  session token, valid 12 hours. Returns the token, which the browser keeps in `sessionStorage`.
- Lockout: 5 failed logins within 15 minutes lock logins for 15 minutes (`adminLockout` single row).
- Every admin query/mutation takes `session` and verifies it server-side; queries return `null` and mutations throw when invalid.
- `/admin` is unlinked and `noindex`.

### Tools

- **Overview:** rooms (total / playing / idle > 1 day), human players, games today and this week, link to the Convex usage page.
- **Rooms:** list (newest activity first) with code, mode, players, status, last activity; delete one; bulk-delete rooms idle
  more than 1 / 3 / 7 / 30 days (batched). Deleting removes reactions, timers and presence.
- **Players:** search by name; rename (updates player, stats rows and seats in their rooms); remove (deletes stats and the
  player record, so that browser must pick a new nickname).
- **Reset leaderboard:** this week or all time, typed `RESET` confirmation, deleted in batches.

## Testing

`convex-test` for: stats on win/draw, bots excluded, cancelled rounds not counted, week vs all, rename propagation,
leaderboard ordering and ties; admin login ok/wrong/lockout, session expiry, unauthenticated access rejected, room delete
(single and bulk), rename/remove player, resets.
