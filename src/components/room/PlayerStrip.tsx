"use client";

import clsx from "clsx";
import { motion } from "motion/react";
import { useState } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/useNow";
import { Mark, seatColor } from "../Mark";
import { NameEditor } from "./NameEditor";
import type { RoomState } from "./types";

type Props = {
  room: RoomState;
  me: Id<"players">;
  online: Set<string>;
  /** Players currently talking in the voice call. */
  speaking?: Set<string>;
  onKick: (playerId: Id<"players">) => void;
};

export function PlayerStrip({ room, me, online, speaking, onKick }: Props) {
  const slots = Array.from({ length: room.settings.maxPlayers }, (_, i) => room.seats[i] ?? null);
  const isHost = room.hostId === me;
  return (
    // As many columns as fit, from 2 on a phone to 5 on a wide screen; a few players stretch to fill the row.
    <ol className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(9.5rem, 1fr))" }} aria-label="Players">
      {slots.map((seat, i) =>
        seat ? (
          <PlayerChip
            key={seat.playerId}
            index={i}
            room={room}
            name={seat.name}
            score={seat.score}
            isMe={seat.playerId === me}
            isHost={seat.playerId === room.hostId}
            bot={seat.bot !== undefined}
            talking={speaking?.has(seat.playerId) ?? false}
            online={seat.bot !== undefined || online.has(seat.playerId)}
            ready={room.status === "finished" && (seat.bot !== undefined || room.rematch.includes(seat.playerId))}
            canKick={
              isHost &&
              seat.playerId !== me &&
              // Computers can be removed between rounds; offline humans at any time.
              (seat.bot !== undefined ? room.status !== "playing" : !online.has(seat.playerId))
            }
            onKick={() => onKick(seat.playerId)}
          />
        ) : (
          <li
            key={`empty-${i}`}
            className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-dashed border-grid px-3 py-2.5 text-muted"
          >
            <Mark seat={i} strokeWidth={12} className="h-7 w-7 shrink-0 opacity-30" />
            <span className="text-sm">Open seat</span>
          </li>
        ),
      )}
    </ol>
  );
}

function PlayerChip({
  index,
  room,
  name,
  score,
  isMe,
  isHost,
  bot,
  talking,
  online,
  ready,
  canKick,
  onKick,
}: {
  index: number;
  room: RoomState;
  name: string;
  score: number;
  isMe: boolean;
  isHost: boolean;
  bot: boolean;
  talking: boolean;
  online: boolean;
  ready: boolean;
  canKick: boolean;
  onKick: () => void;
}) {
  const [editing, setEditing] = useState(false);
  // Crowded rooms get tighter cards whose names wrap instead of being cut off.
  const compact = room.settings.maxPlayers > 4;
  const active = room.status === "playing" && room.turn === index;
  const won = room.status === "finished" && room.winner === index;
  const color = seatColor(index);

  // What goes under the name. Crowded rooms leave out the always-true captions to save space.
  const subtitle = active && bot ? (
    <Thinking />
  ) : active ? (
    <TurnClock endsAt={room.turnEndsAt} />
  ) : ready && !bot ? (
    <span className="font-medium text-ink">{compact ? "Ready" : "Ready for another round"}</span>
  ) : won ? (
    <span style={{ color }}>Won the round</span>
  ) : !online ? (
    "Offline"
  ) : isMe ? (
    "You"
  ) : bot ? (
    compact ? null : "Computer"
  ) : compact ? null : (
    "\u00a0"
  );

  return (
    <li
      className={clsx(
        "relative flex items-center overflow-hidden rounded-2xl border bg-surface transition-[border-color,box-shadow] duration-300",
        compact ? "min-h-[64px] gap-2 px-2.5 py-2" : "min-h-[76px] gap-2.5 px-3 py-2.5",
        !active && !won && "border-line",
        canKick && "pr-8",
      )}
      style={
        active || won
          ? { borderColor: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 18%, transparent)` }
          : undefined
      }
      aria-current={active ? "step" : undefined}
    >
      <div className="relative shrink-0">
        <Mark seat={index} strokeWidth={12} className={compact ? "h-6 w-6" : "h-7 w-7"} />
        {bot ? (
          <span
            className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface bg-ink text-bg"
            title="Computer"
          >
            <BotIcon />
          </span>
        ) : (
          <span
            className={clsx(
              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface",
              online ? "bg-[#22c55e]" : "bg-grid",
            )}
            title={online ? "Online" : "Offline"}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className={clsx("flex gap-1", compact ? "items-start" : "items-center")}>
          {editing ? (
            <NameEditor onDone={() => setEditing(false)} className="w-full" />
          ) : (
            <span
              className={clsx(
                "font-semibold",
                compact ? "line-clamp-2 min-w-0 text-sm leading-tight [overflow-wrap:anywhere]" : "truncate",
              )}
            >
              {name}
            </span>
          )}
          {isMe && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Change your name"
              title="Change your name"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
                <path d="m13.5 6.5 4 4" />
              </svg>
            </button>
          )}
          {talking && !editing && (
            <span className="flex h-3.5 shrink-0 items-end gap-[2px]" style={{ color }} aria-label="Talking">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-[3px] rounded-full bg-current"
                  animate={{ height: ["35%", "100%", "35%"] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12 }}
                />
              ))}
            </span>
          )}
          {isHost && !editing && (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-muted" fill="currentColor" aria-label="Host">
              <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" />
            </svg>
          )}
        </div>
        {subtitle !== null && <div className={clsx("text-xs text-muted", compact && "mt-0.5")}>{subtitle}</div>}
      </div>

      <motion.span
        key={score}
        initial={{ scale: 1.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 18 }}
        className={clsx("font-display font-bold tabular-nums leading-none", compact ? "text-xl" : room.settings.maxPlayers > 3 ? "text-2xl" : "text-3xl")}
        aria-label={`${score} wins`}
      >
        {score}
      </motion.span>

      {canKick && (
        <button
          type="button"
          onClick={onKick}
          aria-label={`Remove ${name} from the room`}
          title={`Remove ${name}`}
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}

      {active && room.turnEndsAt && <TimerBar key={`${room.round}-${room.moveCount}`} endsAt={room.turnEndsAt} total={room.settings.turnSeconds} color={color} />}
    </li>
  );
}

function TurnClock({ endsAt }: { endsAt: number | null }) {
  const { clockOffset } = useSession();
  const now = useNow(250) + clockOffset;
  if (!endsAt) return null;
  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return (
    <span className={clsx("tabular-nums", seconds <= 5 && "font-semibold text-[var(--seat-1)]")}>
      {seconds}s left
    </span>
  );
}

function TimerBar({ endsAt, total, color }: { endsAt: number; total: number; color: string }) {
  const { clockOffset } = useSession();
  // Computed once per turn: the bar then animates linearly to empty.
  const [remaining] = useState(() => Math.max(0, endsAt - (Date.now() + clockOffset)));
  const fraction = Math.min(1, remaining / (total * 1000));
  return (
    <motion.span
      className="absolute bottom-0 left-0 h-1 origin-left"
      style={{ backgroundColor: color, width: "100%" }}
      initial={{ scaleX: fraction }}
      animate={{ scaleX: 0 }}
      transition={{ duration: remaining / 1000, ease: "linear" }}
      aria-hidden="true"
    />
  );
}

function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
      <path d="M11 2h2v3h4a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h4V2Zm-2 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
    </svg>
  );
}

function Thinking() {
  return (
    <span className="inline-flex items-center gap-1">
      Thinking
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-1 w-1 rounded-full bg-current"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}
