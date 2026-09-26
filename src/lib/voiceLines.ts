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

const englishSlang: Lines = {
  turn: ["Yo {name}, you're up!", "{name}, your move. Let's go!", "You're on the clock, {name}"],
  hurry: ["Clock's ticking!", "Hurry up, five seconds!", "Tick tock, make a move!"],
  win: ["Let's go! You won!", "GG, you crushed it!", "Easy win!"],
  lose: ["Oof, {winner} got you this time", "{winner} takes the W", "Unlucky! {winner} wins"],
  draw: ["Stalemate! Nobody wins", "It's a tie, run it back"],
  joined: ["{name} just pulled up, let's play!", "{name} is in the house!"],
};

// Urdu and Desi lines exist twice with the same meaning: Urdu script for Urdu voices,
// and Devanagari for Hindi voices (spoken Hindi and Urdu sound almost the same).
const urdu: Lines = {
  turn: ["{name}، آپ کی باری ہے", "{name}، اب آپ کی چال ہے"],
  hurry: ["جلدی کریں، صرف پانچ سیکنڈ!", "وقت ختم ہونے والا ہے!"],
  win: ["مبارک ہو، آپ جیت گئے!", "شاباش! یہ راؤنڈ آپ کا ہے"],
  lose: ["{winner} جیت گئے", "افسوس، اس بار {winner} جیت گئے"],
  draw: ["مقابلہ برابر رہا", "کوئی نہیں جیتا، برابر!"],
  joined: ["{name} آ گئے، چلیں کھیلیں!", "خوش آمدید {name}!"],
};

const urduInDevanagari: Lines = {
  turn: ["{name}, आपकी बारी है", "{name}, अब आपकी चाल है"],
  hurry: ["जल्दी करें, सिर्फ़ पाँच सेकंड!", "वक़्त ख़त्म होने वाला है!"],
  win: ["मुबारक हो, आप जीत गए!", "शाबाश! ये राउंड आपका है"],
  lose: ["{winner} जीत गए", "अफ़सोस, इस बार {winner} जीत गए"],
  draw: ["मुक़ाबला बराबर रहा", "कोई नहीं जीता, बराबर!"],
  joined: ["{name} आ गए, चलिए खेलें!", "ख़ुश आमदीद {name}!"],
};

const desi: Lines = {
  turn: ["چل {name}، تیری باری!", "{name} یار، اب تو کھیل", "{name}، your turn، جلدی سے"],
  hurry: ["جلدی کر یار!", "اوئے، ٹائم ختم ہو رہا ہے!", "بس پانچ سیکنڈ، چل چل!"],
  win: ["واہ یار، چھا گئے!", "کیا بات ہے، جیت گئے!", "زبردست! easy win"],
  lose: ["اوہو، {winner} لے گئے", "کوئی بات نہیں، اگلی بار! {winner} جیت گئے"],
  draw: ["برابر! پھر سے کھیلو", "نہ تم جیتے نہ ہم، draw!"],
  joined: ["{name} آ گئے یار، شروع کرو!", "لو جی، {name} بھی آ گئے!"],
};

const desiInDevanagari: Lines = {
  turn: ["चल {name}, तेरी बारी!", "{name} यार, अब तू खेल", "{name}, your turn, जल्दी से"],
  hurry: ["जल्दी कर यार!", "ओए, टाइम ख़त्म हो रहा है!", "बस पाँच सेकंड, चल चल!"],
  win: ["वाह यार, छा गए!", "क्या बात है, जीत गए!", "ज़बरदस्त! easy win"],
  lose: ["ओहो, {winner} ले गए", "कोई बात नहीं, अगली बार! {winner} जीत गए"],
  draw: ["बराबर! फिर से खेलो", "न तुम जीते न हम, draw!"],
  joined: ["{name} आ गए यार, शुरू करो!", "लो जी, {name} भी आ गए!"],
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
