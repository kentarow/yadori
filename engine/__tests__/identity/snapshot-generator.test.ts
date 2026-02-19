import { describe, it, expect } from "vitest";
import { generateSnapshot, type SnapshotState } from "../../src/identity/snapshot-generator.js";
import type { PerceptionMode, SelfForm } from "../../src/types.js";

const ALL_SPECIES: PerceptionMode[] = ["chromatic", "vibration", "geometric", "thermal", "temporal", "chemical"];
const ALL_FORMS: SelfForm[] = ["light-particles", "fluid", "crystal", "sound-echo", "mist", "geometric-cluster"];

const DEFAULT_STATE: SnapshotState = {
  mood: 50,
  energy: 50,
  curiosity: 50,
  comfort: 50,
  density: 20,
  complexity: 10,
};

describe("generateSnapshot", () => {
  it("returns a valid PNG buffer", () => {
    const png = generateSnapshot("chromatic", "light-particles", DEFAULT_STATE, 64);

    expect(png[0]).toBe(137);
    expect(png[1]).toBe(80);
    expect(png[2]).toBe(78);
    expect(png[3]).toBe(71);
  });

  it("contains required PNG chunks", () => {
    const png = generateSnapshot("vibration", "crystal", DEFAULT_STATE, 32);
    const str = png.toString("binary");

    expect(str).toContain("IHDR");
    expect(str).toContain("IDAT");
    expect(str).toContain("IEND");
  });

  it("encodes correct dimensions", () => {
    const size = 128;
    const png = generateSnapshot("geometric", "fluid", DEFAULT_STATE, size);

    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(size);
    expect(height).toBe(size);
  });

  it("defaults to 512px", () => {
    const png = generateSnapshot("temporal", "sound-echo", DEFAULT_STATE);
    const width = png.readUInt32BE(16);
    expect(width).toBe(512);
  });

  it("produces different images for different species", () => {
    const a = generateSnapshot("chromatic", "light-particles", DEFAULT_STATE, 32);
    const b = generateSnapshot("vibration", "light-particles", DEFAULT_STATE, 32);
    expect(a.equals(b)).toBe(false);
  });

  it("produces different images for different forms", () => {
    const a = generateSnapshot("chromatic", "light-particles", DEFAULT_STATE, 32);
    const b = generateSnapshot("chromatic", "crystal", DEFAULT_STATE, 32);
    expect(a.equals(b)).toBe(false);
  });

  it("produces different images for different mood values", () => {
    const low = generateSnapshot("chromatic", "light-particles", { ...DEFAULT_STATE, mood: 10 }, 32);
    const high = generateSnapshot("chromatic", "light-particles", { ...DEFAULT_STATE, mood: 90 }, 32);
    expect(low.equals(high)).toBe(false);
  });

  it("produces different images for different energy values", () => {
    const low = generateSnapshot("chromatic", "light-particles", { ...DEFAULT_STATE, energy: 10 }, 32);
    const high = generateSnapshot("chromatic", "light-particles", { ...DEFAULT_STATE, energy: 90 }, 32);
    expect(low.equals(high)).toBe(false);
  });

  it("produces different images for different curiosity values", () => {
    const low = generateSnapshot("chromatic", "light-particles", { ...DEFAULT_STATE, curiosity: 0 }, 32);
    const high = generateSnapshot("chromatic", "light-particles", { ...DEFAULT_STATE, curiosity: 100 }, 32);
    expect(low.equals(high)).toBe(false);
  });

  it("produces different images for different comfort values", () => {
    const low = generateSnapshot("thermal", "fluid", { ...DEFAULT_STATE, comfort: 10 }, 32);
    const high = generateSnapshot("thermal", "fluid", { ...DEFAULT_STATE, comfort: 90 }, 32);
    expect(low.equals(high)).toBe(false);
  });

  it("works for all species × form combinations", () => {
    for (const species of ALL_SPECIES) {
      for (const form of ALL_FORMS) {
        const png = generateSnapshot(species, form, DEFAULT_STATE, 16);
        expect(png.length).toBeGreaterThan(50);
        expect(png[0]).toBe(137);
      }
    }
  });

  it("handles extreme state values gracefully", () => {
    const extremes: SnapshotState = {
      mood: 0,
      energy: 0,
      curiosity: 100,
      comfort: 0,
      density: 100,
      complexity: 100,
    };
    const png = generateSnapshot("chemical", "geometric-cluster", extremes, 32);
    expect(png.length).toBeGreaterThan(50);
    expect(png[0]).toBe(137);
  });

  it("larger size produces larger file", () => {
    const small = generateSnapshot("thermal", "mist", DEFAULT_STATE, 32);
    const large = generateSnapshot("thermal", "mist", DEFAULT_STATE, 128);
    expect(large.length).toBeGreaterThan(small.length);
  });
});
