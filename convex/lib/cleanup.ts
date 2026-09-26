// Deleting rooms, shared by the daily cleanup and the admin tools.
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { presence } from "../presence";

/** Deletes a room with its chat, voice call, reactions, pending timer and presence state. */
export async function deleteRoom(ctx: MutationCtx, room: Doc<"rooms">) {
  const reactions = await ctx.db
    .query("reactions")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .collect();
  for (const r of reactions) await ctx.db.delete(r._id);
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .collect();
  for (const m of messages) await ctx.db.delete(m._id);
  const members = await ctx.db
    .query("voiceMembers")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .collect();
  for (const m of members) await ctx.db.delete(m._id);
  const signals = await ctx.db
    .query("voiceSignals")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .collect();
  for (const s of signals) await ctx.db.delete(s._id);
  if (room.timerId) await ctx.scheduler.cancel(room.timerId);
  await presence.removeRoom(ctx, room.code);
  await ctx.db.delete(room._id);
}
