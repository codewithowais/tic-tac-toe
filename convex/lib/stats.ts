// Leaderboard bookkeeping. Called from mutations that finish a round or rename a player.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const ALL_TIME = "all";
const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" for a UTC day. */
export function dayKey(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

/** Start (ms) of the week containing `now`. Weeks start Monday 00:00 UTC. */
export function weekStart(now: number) {
  const d = new Date(now);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return midnight - daysSinceMonday * DAY_MS;
}

/** Period key for the week containing `now`, e.g. "week:2026-09-21". */
export function weekKey(now: number) {
  return `week:${dayKey(weekStart(now))}`;
}

async function bump(
  ctx: MutationCtx,
  seat: { playerId: Id<"players">; name: string },
  period: string,
  result: "win" | "draw" | "loss",
  now: number,
) {
  const row = await ctx.db
    .query("stats")
    .withIndex("by_player_period", (q) => q.eq("playerId", seat.playerId).eq("period", period))
    .unique();
  const wins = result === "win" ? 1 : 0;
  const draws = result === "draw" ? 1 : 0;
  if (row) {
    await ctx.db.patch(row._id, {
      name: seat.name,
      wins: row.wins + wins,
      draws: row.draws + draws,
      games: row.games + 1,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("stats", {
      playerId: seat.playerId,
      name: seat.name,
      period,
      wins,
      draws,
      games: 1,
      updatedAt: now,
    });
  }
}

/**
 * Records a finished round for every human in it. `winner` is the winning seat,
 * or null for a draw. Computer players are never recorded.
 */
export async function recordRound(ctx: MutationCtx, seats: Doc<"rooms">["seats"], winner: number | null) {
  const now = Date.now();
  const periods = [ALL_TIME, weekKey(now)];
  for (let i = 0; i < seats.length; i++) {
    const seat = seats[i];
    if (seat.bot) continue;
    const result = winner === null ? "draw" : winner === i ? "win" : "loss";
    for (const period of periods) await bump(ctx, seat, period, result, now);
  }

  const day = dayKey(now);
  const counter = await ctx.db
    .query("dailyGames")
    .withIndex("by_day", (q) => q.eq("day", day))
    .unique();
  if (counter) await ctx.db.patch(counter._id, { games: counter.games + 1 });
  else await ctx.db.insert("dailyGames", { day, games: 1 });
}

/** Win rate as a whole percentage. Draws count as half a win. */
export function winRate(row: { wins: number; draws: number; games: number }) {
  return row.games === 0 ? 0 : Math.round(((row.wins + row.draws / 2) / row.games) * 100);
}
