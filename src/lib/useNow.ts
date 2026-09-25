"use client";

import { useEffect, useState } from "react";

/** Re-renders every `interval` ms while `active`, returning the current time. */
export function useNow(interval: number, active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval, active]);
  return now;
}
