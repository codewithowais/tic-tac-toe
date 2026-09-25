"use client";

import clsx from "clsx";
import { motion } from "motion/react";

type Option<T> = { value: T; label: string };

/** A row of mutually exclusive buttons with a sliding highlight. `id` must be unique on the page. */
export function Segmented<T extends string | number>({
  id,
  label,
  options,
  value,
  onChange,
  size = "md",
}: {
  id: string;
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1 rounded-xl bg-surface-2 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.label}
            onClick={() => onChange(o.value)}
            className={clsx(
              "relative rounded-lg font-semibold transition",
              size === "sm" ? "h-8 text-xs" : "h-9 text-sm",
              selected ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {selected && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-lg bg-surface shadow-sm"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
