// Room state transitions shared by rooms.ts and game.ts.
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { BOT_LABELS, type BotLevel } from "./bot";
import { emptyBoard, findWinAt, isBoardFull, nextSeat } from "./game";
import { recordRound } from "./stats";

type Room = Doc<"rooms">;
type Seat = Room["seats"][number];

async function cancelTimer(ctx: MutationCtx, room: Room) {
  if (room.timerId) await ctx.scheduler.cancel(room.timerId);
}

/**
 * Schedules whatever should happen on `turn`: a computer's move after a short
 * "thinking" pause, or the timeout that plays a random move for a slow human.
 */
async function scheduleTurn(ctx: MutationCtx, room: Room, turn: number, round: number, moveCount: number) {
  const args = { roomId: room._id, round, moveCount };
  if (room.seats[turn]?.bot) {
    const delay = 550 + Math.random() * 500;
    const timerId = await ctx.scheduler.runAfter(delay, internal.game.botMove, args);
    return { timerId, turnEndsAt: null };
  }
  const ms = room.settings.turnSeconds * 1000;
  const timerId = await ctx.scheduler.runAfter(ms, internal.game.timeout, args);
  return { timerId, turnEndsAt: Date.now() + ms };
}

/** Everyone is ready for a rematch once every human has asked for one. Computers are always ready. */
export function everyoneReady(seats: Seat[], rematch: Id<"players">[]) {
  return seats.every((s) => s.bot || rematch.includes(s.playerId));
}

/** Creates a computer player and returns its seat, named e.g. "Hard bot" or "Hard bot 2". */
export async function newBotSeat(ctx: MutationCtx, seats: Seat[], level: BotLevel): Promise<Seat> {
  const base = `${BOT_LABELS[level]} bot`;
  const taken = new Set(seats.map((s) => s.name));
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
  const token = `bot_${crypto.randomUUID()}`;
  const playerId = await ctx.db.insert("players", { token, name });
  return { playerId, name, score: 0, bot: level };
}

/** Starts a fresh round. The first round starts with seat 0, later rounds rotate. */
export async function startRound(ctx: MutationCtx, room: Room) {
  await cancelTimer(ctx, room);
  const startingSeat = room.round === 0 ? 0 : nextSeat(room.startingSeat, room.seats.length);
  const round = room.round + 1;
  const timer = await scheduleTurn(ctx, room, startingSeat, round, 0);
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
 * `fromTimer` is true when called by a scheduled job itself, whose own id must not be cancelled.
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
    await recordRound(ctx, room.seats, win.seat);
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
    await recordRound(ctx, room.seats, null);
    return;
  }

  const turn = nextSeat(seat, room.seats.length);
  const timer = await scheduleTurn(ctx, room, turn, room.round, moveCount);
  await ctx.db.patch(room._id, { ...base, turn, ...timer });
}

/**
 * Removes a player's seat. A round in progress (or just finished) is cancelled
 * and the room goes back to the lobby to wait for the seat to be filled again.
 * If only computers would be left, they're removed too.
 */
export async function removeSeat(ctx: MutationCtx, room: Room, playerId: Id<"players">) {
  let seats = room.seats.filter((s) => s.playerId !== playerId);
  if (seats.length === room.seats.length) return;
  if (seats.every((s) => s.bot)) seats = [];

  await cancelTimer(ctx, room);
  const firstHuman = seats.find((s) => !s.bot);
  const hostId = room.hostId === playerId && firstHuman ? firstHuman.playerId : room.hostId;
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
