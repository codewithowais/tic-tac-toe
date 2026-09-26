/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import presenceTest from "@convex-dev/presence/test";
import { api, internal } from "./_generated/api";
import { weekKey } from "./lib/stats";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const CLASSIC = { maxPlayers: 2, size: 3, winLength: 3, turnSeconds: 30 };

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

async function play(t: T, code: string, token: string, cell: number) {
  await t.mutation(api.game.move, { token, code, cell });
}

/** Ali (X) beats Sara (O) along the top row. */
async function aliBeatsSara(t: T) {
  const ali = await player(t, "Ali");
  const sara = await player(t, "Sara");
  const code = await t.mutation(api.rooms.create, { token: ali.token, settings: CLASSIC });
  await t.mutation(api.rooms.join, { token: sara.token, code });
  for (const [p, cell] of [[ali, 0], [sara, 3], [ali, 1], [sara, 4], [ali, 2]] as const) await play(t, code, p.token, cell);
  return { ali, sara, code };
}

const week = () => weekKey(Date.now());

// Thursday 2026-09-24 12:00 UTC, so the week is 2026-09-21.
const THURSDAY = Date.UTC(2026, 8, 24, 12);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(THURSDAY);
});
afterEach(() => vi.useRealTimers());

describe("weekKey", () => {
  it("uses the Monday (UTC) of the current week", () => {
    expect(weekKey(THURSDAY)).toBe("week:2026-09-21");
    expect(weekKey(Date.UTC(2026, 8, 21, 0, 0))).toBe("week:2026-09-21"); // Monday midnight
    expect(weekKey(Date.UTC(2026, 8, 20, 23, 59))).toBe("week:2026-09-14"); // Sunday night
  });
});

describe("recording results", () => {
  it("counts a win for the winner and a game for everyone, weekly and all-time", async () => {
    const t = setup();
    const { ali, sara } = await aliBeatsSara(t);
    for (const period of ["all", week()]) {
      const { rows } = await t.query(api.leaderboard.top, { period });
      expect(rows).toEqual([expect.objectContaining({ rank: 1, name: "Ali", wins: 1, games: 1, winRate: 100 })]);
      const { me } = await t.query(api.leaderboard.top, { period, playerId: sara.playerId });
      expect(me).toEqual(expect.objectContaining({ rank: null, wins: 0, games: 1 }));
    }
    expect(ali.playerId).toBeDefined();
  });

  it("counts a draw for both players", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const sara = await player(t, "Sara");
    const code = await t.mutation(api.rooms.create, { token: ali.token, settings: CLASSIC });
    await t.mutation(api.rooms.join, { token: sara.token, code });
    const order = [0, 1, 2, 4, 3, 5, 7, 6, 8];
    for (let i = 0; i < order.length; i++) await play(t, code, (i % 2 === 0 ? ali : sara).token, order[i]);
    const { me } = await t.query(api.leaderboard.top, { period: "all", playerId: ali.playerId });
    expect(me).toEqual(expect.objectContaining({ wins: 0, draws: 1, games: 1, winRate: 50 }));
  });

  it("never lists computer players, but a win against one still counts", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const code = await t.mutation(api.rooms.create, { token: ali.token, settings: CLASSIC, bots: ["easy"] });
    // Keep playing the first free cell until the round ends.
    for (let i = 0; i < 9; i++) {
      const room = await t.query(api.rooms.get, { code });
      if (room?.status !== "playing") break;
      if (room.turn === 0) await play(t, code, ali.token, room.board.indexOf(null));
      vi.advanceTimersByTime(1200);
      await t.finishInProgressScheduledFunctions();
    }
    const room = await t.query(api.rooms.get, { code });
    expect(room?.status).toBe("finished");
    const stats = await t.run((ctx) => ctx.db.query("stats").collect());
    const botId = room!.seats[1].playerId;
    expect(stats.some((s) => s.playerId === botId)).toBe(false);
    expect(stats.filter((s) => s.playerId === ali.playerId)).toHaveLength(2); // all + week
  });

  it("doesn't count a round cancelled because someone left", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const sara = await player(t, "Sara");
    const code = await t.mutation(api.rooms.create, { token: ali.token, settings: CLASSIC });
    await t.mutation(api.rooms.join, { token: sara.token, code });
    await play(t, code, ali.token, 0);
    await t.mutation(api.rooms.leave, { token: sara.token, code });
    expect(await t.run((ctx) => ctx.db.query("stats").collect())).toHaveLength(0);
  });

  it("counts games per day for the admin overview", async () => {
    const t = setup();
    await aliBeatsSara(t);
    const days = await t.run((ctx) => ctx.db.query("dailyGames").collect());
    expect(days).toEqual([expect.objectContaining({ day: "2026-09-24", games: 1 })]);
  });

  it("renames the player on the board when they change their nickname", async () => {
    const t = setup();
    const { ali } = await aliBeatsSara(t);
    await t.mutation(api.players.rename, { token: ali.token, name: "Ali the Great" });
    const { rows } = await t.query(api.leaderboard.top, { period: "all" });
    expect(rows[0].name).toBe("Ali the Great");
    expect((await t.query(api.leaderboard.top, { period: week() })).rows[0].name).toBe("Ali the Great");
  });
});

