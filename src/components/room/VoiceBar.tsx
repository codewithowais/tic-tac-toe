"use client";

import clsx from "clsx";
import type { Id } from "@convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";
import type { Voice } from "@/lib/useVoice";
import { useToast } from "../Toast";
import { Spinner } from "../ui";
import type { RoomState } from "./types";

function MicIcon({ off = false }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

function listNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Join / mute / leave the room's live voice call, and see who's talking. */
export function VoiceBar({ voice, room, me }: { voice: Voice; room: RoomState; me: Id<"players"> }) {
  const toast = useToast();
  const seatOf = (id: string) => room.seats.findIndex((s) => s.playerId === id);

  if (!voice.joined) {
    const inCall = voice.members.filter((m) => m.playerId !== me).map((m) => m.name);
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <button
          type="button"
          disabled={voice.joining}
          onClick={() => voice.join().catch((e) => toast(errorMessage(e)))}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-4 font-semibold transition hover:bg-surface-2 disabled:opacity-50"
        >
          {voice.joining ? <Spinner /> : <MicIcon />}
          Join voice
        </button>
        <span className="text-muted">
          {inCall.length === 0 ? "Talk while you play" : `${listNames(inCall)} ${inCall.length === 1 ? "is" : "are"} in voice`}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-sm" role="group" aria-label="Voice call">
      <button
        type="button"
        onClick={voice.toggleMute}
        disabled={voice.listenOnly}
        aria-pressed={voice.muted}
        title={voice.listenOnly ? "No microphone, so you're listening only" : undefined}
        className={clsx(
          "inline-flex h-9 items-center gap-2 rounded-full px-4 font-semibold transition disabled:opacity-60",
          voice.muted || voice.listenOnly ? "bg-[var(--seat-1)] text-white" : "bg-ink text-bg",
        )}
      >
        <MicIcon off={voice.muted || voice.listenOnly} />
        {voice.listenOnly ? "Listening only" : voice.muted ? "Unmute" : "Mute"}
      </button>

      <ul className="flex flex-wrap items-center gap-1.5" aria-label="In voice">
        {voice.members.map((m) => {
          const isMe = m.playerId === me;
          const status = isMe ? "connected" : voice.peers[m.playerId];
          const talking = voice.speaking.has(m.playerId);
          const seat = seatOf(m.playerId);
          const color = seat >= 0 ? `var(--seat-${seat})` : "var(--ink)";
          return (
            <li
              key={m.playerId}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 transition-shadow"
              style={talking ? { boxShadow: `0 0 0 2px ${color}, 0 0 12px 2px color-mix(in srgb, ${color} 45%, transparent)` } : undefined}
            >
              <span className="font-medium" style={{ color: seat >= 0 ? color : undefined }}>
                {isMe ? "You" : m.name}
              </span>
              {m.muted && <span className="text-muted" title="Muted"><MicIcon off /></span>}
              {!isMe && status === "connecting" && <span className="text-xs text-muted">connecting…</span>}
              {!isMe && status === "failed" && (
                <span className="text-xs font-medium text-[var(--seat-1)]" title="Their network blocks direct calls">
                  can&rsquo;t connect
                </span>
              )}
              <span className="sr-only">{talking ? "talking" : ""}</span>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={voice.leave}
        className="inline-flex h-9 items-center rounded-full px-3 font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"
      >
        Leave voice
      </button>
    </div>
  );
}
