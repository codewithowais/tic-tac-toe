/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import presenceTest from "@convex-dev/presence/test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const SQUAD = { maxPlayers: 4, size: 5, winLength: 4, turnSeconds: 30 };

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

async function room(t: T) {
  const ali = await player(t, "Ali");
  const code = await t.mutation(api.rooms.create, { token: ali.token, settings: SQUAD });
  const roomId = (await t.query(api.rooms.get, { code }))!._id;
  return { ali, code, roomId };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("voice members", () => {
  it("lists who joined, including spectators, with mute state", async () => {
    const t = setup();
    const { ali, code, roomId } = await room(t);
    const zed = await player(t, "Zed"); // watching, not seated
    await t.mutation(api.voice.join, { token: ali.token, code });
    vi.advanceTimersByTime(10);
    await t.mutation(api.voice.join, { token: zed.token, code });
    await t.mutation(api.voice.setMuted, { token: zed.token, code, muted: true });
    const members = await t.query(api.voice.members, { roomId });
    expect(members.map((m) => [m.name, m.muted])).toEqual([
      ["Ali", false],
      ["Zed", true],
    ]);
    expect(members[0].joinedAt).toBeLessThan(members[1].joinedAt);
    expect(JSON.stringify(members)).not.toContain("token");
  });

  it("joining twice is a no-op, and leaving removes you", async () => {
    const t = setup();
    const { ali, code, roomId } = await room(t);
    await t.mutation(api.voice.join, { token: ali.token, code });
    await t.mutation(api.voice.join, { token: ali.token, code });
    expect(await t.query(api.voice.members, { roomId })).toHaveLength(1);
    await t.mutation(api.voice.leave, { token: ali.token, code });
    expect(await t.query(api.voice.members, { roomId })).toHaveLength(0);
  });

  it("caps a voice call at 4 people", async () => {
    const t = setup();
    const { code } = await room(t);
    for (const n of ["A", "B", "C", "D"]) {
      const p = await player(t, n);
      await t.mutation(api.voice.join, { token: p.token, code });
    }
    const late = await player(t, "E");
    await expect(t.mutation(api.voice.join, { token: late.token, code })).rejects.toThrow("full");
  });
});

describe("voice signalling", () => {
  it("delivers a signal only to its recipient, who deletes it once handled", async () => {
    const t = setup();
    const { ali, code } = await room(t);
    const sara = await player(t, "Sara");
    const zed = await player(t, "Zed");
    for (const p of [ali, sara, zed]) await t.mutation(api.voice.join, { token: p.token, code });

    await t.mutation(api.voice.signal, { token: sara.token, code, to: ali.playerId, kind: "offer", payload: "{\"sdp\":\"x\"}" });
    const aliInbox = await t.query(api.voice.inbox, { token: ali.token, code });
    expect(aliInbox.map((s) => [s.from, s.kind, s.payload])).toEqual([[sara.playerId, "offer", "{\"sdp\":\"x\"}"]]);
    expect(await t.query(api.voice.inbox, { token: zed.token, code })).toEqual([]);

    // Someone else can't delete Ali's mail.
    await t.mutation(api.voice.ack, { token: zed.token, code, ids: [aliInbox[0]._id] });
    expect(await t.query(api.voice.inbox, { token: ali.token, code })).toHaveLength(1);
    await t.mutation(api.voice.ack, { token: ali.token, code, ids: [aliInbox[0]._id] });
    expect(await t.query(api.voice.inbox, { token: ali.token, code })).toEqual([]);
  });

  it("keeps signals in the order they were sent", async () => {
    const t = setup();
    const { ali, code } = await room(t);
    const sara = await player(t, "Sara");
    for (const p of [ali, sara]) await t.mutation(api.voice.join, { token: p.token, code });
    for (const kind of ["offer", "ice", "ice"] as const) {
      await t.mutation(api.voice.signal, { token: sara.token, code, to: ali.playerId, kind, payload: kind });
      vi.advanceTimersByTime(5);
    }
    expect((await t.query(api.voice.inbox, { token: ali.token, code })).map((s) => s.kind)).toEqual(["offer", "ice", "ice"]);
  });

  it("only lets people in the call signal each other, with small payloads", async () => {
    const t = setup();
    const { ali, code } = await room(t);
    const sara = await player(t, "Sara");
    await t.mutation(api.voice.join, { token: ali.token, code });
    await expect(
      t.mutation(api.voice.signal, { token: sara.token, code, to: ali.playerId, kind: "offer", payload: "x" }),
    ).rejects.toThrow("Join voice first");
    await t.mutation(api.voice.join, { token: sara.token, code });
    await expect(
      t.mutation(api.voice.signal, { token: sara.token, code, to: ali.playerId, kind: "offer", payload: "x".repeat(20_001) }),
    ).rejects.toThrow("too large");
    await t.mutation(api.voice.leave, { token: ali.token, code });
    await expect(
      t.mutation(api.voice.signal, { token: sara.token, code, to: ali.playerId, kind: "ice", payload: "x" }),
    ).rejects.toThrow("isn't in voice");
  });

  it("clears your old mail when you rejoin, and your signals when you leave", async () => {
    const t = setup();
    const { ali, code } = await room(t);
    const sara = await player(t, "Sara");
    for (const p of [ali, sara]) await t.mutation(api.voice.join, { token: p.token, code });
    await t.mutation(api.voice.signal, { token: sara.token, code, to: ali.playerId, kind: "offer", payload: "old" });
    await t.mutation(api.voice.signal, { token: ali.token, code, to: sara.playerId, kind: "offer", payload: "mine" });

    await t.mutation(api.voice.leave, { token: ali.token, code });
    expect(await t.query(api.voice.inbox, { token: sara.token, code })).toEqual([]); // Ali's signal is gone
    await t.mutation(api.voice.join, { token: ali.token, code });
    expect(await t.query(api.voice.inbox, { token: ali.token, code })).toEqual([]); // stale mail cleared
  });

  it("is all deleted along with the room", async () => {
    const t = setup();
    const { ali, code } = await room(t);
    const sara = await player(t, "Sara");
    for (const p of [ali, sara]) await t.mutation(api.voice.join, { token: p.token, code });
    await t.mutation(api.voice.signal, { token: sara.token, code, to: ali.playerId, kind: "offer", payload: "x" });
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    await t.mutation(internal.rooms.cleanupIdle, {});
    expect(await t.run((ctx) => ctx.db.query("voiceMembers").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("voiceSignals").collect())).toHaveLength(0);
  });
});
