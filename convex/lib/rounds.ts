// Room state transitions shared by rooms.ts and game.ts.
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { emptyBoard, findWinAt, isBoardFull, nextSeat } from "./game";

type Room = Doc<"rooms">;

async function cancelTimer(ctx: MutationCtx, room: Room) {
  if (room.timerId) await ctx.scheduler.cancel(room.timerId);
}

async function scheduleTimeout(ctx: MutationCtx, room: Room, round: number, moveCount: number) {
  const ms = room.settings.turnSeconds * 1000;
  const timerId = await ctx.scheduler.runAfter(ms, internal.game.timeout, {
    roomId: room._id,
    round,
    moveCount,
  });
  return { timerId, turnEndsAt: Date.now() + ms };
}

/** Starts a fresh round. The first round starts with seat 0, later rounds rotate. */
export async function startRound(ctx: MutationCtx, room: Room) {
  await cancelTimer(ctx, room);
  const startingSeat = room.round === 0 ? 0 : nextSeat(room.startingSeat, room.seats.length);
  const round = room.round + 1;
  const timer = await scheduleTimeout(ctx, room, round, 0);
  await ctx.db.patch(room._id, {
    status: "playing",
    board: emptyBoard(room.settings.size),
    turn: startingSeat,
    startingSeat,
    round,
    moveCount: 0,
    lastMove: null,
    winner: null,
    winLine: null,
    rematch: [],
    ...timer,
    updatedAt: Date.now(),
  });
}

/**
 * Places the current player's piece at `cell`, then resolves win / draw / next turn.
 * `fromTimer` is true when called by the timeout job itself, whose own id must not be cancelled.
 */
export async function applyMove(ctx: MutationCtx, room: Room, cell: number, fromTimer = false) {
  if (!fromTimer) await cancelTimer(ctx, room);

  const seat = room.turn;
  const board = [...room.board];
  board[cell] = seat;
  const moveCount = room.moveCount + 1;
  const now = Date.now();
  const base = { board, moveCount, lastMove: cell, updatedAt: now };

  const win = findWinAt(board, room.settings.size, room.settings.winLength, cell);
  if (win) {
    const seats = room.seats.map((s, i) => (i === win.seat ? { ...s, score: s.score + 1 } : s));
    await ctx.db.patch(room._id, {
      ...base,
      seats,
      status: "finished",
      winner: win.seat,
      winLine: win.line,
      turnEndsAt: null,
      timerId: null,
    });
    return;
  }

  if (isBoardFull(board)) {
    await ctx.db.patch(room._id, {
      ...base,
      status: "finished",
      draws: room.draws + 1,
      turnEndsAt: null,
      timerId: null,
    });
    return;
  }

  const timer = await scheduleTimeout(ctx, room, room.round, moveCount);
  await ctx.db.patch(room._id, { ...base, turn: nextSeat(seat, room.seats.length), ...timer });
}

/**
 * Removes a player's seat. A round in progress (or just finished) is cancelled
 * and the room goes back to the lobby to wait for the seat to be filled again.
 */
export async function removeSeat(ctx: MutationCtx, room: Room, playerId: Id<"players">) {
  const seats = room.seats.filter((s) => s.playerId !== playerId);
  if (seats.length === room.seats.length) return;

  await cancelTimer(ctx, room);
  const hostId = room.hostId === playerId && seats.length > 0 ? seats[0].playerId : room.hostId;
  await ctx.db.patch(room._id, {
    seats,
    hostId,
    status: "lobby",
    board: emptyBoard(room.settings.size),
    moveCount: 0,
    lastMove: null,
    winner: null,
    winLine: null,
    turnEndsAt: null,
    timerId: null,
    rematch: [],
    updatedAt: Date.now(),
  });
}
