"use client";

import { motion } from "motion/react";

// Each seat's mark as SVG path(s) in a 100×100 box. Drawn as strokes, like a pen.
const PATHS: Record<number, string[]> = {
  0: ["M24 24 L76 76", "M76 24 L24 76"],
  1: ["M50 20 A30 30 0 1 1 49.99 20"],
  2: ["M50 20 L82 76 L18 76 Z"],
  3: ["M26 24 H74 Q76 24 76 26 V74 Q76 76 74 76 H26 Q24 76 24 74 V26 Q24 24 26 24 Z"],
};

export function seatColor(seat: number) {
  return `var(--seat-${seat})`;
}

type Props = {
  seat: number;
  /** Animate the stroke being drawn. */
  draw?: boolean;
  className?: string;
  strokeWidth?: number;
  delay?: number;
};

export function Mark({ seat, draw = false, className, strokeWidth = 10, delay = 0 }: Props) {
  const paths = PATHS[seat] ?? PATHS[0];
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" style={{ color: seatColor(seat) }}>
      {paths.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={draw ? { pathLength: 0, opacity: 0 } : false}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            pathLength: { duration: seat === 0 ? 0.18 : 0.32, delay: delay + i * 0.14, ease: [0.65, 0, 0.35, 1] },
            opacity: { duration: 0.01, delay: delay + i * 0.14 },
          }}
        />
      ))}
    </svg>
  );
}
