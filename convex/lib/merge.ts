// Merging two identities of the same person into one player.
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isBotPlayer, roomsWithPlayer } from "./players";
import { removeSeat } from "./rounds";

/**
 * Moves everything from `fromId` onto `intoId`, then deletes `fromId`:
 * leaderboard rows are added together, the old browser token is linked to the
 * kept player (so that browser keeps playing as them), and room seats are swapped.
 */
export async function mergePlayers(ctx: MutationCtx, fromId: Id<"players">, intoId: Id<"players">) {
  if (fromId === intoId) throw new ConvexError("Pick two different players");
  const from = await ctx.db.get(fromId);
  const into = await ctx.db.get(intoId);
  if (!from || !into || isBotPlayer(from) || isBotPlayer(into)) throw new ConvexError("Player not found");

  // Leaderboard: add rows for the same period together, or move them over.
  const rows = await ctx.db
    .query("stats")
    .withIndex("by_player_period", (q) => q.eq("playerId", fromId))
    .collect();
  for (const row of rows) {
    const target = await ctx.db
      .query("stats")
      .withIndex("by_player_period", (q) => q.eq("playerId", intoId).eq("period", row.period))
      .unique();
    if (target) {
      await ctx.db.patch(target._id, {
        wins: target.wins + row.wins,
        draws: target.draws + row.draws,
        games: target.games + row.games,
        updatedAt: Math.max(target.updatedAt, row.updatedAt),
      });
      await ctx.db.delete(row._id);
    } else {
      await ctx.db.patch(row._id, { playerId: intoId, name: into.name });
    }
  }

  // Browsers: link the old token, and any tokens already linked to it, to the kept player.
  await ctx.db.insert("playerTokens", { token: from.token, playerId: intoId });
  const links = await ctx.db
    .query("playerTokens")
    .withIndex("by_player", (q) => q.eq("playerId", fromId))
    .collect();
  for (const link of links) await ctx.db.patch(link._id, { playerId: intoId });

  // Rooms: swap the seat over, or free it if both identities were sitting in the same room.
  for (const room of await roomsWithPlayer(ctx, fromId)) {
    if (room.seats.some((s) => s.playerId === intoId)) {
      await removeSeat(ctx, room, fromId);
      continue;
    }
    await ctx.db.patch(room._id, {
      seats: room.seats.map((s) => (s.playerId === fromId ? { ...s, playerId: intoId, name: into.name } : s)),
      hostId: room.hostId === fromId ? intoId : room.hostId,
      rematch: room.rematch.map((id) => (id === fromId ? intoId : id)),
    });
  }

  await ctx.db.delete(fromId);
}
