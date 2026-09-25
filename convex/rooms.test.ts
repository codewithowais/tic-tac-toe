/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import presenceTest from "@convex-dev/presence/test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);

const CLASSIC = { maxPlayers: 2, size: 3, winLength: 3, turnSeconds: 30 };
const TRIO = { maxPlayers: 3, size: 4, winLength: 3, turnSeconds: 15 };

function setup() {
  const t = convexTest(schema, modules);
  presenceTest.register(t);
  return t;
}

type T = ReturnType<typeof setup>;

async function player(t: T, name: string) {
  const token = `${name}-token-0123456789abcdef`;
  const { playerId } = await t.mutation(api.players.ensure, { token, name });
  return { token, playerId, name };
}

/** Creates a room with `names.length` seats all filled, so the first round has started. */
async function fullRoom(t: T, settings = CLASSIC, names = ["Ali", "Sara"]) {
  const players = [];
  for (const n of names) players.push(await player(t, n));
  const code = await t.mutation(api.rooms.create, { token: players[0].token, settings });
  for (const p of players.slice(1)) await t.mutation(api.rooms.join, { token: p.token, code });
  return { code, players };
}

async function play(t: T, code: string, token: string, cell: number) {
  await t.mutation(api.game.move, { token, code, cell });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("rooms", () => {
  it("creates a room in the lobby with the host seated", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const code = await t.mutation(api.rooms.create, { token: ali.token, settings: CLASSIC });
    expect(code).toMatch(/^[A-Z0-9]{4}$/);
    const room = await t.query(api.rooms.get, { code: code.toLowerCase() });
    expect(room?.status).toBe("lobby");
    expect(room?.seats.map((s) => s.name)).toEqual(["Ali"]);
    expect(room?.hostId).toBe(ali.playerId);
  });

  it("never exposes player tokens from the room query", async () => {
    const t = setup();
    const { code } = await fullRoom(t);
    const room = await t.query(api.rooms.get, { code });
    expect(JSON.stringify(room)).not.toContain("token");
  });

  it("rejects invalid settings", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    await expect(
      t.mutation(api.rooms.create, { token: ali.token, settings: { ...CLASSIC, maxPlayers: 4 } }),
    ).rejects.toThrow(/at least a 5×5/);
  });

  it("starts the round automatically when all seats are filled", async () => {
    const t = setup();
    const { code } = await fullRoom(t, TRIO, ["Ali", "Sara", "Omar"]);
    const room = await t.query(api.rooms.get, { code });
    expect(room?.status).toBe("playing");
    expect(room?.board).toHaveLength(16);
    expect(room?.turn).toBe(0);
    expect(room?.turnEndsAt).toBeTypeOf("number");
  });

  it("does not seat a player twice and rejects joining a full room", async () => {
    const t = setup();
    const { code, players } = await fullRoom(t);
    await t.mutation(api.rooms.join, { token: players[1].token, code }); // no-op
    const extra = await player(t, "Zed");
    await expect(t.mutation(api.rooms.join, { token: extra.token, code })).rejects.toThrow();
    expect((await t.query(api.rooms.get, { code }))?.seats).toHaveLength(2);
  });
});

describe("moves", () => {
  it("enforces turn order, empty cells and seating", async () => {
    const t = setup();
    const { code, players } = await fullRoom(t);
    const [ali, sara] = players;
    await expect(play(t, code, sara.token, 0)).rejects.toThrow("Not your turn");
    await play(t, code, ali.token, 0);
    await expect(play(t, code, sara.token, 0)).rejects.toThrow("taken");
    await expect(play(t, code, sara.token, 9)).rejects.toThrow("Invalid cell");
    const spectator = await player(t, "Zed");
    await expect(play(t, code, spectator.token, 1)).rejects.toThrow("watching");
  });

  it("detects a win, scores it and stops the timer", async () => {
    const t = setup();
    const { code, players } = await fullRoom(t);
    const [ali, sara] = players;
    for (const [p, cell] of [[ali, 0], [sara, 3], [ali, 1], [sara, 4], [ali, 2]] as const) {
      await play(t, code, p.token, cell);
    }
    const room = await t.query(api.rooms.get, { code });
    expect(room?.status).toBe("finished");
    expect(room?.winner).toBe(0);
    expect(room?.winLine).toEqual([0, 1, 2]);
    expect(room?.seats.map((s) => s.score)).toEqual([1, 0]);
    expect(room?.turnEndsAt).toBeNull();
    await expect(play(t, code, sara.token, 5)).rejects.toThrow("isn't running");
  });

  it("detects a draw", async () => {
    const t = setup();
    const { code, players } = await fullRoom(t);
    const [ali, sara] = players;
    // X O X / X O O / O X X
    const order = [0, 1, 2, 4, 3, 5, 7, 6, 8];
    for (let i = 0; i < order.length; i++) {
      await play(t, code, (i % 2 === 0 ? ali : sara).token, order[i]);
    }
    const room = await t.query(api.rooms.get, { code });
    expect(room?.status).toBe("finished");
    expect(room?.winner).toBeNull();
    expect(room?.draws).toBe(1);
  });

  it("rotates turns through three players", async () => {
    const t = setup();
    const { code, players } = await fullRoom(t, TRIO, ["Ali", "Sara", "Omar"]);
    await play(t, code, players[0].token, 0);
    await play(t, code, players[1].token, 5);
    await play(t, code, players[2].token, 10);
    expect((await t.query(api.rooms.get, { code }))?.turn).toBe(0);
  });
});

