"use client";

import usePresence from "@convex-dev/presence/react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { BotLevel } from "@convex/lib/bot";
import { BOT_LABELS, BOT_LEVELS } from "@convex/lib/bot";
import { normalizeCode } from "@convex/lib/game";
import { errorMessage } from "@/lib/errors";
import { useSession } from "@/lib/session";
import { sounds } from "@/lib/sound";
import { announce } from "@/lib/speech";
import { useTurnAlerts } from "@/lib/useTurnAlerts";
import { Board } from "../Board";
import { GridLines } from "../GridLines";
import { Header } from "../Header";
import { Mark } from "../Mark";
import { useToast } from "../Toast";
import { Button, Spinner } from "../ui";
import { NameEditor } from "./NameEditor";
import { PlayerStrip } from "./PlayerStrip";
import { ReactionBar, ReactionBubbles } from "./Reactions";
import type { RoomState } from "./types";

export function RoomView({ code: rawCode }: { code: string }) {
  const code = normalizeCode(rawCode);
  const session = useSession();
  const room = useQuery(api.rooms.get, { code });

  let body;
  if (!session.loaded || room === undefined || (session.name && !session.playerId)) {
    body = (
      <div className="flex flex-1 items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  } else if (room === null) {
    body = <NotFound code={code} />;
  } else if (!session.playerId) {
    body = <NamePrompt code={code} />;
  } else {
    body = <LiveRoom room={room} me={session.playerId} />;
  }

  return (
    <>
      <Header>{room && <ShareButton code={room.code} />}</Header>
      {body}
    </>
  );
}

function ShareButton({ code }: { code: string }) {
  const toast = useToast();

  async function share() {
    const url = `${location.origin}/r/${code}`;
    const touch = matchMedia("(pointer: coarse)").matches;
    if (touch && navigator.share) {
      try {
        await navigator.share({ title: "Play tic-tac-toe with me", url });
        return;
      } catch {
        // Share sheet dismissed: fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast(`Share this link: ${url}`);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="mr-1 flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 transition hover:bg-surface-2"
      aria-label={`Copy link to room ${code}`}
    >
      <span className="font-display text-base font-bold tracking-[0.15em]">{code}</span>
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="12" height="12" rx="2" />
        <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
      </svg>
    </button>
  );
}

function NotFound({ code }: { code: string }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-start justify-center gap-4 px-4 pb-24">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">No room called {code}</h1>
      <p className="text-muted">
        Check the code for typos. Rooms are deleted after a day without any play.
      </p>
      <Link href="/" className="mt-2 inline-flex h-12 items-center rounded-xl bg-ink px-6 font-semibold text-bg">
        Create a room
      </Link>
    </main>
  );
}

function NamePrompt({ code }: { code: string }) {
  const session = useSession();
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    sounds.unlock();
    if (!name.trim()) return toast("Enter a nickname first");
    setBusy(true);
    try {
      await session.saveName(name);
    } catch (err) {
      toast(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-24">
      <form onSubmit={submit} className="flex flex-col gap-5 rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">You&rsquo;re invited to room {code}</h1>
          <p className="mt-2 text-muted">Pick a nickname so the others know who you are.</p>
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          placeholder="Your nickname"
          autoComplete="nickname"
          className="h-12 rounded-xl border border-line bg-bg px-4 text-base outline-none transition placeholder:text-muted/60 focus:border-focus"
        />
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Spinner />}
          Enter room
        </Button>
      </form>
    </main>
  );
}

function LiveRoom({ room, me }: { room: RoomState; me: Id<"players"> }) {
  const { token, name: myName } = useSession();
  const toast = useToast();
  const [editingName, setEditingName] = useState(false);
  const join = useMutation(api.rooms.join);
  const leave = useMutation(api.rooms.leave);
  const kick = useMutation(api.rooms.kick);
  const addBot = useMutation(api.rooms.addBot);
  const rematch = useMutation(api.game.rematch);
  const move = useMutation(api.game.move).withOptimisticUpdate((store, { code, cell }) => {
    const current = store.getQuery(api.rooms.get, { code });
    if (!current || current.board[cell] !== null) return;
    const board = [...current.board];
    board[cell] = current.turn;
    // Hand the turn on immediately so a quick double-tap can't send a second move.
    const turn = (current.turn + 1) % current.seats.length;
    store.setQuery(api.rooms.get, { code }, { ...current, board, turn, lastMove: cell });
  });

  const presence = usePresence(api.presence, room.code, me);
  const online = useMemo(() => new Set((presence ?? []).filter((p) => p.online).map((p) => p.userId)), [presence]);
  const seatedIds = new Set(room.seats.map((s) => s.playerId));
  const watching = [...online].filter((id) => !seatedIds.has(id as Id<"players">)).length;

  const mySeat = room.seats.findIndex((s) => s.playerId === me);
  const seated = mySeat !== -1;
  const myTurn = room.status === "playing" && room.turn === mySeat;
  const openSeats = room.settings.maxPlayers - room.seats.length;

  const run = (p: Promise<unknown>) => p.catch((e) => toast(errorMessage(e)));

  // Take a seat automatically the first time you open a room with space. Only ever once:
  // once you've had a seat (joined, created the room, or used "Take a seat"), losing it
  // because you left or the host removed you must not grab it straight back.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (seated) autoJoined.current = true;
    if (autoJoined.current || seated || room.status !== "lobby" || openSeats <= 0) return;
    autoJoined.current = true;
    join({ token, code: room.code }).catch((e) => toast(errorMessage(e)));
  }, [seated, room.status, openSeats, join, token, room.code, toast]);

  // Sounds for moves and results.
  const prev = useRef({ moveCount: room.moveCount, status: room.status, round: room.round });
  useEffect(() => {
    const p = prev.current;
    if (room.round === p.round && room.moveCount > p.moveCount && room.lastMove !== null) {
      const seat = room.board[room.lastMove];
      if (seat !== null) sounds.move(seat);
    }
    if (room.status === "finished" && p.status === "playing") {
      setTimeout(() => (room.winner !== null ? sounds.win() : sounds.draw()), 250);
      // Seated players also hear the result, after the jingle.
      if (mySeat !== -1) {
        const moment = room.winner === null ? "draw" : room.winner === mySeat ? "win" : "lose";
        const winner = room.winner === null ? undefined : room.seats[room.winner]?.name;
        setTimeout(() => announce(moment, { winner }), 1100);
      }
    }
    prev.current = { moveCount: room.moveCount, status: room.status, round: room.round };
  }, [room.moveCount, room.status, room.round, room.lastMove, room.board, room.winner, room.seats, mySeat]);

  // Announce people who take a seat while you're playing (not computers, which the host adds).
  const prevSeatIds = useRef(room.seats.map((s) => s.playerId));
  useEffect(() => {
    const before = prevSeatIds.current;
    prevSeatIds.current = room.seats.map((s) => s.playerId);
    if (mySeat === -1) return;
    const newcomers = room.seats.filter((s) => !s.bot && s.playerId !== me && !before.includes(s.playerId));
    if (newcomers.length > 0) announce("joined", { name: newcomers[newcomers.length - 1].name });
  }, [room.seats, mySeat, me]);

  useTurnAlerts(myTurn, room.turnEndsAt);

  // Nudge in the tab title when it's your move.
  useEffect(() => {
    document.title = myTurn ? "Your turn · tic tac toe" : `Room ${room.code} · tic tac toe`;
  }, [myTurn, room.code]);

  const status = statusText(room, mySeat);
  const iAmReady = room.rematch.includes(me);
  const waitingFor = room.seats.filter((s) => !s.bot && !room.rematch.includes(s.playerId)).map((s) => s.name);

  return (
    <main className={`mx-auto flex w-full flex-1 flex-col gap-5 px-4 pb-10 sm:px-6 ${room.settings.maxPlayers > 3 ? "max-w-4xl" : "max-w-2xl"}`}>
      <PlayerStrip room={room} me={me} online={online} onKick={(playerId) => run(kick({ token, code: room.code, playerId }))} />

      <div className="relative mx-auto w-full max-w-[min(100%,560px,calc(100dvh-340px))] min-w-[260px]">
        {room.status === "lobby" ? (
          <Lobby
            room={room}
            openSeats={openSeats}
            isHost={room.hostId === me}
            onAddBot={(level) => run(addBot({ token, code: room.code, level }))}
          />
        ) : (
          <Board
            key={room.round}
            size={room.settings.size}
            board={room.board}
            mySeat={seated ? mySeat : null}
            canPlay={myTurn}
            winLine={room.winLine}
            winner={room.winner}
            onPlay={(cell) => {
              sounds.unlock();
              run(move({ token, code: room.code, cell }));
            }}
          />
        )}
        <ReactionBubbles roomId={room._id} me={me} />
      </div>

      <div className="flex min-h-[88px] flex-col items-center gap-3 text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={status.text}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="font-display text-2xl font-bold tracking-tight"
            style={status.seat !== null ? { color: `var(--seat-${status.seat})` } : undefined}
            aria-live="polite"
          >
            {status.text}
          </motion.p>
        </AnimatePresence>

        {room.status === "finished" && seated && (
          <div className="flex flex-col items-center gap-2">
            <Button size="lg" onClick={() => run(rematch({ token, code: room.code }))} disabled={iAmReady}>
              {iAmReady ? "Ready" : "Play again"}
            </Button>
            {iAmReady && waitingFor.length > 0 && (
              <p className="text-sm text-muted">Waiting for {listNames(waitingFor)}</p>
            )}
            <Link href="/leaderboard" className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
              See the leaderboard
            </Link>
          </div>
        )}

        {!seated && room.status === "lobby" && openSeats > 0 && (
          <Button size="lg" onClick={() => run(join({ token, code: room.code }))}>
            Take a seat
          </Button>
        )}

        {!seated && room.status !== "lobby" && <p className="text-sm text-muted">You&rsquo;re watching this game.</p>}
      </div>

      <ReactionBar code={room.code} />

      <footer className="mt-auto flex items-center justify-between gap-4 border-t border-line pt-4 text-sm text-muted">
        <span>
          {room.settings.winLength} in a row wins
          {room.draws > 0 && `, ${room.draws} ${room.draws === 1 ? "draw" : "draws"} so far`}
          {watching > 0 && `, ${watching} watching`}
        </span>
        {seated ? (
          <button
            type="button"
            className="shrink-0 underline-offset-2 hover:text-ink hover:underline"
            onClick={() => {
              autoJoined.current = true;
              run(leave({ token, code: room.code }));
            }}
          >
            Leave seat
          </button>
        ) : editingName ? (
          <NameEditor onDone={() => setEditingName(false)} className="w-40 text-ink" />
        ) : (
          <button
            type="button"
            className="shrink-0 underline-offset-2 hover:text-ink hover:underline"
            onClick={() => setEditingName(true)}
          >
            Watching as {myName}. Change name
          </button>
        )}
      </footer>
    </main>
  );
}

