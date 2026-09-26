import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { findPlayerByToken, requirePlayer } from "./lib/auth";
import { cleanName } from "./lib/game";
import { renameEverywhere } from "./lib/players";

function requireName(name: string) {
  const clean = cleanName(name);
  if (!clean) throw new ConvexError("Nickname can't be empty");
  return clean;
}

/**
 * Called on every visit. Creates the player the first time; afterwards it returns
 * the name stored on the server and never renames. That way two browsers linked
 * to one player can't keep renaming each other with their locally saved names.
 */
export const ensure = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, { token, name }) => {
    if (token.length < 16 || token.length > 64) throw new ConvexError("Invalid session");
    const existing = await findPlayerByToken(ctx, token);
    if (existing) return { playerId: existing._id, name: existing.name, now: Date.now() };
    const clean = requireName(name);
    const playerId = await ctx.db.insert("players", { token, name: clean });
    return { playerId, name: clean, now: Date.now() };
  },
});

/** Changes your nickname everywhere it appears: rooms you're in and the leaderboard. */
export const rename = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, { token, name }) => {
    const player = await requirePlayer(ctx, token);
    const clean = requireName(name);
    if (player.name !== clean) await renameEverywhere(ctx, player._id, clean);
    return { playerId: player._id, name: clean };
  },
});

/** Looks up the caller's public id and nickname. Never returns the token. */
export const me = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await findPlayerByToken(ctx, token);
    return player ? { playerId: player._id, name: player.name } : null;
  },
});
