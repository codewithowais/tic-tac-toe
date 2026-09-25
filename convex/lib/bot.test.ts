import { describe, expect, it } from "vitest";
import { chooseMove, type BotLevel } from "./bot";
import { findWinAt, isBoardFull, type Cell } from "./game";

// Same notation as game.test.ts: X=0, O=1, T=2, S=3, .=empty.
function board(...rows: string[]) {
  const map: Record<string, number | null> = { X: 0, O: 1, T: 2, S: 3, ".": null };
  return rows.join("").split("").map((c) => map[c]);
}

const LEVELS: BotLevel[] = ["easy", "medium", "hard"];
const first = () => 0; // deterministic "random"

describe("chooseMove", () => {
  it("always takes an immediate win, at every level", () => {
    const b = board("OO.", "XX.", "...");
    for (const level of LEVELS) {
      expect(chooseMove({ board: b, size: 3, winLength: 3, seat: 1, players: 2, level, rand: first })).toBe(2);
    }
  });

  it("blocks an opponent's immediate win on medium and hard", () => {
    const b = board("XX.", "O..", "...");
    for (const level of ["medium", "hard"] as const) {
      expect(chooseMove({ board: b, size: 3, winLength: 3, seat: 1, players: 2, level, rand: first })).toBe(2);
    }
  });

  it("blocks the opponent who moves next when several are threatening", () => {
    // Seat 2 (T) to move. Seat 3 (S) moves next and threatens cell 3; seat 0 threatens cell 15.
    const b = board("SSS.", "....", "....", "XXX.");
    const move = chooseMove({ board: b, size: 4, winLength: 4, seat: 2, players: 4, level: "hard", rand: first });
    expect(move).toBe(3);
  });

  it("blocks an open three on a big board before it becomes unstoppable", () => {
    // 5×5, four in a row. X has an open three in the middle row; O must block an end.
    const b = board(".....", ".....", ".XXX.", "..O..", ".....");
    const move = chooseMove({ board: b, size: 5, winLength: 4, seat: 1, players: 2, level: "hard", rand: first });
    expect([10, 14]).toContain(move);
  });

  it("builds a fork on hard when it can", () => {
    // O can play 4 to threaten both 1-4-7 and 3-4-5... simpler: corner fork setup.
    // O at 0 and 8, X at 4 and 2; O playing 6 threatens 0-3-6 and 6-7-8.
    const b = board("O.X", ".X.", "..O");
    const move = chooseMove({ board: b, size: 3, winLength: 3, seat: 1, players: 2, level: "hard", rand: first });
    // X threatens 2-4-6, so O must block at 6, which happens to also be the fork.
    expect(move).toBe(6);
  });

  it("only ever returns an empty cell", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let trial = 0; trial < 200; trial++) {
      const size = 3 + (trial % 4);
      const b: Cell[] = Array.from({ length: size * size }, () => (rand() < 0.45 ? Math.floor(rand() * 3) : null));
      if (isBoardFull(b)) continue;
      const level = LEVELS[trial % 3];
      const move = chooseMove({ board: b, size, winLength: 3, seat: 0, players: 3, level, rand });
      expect(b[move]).toBeNull();
    }
  });
});

describe("hard on 3×3", () => {
  // Plays every possible human line against the hard bot and checks the bot never loses.
  function explore(b: Cell[], toMove: number, botSeat: number): boolean {
    if (isBoardFull(b)) return true;
    if (toMove === botSeat) {
      const cell = chooseMove({ board: b, size: 3, winLength: 3, seat: botSeat, players: 2, level: "hard", rand: first });
      const next = [...b];
      next[cell] = botSeat;
      if (findWinAt(next, 3, 3, cell)) return true;
      return explore(next, 1 - toMove, botSeat);
    }
    for (let cell = 0; cell < 9; cell++) {
      if (b[cell] !== null) continue;
      const next = [...b];
      next[cell] = toMove;
      if (findWinAt(next, 3, 3, cell)) return false; // human won
      if (!explore(next, 1 - toMove, botSeat)) return false;
    }
    return true;
  }

  it("never loses when the human moves first", () => {
    expect(explore(Array(9).fill(null), 0, 1)).toBe(true);
  });

  it("never loses when the bot moves first", () => {
    expect(explore(Array(9).fill(null), 1, 1)).toBe(true);
  });
});
