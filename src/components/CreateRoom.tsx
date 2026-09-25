"use client";

import clsx from "clsx";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import {
  MAX_SIZE,
  MAX_WIN_LENGTH,
  MODES,
  TURN_SECONDS,
  normalizeCode,
  settingsError,
  type ModeKey,
} from "@convex/lib/game";
import { errorMessage } from "@/lib/errors";
import { useSession } from "@/lib/session";
import { sounds } from "@/lib/sound";
import { useToast } from "./Toast";
import { Button, Spinner } from "./ui";
import { Mark } from "./Mark";

type Choice = ModeKey | "custom";

const MODE_COPY: Record<ModeKey, { name: string; blurb: string }> = {
  classic: { name: "Classic", blurb: "2 players on 3×3, three in a row" },
  trio: { name: "Trio", blurb: "3 players on 4×4, three in a row" },
  squad: { name: "Squad", blurb: "4 players on 5×5, four in a row" },
};

/** A tiny board diagram: the grid size, with one mark per player. */
function MiniGrid({ size, players }: { size: number; players: number }) {
  const lines = [];
  for (let i = 1; i < size; i++) {
    const p = (i / size) * 100;
    lines.push(<line key={`v${i}`} x1={p} y1={4} x2={p} y2={96} />);
    lines.push(<line key={`h${i}`} x1={4} y1={p} x2={96} y2={p} />);
  }
  const cell = 100 / size;
  return (
    <svg viewBox="0 0 100 100" className="h-11 w-11 shrink-0" aria-hidden="true">
      <g className="text-grid" stroke="currentColor" strokeWidth={size > 4 ? 3 : 4} strokeLinecap="round">
        {lines}
      </g>
      {Array.from({ length: players }, (_, seat) => (
        <svg key={seat} x={seat * cell + cell * 0.12} y={cell * 0.12} width={cell * 0.76} height={cell * 0.76} viewBox="0 0 100 100">
          <Mark seat={seat} strokeWidth={16} className="h-full w-full" />
        </svg>
      ))}
    </svg>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  format = String,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const btn =
    "flex h-9 w-9 items-center justify-center rounded-lg text-lg font-semibold text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-30";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center gap-1">
        <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Fewer: ${label}`}>
          −
        </button>
        <span className="w-12 text-center font-display text-base font-semibold tabular-nums" aria-live="polite">
          {format(value)}
        </span>
        <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More: ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}

export function CreateRoom() {
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const createRoom = useMutation(api.rooms.create);

  const [name, setName] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>("classic");
  const [custom, setCustom] = useState({ maxPlayers: 2, size: 4, winLength: 3 });
  const [turnSeconds, setTurnSeconds] = useState<number>(30);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  // Show the stored nickname once the session has loaded, until the user edits it.
  const nameValue = name ?? session.name;
  const base = choice === "custom" ? custom : MODES[choice];
  const settings = { ...base, turnSeconds };
  const invalid = settingsError(settings);

  function updateCustom(patch: Partial<typeof custom>) {
    setCustom((c) => {
      const next = { ...c, ...patch };
      // Keep the board big enough for the players, and the win length within the board.
      if (next.maxPlayers > 2) next.size = Math.max(next.size, next.maxPlayers + 1);
      next.winLength = Math.min(Math.max(3, next.winLength), Math.min(next.size, MAX_WIN_LENGTH));
      return next;
    });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    sounds.unlock();
    if (!nameValue.trim()) return toast("Enter a nickname first");
    if (invalid) return toast(invalid);
    setBusy(true);
    try {
      await session.saveName(nameValue);
      const roomCode = await createRoom({ token: session.token, settings });
      router.push(`/r/${roomCode}`);
    } catch (err) {
      toast(errorMessage(err));
      setBusy(false);
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    sounds.unlock();
    const clean = normalizeCode(code);
    if (clean.length !== 4) return toast("Room codes are 4 characters");
    if (nameValue.trim() && nameValue.trim() !== session.name) {
      await session.saveName(nameValue).catch(() => {});
    }
    router.push(`/r/${clean}`);
  }

  return (
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-[0_1px_0_var(--line),0_24px_60px_-30px_color-mix(in_srgb,var(--ink)_30%,transparent)] sm:p-7">
      <form onSubmit={onCreate} className="flex flex-col gap-6">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Your nickname</span>
          <input
            value={nameValue}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="e.g. Owais"
            autoComplete="nickname"
            className="h-12 rounded-xl border border-line bg-bg px-4 text-base outline-none transition placeholder:text-muted/60 focus:border-focus"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Game</legend>
          <div role="radiogroup" aria-label="Game" className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(MODE_COPY) as ModeKey[]).map((key) => (
              <ModeOption
                key={key}
                selected={choice === key}
                onSelect={() => setChoice(key)}
                name={MODE_COPY[key].name}
                blurb={MODE_COPY[key].blurb}
                size={MODES[key].size}
                players={MODES[key].maxPlayers}
              />
            ))}
            <ModeOption
              selected={choice === "custom"}
              onSelect={() => setChoice("custom")}
              name="Custom"
              blurb="Pick players, board and win length"
              size={custom.size}
              players={custom.maxPlayers}
            />
          </div>

          <AnimatePresence initial={false}>
            {choice === "custom" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 36 }}
                className="overflow-hidden"
              >
                <div className="mt-2 flex flex-col gap-1 rounded-2xl bg-surface-2 px-4 py-3">
                  <Stepper label="Players" value={custom.maxPlayers} min={2} max={4} onChange={(v) => updateCustom({ maxPlayers: v })} />
                  <Stepper
                    label="Board"
                    value={custom.size}
                    min={custom.maxPlayers > 2 ? custom.maxPlayers + 1 : 3}
                    max={MAX_SIZE}
                    onChange={(v) => updateCustom({ size: v })}
                    format={(v) => `${v}×${v}`}
                  />
                  <Stepper
                    label="In a row to win"
                    value={custom.winLength}
                    min={3}
                    max={Math.min(custom.size, MAX_WIN_LENGTH)}
                    onChange={(v) => updateCustom({ winLength: v })}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Time per move</legend>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
            {TURN_SECONDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={turnSeconds === s}
                onClick={() => setTurnSeconds(s)}
                className={clsx(
                  "relative h-9 rounded-lg text-sm font-semibold transition",
                  turnSeconds === s ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                {turnSeconds === s && (
                  <motion.span
                    layoutId="timer-pill"
                    className="absolute inset-0 rounded-lg bg-surface shadow-sm"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative">{s} seconds</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">If time runs out, a random move is made for you.</p>
        </fieldset>

        <Button type="submit" size="lg" disabled={busy || !session.loaded}>
          {busy && <Spinner />}
          Create room
        </Button>
      </form>

      <form onSubmit={onJoin} className="mt-6 border-t border-line pt-6">
        <label htmlFor="join-code" className="text-sm font-medium">
          Got a room code?
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="join-code"
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value).slice(0, 4))}
            placeholder="K7QM"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 font-display text-lg font-semibold tracking-[0.2em] uppercase outline-none transition placeholder:font-normal placeholder:tracking-[0.2em] placeholder:text-muted/50 focus:border-focus"
          />
          <Button type="submit" variant="secondary" size="lg">
            Join
          </Button>
        </div>
      </form>
    </div>
  );
}

function ModeOption({
  selected,
  onSelect,
  name,
  blurb,
  size,
  players,
}: {
  selected: boolean;
  onSelect: () => void;
  name: string;
  blurb: string;
  size: number;
  players: number;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={clsx(
        "flex items-center gap-3 rounded-2xl border p-3 text-left transition",
        selected ? "border-ink bg-bg" : "border-line hover:border-grid",
      )}
    >
      <MiniGrid size={size} players={players} />
      <span className="min-w-0">
        <span className="block font-semibold">{name}</span>
        <span className="block text-xs leading-snug text-muted">{blurb}</span>
      </span>
    </button>
  );
}
