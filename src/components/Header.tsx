"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { isMuted, setMuted, sounds } from "@/lib/sound";
import { isVoiceOn, setVoiceOn, speak, speechSupported } from "@/lib/speech";
import { Mark } from "./Mark";

/** `compact` hides the text on small screens, for headers that also hold the room code. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="Tic-tac-toe home">
      <span className="flex -space-x-1.5">
        <Mark seat={0} strokeWidth={13} className="h-6 w-6 transition-transform group-hover:-rotate-12" />
        <Mark seat={1} strokeWidth={13} className="h-6 w-6 transition-transform group-hover:rotate-12" />
      </span>
      <span className={`font-display text-lg font-bold tracking-tight ${compact ? "hidden sm:inline" : ""}`}>
        tic tac toe
      </span>
    </Link>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink"
    >
      {children}
    </button>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const explicit = document.documentElement.dataset.theme;
    // Reading the theme needs the DOM, so it happens after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(explicit ? explicit === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <IconButton label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={toggle}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        )}
      </svg>
    </IconButton>
  );
}

function SoundToggle() {
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMutedState(isMuted());
  }, []);

  function toggle() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) sounds.pop();
  }

  return (
    <IconButton label={muted ? "Turn sound on" : "Turn sound off"} onClick={toggle}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        {muted ? <path d="m16 9 5 6M21 9l-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
      </svg>
    </IconButton>
  );
}

function VoiceToggle() {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(true);

  useEffect(() => {
    // Speech support and the saved setting are only known in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(speechSupported());
    setOn(isVoiceOn());
  }, []);

  if (!supported) return null;

  function toggle() {
    const next = !on;
    setVoiceOn(next);
    setOn(next);
    if (next) speak("Voice on");
  }

  return (
    <IconButton label={on ? "Turn voice announcements off" : "Turn voice announcements on"} onClick={toggle}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12a6 6 0 0 1 11.2-3M15 12.5c0 2.5-1.5 3.5-3 4.5v2a1 1 0 0 1-1 1H8a4 4 0 0 1-4-4v-4" />
        <circle cx="9.5" cy="11" r="1" fill="currentColor" stroke="none" />
        {on ? <path d="M18 9a4 4 0 0 1 0 6M20.5 6.5a8 8 0 0 1 0 11" /> : <path d="m17 9 5 6M22 9l-5 6" />}
      </svg>
    </IconButton>
  );
}

export function Header({ children }: { children?: ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
      <Wordmark compact={Boolean(children)} />
      <div className="flex items-center gap-0.5 sm:gap-1">
        {children}
        <Link
          href="/leaderboard"
          aria-label="Leaderboard"
          title="Leaderboard"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
            <path d="M17 5h3v2a4 4 0 0 1-3 3.9M7 5H4v2a4 4 0 0 0 3 3.9" />
          </svg>
        </Link>
        <SoundToggle />
        <VoiceToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}
