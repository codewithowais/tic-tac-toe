import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";

/**
 * Finds the player a secret browser token belongs to: either their own token,
 * or one linked to them when an admin merged two identities.
 */
export async function findPlayerByToken(ctx: QueryCtx, token: string) {
  const own = await ctx.db
    .query("players")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (own) return own;
  const link = await ctx.db
    .query("playerTokens")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  return link ? await ctx.db.get(link.playerId) : null;
}

/** Resolves the caller's secret browser token to their player record. */
export async function requirePlayer(ctx: QueryCtx, token: string) {
  const player = await findPlayerByToken(ctx, token);
  if (!player) throw new ConvexError("Pick a nickname first");
  return player;
}
