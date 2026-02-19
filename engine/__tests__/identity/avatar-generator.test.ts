import { describe, it, expect } from "vitest";
import { generateAvatar, generateBotName } from "../../src/identity/avatar-generator.js";
import type { PerceptionMode, SelfForm } from "../../src/types.js";

const ALL_SPECIES: PerceptionMode[] = ["chromatic", "vibration", "geometric", "thermal", "temporal", "chemical"];
const ALL_FORMS: SelfForm[] = ["light-particles", "fluid", "crystal", "sound-echo", "mist", "geometric-cluster"];

describe("generateAvatar", () => {
  it("returns a valid PNG buffer (correct signature)", () => {
    const png = generateAvatar("chromatic", "light-particles", 64);

    // PNG magic bytes: 137 80 78 71 13 10 26 10
    expect(png[0]).toBe(137);
    expect(png[1]).toBe(80);  // P
    expect(png[2]).toBe(78);  // N
    expect(png[3]).toBe(71);  // G
    expect(png[4]).toBe(13);
    expect(png[5]).toBe(10);
    expect(png[6]).toBe(26);
    expect(png[7]).toBe(10);
  });

  it("contains IHDR, IDAT, and IEND chunks", () => {
    const png = generateAvatar("vibration", "crystal", 32);
    const str = png.toString("binary");

    expect(str).toContain("IHDR");
    expect(str).toContain("IDAT");
    expect(str).toContain("IEND");
  });

  it("encodes correct dimensions in IHDR", () => {
    const size = 128;
    const png = generateAvatar("geometric", "fluid", size);

    // IHDR data starts after: 8 (sig) + 4 (length) + 4 (type) = 16
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(size);
    expect(height).toBe(size);
  });

  it("produces different images for different species", () => {
    const chromatic = generateAvatar("chromatic", "light-particles", 32);
    const vibration = generateAvatar("vibration", "light-particles", 32);

    // Different species → different pixel data → different compressed output
    expect(chromatic.equals(vibration)).toBe(false);
  });

  it("produces different images for different forms", () => {
    const soft = generateAvatar("chromatic", "light-particles", 32);
    const sharp = generateAvatar("chromatic", "crystal", 32);

    expect(soft.equals(sharp)).toBe(false);
  });

  it("works for all species × form combinations", () => {
    for (const species of ALL_SPECIES) {
      for (const form of ALL_FORMS) {
        const png = generateAvatar(species, form, 16);
        // Should be a valid, non-empty PNG
        expect(png.length).toBeGreaterThan(50);
        expect(png[0]).toBe(137); // PNG signature
      }
    }
  });

  it("respects size parameter", () => {
    const small = generateAvatar("thermal", "mist", 16);
    const large = generateAvatar("thermal", "mist", 128);

    // Larger image = more pixel data = larger file
    expect(large.length).toBeGreaterThan(small.length);
  });

  it("defaults to 256px when size not specified", () => {
    const png = generateAvatar("temporal", "sound-echo");
    const width = png.readUInt32BE(16);
    expect(width).toBe(256);
  });
});

describe("generateBotName", () => {
  it("returns a string of exactly 3 symbols for each species", () => {
    for (const species of ALL_SPECIES) {
      const name = generateBotName(species);
      // Each symbol is a multi-byte Unicode char, but String.length counts code points
      expect([...name]).toHaveLength(3);
    }
  });

  it("returns different names for different species", () => {
    const names = new Set(ALL_SPECIES.map(s => generateBotName(s)));
    // At least 4 distinct names out of 6 species
    // (thermal and chromatic share some symbols but differ in combination)
    expect(names.size).toBeGreaterThanOrEqual(4);
  });

  it("uses only recognized symbols", () => {
    const validSymbols = "○●△▽◎☆◇◆■□▲▼★◉◈";
    for (const species of ALL_SPECIES) {
      const name = generateBotName(species);
      for (const char of name) {
        expect(validSymbols).toContain(char);
      }
    }
  });

  it("chromatic uses round/open symbols", () => {
    const name = generateBotName("chromatic");
    // Chromatic symbols: ◎○●
    expect(name).toContain("◎");
    expect(name).toContain("○");
  });

  it("geometric uses angular/structured symbols", () => {
    const name = generateBotName("geometric");
    // Geometric: ■□△
    expect(name).toContain("■");
  });
});
