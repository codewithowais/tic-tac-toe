import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import {
  LOCKOUT_MS,
  LOCKOUT_WINDOW_MS,
  MAX_FAILURES,
  SESSION_MS,
  isAdmin,
  randomToken,
  requireAdmin,
  sha256Hex,
  timingSafeEqual,
} from "./lib/admin";
import { deleteRoom } from "./lib/cleanup";
import { cleanName } from "./lib/game";
import { removeSeat } from "./lib/rounds";
import { ALL_TIME, dayKey, weekStart, winRate } from "./lib/stats";

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 100;

const isBot = (player: { token: string }) => player.token.startsWith("bot_");

// ---------------------------------------------------------------------------
// Login

/**
 * Checks the passcode against the ADMIN_PASSCODE environment variable and returns
 * a session token. Runs as an action so the token comes from real randomness.
 */
export const login = action({
  args: { passcode: v.string() },
  handler: async (ctx, { passcode }): Promise<string> => {
    const expected = process.env.ADMIN_PASSCODE;
    if (!expected) throw new ConvexError("Admin isn't set up yet. Set ADMIN_PASSCODE in Convex.");
    const ok = timingSafeEqual(await sha256Hex(passcode), await sha256Hex(expected));
    const token = randomToken();
    const result: string = await ctx.runMutation(internal.admin.recordLogin, {
      ok,
      tokenHash: await sha256Hex(token),
    });
    if (result !== "ok") throw new ConvexError(result);
    return token;
  },
});

