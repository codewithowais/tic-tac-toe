/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import presenceTest from "@convex-dev/presence/test";
import { api, internal } from "./_generated/api";
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

async function room(t: T) {
  const ali = await player(t, "Ali");
  const code = await t.mutation(api.rooms.create, { token: ali.token, settings: CLASSIC });
  const roomId = (await t.query(api.rooms.get, { code }))!._id;
  return { ali, code, roomId };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("chat", () => {
  it("lets players and spectators send messages, shown oldest first", async () => {
    const t = setup();
    const { ali, code, roomId } = await room(t);
    const zed = await player(t, "Zed"); // not seated: a spectator
    await t.mutation(api.chat.send, { token: ali.token, code, text: "  hello   there " });
    vi.advanceTimersByTime(1500);
    await t.mutation(api.chat.send, { token: zed.token, code, text: "hi!" });
    const messages = await t.query(api.chat.list, { roomId });
    expect(messages.map((m) => [m.name, m.text])).toEqual([
      ["Ali", "hello there"],
      ["Zed", "hi!"],
    ]);
    expect(messages[0].playerId).toBe(ali.playerId);
    expect(JSON.stringify(messages)).not.toContain("token");
  });

  it("rejects empty and over-long messages", async () => {
    const t = setup();
    const { ali, code } = await room(t);
    await expect(t.mutation(api.chat.send, { token: ali.token, code, text: "   " })).rejects.toThrow("Type a message");
    await expect(t.mutation(api.chat.send, { token: ali.token, code, text: "x".repeat(201) })).rejects.toThrow("200 characters");
    await t.mutation(api.chat.send, { token: ali.token, code, text: "x".repeat(200) });
  });

  it("allows one message per second per person", async () => {
    const t = setup();
    const { ali, code } = await room(t);
    await t.mutation(api.chat.send, { token: ali.token, code, text: "one" });
    await expect(t.mutation(api.chat.send, { token: ali.token, code, text: "two" })).rejects.toThrow("Slow down");
    vi.advanceTimersByTime(1100);
    await t.mutation(api.chat.send, { token: ali.token, code, text: "two" });
  });

  it("returns only the latest 50", async () => {
    const t = setup();
    const { ali, code, roomId } = await room(t);
    for (let i = 1; i <= 55; i++) {
      await t.mutation(api.chat.send, { token: ali.token, code, text: `m${i}` });
      vi.advanceTimersByTime(1001);
    }
    const messages = await t.query(api.chat.list, { roomId });
    expect(messages).toHaveLength(50);
    expect(messages[0].text).toBe("m6");
    expect(messages[49].text).toBe("m55");
  });

  it("needs a nickname", async () => {
    const t = setup();
    const { code } = await room(t);
    await expect(t.mutation(api.chat.send, { token: "no-such-token-0123456789", code, text: "hi" })).rejects.toThrow("nickname");
  });

  it("is deleted along with the room", async () => {
    const t = setup();
    const { ali, code } = await room(t);
    await t.mutation(api.chat.send, { token: ali.token, code, text: "bye" });
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    await t.mutation(internal.rooms.cleanupIdle, {});
    expect(await t.run((ctx) => ctx.db.query("messages").collect())).toHaveLength(0);
  });
});
