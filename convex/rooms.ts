import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { requirePlayer } from "./lib/auth";
import { deleteRoom } from "./lib/cleanup";
import { CODE_ALPHABET, CODE_LENGTH, emptyBoard, normalizeCode, settingsError } from "./lib/game";
import { newBotSeat, removeSeat, startRound } from "./lib/rounds";
import { botLevelValidator, settingsValidator } from "./schema";

const IDLE_ROOM_MS = 24 * 60 * 60 * 1000;

async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", normalizeCode(code)))
    .unique();
}

export async function requireRoom(ctx: QueryCtx, code: string) {
  const room = await roomByCode(ctx, code);
  if (!room) throw new ConvexError("Room not found");
  return room;
}

function randomCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Creates a room with the caller in seat 0. Passing `bots` fills that many of the
 * other seats with computer players; if that fills the room, the game starts at once.
 */
export const create = mutation({
  args: {
    token: v.string(),
    settings: settingsValidator,
    bots: v.optional(v.array(botLevelValidator)),
  },
  handler: async (ctx, { token, settings, bots = [] }) => {
    const player = await requirePlayer(ctx, token);
    const error = settingsError(settings);
    if (error) throw new ConvexError(error);
    if (bots.length > settings.maxPlayers - 1) throw new ConvexError("Too many computer players");

    let code = randomCode();
    for (let tries = 0; (await roomByCode(ctx, code)) && tries < 20; tries++) code = randomCode();

    const seats: Doc<"rooms">["seats"] = [{ playerId: player._id, name: player.name, score: 0 }];
    for (const level of bots) seats.push(await newBotSeat(ctx, seats, level));

    const roomId = await ctx.db.insert("rooms", {
      code,
      hostId: player._id,
      settings,
      seats,
      status: "lobby",
      board: emptyBoard(settings.size),
      turn: 0,
      startingSeat: 0,
      round: 0,
      moveCount: 0,
      lastMove: null,
      turnEndsAt: null,
      timerId: null,
      winner: null,
      winLine: null,
      draws: 0,
      rematch: [],
      updatedAt: Date.now(),
    });
    if (seats.length === settings.maxPlayers) {
      const room = await ctx.db.get(roomId);
      if (room) await startRound(ctx, room);
    }
    return code;
  },
});

/** Host-only: fills the next open seat with a computer player. */
export const addBot = mutation({
  args: { token: v.string(), code: v.string(), level: botLevelValidator },
  handler: async (ctx, { token, code, level }) => {
    const player = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== player._id) throw new ConvexError("Only the host can add computer players");
    if (room.status !== "lobby") throw new ConvexError("Computer players can only join between games");
    if (room.seats.length >= room.settings.maxPlayers) throw new ConvexError("This room is full");

    const seats = [...room.seats, await newBotSeat(ctx, room.seats, level)];
    await ctx.db.patch(room._id, { seats, updatedAt: Date.now() });
    if (seats.length === room.settings.maxPlayers) {
      await startRound(ctx, { ...room, seats });
    }
  },
});

/** Takes the next free seat. The round starts automatically once every seat is filled. */
export const join = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const player = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    if (room.seats.some((s) => s.playerId === player._id)) return;
    if (room.status !== "lobby") throw new ConvexError("A round is in progress — you can watch for now");
    if (room.seats.length >= room.settings.maxPlayers) throw new ConvexError("This room is full");

    const seats = [...room.seats, { playerId: player._id, name: player.name, score: 0 }];
    const hostId = room.seats.length === 0 ? player._id : room.hostId;
    await ctx.db.patch(room._id, { seats, hostId, updatedAt: Date.now() });

    if (seats.length === room.settings.maxPlayers) {
      await startRound(ctx, { ...room, seats, hostId });
    }
  },
});

export const leave = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const player = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    await removeSeat(ctx, room, player._id);
  },
});

/** Host-only: frees the seat of a player (e.g. one who went offline). */
export const kick = mutation({
  args: { token: v.string(), code: v.string(), playerId: v.id("players") },
  handler: async (ctx, { token, code, playerId }) => {
    const player = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    if (room.hostId !== player._id) throw new ConvexError("Only the host can remove players");
    if (playerId === player._id) throw new ConvexError("Use Leave to leave the room");
    await removeSeat(ctx, room, playerId);
  },
});

/** Public room state. Deliberately omits scheduler ids and anything secret. */
export const get = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await roomByCode(ctx, code);
    if (!room) return null;
    return {
      _id: room._id,
      code: room.code,
      hostId: room.hostId,
      settings: room.settings,
      seats: room.seats,
      status: room.status,
      board: room.board,
      turn: room.turn,
      round: room.round,
      moveCount: room.moveCount,
      lastMove: room.lastMove,
      turnEndsAt: room.turnEndsAt,
      winner: room.winner,
      winLine: room.winLine,
      draws: room.draws,
      rematch: room.rematch,
    };
  },
});

/** Daily cron: deletes rooms nobody has touched for 24 hours, with their reactions. */
export const cleanupIdle = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - IDLE_ROOM_MS;
    const stale = await ctx.db
      .query("rooms")
      .withIndex("by_updated", (q) => q.lt("updatedAt", cutoff))
      .take(100);
    for (const room of stale) await deleteRoom(ctx, room);
  },
});
