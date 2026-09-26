/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import presenceTest from "@convex-dev/presence/test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const CLASSIC = { maxPlayers: 2, size: 3, winLength: 3, turnSeconds: 30 };
const TRIO = { maxPlayers: 3, size: 4, winLength: 3, turnSeconds: 30 };
const PASSCODE = "correct-horse-battery-staple-42";

function setup() {
  const t = convexTest(schema, modules);
  presenceTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;
type P = { token: string; playerId: Id<"players">; name: string };

async function player(t: T, key: string, name = key): Promise<P> {
  const token = `${key}-token-0123456789abcdef`;
  const { playerId } = await t.mutation(api.players.ensure, { token, name });
  return { token, playerId, name };
}

/** `winner` beats `loser` along the top row in a fresh room. */
async function beat(t: T, winner: P, loser: P) {
  const code = await t.mutation(api.rooms.create, { token: winner.token, settings: CLASSIC });
  await t.mutation(api.rooms.join, { token: loser.token, code });
  for (const [p, cell] of [[winner, 0], [loser, 3], [winner, 1], [loser, 4], [winner, 2]] as const) {
    await t.mutation(api.game.move, { token: p.token, code, cell });
  }
}

async function statsOf(t: T, playerId: Id<"players">) {
  const rows = await t.run((ctx) => ctx.db.query("stats").collect());
  return rows
    .filter((r) => r.playerId === playerId)
    .map((r) => ({ period: r.period, wins: r.wins, draws: r.draws, games: r.games, name: r.name }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 24, 12));
  vi.stubEnv("ADMIN_PASSCODE", PASSCODE);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("merging players", () => {
  it("adds the stats together for every period and removes the duplicate", async () => {
    const t = setup();
    const laptop = await player(t, "laptop", "Owais");
    const phone = await player(t, "phone", "Owais");
    const sara = await player(t, "sara", "Sara");
    await beat(t, laptop, sara);
    await beat(t, phone, sara);
    await beat(t, sara, phone);

    await t.mutation(internal.admin.mergePlayersInternal, { fromId: phone.playerId, intoId: laptop.playerId });

    expect(await statsOf(t, laptop.playerId)).toEqual([
      { period: "all", wins: 2, draws: 0, games: 3, name: "Owais" },
      { period: "week:2026-09-21", wins: 2, draws: 0, games: 3, name: "Owais" },
    ]);
    expect(await statsOf(t, phone.playerId)).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(phone.playerId))).toBeNull();
    const { rows } = await t.query(api.leaderboard.top, { period: "all" });
    expect(rows.map((r) => [r.name, r.wins, r.games])).toEqual([
      ["Owais", 2, 3],
      ["Sara", 1, 3],
    ]);
  });

  it("moves stats over when the target has none for a period", async () => {
    const t = setup();
    const keep = await player(t, "keep", "Owais");
    const dupe = await player(t, "dupe", "owais");
    const sara = await player(t, "sara", "Sara");
    await beat(t, dupe, sara);
    await t.mutation(internal.admin.mergePlayersInternal, { fromId: dupe.playerId, intoId: keep.playerId });
    expect(await statsOf(t, keep.playerId)).toEqual([
      { period: "all", wins: 1, draws: 0, games: 1, name: "Owais" },
      { period: "week:2026-09-21", wins: 1, draws: 0, games: 1, name: "Owais" },
    ]);
  });

  it("links the merged browser, so it keeps playing as the same player", async () => {
    const t = setup();
    const laptop = await player(t, "laptop", "Owais");
    const phone = await player(t, "phone", "Owais");
    const sara = await player(t, "sara", "Sara");
    await t.mutation(internal.admin.mergePlayersInternal, { fromId: phone.playerId, intoId: laptop.playerId });

    // The phone's own token now resolves to the laptop's player.
    expect(await t.query(api.players.me, { token: phone.token })).toEqual({ playerId: laptop.playerId, name: "Owais" });
    const again = await t.mutation(api.players.ensure, { token: phone.token, name: "Owais" });
    expect(again.playerId).toBe(laptop.playerId);

    // Games played from the phone now count for the same leaderboard entry.
    await beat(t, { ...phone, playerId: laptop.playerId }, sara);
    await beat(t, laptop, sara);
    const { rows } = await t.query(api.leaderboard.top, { period: "all" });
    expect(rows).toEqual([expect.objectContaining({ playerId: laptop.playerId, wins: 2, games: 2 })]);
  });

  it("replaces the duplicate's seats, and frees one if both were in the same room", async () => {
    const t = setup();
    const laptop = await player(t, "laptop", "Owais");
    const phone = await player(t, "phone", "Owais P");
    const sara = await player(t, "sara", "Sara");
    const shared = await t.mutation(api.rooms.create, { token: phone.token, settings: TRIO });
    await t.mutation(api.rooms.join, { token: laptop.token, code: shared });
    const phoneOnly = await t.mutation(api.rooms.create, { token: phone.token, settings: CLASSIC });
    await t.mutation(api.rooms.join, { token: sara.token, code: phoneOnly });

    await t.mutation(internal.admin.mergePlayersInternal, { fromId: phone.playerId, intoId: laptop.playerId });

    const a = (await t.query(api.rooms.get, { code: shared }))!;
    expect(a.seats.map((s) => s.playerId)).toEqual([laptop.playerId]);
    expect(a.hostId).toBe(laptop.playerId);
    const b = (await t.query(api.rooms.get, { code: phoneOnly }))!;
    expect(b.seats.map((s) => [s.playerId, s.name])).toEqual([
      [laptop.playerId, "Owais"],
      [sara.playerId, "Sara"],
    ]);
    expect(b.hostId).toBe(laptop.playerId);
    expect(b.status).toBe("playing"); // the game carries on
  });

  it("rejects merging a player into themselves or into a computer", async () => {
    const t = setup();
    const ali = await player(t, "ali", "Ali");
    const code = await t.mutation(api.rooms.create, { token: ali.token, settings: CLASSIC, bots: ["easy"] });
    const bot = (await t.query(api.rooms.get, { code }))!.seats[1];
    await expect(
      t.mutation(internal.admin.mergePlayersInternal, { fromId: ali.playerId, intoId: ali.playerId }),
    ).rejects.toThrow("two different players");
    await expect(
      t.mutation(internal.admin.mergePlayersInternal, { fromId: ali.playerId, intoId: bot.playerId }),
    ).rejects.toThrow("not found");
  });

  it("needs an admin session from the dashboard", async () => {
    const t = setup();
    const a = await player(t, "a", "A");
    const b = await player(t, "b", "B");
    await expect(
      t.mutation(api.admin.mergePlayers, { session: "nope", fromId: a.playerId, intoId: b.playerId }),
    ).rejects.toThrow("admin session has expired");
    const session = await t.action(api.admin.login, { passcode: PASSCODE });
    await t.mutation(api.admin.mergePlayers, { session, fromId: a.playerId, intoId: b.playerId });
    expect(await t.query(api.players.me, { token: a.token })).toEqual({ playerId: b.playerId, name: "B" });
  });

  it("removing a player also removes the browsers linked to them", async () => {
    const t = setup();
    const laptop = await player(t, "laptop", "Owais");
    const phone = await player(t, "phone", "Owais");
    await t.mutation(internal.admin.mergePlayersInternal, { fromId: phone.playerId, intoId: laptop.playerId });
    const session = await t.action(api.admin.login, { passcode: PASSCODE });
    await t.mutation(api.admin.removePlayer, { session, playerId: laptop.playerId });
    expect(await t.query(api.players.me, { token: phone.token })).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("playerTokens").collect())).toHaveLength(0);
  });
});
