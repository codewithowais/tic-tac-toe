import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { ALL_TIME, dayKey, weekStart, winRate } from "./lib/stats";

const TOP = 25;
const WEEKS_KEPT = 8;
const DAYS_KEPT = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

function validPeriod(period: string) {
  return period === ALL_TIME || /^week:\d{4}-\d{2}-\d{2}$/.test(period);
}

type Row = { playerId: string; name: string; wins: number; draws: number; games: number; updatedAt: number };

/** More wins first; on equal wins, fewer games (the better record), then whoever got there first. */
function compare(a: Row, b: Row) {
  return b.wins - a.wins || a.games - b.games || a.updatedAt - b.updatedAt;
}

/**
 * Top players for a period. The client passes the period key (e.g. "week:2026-09-21")
 * so the cached result never goes stale when a new week starts.
 */
export const top = query({
  args: { period: v.string(), playerId: v.optional(v.id("players")) },
  handler: async (ctx, { period, playerId }) => {
    if (!validPeriod(period)) throw new ConvexError("Unknown leaderboard period");

    // Read a little more than we show, so ties at the cut-off are ordered correctly.
    const candidates = await ctx.db
      .query("stats")
      .withIndex("by_period_wins", (q) => q.eq("period", period).gt("wins", 0))
      .order("desc")
      .take(TOP * 3);
    const sorted = candidates.sort(compare).slice(0, TOP);

    // Competition ranking: equal records share a rank (1, 2, 2, 4).
    let rank = 0;
    const rows = sorted.map((r, i) => {
      if (i === 0 || compare(sorted[i - 1], r) !== 0) rank = i + 1;
      return {
        rank,
        playerId: r.playerId,
        name: r.name,
        wins: r.wins,
        draws: r.draws,
        games: r.games,
        winRate: winRate(r),
      };
    });

    let me = null;
    if (playerId) {
      const mine = rows.find((r) => r.playerId === playerId);
      if (mine) {
        me = mine;
      } else {
        const row = await ctx.db
          .query("stats")
          .withIndex("by_player_period", (q) => q.eq("playerId", playerId).eq("period", period))
          .unique();
        if (row) {
          me = { rank: null, playerId: row.playerId, name: row.name, wins: row.wins, draws: row.draws, games: row.games, winRate: winRate(row) };
        }
      }
    }
    return { rows, me };
  },
});

/** Daily cron: drops weekly rows older than 8 weeks and day counters older than 60 days. */
export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const oldestWeek = `week:${dayKey(weekStart(now) - WEEKS_KEPT * 7 * DAY_MS)}`;
    const oldWeeks = await ctx.db
      .query("stats")
      .withIndex("by_period", (q) => q.gte("period", "week:").lt("period", oldestWeek))
      .take(1000);
    for (const row of oldWeeks) await ctx.db.delete(row._id);

    const oldestDay = dayKey(now - DAYS_KEPT * DAY_MS);
    const oldDays = await ctx.db
      .query("dailyGames")
      .withIndex("by_day", (q) => q.lt("day", oldestDay))
      .take(1000);
    for (const row of oldDays) await ctx.db.delete(row._id);

    const expired = (await ctx.db.query("adminSessions").take(1000)).filter((s) => s.expiresAt < now);
    for (const s of expired) await ctx.db.delete(s._id);
  },
});
