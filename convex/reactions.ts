import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requirePlayer } from "./lib/auth";
import { REACTIONS } from "./lib/game";
import { requireRoom } from "./rooms";

const COOLDOWN_MS = 1000;

export const send = mutation({
  args: { token: v.string(), code: v.string(), emoji: v.string() },
  handler: async (ctx, { token, code, emoji }) => {
    if (!(REACTIONS as readonly string[]).includes(emoji)) throw new ConvexError("Unknown reaction");
    const player = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    const now = Date.now();
    const last = await ctx.db
      .query("reactions")
      .withIndex("by_room_player", (q) => q.eq("roomId", room._id).eq("playerId", player._id))
      .order("desc")
      .first();
    if (last && now - last.createdAt < COOLDOWN_MS) throw new ConvexError("Slow down!");
    await ctx.db.insert("reactions", {
      roomId: room._id,
      playerId: player._id,
      name: player.name,
      emoji,
      createdAt: now,
    });
  },
});

export const recent = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const rows = await ctx.db
      .query("reactions")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .order("desc")
      .take(15);
    return rows.map((r) => ({
      _id: r._id,
      playerId: r.playerId,
      name: r.name,
      emoji: r.emoji,
      createdAt: r.createdAt,
    }));
  },
});
