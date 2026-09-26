import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requirePlayer } from "./lib/auth";
import { requireRoom } from "./rooms";

export const MAX_LENGTH = 200;
const COOLDOWN_MS = 1000;
const SHOWN = 50;

/** Sends a chat message to a room. Anyone in the room can chat, including spectators. */
export const send = mutation({
  args: { token: v.string(), code: v.string(), text: v.string() },
  handler: async (ctx, { token, code, text }) => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) throw new ConvexError("Type a message first");
    if (clean.length > MAX_LENGTH) throw new ConvexError(`Messages can be up to ${MAX_LENGTH} characters`);

    const player = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    const now = Date.now();
    const last = await ctx.db
      .query("messages")
      .withIndex("by_room_player", (q) => q.eq("roomId", room._id).eq("playerId", player._id))
      .order("desc")
      .first();
    if (last && now - last.createdAt < COOLDOWN_MS) throw new ConvexError("Slow down!");

    await ctx.db.insert("messages", {
      roomId: room._id,
      playerId: player._id,
      name: player.name,
      text: clean,
      createdAt: now,
    });
  },
});

/** The latest 50 messages in a room, oldest first. */
export const list = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .order("desc")
      .take(SHOWN);
    return rows.reverse().map((m) => ({
      _id: m._id,
      playerId: m.playerId,
      name: m.name,
      text: m.text,
      createdAt: m.createdAt,
    }));
  },
});