describe("turn timer", () => {
  it("plays a random move when time runs out", async () => {
    const t = setup();
    const { code } = await fullRoom(t);
    vi.advanceTimersByTime(30_000);
    await t.finishInProgressScheduledFunctions();
    const room = await t.query(api.rooms.get, { code });
    expect(room?.moveCount).toBe(1);
    expect(room?.board.filter((c) => c === 0)).toHaveLength(1);
    expect(room?.turn).toBe(1);
  });

  it("ignores a stale timeout after a real move", async () => {
    const t = setup();
    const { code, players } = await fullRoom(t);
    const before = await t.run((ctx) => ctx.db.query("rooms").first());
    await play(t, code, players[0].token, 4);
    // Fire the timeout for the old turn directly; it must do nothing.
    await t.mutation(internal.game.timeout, { roomId: before!._id, round: 1, moveCount: 0 });
    expect((await t.query(api.rooms.get, { code }))?.moveCount).toBe(1);
  });
});

describe("rematch", () => {
  it("starts the next round once everyone is ready, rotating who goes first", async () => {
    const t = setup();
    const { code, players } = await fullRoom(t);
    const [ali, sara] = players;
    for (const [p, cell] of [[ali, 0], [sara, 3], [ali, 1], [sara, 4], [ali, 2]] as const) {
      await play(t, code, p.token, cell);
    }
    await t.mutation(api.game.rematch, { token: ali.token, code });
    let room = await t.query(api.rooms.get, { code });
    expect(room?.status).toBe("finished");
    expect(room?.rematch).toEqual([ali.playerId]);

    await t.mutation(api.game.rematch, { token: sara.token, code });
    room = await t.query(api.rooms.get, { code });
    expect(room?.status).toBe("playing");
    expect(room?.round).toBe(2);
    expect(room?.turn).toBe(1); // Sara (O) starts round 2
    expect(room?.board.every((c) => c === null)).toBe(true);
    expect(room?.seats.map((s) => s.score)).toEqual([1, 0]); // scores kept
  });
});

describe("leaving", () => {
  it("cancels the round, returns to the lobby and passes host on", async () => {
    const t = setup();
    const { code, players } = await fullRoom(t);
    const [ali, sara] = players;
    await play(t, code, ali.token, 0);
    await t.mutation(api.rooms.leave, { token: ali.token, code });
    const room = await t.query(api.rooms.get, { code });
    expect(room?.status).toBe("lobby");
    expect(room?.seats.map((s) => s.name)).toEqual(["Sara"]);
    expect(room?.hostId).toBe(sara.playerId);
    expect(room?.board.every((c) => c === null)).toBe(true);

    // A new player can take the free seat and the game restarts.
    const zed = await player(t, "Zed");
    await t.mutation(api.rooms.join, { token: zed.token, code });
    expect((await t.query(api.rooms.get, { code }))?.status).toBe("playing");
  });

  it("only lets the host remove players", async () => {
    const t = setup();
    const { code, players } = await fullRoom(t);
    const [ali, sara] = players;
    await expect(
      t.mutation(api.rooms.kick, { token: sara.token, code, playerId: ali.playerId }),
    ).rejects.toThrow("Only the host");
    await t.mutation(api.rooms.kick, { token: ali.token, code, playerId: sara.playerId });
    expect((await t.query(api.rooms.get, { code }))?.seats).toHaveLength(1);
  });
});

describe("reactions", () => {
  it("accepts known emojis and rate-limits each player", async () => {
    const t = setup();
    const { code, players } = await fullRoom(t);
    const room = await t.query(api.rooms.get, { code });
    await t.mutation(api.reactions.send, { token: players[0].token, code, emoji: "🔥" });
    await expect(
      t.mutation(api.reactions.send, { token: players[0].token, code, emoji: "🔥" }),
    ).rejects.toThrow("Slow down");
    await expect(
      t.mutation(api.reactions.send, { token: players[1].token, code, emoji: "💩" }),
    ).rejects.toThrow("Unknown reaction");
    vi.advanceTimersByTime(1_100);
    await t.mutation(api.reactions.send, { token: players[0].token, code, emoji: "😂" });
    const recent = await t.query(api.reactions.recent, { roomId: room!._id });
    expect(recent.map((r) => r.emoji)).toEqual(["😂", "🔥"]);
  });
});

describe("cleanup", () => {
  it("deletes rooms idle for more than a day", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const code = await t.mutation(api.rooms.create, { token: ali.token, settings: CLASSIC });
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    await t.mutation(internal.rooms.cleanupIdle, {});
    expect(await t.query(api.rooms.get, { code })).toBeNull();
  });
});

