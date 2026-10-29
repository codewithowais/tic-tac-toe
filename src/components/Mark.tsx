"use client";

import { motion } from "motion/react";
import { MARK_PATHS } from "@/lib/markPaths";

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
  const paths = MARK_PATHS[seat] ?? MARK_PATHS[0];
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
