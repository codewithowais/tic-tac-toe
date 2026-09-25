"use client";

import clsx from "clsx";
import { useQuery } from "convex/react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { weekKey } from "@convex/lib/stats";
import { useSession } from "@/lib/session";
import { Segmented } from "./Segmented";

type Tab = "week" | "all";

export function Leaderboard() {
  const { playerId } = useSession();
  const [tab, setTab] = useState<Tab>("week");
  // Computed on the client (once per visit) so the weekly board rolls over on Monday without a stale cache.
  const [thisWeek] = useState(() => weekKey(Date.now()));
  const period = tab === "all" ? "all" : thisWeek;
  const data = useQuery(api.leaderboard.top, { period, playerId: playerId ?? undefined });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-16 pt-4 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[clamp(2.5rem,7vw,3.75rem)] font-extrabold leading-none tracking-[-0.035em]">
          Leaderboard
        </h1>
        <p className="text-muted">
          {tab === "week"
            ? "Wins since Monday. The weekly board starts fresh every Monday."
            : "Every win since the leaderboard began."}
        </p>
      </div>

      <div className="max-w-xs">
        <Segmented
          id="board-period"
          label="Leaderboard period"
          value={tab}
          onChange={setTab}
          options={[
            { value: "week", label: "This week" },
            { value: "all", label: "All time" },
          ]}
        />
      </div>

      {data === undefined ? (
        <SkeletonRows />
      ) : data.rows.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-3xl border border-dashed border-grid p-8">
          <p className="font-display text-2xl font-bold tracking-tight">
            {tab === "week" ? "No wins yet this week" : "No wins yet"}
          </p>
          <p className="text-muted">Win a round and your name goes up here.</p>
          <Link href="/" className="inline-flex h-11 items-center rounded-xl bg-ink px-5 font-semibold text-bg">
            Start a game
          </Link>
        </div>
      ) : (
        <>
          <ol className="flex flex-col" aria-label={tab === "week" ? "This week's leaderboard" : "All-time leaderboard"}>
            <li className="grid grid-cols-[3rem_1fr_4rem_4rem] items-center gap-2 px-3 pb-2 text-xs font-medium text-muted sm:grid-cols-[3.5rem_1fr_5rem_5rem_5rem]">
              <span>Rank</span>
              <span>Player</span>
              <span className="text-right">Wins</span>
              <span className="hidden text-right sm:block">Games</span>
              <span className="text-right">Win rate</span>
            </li>
            {data.rows.map((row, i) => (
              <motion.li
                key={row.playerId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.025 }}
                className={clsx(
                  "grid grid-cols-[3rem_1fr_4rem_4rem] items-center gap-2 border-t border-line px-3 py-3 sm:grid-cols-[3.5rem_1fr_5rem_5rem_5rem]",
                  row.playerId === playerId && "rounded-xl border-transparent bg-surface-2",
                )}
                aria-current={row.playerId === playerId ? "true" : undefined}
              >
                <Rank rank={row.rank} />
                <span className="flex min-w-0 items-center gap-2">
                  <span className={clsx("truncate", row.rank <= 3 ? "font-semibold" : "font-medium")}>{row.name}</span>
                  {row.playerId === playerId && (
                    <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-bg">You</span>
                  )}
                </span>
                <span className="text-right font-display text-xl font-bold tabular-nums">{row.wins}</span>
                <span className="hidden text-right tabular-nums text-muted sm:block">{row.games}</span>
                <span className="text-right tabular-nums text-muted">{row.winRate}%</span>
              </motion.li>
            ))}
          </ol>

          {data.me && data.me.rank === null && (
            <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm">
              You have <strong>{data.me.wins}</strong> {data.me.wins === 1 ? "win" : "wins"} from {data.me.games}{" "}
              {data.me.games === 1 ? "game" : "games"}. Keep playing to reach the top 25.
            </p>
          )}
        </>
      )}

      <p className="text-xs text-muted">
        Draws count as half a win in the win rate. Wins against the computer count too.
      </p>
    </main>
  );
}

/** Rank number. First place gets a red-pen circle drawn around it. */
function Rank({ rank }: { rank: number }) {
  return (
    <span className="relative flex h-10 w-10 items-center justify-center">
      <span
        className={clsx(
          "relative z-10 font-display tabular-nums",
          rank === 1 ? "text-2xl font-extrabold" : rank <= 3 ? "text-xl font-bold" : "text-base font-semibold text-muted",
        )}
      >
        {rank}
      </span>
      {rank === 1 && (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <motion.path
            d="M52 10 C 80 8, 94 32, 90 55 C 86 80, 60 94, 38 88 C 14 82, 4 58, 12 34 C 18 18, 34 10, 58 13"
            fill="none"
            stroke="var(--seat-1)"
            strokeWidth={6}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.65, 0, 0.35, 1] }}
          />
        </svg>
      )}
    </span>
  );
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-2" style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}
