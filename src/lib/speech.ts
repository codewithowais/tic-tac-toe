// Spoken announcements using the browser's built-in text-to-speech (free, no audio files).

const STORAGE_KEY = "ttt.voice";

// Clear-sounding English voices, best first. Whatever the device has is used otherwise.
const PREFERRED_VOICES = [
  "Google US English",
  "Samantha",
  "Google UK English Female",
  "Microsoft Aria Online (Natural) - English (United States)",
  "Microsoft Jenny Online (Natural) - English (United States)",
  "Karen",
  "Daniel",
];

/** "Owais, it's your turn". Emoji and symbols are dropped so the voice doesn't read them out. */
export function turnPhrase(name: string) {
  const speakable = name
    .replace(/[^\p{L}\p{M}\p{N}' -]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return speakable ? `${speakable}, it's your turn` : "It's your turn";
}

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

let enabled = true;
try {
  enabled = typeof localStorage === "undefined" || localStorage.getItem(STORAGE_KEY) !== "0";
} catch {}

export function isVoiceOn() {
  return enabled;
}

export function setVoiceOn(value: boolean) {
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {}
  if (!value && speechSupported()) window.speechSynthesis.cancel();
}

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  for (const name of PREFERRED_VOICES) {
    const match = voices.find((v) => v.name === name);
    if (match) return match;
  }
  return voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? null;
}

/** Says `text`, replacing anything still being spoken so announcements never queue up. */
export function speak(text: string) {
  if (!enabled || !speechSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = "en-US";
  }
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 0.9;
  synth.speak(utterance);
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
