"use client";

import clsx from "clsx";
import { useRef, useState, type KeyboardEvent } from "react";
import { errorMessage } from "@/lib/errors";
import { useSession } from "@/lib/session";
import { useToast } from "../Toast";

/**
 * Inline nickname field. Enter or clicking away saves; Escape cancels.
 * Calls `onDone` when editing ends either way.
 */
export function NameEditor({ onDone, className }: { onDone: () => void; className?: string }) {
  const { name, saveName } = useSession();
  const toast = useToast();
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const finished = useRef(false);

  async function save() {
    if (finished.current) return;
    finished.current = true;
    const next = value.trim();
    if (!next || next === name) return onDone();
    setSaving(true);
    try {
      await saveName(next);
      toast("Name changed");
    } catch (err) {
      toast(errorMessage(err));
    }
    onDone();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      finished.current = true;
      onDone();
    }
  }

  return (
    <input
      autoFocus
      value={value}
      maxLength={20}
      disabled={saving}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => void save()}
      onFocus={(e) => e.target.select()}
      aria-label="Your nickname. Press Enter to save or Escape to cancel."
      className={clsx(
        "h-7 min-w-0 rounded-md border border-focus bg-bg px-2 text-sm font-semibold outline-none disabled:opacity-60",
        className,
      )}
    />
  );
}
