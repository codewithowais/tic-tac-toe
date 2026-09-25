import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";

/** Resolves the caller's secret browser token to their player record. */
export async function requirePlayer(ctx: QueryCtx, token: string) {
  const player = await ctx.db
    .query("players")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!player) throw new ConvexError("Pick a nickname first");
  return player;
}
