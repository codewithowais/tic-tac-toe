import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { requirePlayer } from "./lib/auth";
import { chooseMove } from "./lib/bot";
import { applyMove, everyoneReady, startRound } from "./lib/rounds";
import { requireRoom } from "./rooms";

export const move = mutation({
  args: { token: v.string(), code: v.string(), cell: v.number() },
  handler: async (ctx, { token, code, cell }) => {
    const player = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    if (room.status !== "playing") throw new ConvexError("The round isn't running");
    const seat = room.seats.findIndex((s) => s.playerId === player._id);
    if (seat === -1) throw new ConvexError("You're watching this game");
    if (seat !== room.turn) throw new ConvexError("Not your turn");
    if (!Number.isInteger(cell) || cell < 0 || cell >= room.board.length) {
      throw new ConvexError("Invalid cell");
    }
    if (room.board[cell] !== null) throw new ConvexError("That cell is taken");
    await applyMove(ctx, room, cell);
  },
});

/** Marks the caller ready for another round; starts it once every seated player is ready. */
export const rematch = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const player = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    if (room.status !== "finished") throw new ConvexError("The round isn't over yet");
    if (!room.seats.some((s) => s.playerId === player._id)) {
      throw new ConvexError("You're watching this game");
    }
    const rematch = room.rematch.includes(player._id) ? room.rematch : [...room.rematch, player._id];
    if (everyoneReady(room.seats, rematch)) {
      await startRound(ctx, room);
    } else {
      await ctx.db.patch(room._id, { rematch, updatedAt: Date.now() });
    }
  },
});

/** Scheduled when a turn starts. If nobody moved in time, plays a random empty cell. */
export const timeout = internalMutation({
  args: { roomId: v.id("rooms"), round: v.number(), moveCount: v.number() },
  handler: async (ctx, { roomId, round, moveCount }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing") return;
    if (room.round !== round || room.moveCount !== moveCount) return; // a move already happened
    const empty = room.board.flatMap((c, i) => (c === null ? [i] : []));
    if (empty.length === 0) return;
    const cell = empty[Math.floor(Math.random() * empty.length)];
    await applyMove(ctx, room, cell, true);
  },
});

/** Scheduled when it's a computer player's turn. */
export const botMove = internalMutation({
  args: { roomId: v.id("rooms"), round: v.number(), moveCount: v.number() },
  handler: async (ctx, { roomId, round, moveCount }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "playing") return;
    if (room.round !== round || room.moveCount !== moveCount) return;
    const level = room.seats[room.turn]?.bot;
    if (!level) return;
    const cell = chooseMove({
      board: room.board,
      size: room.settings.size,
      winLength: room.settings.winLength,
      seat: room.turn,
      players: room.seats.length,
      level,
    });
    await applyMove(ctx, room, cell, true);
  },
});
