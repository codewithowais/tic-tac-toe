"use client";

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { REACTIONS } from "@convex/lib/game";
import { errorMessage } from "@/lib/errors";
import { useSession } from "@/lib/session";
import { sounds } from "@/lib/sound";
import { useToast } from "../Toast";

type Bubble = { id: string; emoji: string; name: string; x: number; mine: boolean };

/** Floating emoji bubbles over the board. Only reactions that arrive after mount are shown. */
export function ReactionBubbles({ roomId, me }: { roomId: Id<"rooms">; me: Id<"players"> }) {
  const recent = useQuery(api.reactions.recent, { roomId });
  const seen = useRef<Set<string> | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useEffect(() => {
    if (!recent) return;
    if (seen.current === null) {
      seen.current = new Set(recent.map((r) => r._id));
      return;
    }
    const fresh = recent.filter((r) => !seen.current!.has(r._id)).reverse();
    if (fresh.length === 0) return;
    for (const r of fresh) seen.current.add(r._id);
    if (fresh.some((r) => r.playerId !== me)) sounds.pop();
    // New reactions arrive from the server subscription, so they're added to local state here.
    setBubbles((b) => [
      ...b,
      ...fresh.map((r) => ({
        id: r._id,
        emoji: r.emoji,
        name: r.name,
        x: 10 + Math.random() * 80,
        mine: r.playerId === me,
      })),
    ]);
  }, [recent, me]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
      <AnimatePresence>
        {bubbles.map((b) => (
          <motion.div
            key={b.id}
            className="absolute bottom-[8%] flex flex-col items-center"
            style={{ left: `${b.x}%` }}
            initial={{ opacity: 0, y: 20, scale: 0.4, x: "-50%" }}
            animate={{ opacity: [0, 1, 1, 0], y: -220, scale: [0.4, 1.15, 1, 0.9], x: "-50%" }}
            transition={{ duration: 2.4, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
            onAnimationComplete={() => setBubbles((all) => all.filter((x) => x.id !== b.id))}
          >
            <span className="text-5xl drop-shadow-sm">{b.emoji}</span>
            <span className="mt-1 rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-bg">
              {b.mine ? "You" : b.name}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ReactionBar({ code }: { code: string }) {
  const send = useMutation(api.reactions.send);
  const { token } = useSession();
  const toast = useToast();

  return (
    <div className="flex flex-wrap justify-center sm:gap-1" role="group" aria-label="Send a reaction">
      {REACTIONS.map((emoji) => (
        <motion.button
          key={emoji}
          type="button"
          whileTap={{ scale: 0.8 }}
          whileHover={{ y: -2 }}
          onClick={() => send({ token, code, emoji }).catch((e) => toast(errorMessage(e)))}
          className="flex h-11 w-10 items-center justify-center rounded-xl text-2xl sm:w-11 transition-colors hover:bg-surface-2"
          aria-label={`React with ${emoji}`}
        >
          {emoji}
        </motion.button>
      ))}
    </div>
  );
}
