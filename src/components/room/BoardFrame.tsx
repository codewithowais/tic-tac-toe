"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** The smallest a cell gets before a big board scrolls sideways instead of shrinking further. */
export const MIN_CELL = 28;

/**
 * The widest the board may be: 560px (a little more for big boards), never taller than the
 * screen leaves room for, and never so narrow that cells drop below MIN_CELL.
 */
export function boardMaxWidth(size: number) {
  const cap = Math.max(560, Math.min(720, size * 40));
  return `min(100%, ${cap}px, max(100dvh - 340px, ${size * MIN_CELL}px))`;
}

/**
 * Holds the board. When the screen is too narrow to give every cell MIN_CELL (a big board on a
 * phone), the board keeps that size and scrolls sideways, and the latest move is kept in view.
 */
export function BoardScroller({ size, lastMove, children }: { size: number; lastMove: number | null; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // Fires once on observe and again whenever the screen or board size changes.
    const observer = new ResizeObserver(() => setScrolls(el.scrollWidth > el.clientWidth + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, [size]);

  useEffect(() => {
    const el = scroller.current;
    const inner = board.current;
    if (lastMove === null || !el || !inner || el.scrollWidth <= el.clientWidth + 1) return;
    const cellWidth = inner.clientWidth / size;
    const left = (lastMove % size) * cellWidth;
    const hidden = left < el.scrollLeft + 4 || left + cellWidth > el.scrollLeft + el.clientWidth - 4;
    if (hidden) el.scrollTo({ left: left + cellWidth / 2 - el.clientWidth / 2, behavior: "smooth" });
  }, [lastMove, size]);

  return (
    <>
      {/* The negative margin and padding leave room for focus rings at the edges without moving the board. */}
      <div ref={scroller} className="-mx-1 overflow-x-auto overscroll-x-contain px-1 py-1">
        <div ref={board} style={{ minWidth: size * MIN_CELL }}>
          {children}
        </div>
      </div>
      {scrolls && <p className="mt-2 text-center text-xs text-muted">Big board: swipe sideways to see all of it</p>}
    </>
  );
}
