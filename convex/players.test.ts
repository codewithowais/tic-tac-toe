/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import presenceTest from "@convex-dev/presence/test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const CLASSIC = { maxPlayers: 2, size: 3, winLength: 3, turnSeconds: 30 };
const TRIO = { maxPlayers: 3, size: 4, winLength: 3, turnSeconds: 30 };

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

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("renaming yourself", () => {
  it("updates your seat in every room you're in, but nobody else's", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const sara = await player(t, "Sara");
    const one = await t.mutation(api.rooms.create, { token: ali.token, settings: CLASSIC });
    await t.mutation(api.rooms.join, { token: sara.token, code: one });
    const two = await t.mutation(api.rooms.create, { token: sara.token, settings: TRIO });
    await t.mutation(api.rooms.join, { token: ali.token, code: two });

    const result = await t.mutation(api.players.rename, { token: ali.token, name: "  Ali   Khan " });
    expect(result.name).toBe("Ali Khan");

    const names = async (code: string) => (await t.query(api.rooms.get, { code }))!.seats.map((s) => s.name);
    expect(await names(one)).toEqual(["Ali Khan", "Sara"]);
    expect(await names(two)).toEqual(["Sara", "Ali Khan"]);
  });

  it("keeps the game going: board, turn and scores are untouched", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const sara = await player(t, "Sara");
    const code = await t.mutation(api.rooms.create, { token: ali.token, settings: CLASSIC });
    await t.mutation(api.rooms.join, { token: sara.token, code });
    await t.mutation(api.game.move, { token: ali.token, code, cell: 4 });
    const before = await t.query(api.rooms.get, { code });

    await t.mutation(api.players.rename, { token: sara.token, name: "Sara B" });
    const after = await t.query(api.rooms.get, { code });
    expect(after).toEqual({ ...before, seats: [before!.seats[0], { ...before!.seats[1], name: "Sara B" }] });
  });

  it("renames you on the leaderboard", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const sara = await player(t, "Sara");
    const code = await t.mutation(api.rooms.create, { token: ali.token, settings: CLASSIC });
    await t.mutation(api.rooms.join, { token: sara.token, code });
    for (const [p, cell] of [[ali, 0], [sara, 3], [ali, 1], [sara, 4], [ali, 2]] as const) {
      await t.mutation(api.game.move, { token: p.token, code, cell });
    }
    await t.mutation(api.players.rename, { token: ali.token, name: "Champ" });
    expect((await t.query(api.leaderboard.top, { period: "all" })).rows[0].name).toBe("Champ");
  });

  it("never renames on a normal visit: the saved server name wins", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    const again = await t.mutation(api.players.ensure, { token: ali.token, name: "Something else" });
    expect(again).toEqual(expect.objectContaining({ playerId: ali.playerId, name: "Ali" }));
  });

  it("rejects an empty name", async () => {
    const t = setup();
    const ali = await player(t, "Ali");
    await expect(t.mutation(api.players.rename, { token: ali.token, name: "   " })).rejects.toThrow("can't be empty");
  });
});
