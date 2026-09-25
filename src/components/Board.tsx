"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { SEATS, type Cell } from "@convex/lib/game";
import { GridLines, WinLine } from "./GridLines";
import { Mark } from "./Mark";

type Props = {
  size: number;
  board: Cell[];
  /** The viewer's seat, used for the hover preview. Null for spectators. */
  mySeat: number | null;
  canPlay: boolean;
  winLine: number[] | null;
  winner: number | null;
  onPlay: (cell: number) => void;
};

/**
 * The game board. Remount it (via `key`) at the start of each round so that
 * pieces already on the board when it mounts appear instantly, and only new
 * moves animate their strokes.
 */
export function Board({ size, board, mySeat, canPlay, winLine, winner, onPlay }: Props) {
  const [initial] = useState(() => new Set(board.flatMap((c, i) => (c === null ? [] : [i]))));
  const [focus, setFocus] = useState(() => Math.floor((size * size) / 2));
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const markStroke = size <= 3 ? 9 : size <= 5 ? 10 : 11;

  function onKeyDown(e: KeyboardEvent, index: number) {
    const row = Math.floor(index / size);
    const col = index % size;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const delta = moves[e.key];
    if (!delta) return;
    e.preventDefault();
    const r = Math.min(size - 1, Math.max(0, row + delta[0]));
    const c = Math.min(size - 1, Math.max(0, col + delta[1]));
    const next = r * size + c;
    setFocus(next);
    cells.current[next]?.focus();
  }

  return (
    <div
      role="grid"
      aria-label={`${size} by ${size} board`}
      className="relative aspect-square w-full select-none"
    >
      <GridLines size={size} animate={initial.size === 0} />
      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, gridTemplateRows: `repeat(${size}, 1fr)` }}>
        {board.map((cell, i) => {
          const empty = cell === null;
          const playable = empty && canPlay;
          const dimmed = winLine !== null && !winLine.includes(i);
          const row = Math.floor(i / size) + 1;
          const col = (i % size) + 1;
          return (
            <button
              key={i}
              ref={(el) => {
                cells.current[i] = el;
              }}
              type="button"
              role="gridcell"
              tabIndex={i === focus ? 0 : -1}
              aria-label={`Row ${row}, column ${col}, ${empty ? "empty" : SEATS[cell].label}`}
              aria-disabled={!playable}
              onFocus={() => setFocus(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              onClick={() => playable && onPlay(i)}
              className={`group relative flex min-h-0 min-w-0 items-center justify-center rounded-lg transition-opacity duration-500 ${
                playable ? "cursor-pointer" : "cursor-default"
              } ${dimmed ? "opacity-30" : "opacity-100"}`}
              style={{ padding: `${size <= 3 ? 16 : size <= 5 ? 12 : 8}%` }}
            >
              {!empty && <Mark seat={cell} draw={!initial.has(i)} strokeWidth={markStroke} className="h-full w-full" />}
              {playable && mySeat !== null && (
                <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-20 group-focus-visible:opacity-20" style={{ padding: "inherit" }}>
                  <Mark seat={mySeat} strokeWidth={markStroke} className="h-full w-full" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {winLine && winner !== null && <WinLine line={winLine} size={size} seat={winner} />}
    </div>
  );
}
