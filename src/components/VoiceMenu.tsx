"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session";
import {
  MOMENT_GROUPS,
  getMoments,
  getVoiceStyle,
  hasUrduOrHindiVoice,
  previewStyle,
  setMoment,
  setVoiceStyle,
  speechSupported,
  type MomentGroup,
  type VoiceSetting,
} from "@/lib/speech";
import { STYLES, STYLE_LABELS, type VoiceStyle } from "@/lib/voiceLines";

const SAMPLE_NAME = "Owais";

/** What each option looks like in the menu (Urdu and Desi shown in Roman script so everyone can read them). */
const SAMPLES: Record<VoiceSetting, (name: string) => string> = {
  off: () => "No spoken announcements",
  english: (n) => `${n}, it's your turn`,
  "english-slang": (n) => `Yo ${n}, you're up!`,
  urdu: (n) => `${n}, aap ki baari`,
  desi: (n) => `Chal ${n}, teri baari`,
};

/** Header button that opens voice settings: style (or off) and which moments are spoken. */
export function VoiceMenu() {
  const { name } = useSession();
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<VoiceSetting>("english");
  const [moments, setMoments] = useState<Record<MomentGroup, boolean>>(getMoments());
  const [urduVoice, setUrduVoice] = useState(true);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Speech support, voices and saved settings are only known in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(speechSupported());
    setStyle(getVoiceStyle());
    setMoments(getMoments());
  }, []);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrduVoice(hasUrduOrHindiVoice());
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!supported) return null;

  function choose(next: VoiceSetting) {
    setVoiceStyle(next);
    setStyle(next);
    if (next !== "off") previewStyle(next, name || SAMPLE_NAME);
  }

  function toggleMoment(key: MomentGroup) {
    const on = !moments[key];
    setMoment(key, on);
    setMoments((m) => ({ ...m, [key]: on }));
  }

  const off = style === "off";
  const needsUrdu = style === "urdu" || style === "desi";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={off ? "Voice announcements: off" : `Voice announcements: ${STYLE_LABELS[style as VoiceStyle]}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Voice announcements"
        className={clsx(
          "flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-surface-2 hover:text-ink",
          open ? "bg-surface-2 text-ink" : "text-muted",
        )}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12a6 6 0 0 1 11.2-3M15 12.5c0 2.5-1.5 3.5-3 4.5v2a1 1 0 0 1-1 1H8a4 4 0 0 1-4-4v-4" />
          <circle cx="9.5" cy="11" r="1" fill="currentColor" stroke="none" />
          {off ? <path d="m17 9 5 6M22 9l-5 6" /> : <path d="M18 9a4 4 0 0 1 0 6M20.5 6.5a8 8 0 0 1 0 11" />}
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Voice announcements"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 500, damping: 36 }}
            className="absolute right-0 top-12 z-40 w-[min(20rem,calc(100vw-2rem))] origin-top-right rounded-2xl border border-line bg-surface p-3 shadow-[0_24px_60px_-20px_color-mix(in_srgb,var(--ink)_35%,transparent)]"
          >
            <p className="px-2 pb-2 pt-1 font-display text-lg font-bold tracking-tight">Voice</p>
            <div role="radiogroup" aria-label="Voice style" className="flex flex-col">
              {(["off", ...STYLES] as VoiceSetting[]).map((option) => {
                const selected = style === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={option === "off" ? "Off" : `${STYLE_LABELS[option]}: ${SAMPLES[option](name || SAMPLE_NAME)}`}
                    onClick={() => choose(option)}
                    className={clsx(
                      "flex items-center gap-3 rounded-xl px-2 py-2 text-left transition",
                      selected ? "bg-surface-2" : "hover:bg-surface-2/60",
                    )}
                  >
                    <span
                      className={clsx(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                        selected ? "border-ink" : "border-grid",
                      )}
                      aria-hidden="true"
                    >
                      {selected && <span className="h-2 w-2 rounded-full bg-ink" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{option === "off" ? "Off" : STYLE_LABELS[option]}</span>
                      <span className="block truncate text-xs text-muted">{SAMPLES[option](name || SAMPLE_NAME)}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {needsUrdu && !urduVoice && (
              <p className="mx-2 mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
                This device has no Urdu or Hindi voice, so it speaks the English version instead.
              </p>
            )}

            <fieldset className={clsx("mt-3 border-t border-line px-2 pt-3", off && "opacity-40")} disabled={off}>
              <legend className="sr-only">Say it when</legend>
              <p className="pb-1 text-xs font-medium text-muted">Say it when</p>
              {MOMENT_GROUPS.map((m) => (
                <label key={m.key} className="flex cursor-pointer items-center gap-3 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={moments[m.key]}
                    onChange={() => toggleMoment(m.key)}
                    className="h-4 w-4 accent-[var(--ink)]"
                  />
                  {m.label}
                </label>
              ))}
            </fieldset>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