describe("ranking", () => {
  async function seed(t: T, rows: [name: string, wins: number, games: number][]) {
    await t.run(async (ctx) => {
      for (const [name, wins, games] of rows) {
        const playerId = await ctx.db.insert("players", { token: `${name}-seed-token-000000`, name });
        await ctx.db.insert("stats", { playerId, name, period: "all", wins, draws: 0, games, updatedAt: Date.now() });
      }
    });
  }

  it("orders by wins, then fewer games, and shares ranks on equal records", async () => {
    const t = setup();
    await seed(t, [
      ["Cara", 3, 10],
      ["Ali", 5, 8],
      ["Bea", 3, 4],
      ["Dan", 3, 10],
      ["Zero", 0, 6],
    ]);
    const { rows } = await t.query(api.leaderboard.top, { period: "all" });
    // Players with no wins aren't listed; Cara and Dan have identical records and share 3rd.
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 3]);
    expect(rows.slice(0, 2).map((r) => r.name)).toEqual(["Ali", "Bea"]);
    expect(rows.slice(2).map((r) => r.name).sort()).toEqual(["Cara", "Dan"]);
  });

  it("shows the top 25 and reports your stats if you're below the cut", async () => {
    const t = setup();
    await seed(t, Array.from({ length: 30 }, (_, i) => [`P${i}`, 40 - i, 50] as [string, number, number]));
    const me = await t.run((ctx) => ctx.db.query("players").collect()).then((ps) => ps.find((p) => p.name === "P29")!);
    const result = await t.query(api.leaderboard.top, { period: "all", playerId: me._id });
    expect(result.rows).toHaveLength(25);
    expect(result.me).toEqual(expect.objectContaining({ rank: null, wins: 11 }));
  });

  it("rejects unknown periods", async () => {
    const t = setup();
    await expect(t.query(api.leaderboard.top, { period: "month" })).rejects.toThrow("Unknown leaderboard");
  });
});

describe("weeks", () => {
  it("starts a fresh weekly board on Monday while all-time keeps counting", async () => {
    const t = setup();
    await aliBeatsSara(t);
    vi.setSystemTime(Date.UTC(2026, 8, 28, 9)); // next Monday
    expect((await t.query(api.leaderboard.top, { period: week() })).rows).toHaveLength(0);
    expect((await t.query(api.leaderboard.top, { period: "all" })).rows).toHaveLength(1);
  });

  it("prunes weekly rows older than 8 weeks but keeps all-time", async () => {
    const t = setup();
    await aliBeatsSara(t);
    vi.setSystemTime(THURSDAY + 9 * 7 * 24 * 60 * 60 * 1000);
    await t.mutation(internal.leaderboard.prune, {});
    const periods = (await t.run((ctx) => ctx.db.query("stats").collect())).map((s) => s.period);
    expect(periods.every((p) => p === "all")).toBe(true);
    expect(periods).toHaveLength(2);
  });
});
