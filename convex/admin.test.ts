/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import presenceTest from "@convex-dev/presence/test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const CLASSIC = { maxPlayers: 2, size: 3, winLength: 3, turnSeconds: 30 };
const PASSCODE = "correct-horse-battery-staple-42";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

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

async function login(t: T) {
  return await t.action(api.admin.login, { passcode: PASSCODE });
}

/** Ali beats Sara once, so both have leaderboard rows. */
async function playedRoom(t: T) {
  const ali = await player(t, "Ali");
  const sara = await player(t, "Sara");
  const code = await t.mutation(api.rooms.create, { token: ali.token, settings: CLASSIC });
  await t.mutation(api.rooms.join, { token: sara.token, code });
  for (const [p, cell] of [[ali, 0], [sara, 3], [ali, 1], [sara, 4], [ali, 2]] as const) {
    await t.mutation(api.game.move, { token: p.token, code, cell });
  }
  return { ali, sara, code };
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

describe("admin login", () => {
  it("returns a session for the right passcode", async () => {
    const t = setup();
    const session = await login(t);
    expect(session).toMatch(/^[0-9a-f]{64}$/);
    expect(await t.query(api.admin.overview, { session })).not.toBeNull();
    // Only a hash is stored, never the token itself.
    const stored = await t.run((ctx) => ctx.db.query("adminSessions").collect());
    expect(JSON.stringify(stored)).not.toContain(session);
  });

  it("rejects a wrong passcode", async () => {
    const t = setup();
    await expect(t.action(api.admin.login, { passcode: "nope" })).rejects.toThrow("isn't right");
  });

  it("is disabled when no passcode is configured", async () => {
    const t = setup();
    vi.stubEnv("ADMIN_PASSCODE", "");
    await expect(t.action(api.admin.login, { passcode: "" })).rejects.toThrow("isn't set up");
  });

  it("locks logins after 5 wrong attempts, even for the right passcode, then unlocks", async () => {
    const t = setup();
    for (let i = 0; i < 4; i++) {
      await expect(t.action(api.admin.login, { passcode: `wrong-${i}` })).rejects.toThrow("isn't right");
    }
    await expect(t.action(api.admin.login, { passcode: "wrong-5" })).rejects.toThrow("locked");
    await expect(login(t)).rejects.toThrow("Too many wrong attempts");
    vi.advanceTimersByTime(16 * 60 * 1000);
    await expect(login(t)).resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  it("forgets old failures after 15 minutes", async () => {
    const t = setup();
    for (let i = 0; i < 4; i++) await expect(t.action(api.admin.login, { passcode: "x" })).rejects.toThrow();
    vi.advanceTimersByTime(16 * 60 * 1000);
    await expect(t.action(api.admin.login, { passcode: "x" })).rejects.toThrow("isn't right"); // not locked
  });

  it("expires sessions after 12 hours and on logout", async () => {
    const t = setup();
    const session = await login(t);
    vi.advanceTimersByTime(13 * HOUR);
    expect(await t.query(api.admin.overview, { session })).toBeNull();

    const fresh = await login(t);
    await t.mutation(api.admin.logout, { session: fresh });
    expect(await t.query(api.admin.overview, { session: fresh })).toBeNull();
  });
});

describe("without a session", () => {
  it("returns nothing from admin queries and rejects admin mutations", async () => {
    const t = setup();
    const { ali, code } = await playedRoom(t);
    const room = await t.query(api.rooms.get, { code });
    const session = "not-a-real-session";
    expect(await t.query(api.admin.overview, { session })).toBeNull();
    expect(await t.query(api.admin.rooms, { session })).toBeNull();
    expect(await t.query(api.admin.players, { session, search: "" })).toBeNull();
    const denied = "admin session has expired";
    await expect(t.mutation(api.admin.deleteRoomById, { session, roomId: room!._id })).rejects.toThrow(denied);
    await expect(t.mutation(api.admin.deleteIdleRooms, { session, days: 0 })).rejects.toThrow(denied);
    await expect(t.mutation(api.admin.renamePlayer, { session, playerId: ali.playerId, name: "x" })).rejects.toThrow(denied);
    await expect(t.mutation(api.admin.removePlayer, { session, playerId: ali.playerId })).rejects.toThrow(denied);
    await expect(t.mutation(api.admin.resetLeaderboard, { session, period: "all" })).rejects.toThrow(denied);
    expect(await t.query(api.rooms.get, { code })).not.toBeNull();
  });
});

describe("admin tools", () => {
  it("summarises rooms, players and games", async () => {
    const t = setup();
    await playedRoom(t);
    const bot = await player(t, "Solo");
    await t.mutation(api.rooms.create, { token: bot.token, settings: CLASSIC, bots: ["easy"] });
    const session = await login(t);
    expect(await t.query(api.admin.overview, { session })).toEqual(
      expect.objectContaining({ rooms: 2, playing: 1, idle: 0, players: 3, gamesToday: 1, gamesThisWeek: 1 }),
    );
  });

  it("lists rooms and deletes one with its reactions", async () => {
    const t = setup();
    const { ali, code } = await playedRoom(t);
    await t.mutation(api.reactions.send, { token: ali.token, code, emoji: "🔥" });
    const session = await login(t);
    const rooms = await t.query(api.admin.rooms, { session });
    expect(rooms).toEqual([expect.objectContaining({ code, status: "finished", players: [{ name: "Ali", bot: null }, { name: "Sara", bot: null }] })]);
    await t.mutation(api.admin.deleteRoomById, { session, roomId: rooms![0]._id });
    expect(await t.query(api.rooms.get, { code })).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("reactions").collect())).toHaveLength(0);
  });

  it("bulk-deletes only rooms idle longer than the chosen number of days", async () => {
    const t = setup();
    const { code: oldCode } = await playedRoom(t);
    vi.advanceTimersByTime(4 * DAY);
    const nia = await player(t, "Nia");
    const freshCode = await t.mutation(api.rooms.create, { token: nia.token, settings: CLASSIC });
    const session = await login(t);
    expect(await t.mutation(api.admin.deleteIdleRooms, { session, days: 3 })).toEqual({ deleted: 1, more: false });
    expect(await t.query(api.rooms.get, { code: oldCode })).toBeNull();
    expect(await t.query(api.rooms.get, { code: freshCode })).not.toBeNull();
  });

  it("searches players by name, hiding computers", async () => {
    const t = setup();
    await playedRoom(t);
    const solo = await player(t, "Solo");
    await t.mutation(api.rooms.create, { token: solo.token, settings: CLASSIC, bots: ["hard"] });
    const session = await login(t);
    const all = await t.query(api.admin.players, { session, search: "" });
    expect(all!.map((p) => p.name).sort()).toEqual(["Ali", "Sara", "Solo"]);
    const found = await t.query(api.admin.players, { session, search: "Ali" });
    expect(found).toEqual([expect.objectContaining({ name: "Ali", wins: 1, games: 1 })]);
    expect(JSON.stringify(all)).not.toContain("token");
  });

  it("renames a player everywhere", async () => {
    const t = setup();
    const { ali, code } = await playedRoom(t);
    const session = await login(t);
    await t.mutation(api.admin.renamePlayer, { session, playerId: ali.playerId, name: "  Player  One " });
    expect((await t.query(api.leaderboard.top, { period: "all" })).rows[0].name).toBe("Player One");
    expect((await t.query(api.rooms.get, { code }))!.seats[0].name).toBe("Player One");
    expect(await t.query(api.players.me, { token: ali.token })).toEqual(expect.objectContaining({ name: "Player One" }));
  });

  it("removes a player: stats gone, seat freed, browser must pick a new name", async () => {
    const t = setup();
    const { ali, sara, code } = await playedRoom(t);
    const session = await login(t);
    await t.mutation(api.admin.removePlayer, { session, playerId: ali.playerId });
    expect((await t.query(api.leaderboard.top, { period: "all" })).rows).toHaveLength(0);
    expect(await t.query(api.players.me, { token: ali.token })).toBeNull();
    const room = await t.query(api.rooms.get, { code });
    expect(room!.seats.map((s) => s.name)).toEqual(["Sara"]);
    expect(room!.hostId).toBe(sara.playerId);
  });

  it("won't rename or remove computer players", async () => {
    const t = setup();
    const solo = await player(t, "Solo");
    const code = await t.mutation(api.rooms.create, { token: solo.token, settings: CLASSIC, bots: ["easy"] });
    const bot = (await t.query(api.rooms.get, { code }))!.seats[1];
    const session = await login(t);
    await expect(t.mutation(api.admin.removePlayer, { session, playerId: bot.playerId })).rejects.toThrow("not found");
  });

  it("resets one leaderboard without touching the other", async () => {
    const t = setup();
    await playedRoom(t);
    const session = await login(t);
    const week = "week:2026-09-21";
    expect(await t.mutation(api.admin.resetLeaderboard, { session, period: week })).toEqual({ deleted: 2 });
    expect((await t.query(api.leaderboard.top, { period: week })).rows).toHaveLength(0);
    expect((await t.query(api.leaderboard.top, { period: "all" })).rows).toHaveLength(1);
    await expect(t.mutation(api.admin.resetLeaderboard, { session, period: "everything" })).rejects.toThrow("Unknown");
  });
});
