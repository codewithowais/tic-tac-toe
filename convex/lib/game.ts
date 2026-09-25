// Pure game rules shared by the backend and the UI. No Convex imports here.

/** A cell holds the seat index (0–3) of the player who took it, or null. */
export type Cell = number | null;

export type Settings = {
  maxPlayers: number;
  size: number;
  winLength: number;
  turnSeconds: number;
};

export const MODES = {
  classic: { maxPlayers: 2, size: 3, winLength: 3 },
  trio: { maxPlayers: 3, size: 4, winLength: 3 },
  squad: { maxPlayers: 4, size: 5, winLength: 4 },
} as const;

export type ModeKey = keyof typeof MODES;

export const TURN_SECONDS = [15, 30, 60] as const;
export const MIN_SIZE = 3;
export const MAX_SIZE = 7;
export const MAX_WIN_LENGTH = 5;

export const REACTIONS = ["👍", "😂", "🔥", "😮", "😤", "🎉", "🤝", "👀"] as const;

/** Returns an error message for invalid settings, or null if they are fine. */
export function settingsError(s: Settings): string | null {
  if (!Number.isInteger(s.maxPlayers) || s.maxPlayers < 2 || s.maxPlayers > 4) {
    return "Players must be between 2 and 4";
  }
  if (!Number.isInteger(s.size) || s.size < MIN_SIZE || s.size > MAX_SIZE) {
    return `Board size must be between ${MIN_SIZE} and ${MAX_SIZE}`;
  }
  if (s.size < s.maxPlayers + 1 && s.maxPlayers > 2) {
    return `${s.maxPlayers} players need at least a ${s.maxPlayers + 1}×${s.maxPlayers + 1} board`;
  }
  const maxWin = Math.min(s.size, MAX_WIN_LENGTH);
  if (!Number.isInteger(s.winLength) || s.winLength < 3 || s.winLength > maxWin) {
    return `Win length must be between 3 and ${maxWin}`;
  }
  if (!(TURN_SECONDS as readonly number[]).includes(s.turnSeconds)) {
    return "Turn timer must be 15, 30 or 60 seconds";
  }
  return null;
}

export function validateSettings(s: Settings): void {
  const error = settingsError(s);
  if (error) throw new Error(error);
}

const DIRECTIONS = [
  [0, 1], // row
  [1, 0], // column
  [1, 1], // diagonal
  [1, -1], // anti-diagonal
] as const;

/**
 * Checks whether the piece at `cell` completes a line of `winLength`.
 * Only the most recent move can create a new win, so we scan outwards from it.
 * Returns the full contiguous run (sorted), which may exceed `winLength`.
 */
export function findWinAt(
  board: Cell[],
  size: number,
  winLength: number,
  cell: number,
): { seat: number; line: number[] } | null {
  const seat = board[cell];
  if (seat === null || seat === undefined) return null;
  const row0 = Math.floor(cell / size);
  const col0 = cell % size;

  for (const [dr, dc] of DIRECTIONS) {
    const line = [cell];
    for (const sign of [1, -1]) {
      let r = row0 + dr * sign;
      let c = col0 + dc * sign;
      while (r >= 0 && r < size && c >= 0 && c < size && board[r * size + c] === seat) {
        line.push(r * size + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= winLength) {
      return { seat, line: line.sort((a, b) => a - b) };
    }
  }
  return null;
}

export function isBoardFull(board: Cell[]): boolean {
  return board.every((c) => c !== null);
}

export function nextSeat(seat: number, players: number): number {
  return (seat + 1) % players;
}

export function emptyBoard(size: number): Cell[] {
  return Array.from({ length: size * size }, () => null);
}

/** Symbols and names for each seat, used by the UI. */
export const SEATS = [
  { symbol: "X", label: "Cross" },
  { symbol: "O", label: "Circle" },
  { symbol: "△", label: "Triangle" },
  { symbol: "□", label: "Square" },
] as const;

// Room codes avoid look-alike characters (0/O, 1/I/L).
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 4;

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, 20);
}
