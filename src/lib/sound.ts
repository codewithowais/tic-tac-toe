// Tiny synthesized sounds, so there are no audio files to load.
let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = typeof localStorage !== "undefined" && localStorage.getItem("ttt.muted") === "1";
} catch {}

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem("ttt.muted", value ? "1" : "0");
  } catch {}
}

function audio() {
  if (typeof window === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, duration: number, volume = 0.08, type: OscillatorType = "sine") {
  const ac = audio();
  if (!ac || muted) return;
  const t = ac.currentTime + start;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

// Each seat gets its own pitch so you can hear who moved.
const SEAT_PITCH = [523.25, 392.0, 659.25, 440.0];

export const sounds = {
  move: (seat: number) => tone(SEAT_PITCH[seat] ?? 500, 0, 0.14, 0.07, "triangle"),
  win: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.3, 0.06)),
  draw: () => [392, 349.23].forEach((f, i) => tone(f, i * 0.12, 0.25, 0.05)),
  pop: () => tone(880, 0, 0.08, 0.04),
  /** Rising two-note chime: it's your move. */
  yourTurn: () => {
    tone(659.25, 0, 0.16, 0.07);
    tone(987.77, 0.11, 0.28, 0.07);
  },
  /** Soft tick for the last seconds of your turn; `urgency` 0–1 raises the pitch. */
  tick: (urgency = 0) => tone(1100 + urgency * 500, 0, 0.05, 0.035, "square"),
  /** Call from a click handler so browsers allow audio later. */
  unlock: () => void audio(),
};

/** Short vibration on phones that support it (Android). Follows the sound on/off switch. */
export function buzz(pattern: number | number[] = 60) {
  if (muted || typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {}
}