/** Applies the lockout and stores the session. Returns "ok" or an error message; never throws, so failures are saved. */
export const recordLogin = internalMutation({
  args: { ok: v.boolean(), tokenHash: v.string() },
  handler: async (ctx, { ok, tokenHash }) => {
    const now = Date.now();
    let lock = await ctx.db.query("adminLockout").first();
    if (!lock) {
      const id = await ctx.db.insert("adminLockout", { failures: [], lockedUntil: 0 });
      lock = (await ctx.db.get(id))!;
    }
    if (lock.lockedUntil > now) {
      const minutes = Math.ceil((lock.lockedUntil - now) / 60000);
      return `Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    if (!ok) {
      const failures = [...lock.failures.filter((t) => t > now - LOCKOUT_WINDOW_MS), now];
      if (failures.length >= MAX_FAILURES) {
        await ctx.db.patch(lock._id, { failures: [], lockedUntil: now + LOCKOUT_MS });
        return "Too many wrong attempts. Logins are locked for 15 minutes.";
      }
      await ctx.db.patch(lock._id, { failures });
      return "That passcode isn't right.";
    }
    await ctx.db.patch(lock._id, { failures: [] });
    await ctx.db.insert("adminSessions", { tokenHash, expiresAt: now + SESSION_MS });
    return "ok";
  },
});

export const logout = mutation({
  args: { session: v.string() },
  handler: async (ctx, { session }) => {
    const tokenHash = await sha256Hex(session);
    const row = await ctx.db
      .query("adminSessions")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});

// ---------------------------------------------------------------------------
// Overview

export const overview = query({
  args: { session: v.string() },
  handler: async (ctx, { session }) => {
    if (!(await isAdmin(ctx, session))) return null;
    const now = Date.now();
    const rooms = await ctx.db.query("rooms").take(5000);
    const players = await ctx.db.query("players").take(10000);
    const days = await ctx.db
      .query("dailyGames")
      .withIndex("by_day", (q) => q.gte("day", dayKey(weekStart(now))))
      .collect();
    const today = dayKey(now);
    return {
      rooms: rooms.length,
      playing: rooms.filter((r) => r.status === "playing").length,
      idle: rooms.filter((r) => r.updatedAt < now - DAY_MS).length,
      players: players.filter((p) => !isBot(p)).length,
      gamesToday: days.find((d) => d.day === today)?.games ?? 0,
      gamesThisWeek: days.reduce((sum, d) => sum + d.games, 0),
      capped: rooms.length === 5000 || players.length === 10000,
    };
  },
});

// ---------------------------------------------------------------------------
// Rooms

export const rooms = query({
  args: { session: v.string() },
  handler: async (ctx, { session }) => {
    if (!(await isAdmin(ctx, session))) return null;
    const rows = await ctx.db.query("rooms").withIndex("by_updated").order("desc").take(200);
    return rows.map((r) => ({
      _id: r._id,
      code: r.code,
      status: r.status,
      settings: r.settings,
      round: r.round,
      players: r.seats.map((s) => ({ name: s.name, bot: s.bot ?? null })),
      updatedAt: r.updatedAt,
    }));
  },
});

export const deleteRoomById = mutation({
  args: { session: v.string(), roomId: v.id("rooms") },
  handler: async (ctx, { session, roomId }) => {
    await requireAdmin(ctx, session);
    const room = await ctx.db.get(roomId);
    if (room) await deleteRoom(ctx, room);
  },
});

async function deleteIdleBatch(ctx: MutationCtx, cutoff: number) {
  const stale = await ctx.db
    .query("rooms")
    .withIndex("by_updated", (q) => q.lt("updatedAt", cutoff))
    .take(BATCH);
  for (const room of stale) await deleteRoom(ctx, room);
  if (stale.length === BATCH) await ctx.scheduler.runAfter(0, internal.admin.continueDeleteIdle, { cutoff });
  return stale.length;
}

/** Deletes every room with no activity for `days` days. Large jobs continue in the background. */
export const deleteIdleRooms = mutation({
  args: { session: v.string(), days: v.number() },
  handler: async (ctx, { session, days }) => {
    await requireAdmin(ctx, session);
    if (!Number.isFinite(days) || days < 0) throw new ConvexError("Pick how many days");
    const deleted = await deleteIdleBatch(ctx, Date.now() - days * DAY_MS);
    return { deleted, more: deleted === BATCH };
  },
});

export const continueDeleteIdle = internalMutation({
  args: { cutoff: v.number() },
  handler: async (ctx, { cutoff }) => {
    await deleteIdleBatch(ctx, cutoff);
  },
});

// ---------------------------------------------------------------------------
// Players

export const players = query({
  args: { session: v.string(), search: v.string() },
  handler: async (ctx, { session, search }) => {
    if (!(await isAdmin(ctx, session))) return null;
    const term = search.trim();
    const found = term
      ? await ctx.db
          .query("players")
          .withSearchIndex("search_name", (q) => q.search("name", term))
          .take(60)
      : await ctx.db.query("players").order("desc").take(60);
    const humans = found.filter((p) => !isBot(p)).slice(0, 50);
    return await Promise.all(
      humans.map(async (p) => {
        const stats = await ctx.db
          .query("stats")
          .withIndex("by_player_period", (q) => q.eq("playerId", p._id).eq("period", ALL_TIME))
          .unique();
        return {
          _id: p._id,
          name: p.name,
          joinedAt: p._creationTime,
          wins: stats?.wins ?? 0,
          games: stats?.games ?? 0,
          winRate: stats ? winRate(stats) : 0,
        };
      }),
    );
  },
});

/** Rooms are deleted after a day idle, so scanning them to find a player's seats stays cheap. */
async function roomsWithPlayer(ctx: MutationCtx, playerId: Id<"players">) {
  const rooms = await ctx.db.query("rooms").take(2000);
  return rooms.filter((r) => r.seats.some((s) => s.playerId === playerId));
}

async function requireHuman(ctx: MutationCtx, playerId: Id<"players">) {
  const player = await ctx.db.get(playerId);
  if (!player || isBot(player)) throw new ConvexError("Player not found");
  return player;
}

export const renamePlayer = mutation({
  args: { session: v.string(), playerId: v.id("players"), name: v.string() },
  handler: async (ctx, { session, playerId, name }) => {
    await requireAdmin(ctx, session);
    await requireHuman(ctx, playerId);
    const clean = cleanName(name);
    if (!clean) throw new ConvexError("Nickname can't be empty");

    await ctx.db.patch(playerId, { name: clean });
    const rows = await ctx.db
      .query("stats")
      .withIndex("by_player_period", (q) => q.eq("playerId", playerId))
      .collect();
    for (const row of rows) await ctx.db.patch(row._id, { name: clean });
    for (const room of await roomsWithPlayer(ctx, playerId)) {
      await ctx.db.patch(room._id, {
        seats: room.seats.map((s) => (s.playerId === playerId ? { ...s, name: clean } : s)),
      });
    }
  },
});

/** Deletes a player's stats and identity, and frees their seats. Their browser will be asked for a new nickname. */
export const removePlayer = mutation({
  args: { session: v.string(), playerId: v.id("players") },
  handler: async (ctx, { session, playerId }) => {
    await requireAdmin(ctx, session);
    await requireHuman(ctx, playerId);
    const rows = await ctx.db
      .query("stats")
      .withIndex("by_player_period", (q) => q.eq("playerId", playerId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    for (const room of await roomsWithPlayer(ctx, playerId)) await removeSeat(ctx, room, playerId);
    await ctx.db.delete(playerId);
  },
});

// ---------------------------------------------------------------------------
// Leaderboard reset

async function resetBatch(ctx: MutationCtx, period: string) {
  const rows = await ctx.db
    .query("stats")
    .withIndex("by_period", (q) => q.eq("period", period))
    .take(500);
  for (const row of rows) await ctx.db.delete(row._id);
  if (rows.length === 500) await ctx.scheduler.runAfter(0, internal.admin.continueReset, { period });
  return rows.length;
}

/** Clears one leaderboard. `period` is "all" or this week's key, e.g. "week:2026-09-21". */
export const resetLeaderboard = mutation({
  args: { session: v.string(), period: v.string() },
  handler: async (ctx, { session, period }) => {
    await requireAdmin(ctx, session);
    if (period !== ALL_TIME && !/^week:\d{4}-\d{2}-\d{2}$/.test(period)) throw new ConvexError("Unknown leaderboard");
    return { deleted: await resetBatch(ctx, period) };
  },
});

export const continueReset = internalMutation({
  args: { period: v.string() },
  handler: async (ctx, { period }) => {
    await resetBatch(ctx, period);
  },
});
