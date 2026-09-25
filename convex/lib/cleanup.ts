// Deleting rooms, shared by the daily cleanup and the admin tools.
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { presence } from "../presence";

/** Deletes a room with its reactions, pending timer and presence state. */
export async function deleteRoom(ctx: MutationCtx, room: Doc<"rooms">) {
  const reactions = await ctx.db
    .query("reactions")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .collect();
  for (const r of reactions) await ctx.db.delete(r._id);
  if (room.timerId) await ctx.scheduler.cancel(room.timerId);
  await presence.removeRoom(ctx, room.code);
  await ctx.db.delete(room._id);
}