describe("computer players", () => {
  /** Lets the scheduled "thinking" delay pass so the bot moves. */
  async function botThinks(t: T) {
    vi.advanceTimersByTime(1_200);
    await t.finishInProgressScheduledFunctions();
  }

  it("starts a solo game immediately with bots in the other seats", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const code = await t.mutation(api.rooms.create, { token: ali.token, settings: TRIO, bots: ["easy", "hard"] });
    const room = await t.query(api.rooms.get, { code });
    expect(room?.status).toBe("playing");
    expect(room?.seats.map((s) => [s.name, s.bot ?? null])).toEqual([
      ["Ali", null],
      ["Easy bot", "easy"],
      ["Hard bot", "hard"],
    ]);
  });

  it("replies after the human moves, then hands the turn back", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const code = await t.mutation(api.rooms.create, { token: ali.token, settings: CLASSIC, bots: ["hard"] });
    await play(t, code, ali.token, 0);
    let room = await t.query(api.rooms.get, { code });
    expect(room?.turn).toBe(1);
    expect(room?.turnEndsAt).toBeNull(); // no countdown while the bot thinks

    await botThinks(t);
    room = await t.query(api.rooms.get, { code });
    expect(room?.moveCount).toBe(2);
    expect(room?.board.filter((c) => c === 1)).toHaveLength(1);
    expect(room?.turn).toBe(0);
    expect(room?.turnEndsAt).toBeTypeOf("number");
  });

  it("chains several bots in a row", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const code = await t.mutation(api.rooms.create, { token: ali.token, settings: TRIO, bots: ["medium", "medium"] });
    await play(t, code, ali.token, 5);
    await botThinks(t);
    await botThinks(t);
    const room = await t.query(api.rooms.get, { code });
    expect(room?.moveCount).toBe(3);
    expect(room?.turn).toBe(0);
    expect(room?.seats.map((s) => s.name)).toEqual(["Ali", "Medium bot", "Medium bot 2"]);
  });

  it("never lets a human move for a bot", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const code = await t.mutation(api.rooms.create, { token: ali.token, settings: CLASSIC, bots: ["easy"] });
    await play(t, code, ali.token, 0);
    await expect(play(t, code, ali.token, 1)).rejects.toThrow("Not your turn");
  });

  it("plays a whole solo game to the end, and a rematch needs only the human", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const code = await t.mutation(api.rooms.create, { token: ali.token, settings: CLASSIC, bots: ["hard"] });
    for (let i = 0; i < 9; i++) {
      const room = await t.query(api.rooms.get, { code });
      if (room?.status !== "playing") break;
      await play(t, code, ali.token, room.board.indexOf(null));
      await botThinks(t);
    }
    let room = await t.query(api.rooms.get, { code });
    expect(room?.status).toBe("finished");
    expect(room?.winner).not.toBe(0); // hard bot never loses on 3×3

    await t.mutation(api.game.rematch, { token: ali.token, code });
    room = await t.query(api.rooms.get, { code });
    expect(room?.status).toBe("playing");
    expect(room?.round).toBe(2);
    expect(room?.turn).toBe(1); // the bot starts round 2...
    await botThinks(t);
    expect((await t.query(api.rooms.get, { code }))?.moveCount).toBe(1); // ...and moves on its own
  });

  it("lets only the host add bots to open seats, which can start the game", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const sara = await player(t, "Sara");
    const code = await t.mutation(api.rooms.create, { token: ali.token, settings: TRIO });
    await t.mutation(api.rooms.join, { token: sara.token, code });
    await expect(t.mutation(api.rooms.addBot, { token: sara.token, code, level: "easy" })).rejects.toThrow("Only the host");
    await t.mutation(api.rooms.addBot, { token: ali.token, code, level: "hard" });
    const room = await t.query(api.rooms.get, { code });
    expect(room?.status).toBe("playing");
    expect(room?.seats.map((s) => s.bot ?? "human")).toEqual(["human", "human", "hard"]);
    await expect(t.mutation(api.rooms.addBot, { token: ali.token, code, level: "easy" })).rejects.toThrow();
  });

  it("removes the bots when the last human leaves", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const code = await t.mutation(api.rooms.create, { token: ali.token, settings: CLASSIC, bots: ["easy"] });
    await t.mutation(api.rooms.leave, { token: ali.token, code });
    const room = await t.query(api.rooms.get, { code });
    expect(room?.seats).toHaveLength(0);
    expect(room?.status).toBe("lobby");
  });

  it("lets the host remove a bot", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const code = await t.mutation(api.rooms.create, { token: ali.token, settings: TRIO, bots: ["easy"] });
    const bot = (await t.query(api.rooms.get, { code }))!.seats[1];
    await t.mutation(api.rooms.kick, { token: ali.token, code, playerId: bot.playerId });
    expect((await t.query(api.rooms.get, { code }))?.seats.map((s) => s.name)).toEqual(["Ali"]);
  });
});
