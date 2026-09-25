import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { cleanName } from "./lib/game";

/** Creates the player on first visit, or updates their nickname. */
export const ensure = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, { token, name }) => {
    if (token.length < 16 || token.length > 64) throw new ConvexError("Invalid session");
    const clean = cleanName(name);
    if (!clean) throw new ConvexError("Nickname can't be empty");

    const existing = await ctx.db
      .query("players")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (existing) {
      if (existing.name !== clean) await ctx.db.patch(existing._id, { name: clean });
      return { playerId: existing._id, name: clean, now: Date.now() };
    }
    const playerId = await ctx.db.insert("players", { token, name: clean });
    return { playerId, name: clean, now: Date.now() };
  },
});

/** Looks up the caller's public id and nickname. Never returns the token. */
export const me = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    return player ? { playerId: player._id, name: player.name } : null;
  },
});
