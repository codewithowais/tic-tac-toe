import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requirePlayer } from "./lib/auth";
import { presence } from "./presence";
import { requireRoom } from "./rooms";

// A mesh call sends everyone's audio to everyone else, so it stays small.
export const MAX_MEMBERS = 4;
const MAX_PAYLOAD = 20_000;

async function memberOf(ctx: MutationCtx, roomId: Id<"rooms">, playerId: Id<"players">) {
  return await ctx.db
    .query("voiceMembers")
    .withIndex("by_room_player", (q) => q.eq("roomId", roomId).eq("playerId", playerId))
    .unique();
}

/** Deletes signals to and from a player in a room, e.g. when they join fresh or leave. */
async function clearSignals(ctx: MutationCtx, roomId: Id<"rooms">, playerId: Id<"players">) {
  const incoming = await ctx.db
    .query("voiceSignals")
    .withIndex("by_to", (q) => q.eq("roomId", roomId).eq("to", playerId))
    .collect();
  const outgoing = await ctx.db
    .query("voiceSignals")
    .withIndex("by_from", (q) => q.eq("roomId", roomId).eq("from", playerId))
    .collect();
  for (const s of [...incoming, ...outgoing]) await ctx.db.delete(s._id);
}

/** Joins the room's voice call. Anyone in the room can, players or spectators. */
export const join = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const player = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    const existing = await memberOf(ctx, room._id, player._id);
    // Rejoining (e.g. after a reload) starts clean: old connection messages are useless now.
    await clearSignals(ctx, room._id, player._id);
    if (existing) {
      await ctx.db.patch(existing._id, { joinedAt: Date.now(), name: player.name });
      return;
    }
    let members = await ctx.db
      .query("voiceMembers")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    if (members.length >= MAX_MEMBERS) {
      // Someone whose tab was killed or crashed never sends "leave". Free their place if
      // the room's presence says they're gone, so ghosts can't keep a call full.
      const online = new Set((await presence.listRoom(ctx, room.code, true)).map((p) => p.userId));
      for (const m of members.filter((m) => !online.has(m.playerId))) {
        await ctx.db.delete(m._id);
        await clearSignals(ctx, room._id, m.playerId);
      }
      members = members.filter((m) => online.has(m.playerId));
    }
    if (members.length >= MAX_MEMBERS) throw new ConvexError(`Voice is full (${MAX_MEMBERS} people max)`);
    await ctx.db.insert("voiceMembers", {
      roomId: room._id,
      playerId: player._id,
      name: player.name,
      muted: false,
      joinedAt: Date.now(),
    });
  },
});

/** Leaves the call. Also sent by the browser when the tab closes. */
export const leave = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const player = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    const existing = await memberOf(ctx, room._id, player._id);
    if (existing) await ctx.db.delete(existing._id);
    await clearSignals(ctx, room._id, player._id);
  },
});

export const setMuted = mutation({
  args: { token: v.string(), code: v.string(), muted: v.boolean() },
  handler: async (ctx, { token, code, muted }) => {
    const player = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    const existing = await memberOf(ctx, room._id, player._id);
    if (existing && existing.muted !== muted) await ctx.db.patch(existing._id, { muted });
  },
});

/** Who's in the call, in the order they joined. */
export const members = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const rows = await ctx.db
      .query("voiceMembers")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
    return rows.map((m) => ({ playerId: m.playerId, name: m.name, muted: m.muted, joinedAt: m.joinedAt }));
  },
});

/** Sends one connection-setup message to another person in the call. */
export const signal = mutation({
  args: {
    token: v.string(),
    code: v.string(),
    to: v.id("players"),
    kind: v.union(v.literal("offer"), v.literal("answer"), v.literal("ice")),
    payload: v.string(),
  },
  handler: async (ctx, { token, code, to, kind, payload }) => {
    if (payload.length > MAX_PAYLOAD) throw new ConvexError("Voice message too large");
    const player = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    if (!(await memberOf(ctx, room._id, player._id))) throw new ConvexError("Join voice first");
    if (!(await memberOf(ctx, room._id, to))) throw new ConvexError("That person isn't in voice any more");
    await ctx.db.insert("voiceSignals", { roomId: room._id, from: player._id, to, kind, payload, createdAt: Date.now() });
  },
});

/** Connection-setup messages waiting for the caller, oldest first. Only ever the caller's own. */
export const inbox = query({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const player = await requirePlayer(ctx, token);
    const room = await requireRoom(ctx, code);
    const rows = await ctx.db
      .query("voiceSignals")
      .withIndex("by_to", (q) => q.eq("roomId", room._id).eq("to", player._id))
      .take(200);
    return rows.map((s) => ({ _id: s._id, from: s.from, kind: s.kind, payload: s.payload }));
  },
});

/** Deletes messages the caller has handled. Ignores ids that aren't addressed to them. */
export const ack = mutation({
  args: { token: v.string(), code: v.string(), ids: v.array(v.id("voiceSignals")) },
  handler: async (ctx, { token, code, ids }) => {
    const player = await requirePlayer(ctx, token);
    await requireRoom(ctx, code);
    for (const id of ids.slice(0, 200)) {
      const row = await ctx.db.get(id);
      if (row && row.to === player._id) await ctx.db.delete(id);
    }
  },
});
