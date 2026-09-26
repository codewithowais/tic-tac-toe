// Spoken announcements using the browser's built-in text-to-speech (free, no audio files).
import { STYLES, lineFor, speakableName, type Moment, type VoiceStyle } from "./voiceLines";

export type VoiceSetting = "off" | VoiceStyle;
/** Moments people can switch on or off. "result" covers win, lose and draw. */
export type MomentGroup = "turn" | "hurry" | "result" | "joined";
export const MOMENT_GROUPS: { key: MomentGroup; label: string }[] = [
  { key: "turn", label: "Your turn" },
  { key: "hurry", label: "Hurry up (5 seconds left)" },
  { key: "result", label: "Round result" },
  { key: "joined", label: "Someone joins" },
];

const STYLE_KEY = "ttt.voiceStyle";
const MOMENTS_KEY = "ttt.voiceMoments";
const LEGACY_KEY = "ttt.voice"; // "0" meant off, before styles existed

// Clear-sounding English voices, best first. Whatever the device has is used otherwise.
const PREFERRED_ENGLISH = [
  "Google US English",
  "Samantha",
  "Google UK English Female",
  "Microsoft Aria Online (Natural) - English (United States)",
  "Microsoft Jenny Online (Natural) - English (United States)",
  "Karen",
  "Daniel",
];

/** "Owais, it's your turn". Kept for callers that only need the plain English line. */
export function turnPhrase(name: string) {
  const speakable = speakableName(name);
  return speakable ? `${speakable}, it's your turn` : "It's your turn";
}

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function read(key: string) {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

let style: VoiceSetting = (() => {
  const saved = read(STYLE_KEY);
  if (saved === "off" || (STYLES as readonly string[]).includes(saved ?? "")) return saved as VoiceSetting;
  return read(LEGACY_KEY) === "0" ? "off" : "english";
})();

let moments: Record<MomentGroup, boolean> = (() => {
  const all = { turn: true, hurry: true, result: true, joined: true };
  try {
    return { ...all, ...JSON.parse(read(MOMENTS_KEY) ?? "{}") };
  } catch {
    return all;
  }
})();

export function getVoiceStyle() {
  return style;
}

export function setVoiceStyle(next: VoiceSetting) {
  style = next;
  write(STYLE_KEY, next);
  if (next === "off" && speechSupported()) window.speechSynthesis.cancel();
}

export function getMoments() {
  return { ...moments };
}

export function setMoment(key: MomentGroup, on: boolean) {
  moments = { ...moments, [key]: on };
  write(MOMENTS_KEY, JSON.stringify(moments));
}

function voices() {
  return speechSupported() ? window.speechSynthesis.getVoices() : [];
}

/** True if the device can speak Urdu, or Hindi as the stand-in. */
export function hasUrduOrHindiVoice() {
  return voices().some((v) => /^(ur|hi)/i.test(v.lang));
}

function voiceFor(lang: "en" | "ur" | "hi") {
  const all = voices();
  if (lang === "en") {
    for (const name of PREFERRED_ENGLISH) {
      const match = all.find((v) => v.name === name);
      if (match) return match;
    }
  }
  return all.find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null;
}

/**
 * Says `text`. Announcements queue behind each other (e.g. "Sara joined" then
 * "your turn" when a game starts); `interrupt` cuts off whatever is playing.
 */
function say(text: string, lang: "en" | "ur" | "hi", interrupt = false) {
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  if (interrupt) synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = voiceFor(lang);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? { en: "en-US", ur: "ur-PK", hi: "hi-IN" }[lang];
  utterance.volume = 0.9;
  synth.speak(utterance);
}

function groupOf(moment: Moment): MomentGroup {
  return moment === "win" || moment === "lose" || moment === "draw" ? "result" : moment;
}

/** Speaks the line for `moment` in the chosen style, if that style and moment are switched on. */
export function announce(moment: Moment, vars: { name?: string; winner?: string } = {}) {
  if (style === "off" || !moments[groupOf(moment)] || !speechSupported()) return;
  const line = lineFor(style, moment, vars, voices().map((v) => v.lang));
  say(line.text, line.lang);
}

/** Plays a sample of a style (used when picking one), regardless of the current setting. */
export function previewStyle(next: VoiceStyle, name: string) {
  const line = lineFor(next, "turn", { name }, voices().map((v) => v.lang));
  say(line.text, line.lang, true);
}

// Some browsers (iPhone Safari especially) only allow speech after it has been
// started once from a tap or click, so speak a silent utterance on the first one.
if (speechSupported()) {
  const unlock = () => {
    const silent = new SpeechSynthesisUtterance("");
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
  // Voices load asynchronously in Chrome; asking once warms the list up.
  window.speechSynthesis.getVoices();
}
