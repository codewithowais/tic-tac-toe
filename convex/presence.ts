import { ConvexError, v } from "convex/values";
import { Presence } from "@convex-dev/presence";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";

// Presence is display-only (online dots). It never affects game rules, so the
// component's userId-based heartbeat is acceptable without the secret token.
export const presence = new Presence(components.presence);

export const heartbeat = mutation({
  args: { roomId: v.string(), userId: v.string(), sessionId: v.string(), interval: v.number() },
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    const playerId = ctx.db.normalizeId("players", userId);
    if (!playerId || !(await ctx.db.get(playerId))) throw new ConvexError("Unknown player");
    return await presence.heartbeat(ctx, roomId, userId, sessionId, interval);
  },
});

export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => {
    return await presence.list(ctx, roomToken);
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    // Called via sendBeacon when a tab closes, so there's no auth to check here.
    return await presence.disconnect(ctx, sessionToken);
  },
});
