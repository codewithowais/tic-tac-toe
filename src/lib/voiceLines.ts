// What the voice says, per style. Pure data and functions, so they're easy to test.

export const STYLES = ["english", "english-slang", "urdu", "desi"] as const;
export type VoiceStyle = (typeof STYLES)[number];

export const MOMENTS = ["turn", "hurry", "win", "lose", "draw", "joined"] as const;
export type Moment = (typeof MOMENTS)[number];

type Lines = Record<Moment, string[]>;

/** `{name}` is the player the line is about; `{winner}` is who won the round. */
const english: Lines = {
  turn: ["{name}, it's your turn", "Your move, {name}"],
  hurry: ["Five seconds left", "Quick, five seconds!"],
  win: ["You win! Well played", "Nice one, you win this round"],
  lose: ["{winner} wins this round", "{winner} takes this one"],
  draw: ["It's a draw", "Nobody wins, it's a draw"],
  joined: ["{name} joined the game", "{name} is here, let's play"],
};

// How friends actually talk while playing: short, casual, and never "Player 2 has moved".
const englishSlang: Lines = {
  turn: ["Yo {name}, you're up!", "Your go, {name}", "Alright {name}, show us what you've got"],
  hurry: ["Clock's ticking!", "Come on, make a move!", "Five seconds, hurry up!"],
  win: ["Let's go! You won!", "GG, that was clean", "Too easy!"],
  lose: ["Oof, {winner} got you", "{winner} takes this one", "Unlucky, {winner} wins"],
  draw: ["Draw! Nobody wins", "It's a tie. Run it back?"],
  joined: ["{name} just joined, let's go!", "{name}'s here, game on!"],
};

// Urdu and Desi lines exist twice with the same meaning: Urdu script for Urdu voices,
// and Devanagari for Hindi voices (spoken Hindi and Urdu sound almost the same).
// Everyday words people really say ("baari", "time", "game", "draw") are written in the
// voice's own script, because English spelled inside an Urdu or Hindi line gets mispronounced.
// Lines avoid gendered verbs where possible ("{winner} ne hara diya", "aa gaye").

/** Polite, everyday Urdu ("aap"), the way you'd talk to anyone. */
const urdu: Lines = {
  turn: ["{name}، آپ کی باری", "{name}، چلیں آپ کی باری ہے", "اب آپ کھیلیں، {name}"],
  hurry: ["جلدی کریں، ٹائم ختم ہو رہا ہے", "بس پانچ سیکنڈ رہ گئے"],
  win: ["واہ! آپ جیت گئے", "زبردست، یہ گیم آپ کی"],
  lose: ["اس بار {winner} جیت گئے", "{winner} بازی لے گئے"],
  draw: ["گیم برابر رہی", "کوئی نہیں جیتا، ڈرا ہو گیا"],
  joined: ["{name} آ گئے ہیں، چلیں شروع کریں", "{name} بھی آ گئے"],
};

const urduInDevanagari: Lines = {
  turn: ["{name}, आपकी बारी", "{name}, चलिए आपकी बारी है", "अब आप खेलिए, {name}"],
  hurry: ["जल्दी करें, टाइम ख़त्म हो रहा है", "बस पाँच सेकंड रह गए"],
  win: ["वाह! आप जीत गए", "ज़बरदस्त, ये गेम आपकी"],
  lose: ["इस बार {winner} जीत गए", "{winner} बाज़ी ले गए"],
  draw: ["गेम बराबर रही", "कोई नहीं जीता, ड्रॉ हो गया"],
  joined: ["{name} आ गए हैं, चलिए शुरू करें", "{name} भी आ गए"],
};

/** Casual Pakistani friend talk ("tu", "yaar", "chal", "oye"). */
const desi: Lines = {
  turn: ["چل {name}، تیری باری", "{name} یار، چل کھیل اب", "اوئے {name}، تیری باری ہے"],
  hurry: ["جلدی کر یار", "ٹائم ختم ہو رہا ہے، جلدی", "سو تو نہیں گئے؟ چلو کھیلو"],
  win: ["واہ یار، کمال کر دیا", "چھا گئے استاد", "جیت گئے بھئی"],
  lose: ["اس بار {winner} کی جیت", "{winner} نے ہرا دیا یار"],
  draw: ["برابر! ایک اور ہو جائے", "ڈرا ہو گیا، چل دوبارہ"],
  joined: ["{name} بھی آ گئے، چلو شروع کرو", "لو جی، {name} آ گئے"],
};

const desiInDevanagari: Lines = {
  turn: ["चल {name}, तेरी बारी", "{name} यार, चल खेल अब", "ओए {name}, तेरी बारी है"],
  hurry: ["जल्दी कर यार", "टाइम ख़त्म हो रहा है, जल्दी", "सो तो नहीं गए? चलो खेलो"],
  win: ["वाह यार, कमाल कर दिया", "छा गए उस्ताद", "जीत गए भई"],
  lose: ["इस बार {winner} की जीत", "{winner} ने हरा दिया यार"],
  draw: ["बराबर! एक और हो जाए", "ड्रॉ हो गया, चल दोबारा"],
  joined: ["{name} भी आ गए, चलो शुरू करो", "लो जी, {name} आ गए"],
};

export const packs = {
  english: { english },
  "english-slang": { english: englishSlang },
  urdu: { urdu, hindi: urduInDevanagari, fallback: english },
  desi: { urdu: desi, hindi: desiInDevanagari, fallback: englishSlang },
} as const;

export const STYLE_LABELS: Record<VoiceStyle, string> = {
  english: "English",
  "english-slang": "English slang",
  urdu: "Urdu",
  desi: "Desi mix",
};

/** Drops emoji and symbols the voice would read out awkwardly; keeps letters in any script. */
export function speakableName(name: string) {
  return name
    .replace(/[^\p{L}\p{M}\p{N}' -]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fill(template: string, vars: { name?: string; winner?: string }) {
  const text = template
    .replace("{name}", speakableName(vars.name ?? ""))
    .replace("{winner}", speakableName(vars.winner ?? "") || "Someone")
    // Tidy up if a name was empty: "  , it's your turn" -> "It's your turn".
    .replace(/\s+([,،!])/g, "$1")
    .replace(/^[\s,،]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Picks the line to say and the language of the voice to say it in.
 * `voiceLangs` are the device's available voice languages (e.g. "ur-PK", "hi-IN", "en-US").
 */
export function lineFor(
  style: VoiceStyle,
  moment: Moment,
  vars: { name?: string; winner?: string },
  voiceLangs: string[],
  rand: () => number = Math.random,
): { text: string; lang: "en" | "ur" | "hi" } {
  const pick = (lines: string[]) => lines[Math.floor(rand() * lines.length)];
  const pack = packs[style];
  if ("english" in pack) return { text: fill(pick(pack.english[moment]), vars), lang: "en" };

  const has = (prefix: string) => voiceLangs.some((l) => l.toLowerCase().startsWith(prefix));
  if (has("ur")) return { text: fill(pick(pack.urdu[moment]), vars), lang: "ur" };
  if (has("hi")) return { text: fill(pick(pack.hindi[moment]), vars), lang: "hi" };
  return { text: fill(pick(pack.fallback[moment]), vars), lang: "en" };
}
