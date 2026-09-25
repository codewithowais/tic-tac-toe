import { describe, expect, it } from "vitest";
import { findWinAt, isBoardFull, nextSeat, validateSettings, MODES } from "./game";

// Builds a board from rows like "X.O" where X=0, O=1, T=2, S=3, .=empty.
function board(...rows: string[]) {
  const map: Record<string, number | null> = { X: 0, O: 1, T: 2, S: 3, ".": null };
  return rows.join("").split("").map((c) => map[c]);
}

describe("findWinAt", () => {
  it("detects a row win through the last move", () => {
    const b = board("XXX", "OO.", "...");
    expect(findWinAt(b, 3, 3, 1)).toEqual({ seat: 0, line: [0, 1, 2] });
  });

  it("detects a column win", () => {
    const b = board("OX.", "OX.", "O..");
    expect(findWinAt(b, 3, 3, 6)).toEqual({ seat: 1, line: [0, 3, 6] });
  });

  it("detects both diagonals", () => {
    expect(findWinAt(board("X..", ".X.", "..X"), 3, 3, 4)?.line).toEqual([0, 4, 8]);
    expect(findWinAt(board("..O", ".O.", "O.."), 3, 3, 6)?.line).toEqual([2, 4, 6]);
  });

  it("returns null when there is no win", () => {
    expect(findWinAt(board("XOX", "XOO", "OXX"), 3, 3, 8)).toBeNull();
  });

  it("returns null for an empty cell", () => {
    expect(findWinAt(board("XX.", "...", "..."), 3, 3, 2)).toBeNull();
  });

  it("supports win length shorter than the board", () => {
    const b = board("....", ".TTT", "....", "....");
    expect(findWinAt(b, 4, 3, 5)).toEqual({ seat: 2, line: [5, 6, 7] });
  });

  it("does not wrap across row edges", () => {
    // cells 2,3 are end of row 0; 4 is start of row 1 — not a line
    const b = board("..XX", "X...", "....", "....");
    expect(findWinAt(b, 4, 3, 4)).toBeNull();
  });

  it("returns the full run when it is longer than the win length", () => {
    const b = board("SSSSS", ".....", ".....", ".....", ".....");
    expect(findWinAt(b, 5, 4, 2)?.line).toEqual([0, 1, 2, 3, 4]);
  });

  it("detects an anti-diagonal on a larger board", () => {
    const b = board(".....", "...O.", "..O..", ".O...", ".....");
    expect(findWinAt(b, 5, 3, 12)?.line).toEqual([8, 12, 16]);
  });
});

describe("isBoardFull", () => {
  it("is true only when every cell is taken", () => {
    expect(isBoardFull(board("XOX", "XOO", "OXX"))).toBe(true);
    expect(isBoardFull(board("XOX", "XO.", "OXX"))).toBe(false);
  });
});

describe("nextSeat", () => {
  it("rotates through seats", () => {
    expect(nextSeat(0, 2)).toBe(1);
    expect(nextSeat(1, 2)).toBe(0);
    expect(nextSeat(2, 4)).toBe(3);
    expect(nextSeat(3, 4)).toBe(0);
  });
});

describe("validateSettings", () => {
  it("accepts every preset", () => {
    for (const mode of Object.values(MODES)) {
      expect(() => validateSettings({ ...mode, turnSeconds: 30 })).not.toThrow();
    }
  });

  it("rejects bad values", () => {
    expect(() => validateSettings({ maxPlayers: 5, size: 5, winLength: 3, turnSeconds: 30 })).toThrow();
    expect(() => validateSettings({ maxPlayers: 2, size: 8, winLength: 3, turnSeconds: 30 })).toThrow();
    expect(() => validateSettings({ maxPlayers: 2, size: 3, winLength: 4, turnSeconds: 30 })).toThrow();
    expect(() => validateSettings({ maxPlayers: 2, size: 3, winLength: 3, turnSeconds: 10 })).toThrow();
  });

  it("rejects boards too small for the number of players", () => {
    // 4 players on 3x3 would leave barely 2 moves each
    expect(() => validateSettings({ maxPlayers: 4, size: 3, winLength: 3, turnSeconds: 30 })).toThrow();
  });
});
