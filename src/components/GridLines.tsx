"use client";

import { motion } from "motion/react";

/** The classic tic-tac-toe grid: inner lines only, with rounded pen caps. */
export function GridLines({ size, animate = false }: { size: number; animate?: boolean }) {
  const lines = [];
  for (let i = 1; i < size; i++) {
    const p = (i / size) * 100;
    lines.push({ key: `v${i}`, x1: p, y1: 2, x2: p, y2: 98 });
    lines.push({ key: `h${i}`, x1: 2, y1: p, x2: 98, y2: p });
  }
  const width = size <= 3 ? 1.1 : size <= 5 ? 0.8 : 0.6;
  return (
    <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full text-grid" aria-hidden="true">
      {lines.map(({ key, ...l }, i) => (
        <motion.line
          key={key}
          {...l}
          stroke="currentColor"
          strokeWidth={width}
          strokeLinecap="round"
          initial={animate ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.35, delay: i * 0.05, ease: "easeOut" }}
        />
      ))}
    </svg>
  );
}

/** Strike-through across the winning cells. */
export function WinLine({ line, size, seat }: { line: number[]; size: number; seat: number }) {
  const center = (cell: number) => ({
    x: ((cell % size) + 0.5) * (100 / size),
    y: (Math.floor(cell / size) + 0.5) * (100 / size),
  });
  const a = center(line[0]);
  const b = center(line[line.length - 1]);
  // Extend a little past the end cells so the strike reads clearly.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ext = 30 / size;
  return (
    <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <motion.line
        x1={a.x - (dx / len) * ext}
        y1={a.y - (dy / len) * ext}
        x2={b.x + (dx / len) * ext}
        y2={b.y + (dy / len) * ext}
        stroke={`var(--seat-${seat})`}
        strokeWidth={size <= 3 ? 1.9 : size <= 5 ? 1.5 : 1.2}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, delay: 0.25, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  );
}