function Lobby({
  room,
  openSeats,
  isHost,
  onAddBot,
}: {
  room: RoomState;
  openSeats: number;
  isHost: boolean;
  onAddBot: (level: BotLevel) => void;
}) {
  return (
    <div className="relative aspect-square w-full">
      <div className="absolute inset-0 opacity-50 [mask-image:radial-gradient(circle,transparent_32%,black_72%)]">
        <GridLines size={room.settings.size} animate />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex gap-1">
          {Array.from({ length: room.settings.maxPlayers }, (_, i) => (
            <motion.span
              key={i}
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
            >
              <Mark seat={i} strokeWidth={12} className="h-8 w-8" />
            </motion.span>
          ))}
        </div>
        <p className="font-display text-[clamp(3rem,14vw,5.5rem)] font-extrabold leading-none tracking-[0.12em]">{room.code}</p>
        <p className="max-w-xs text-muted text-pretty">
          Send the link or this code to {openSeats === 1 ? "one more friend" : `${openSeats} friends`}. The game starts
          when every seat is filled.
        </p>
        {isHost && openSeats > 0 && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm text-muted">Or fill a seat with a computer</span>
            <div className="flex gap-1.5">
              {BOT_LEVELS.map((level) => (
                <Button key={level} variant="secondary" onClick={() => onAddBot(level)}>
                  {BOT_LABELS[level]}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function statusText(room: RoomState, mySeat: number): { text: string; seat: number | null } {
  const name = (seat: number) => room.seats[seat]?.name ?? "Someone";
  if (room.status === "lobby") {
    const open = room.settings.maxPlayers - room.seats.length;
    return { text: `Waiting for ${open} more ${open === 1 ? "player" : "players"}`, seat: null };
  }
  if (room.status === "playing") {
    if (room.turn === mySeat) return { text: "Your turn", seat: mySeat };
    if (room.seats[room.turn]?.bot) return { text: `${name(room.turn)} is thinking`, seat: room.turn };
    return { text: `${name(room.turn)}'s turn`, seat: room.turn };
  }
  if (room.winner === null) return { text: "It's a draw", seat: null };
  if (room.winner === mySeat) return { text: "You win this round", seat: mySeat };
  return { text: `${name(room.winner)} wins this round`, seat: room.winner };
}

function listNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
