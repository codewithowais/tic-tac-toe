"use client";

import clsx from "clsx";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";
import { useSession } from "@/lib/session";
import { sounds } from "@/lib/sound";
import { useToast } from "../Toast";
import type { RoomState } from "./types";

const MAX_LENGTH = 200;

type Message = {
  _id: Id<"messages">;
  playerId: Id<"players">;
  name: string;
  text: string;
  createdAt: number;
};

function timeLabel(ms: number) {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function MessageList({ messages, room, me }: { messages: Message[] | undefined; room: RoomState; me: Id<"players"> }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Stay scrolled to the newest message, unless the reader has scrolled up.
  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (messages === undefined) return <div className="flex-1" />;

  const seatOf = (playerId: Id<"players">) => room.seats.findIndex((s) => s.playerId === playerId);

  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3"
      role="log"
      aria-live="polite"
      aria-label="Chat messages"
    >
      {messages.length === 0 ? (
        <p className="m-auto max-w-[14rem] text-center text-sm text-muted">
          Say hi. Everyone in the room, including people watching, can see the chat.
        </p>
      ) : (
        messages.map((m, i) => {
          const mine = m.playerId === me;
          const seat = seatOf(m.playerId);
          const sameAsPrevious = i > 0 && messages[i - 1].playerId === m.playerId && m.createdAt - messages[i - 1].createdAt < 120_000;
          return (
            <div key={m._id} className={clsx("flex flex-col", mine ? "items-end" : "items-start", sameAsPrevious && "-mt-1")}>
              {!sameAsPrevious && (
                <div className="mb-0.5 flex items-baseline gap-2 px-1 text-xs">
                  <span className="font-semibold" style={seat >= 0 ? { color: `var(--seat-${seat})` } : undefined}>
                    {mine ? "You" : m.name}
                  </span>
                  <span className="text-muted">{timeLabel(m.createdAt)}</span>
                </div>
              )}
              <p
                className={clsx(
                  "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm",
                  mine ? "rounded-br-md bg-ink text-bg" : "rounded-bl-md bg-surface-2",
                )}
              >
                {m.text}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}

function Composer({ code, autoFocus }: { code: string; autoFocus?: boolean }) {
  const { token } = useSession();
  const send = useMutation(api.chat.send);
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await send({ token, code, text: clean });
      setText("");
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const left = MAX_LENGTH - text.length;
  return (
    <form onSubmit={submit} className="flex items-center gap-2 border-t border-line p-2">
      <input
        value={text}
        autoFocus={autoFocus}
        maxLength={MAX_LENGTH}
        onChange={(e) => setText(e.target.value)}
        placeholder="Message"
        aria-label="Chat message"
        enterKeyHint="send"
        className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-sm outline-none transition focus:border-focus"
      />
      {left <= 30 && <span className={clsx("text-xs tabular-nums", left <= 10 ? "text-[var(--seat-1)]" : "text-muted")}>{left}</span>}
      <button
        type="submit"
        disabled={!text.trim() || busy}
        aria-label="Send message"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-bg transition active:scale-95 disabled:opacity-30"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
}

function Panel({ room, me, messages, autoFocus, onClose }: {
  room: RoomState;
  me: Id<"players">;
  messages: Message[] | undefined;
  autoFocus?: boolean;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="font-display text-lg font-bold tracking-tight">Chat</h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close chat" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </div>
      <MessageList messages={messages} room={room} me={me} />
      <Composer code={room.code} autoFocus={autoFocus} />
    </div>
  );
}

/**
 * Room chat: a side column on wide screens, and a button with an unread badge
 * that opens a bottom sheet on smaller ones.
 */
export function Chat({ room, me }: { room: RoomState; me: Id<"players"> }) {
  const messages = useQuery(api.chat.list, { roomId: room._id });
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [unread, setUnread] = useState(0);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const mq = matchMedia("(min-width: 1280px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const visible = wide || open;

  // Count messages from others that arrived while the chat wasn't visible, and blip for them.
  useEffect(() => {
    if (!messages) return;
    if (seen.current === null) {
      seen.current = new Set(messages.map((m) => m._id));
      return;
    }
    const fresh = messages.filter((m) => !seen.current!.has(m._id));
    for (const m of fresh) seen.current.add(m._id);
    const fromOthers = fresh.filter((m) => m.playerId !== me).length;
    if (fromOthers === 0) return;
    sounds.pop();
    // New messages arrive from the server subscription, so the badge is updated here.
    if (!visible) setUnread((n) => n + fromOthers);
  }, [messages, me, visible]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (visible) setUnread(0);
  }, [visible]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (wide) {
    return (
      <aside className="sticky top-4 flex h-[calc(100dvh-6.5rem)] w-80 shrink-0 flex-col" aria-label="Chat">
        <Panel room={room} me={me} messages={messages} />
      </aside>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `Open chat, ${unread} unread` : "Open chat"}
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-bg shadow-lg transition active:scale-95"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-bg bg-[var(--seat-1)] px-1.5 text-xs font-bold text-white tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              role="dialog"
              aria-label="Chat"
              className="fixed inset-x-0 bottom-0 z-50 mx-auto h-[70dvh] w-full max-w-lg p-2 sm:bottom-4"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 40 }}
            >
              <Panel room={room} me={me} messages={messages} autoFocus onClose={() => setOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
