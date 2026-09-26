import { describe, expect, it } from "vitest";
import { MOMENTS, STYLES, lineFor, packs, type Moment } from "./voiceLines";

const first = () => 0;
const EN = ["en-US"];
const UR = ["ur-PK", "en-US"];
const HI = ["hi-IN", "en-US"];

describe("phrase packs", () => {
  it("has at least two variations for every style and moment", () => {
    for (const style of STYLES) {
      for (const moment of MOMENTS) {
        const pack = packs[style];
        const count = "english" in pack ? pack.english[moment].length : pack.urdu[moment].length;
        expect(count, `${style} ${moment}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("keeps Urdu-script and Devanagari lines aligned, so both mean the same thing", () => {
    for (const style of ["urdu", "desi"] as const) {
      const pack = packs[style];
      for (const moment of MOMENTS) expect(pack.hindi[moment].length).toBe(pack.urdu[moment].length);
    }
  });

  it("mentions the right person in every line that needs a name", () => {
    const needs: Partial<Record<Moment, string>> = { turn: "{name}", joined: "{name}", lose: "{winner}" };
    for (const style of STYLES) {
      const pack = packs[style];
      const sets = "english" in pack ? [pack.english] : [pack.urdu, pack.hindi];
      for (const set of sets) {
        for (const [moment, placeholder] of Object.entries(needs)) {
          for (const line of set[moment as Moment]) expect(line, `${style} ${moment}`).toContain(placeholder);
        }
      }
    }
  });
});

describe("lineFor", () => {
  it("fills in names and uses an English voice for English styles", () => {
    expect(lineFor("english", "turn", { name: "Owais" }, EN, first)).toEqual({ text: "Owais, it's your turn", lang: "en" });
    expect(lineFor("english-slang", "turn", { name: "Owais" }, EN, first)).toEqual({ text: "Yo Owais, you're up!", lang: "en" });
    expect(lineFor("english", "lose", { winner: "Sara" }, EN, first).text).toBe("Sara wins this round");
  });

  it("uses Urdu script when the device has an Urdu voice", () => {
    expect(lineFor("urdu", "turn", { name: "Owais" }, UR, first)).toEqual({ text: "Owais، آپ کی باری", lang: "ur" });
  });

  it("falls back to a Hindi voice with the same words in Devanagari", () => {
    expect(lineFor("urdu", "turn", { name: "Owais" }, HI, first)).toEqual({ text: "Owais, आपकी बारी", lang: "hi" });
    expect(lineFor("desi", "turn", { name: "Owais" }, HI, first)).toEqual({ text: "चल Owais, तेरी बारी", lang: "hi" });
  });

  it("falls back to English when there's no Urdu or Hindi voice", () => {
    expect(lineFor("urdu", "turn", { name: "Owais" }, EN, first)).toEqual({ text: "Owais, it's your turn", lang: "en" });
    expect(lineFor("desi", "turn", { name: "Owais" }, EN, first)).toEqual({ text: "Yo Owais, you're up!", lang: "en" });
  });

  it("cleans names so emoji and symbols aren't read out", () => {
    expect(lineFor("english", "joined", { name: "🔥Sara🔥" }, EN, first).text).toBe("Sara joined the game");
    expect(lineFor("english", "turn", { name: "🔥" }, EN, first).text).toBe("It's your turn");
  });

  it("never spells English words inside Urdu or Hindi lines, which the voice would mispronounce", () => {
    for (const style of ["urdu", "desi"] as const) {
      const pack = packs[style];
      for (const set of [pack.urdu, pack.hindi]) {
        for (const moment of MOMENTS) {
          for (const line of set[moment]) {
            expect(line.replace(/\{(name|winner)\}/g, ""), `${style} ${moment}`).not.toMatch(/[A-Za-z]/);
          }
        }
      }
    }
  });

  it("picks different variations", () => {
    const seen = new Set<string>();
    for (const r of [0, 0.5, 0.99]) seen.add(lineFor("english-slang", "win", {}, EN, () => r).text);
    expect(seen.size).toBeGreaterThan(1);
  });
});
