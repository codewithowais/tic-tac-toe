import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const settingsValidator = v.object({
  maxPlayers: v.number(),
  size: v.number(),
  winLength: v.number(),
  turnSeconds: v.number(),
});

export const botLevelValidator = v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"));

export const seatValidator = v.object({
  playerId: v.id("players"),
  name: v.string(),
  score: v.number(),
  /** Set for computer players. */
  bot: v.optional(botLevelValidator),
});

export default defineSchema({
  // Anonymous players. `token` is a secret kept in the browser; never return it from a query.
  players: defineTable({
    token: v.string(),
    name: v.string(),
  }).index("by_token", ["token"]),

  rooms: defineTable({
    code: v.string(),
    hostId: v.id("players"),
    settings: settingsValidator,
    // Array index is the seat number, which decides the player's symbol.
    seats: v.array(seatValidator),
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished")),
    board: v.array(v.union(v.number(), v.null())),
    turn: v.number(),
    startingSeat: v.number(),
    round: v.number(),
    moveCount: v.number(),
    lastMove: v.union(v.number(), v.null()),
    turnEndsAt: v.union(v.number(), v.null()),
    timerId: v.union(v.id("_scheduled_functions"), v.null()),
    winner: v.union(v.number(), v.null()),
    winLine: v.union(v.array(v.number()), v.null()),
    draws: v.number(),
    rematch: v.array(v.id("players")),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_updated", ["updatedAt"]),

  reactions: defineTable({
    roomId: v.id("rooms"),
    playerId: v.id("players"),
    name: v.string(),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_room", ["roomId", "createdAt"])
    .index("by_room_player", ["roomId", "playerId", "createdAt"]),
});
