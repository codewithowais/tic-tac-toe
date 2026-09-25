"use client";

import { useEffect, useState } from "react";
import type { Cell } from "@convex/lib/game";
import { GridLines, WinLine } from "./GridLines";
import { Mark } from "./Mark";

// A short game where X sets up a double threat and wins down the left column.
const SCRIPT: [cell: number, seat: number][] = [
  [4, 0], [1, 1], [0, 0], [8, 1], [6, 0], [2, 1], [3, 0],
];
const WIN = [0, 3, 6];

/** Self-playing board for the home page. */
export function DemoBoard() {
  const [step, setStep] = useState(0);
  const [loop, setLoop] = useState(0);

  useEffect(() => {
    const done = step >= SCRIPT.length;
    const id = setTimeout(
      () => {
        if (done) {
          setStep(0);
          setLoop((l) => l + 1);
        } else {
          setStep((s) => s + 1);
        }
      },
      done ? 2600 : step === 0 ? 900 : 700,
    );
    return () => clearTimeout(id);
  }, [step]);

  const board: Cell[] = Array(9).fill(null);
  for (const [cell, seat] of SCRIPT.slice(0, step)) board[cell] = seat;
  const won = step >= SCRIPT.length;

  return (
    <div key={loop} className="relative aspect-square w-full" aria-hidden="true">
      <GridLines size={3} animate={loop === 0} />
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
        {board.map((cell, i) => (
          <div
            key={i}
            className={`min-h-0 p-[16%] transition-opacity duration-500 ${won && !WIN.includes(i) ? "opacity-30" : ""}`}
          >
            {cell !== null && <Mark seat={cell} draw strokeWidth={9} className="h-full w-full" />}
          </div>
        ))}
      </div>
      {won && <WinLine line={WIN} size={3} seat={0} />}
    </div>
  );
}
