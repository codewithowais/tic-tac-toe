// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_PLAYERS } from "../../convex/lib/game";
import { MARK_PATHS } from "./markPaths";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** The stylesheet's three palettes: light, dark by system setting, dark by manual switch. */
function palettes() {
  const media = css.indexOf("@media (prefers-color-scheme: dark)");
  const manual = css.indexOf(':root[data-theme="dark"]');
  const end = css.indexOf("@theme inline");
  return {
    light: css.slice(css.indexOf(":root {"), media),
    "dark (system)": css.slice(media, manual),
    "dark (switch)": css.slice(manual, end),
  };
}

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Perceptual colour difference (CIE76 ΔE): around 20+ looks clearly different. */
function deltaE(a: string, b: string) {
  const lab = (hex: string) => {
    const [r, g, bl] = hexToRgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    const z = (0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

const seatColor = (block: string, i: number) => block.match(new RegExp(`--seat-${i}:\\s*(#[0-9a-fA-F]{6})`))?.[1];

describe("player marks", () => {
  it("has a drawn shape for every possible player, all different", () => {
    for (let seat = 0; seat < MAX_PLAYERS; seat++) {
      expect(MARK_PATHS[seat]?.length, `seat ${seat}`).toBeGreaterThan(0);
    }
    const shapes = Array.from({ length: MAX_PLAYERS }, (_, i) => MARK_PATHS[i].join("|"));
    expect(new Set(shapes).size).toBe(MAX_PLAYERS);
  });
});

describe("player colours", () => {
  for (const [name, block] of Object.entries(palettes())) {
    it(`${name}: every seat has a colour that stands out from the background`, () => {
      const bg = block.match(/--bg:\s*(#[0-9a-fA-F]{6})/)![1];
      for (let i = 0; i < MAX_PLAYERS; i++) {
        const color = seatColor(block, i);
        expect(color, `--seat-${i}`).toBeDefined();
        expect(contrast(color!, bg), `seat ${i} ${color} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    });

    it(`${name}: no two seats have colours that look alike`, () => {
      for (let i = 0; i < MAX_PLAYERS; i++) {
        for (let j = i + 1; j < MAX_PLAYERS; j++) {
          const a = seatColor(block, i)!;
          const b = seatColor(block, j)!;
          // Shapes tell near-identical neighbours apart too, so this is a floor, not a goal.
          expect(deltaE(a, b), `seats ${i} (${a}) and ${j} (${b})`).toBeGreaterThanOrEqual(14);
        }
      }
    });
  }
});
