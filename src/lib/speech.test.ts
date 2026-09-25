import { describe, expect, it } from "vitest";
import { turnPhrase } from "./speech";

describe("turnPhrase", () => {
  it("puts the player's name first", () => {
    expect(turnPhrase("Owais")).toBe("Owais, it's your turn");
  });

  it("keeps letters from any language, digits and simple punctuation", () => {
    expect(turnPhrase("Ali-Khan 2")).toBe("Ali-Khan 2, it's your turn");
    expect(turnPhrase("اویس")).toBe("اویس, it's your turn");
    expect(turnPhrase("O'Neil")).toBe("O'Neil, it's your turn");
  });

  it("drops emoji and symbols the voice would read out awkwardly", () => {
    expect(turnPhrase("🔥Owais🔥")).toBe("Owais, it's your turn");
    expect(turnPhrase("x_X!!")).toBe("x X, it's your turn");
  });

  it("falls back to a plain phrase when nothing speakable is left", () => {
    expect(turnPhrase("🔥🔥")).toBe("It's your turn");
    expect(turnPhrase("   ")).toBe("It's your turn");
  });
});
