// Renaming a player everywhere their name is copied: seats in rooms and leaderboard rows.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Computer players are stored as players whose token starts with "bot_". */
export function isBotPlayer(player: Pick<Doc<"players">, "token">) {
  return player.token.startsWith("bot_");
}

/** Rooms are deleted after a day idle, so scanning them to find a player's seats stays cheap. */
export async function roomsWithPlayer(ctx: MutationCtx, playerId: Id<"players">) {
  const rooms = await ctx.db.query("rooms").take(2000);
  return rooms.filter((r) => r.seats.some((s) => s.playerId === playerId));
}

/** Sets a player's nickname and updates every copy of it. `name` must already be cleaned. */
export async function renameEverywhere(ctx: MutationCtx, playerId: Id<"players">, name: string) {
  await ctx.db.patch(playerId, { name });

  const rows = await ctx.db
    .query("stats")
    .withIndex("by_player_period", (q) => q.eq("playerId", playerId))
    .collect();
  for (const row of rows) if (row.name !== name) await ctx.db.patch(row._id, { name });

  for (const room of await roomsWithPlayer(ctx, playerId)) {
    await ctx.db.patch(room._id, {
      seats: room.seats.map((s) => (s.playerId === playerId ? { ...s, name } : s)),
    });
  }
}
