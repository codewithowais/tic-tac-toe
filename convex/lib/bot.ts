// Computer opponent. Pure functions: given a board, pick a cell to play.
import { findWinAt, isBoardFull, type Cell } from "./game";

export const BOT_LEVELS = ["easy", "medium", "hard"] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];

export const BOT_LABELS: Record<BotLevel, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

type Args = {
  board: Cell[];
  size: number;
  winLength: number;
  /** The bot's seat. */
  seat: number;
  /** Number of seats in the room, to know who moves next. */
  players: number;
  level: BotLevel;
  rand?: () => number;
};

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const;

function emptyCells(board: Cell[]) {
  return board.flatMap((c, i) => (c === null ? [i] : []));
}

/** Empty cells where `seat` would complete a line right now. */
function winningCells(board: Cell[], size: number, winLength: number, seat: number) {
  return emptyCells(board).filter((cell) => {
    const next = [...board];
    next[cell] = seat;
    return findWinAt(next, size, winLength, cell) !== null;
  });
}

/**
 * How promising a cell is: counts every possible winning window through it,
 * rewarding windows that are ours alone (attack) or a single opponent's (defence).
 */
function heuristic(board: Cell[], size: number, winLength: number, seat: number, cell: number) {
  const row = Math.floor(cell / size);
  const col = cell % size;
  let attack = 0;
  let defend = 0;
  for (const [dr, dc] of DIRECTIONS) {
    for (let offset = -(winLength - 1); offset <= 0; offset++) {
      const r0 = row + dr * offset;
      const c0 = col + dc * offset;
      const r1 = r0 + dr * (winLength - 1);
      const c1 = c0 + dc * (winLength - 1);
      if (r0 < 0 || r0 >= size || c0 < 0 || c0 >= size || r1 < 0 || r1 >= size || c1 < 0 || c1 >= size) continue;

      let mine = 0;
      const others = new Map<number, number>();
      for (let k = 0; k < winLength; k++) {
        const v = board[(r0 + dr * k) * size + (c0 + dc * k)];
        if (v === null) continue;
        if (v === seat) mine++;
        else others.set(v, (others.get(v) ?? 0) + 1);
      }
      if (others.size === 0) attack += 5 ** mine;
      else if (others.size === 1 && mine === 0) defend += 4 ** [...others.values()][0];
    }
  }
  const mid = (size - 1) / 2;
  const centrality = 1 - (Math.abs(row - mid) + Math.abs(col - mid)) / (size || 1);
  return attack * 1.2 + defend + centrality;
}

/** Perfect play for classic 3×3 with two players (negamax with memoisation). */
function solve3x3(board: Cell[], seat: number, rand: () => number) {
  const memo = new Map<string, number>();

  function value(b: Cell[], turn: number): number {
    const key = b.map((c) => (c === null ? "." : c)).join("") + turn;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let best = -Infinity;
    for (const cell of emptyCells(b)) {
      b[cell] = turn;
      let v: number;
      if (findWinAt(b, 3, 3, cell)) v = 10 + emptyCells(b).length; // prefer quicker wins
      else if (isBoardFull(b)) v = 0;
      else v = -value(b, 1 - turn);
      b[cell] = null;
      if (v > best) best = v;
    }
    memo.set(key, best);
    return best;
  }

  const b = [...board];
  let best = -Infinity;
  let options: number[] = [];
  for (const cell of emptyCells(b)) {
    b[cell] = seat;
    let v: number;
    if (findWinAt(b, 3, 3, cell)) v = 10 + emptyCells(b).length;
    else if (isBoardFull(b)) v = 0;
    else v = -value(b, 1 - seat);
    b[cell] = null;
    if (v > best) {
      best = v;
      options = [cell];
    } else if (v === best) {
      options.push(cell);
    }
  }
  return options[Math.floor(rand() * options.length)];
}

export function chooseMove({ board, size, winLength, seat, players, level, rand = Math.random }: Args): number {
  const empty = emptyCells(board);
  if (empty.length === 0) throw new Error("No empty cells");
  const pick = (cells: number[]) => cells[Math.floor(rand() * cells.length)];

  // 1. Win if we can. Even the easy bot does this, or it feels broken.
  const wins = winningCells(board, size, winLength, seat);
  if (wins.length) return pick(wins);

  // 2. Block the opponents' immediate wins, starting with whoever moves next.
  const blockChance = level === "easy" ? 0.3 : 1;
  if (rand() < blockChance) {
    for (let k = 1; k < players; k++) {
      const threats = winningCells(board, size, winLength, (seat + k) % players);
      if (threats.length) return pick(threats);
    }
  }

  if (level === "easy") return pick(empty);

  if (level === "hard") {
    if (size === 3 && players === 2 && winLength === 3) return solve3x3(board, seat, rand);

    // 3. Make a fork: a move that creates two winning threats at once.
    const forks = empty.filter((cell) => {
      const next = [...board];
      next[cell] = seat;
      return winningCells(next, size, winLength, seat).length >= 2;
    });
    if (forks.length) return pick(forks);

    // 4. Take the square the next opponent would fork on.
    const nextSeat = (seat + 1) % players;
    const theirForks = empty.filter((cell) => {
      const next = [...board];
      next[cell] = nextSeat;
      return winningCells(next, size, winLength, nextSeat).length >= 2;
    });
    if (theirForks.length) return pick(theirForks);
  }

  // 5. Best square by heuristic. Medium adds noise so it makes human-like mistakes.
  let best = -Infinity;
  let options: number[] = [];
  for (const cell of empty) {
    let score = heuristic(board, size, winLength, seat, cell);
    if (level === "medium") score *= 0.6 + rand() * 0.8;
    if (score > best + 1e-9) {
      best = score;
      options = [cell];
    } else if (Math.abs(score - best) <= 1e-9) {
      options.push(cell);
    }
  }
  return pick(options);
}
