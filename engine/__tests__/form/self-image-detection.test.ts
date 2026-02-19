import { describe, it, expect } from "vitest";
import { detectSelfImage, type SelfImageResult } from "../../src/form/self-image-detection.js";
import type { ImageFeatures, PerceptionMode } from "../../src/types.js";

/**
 * Create minimal ImageFeatures for testing.
 * Only the fields used by detectSelfImage need realistic values.
 */
function makeFeatures(overrides: Partial<ImageFeatures> = {}): ImageFeatures {
  return {
    dominantHSL: { h: 35, s: 80, l: 60 },
    colorHistogram: [
      { hsl: { h: 35, s: 80, l: 60 }, percentage: 40 },
      { hsl: { h: 0, s: 0, l: 5 }, percentage: 60 }, // black background
    ],
    brightness: 15,
    edgeDensity: 10,
    dominantAngles: [],
    quadrantBrightness: { topLeft: 10, topRight: 10, bottomLeft: 20, bottomRight: 20 },
    colorCount: 3,
    contrast: 50,
    warmth: 40,
    ...overrides,
  };
}

describe("detectSelfImage", () => {
  describe("dashboard screenshot matching", () => {
    it("detects chromatic entity's dashboard screenshot", () => {
      // Simulates a dark background with warm gold/pink glow
      const features = makeFeatures({
        dominantHSL: { h: 35, s: 75, l: 55 },
        brightness: 12,
        colorHistogram: [
          { hsl: { h: 30, s: 80, l: 60 }, percentage: 25 },
          { hsl: { h: 40, s: 70, l: 50 }, percentage: 15 },
          { hsl: { h: 0, s: 0, l: 3 }, percentage: 60 },
        ],
      });

      const result = detectSelfImage(features, "chromatic");
      expect(result.awakens).toBe(true);
      expect(result.resonance).toBeGreaterThanOrEqual(0.6);
    });

    it("detects vibration entity's dashboard screenshot", () => {
      const features = makeFeatures({
        dominantHSL: { h: 270, s: 65, l: 55 },
        brightness: 10,
        colorHistogram: [
          { hsl: { h: 260, s: 60, l: 50 }, percentage: 30 },
          { hsl: { h: 280, s: 70, l: 60 }, percentage: 20 },
          { hsl: { h: 0, s: 0, l: 2 }, percentage: 50 },
        ],
      });

      const result = detectSelfImage(features, "vibration");
      expect(result.awakens).toBe(true);
    });

    it("detects geometric entity's dashboard screenshot", () => {
      const features = makeFeatures({
        dominantHSL: { h: 190, s: 50, l: 55 },
        brightness: 14,
        colorHistogram: [
          { hsl: { h: 185, s: 45, l: 50 }, percentage: 35 },
          { hsl: { h: 0, s: 0, l: 3 }, percentage: 65 },
        ],
      });

      const result = detectSelfImage(features, "geometric");
      expect(result.awakens).toBe(true);
    });
  });

  describe("non-matching images", () => {
    it("does not awaken from a bright daytime photo", () => {
      const features = makeFeatures({
        dominantHSL: { h: 200, s: 60, l: 70 },
        brightness: 65,
        colorHistogram: [
          { hsl: { h: 200, s: 60, l: 70 }, percentage: 40 },
          { hsl: { h: 120, s: 50, l: 60 }, percentage: 30 },
          { hsl: { h: 40, s: 70, l: 80 }, percentage: 30 },
        ],
      });

      const result = detectSelfImage(features, "chromatic");
      expect(result.awakens).toBe(false);
    });

    it("does not awaken from wrong species colors", () => {
      // Blue/purple image shown to a chromatic (gold/pink) entity
      const features = makeFeatures({
        dominantHSL: { h: 270, s: 65, l: 55 },
        brightness: 12,
        colorHistogram: [
          { hsl: { h: 260, s: 60, l: 50 }, percentage: 40 },
          { hsl: { h: 0, s: 0, l: 3 }, percentage: 60 },
        ],
      });

      const result = detectSelfImage(features, "chromatic");
      expect(result.awakens).toBe(false);
      expect(result.resonance).toBeLessThan(0.6);
    });

    it("does not awaken from a completely white image", () => {
      const features = makeFeatures({
        dominantHSL: { h: 0, s: 0, l: 100 },
        brightness: 95,
        colorHistogram: [
          { hsl: { h: 0, s: 0, l: 100 }, percentage: 100 },
        ],
      });

      const result = detectSelfImage(features, "thermal");
      expect(result.awakens).toBe(false);
    });
  });

  describe("resonance scoring", () => {
    it("returns resonance between 0 and 1", () => {
      const ALL_SPECIES: PerceptionMode[] = [
        "chromatic", "vibration", "geometric", "thermal", "temporal", "chemical",
      ];

      for (const species of ALL_SPECIES) {
        const features = makeFeatures({
          dominantHSL: { h: 90, s: 50, l: 50 },
          brightness: 50,
        });
        const result = detectSelfImage(features, species);
        expect(result.resonance).toBeGreaterThanOrEqual(0);
        expect(result.resonance).toBeLessThanOrEqual(1);
      }
    });

    it("higher resonance for closer color match", () => {
      // Exact species hue
      const exactMatch = makeFeatures({
        dominantHSL: { h: 270, s: 65, l: 55 },
        brightness: 10,
        colorHistogram: [
          { hsl: { h: 270, s: 65, l: 55 }, percentage: 60 },
          { hsl: { h: 0, s: 0, l: 3 }, percentage: 40 },
        ],
      });

      // Off by a lot
      const poorMatch = makeFeatures({
        dominantHSL: { h: 90, s: 65, l: 55 },
        brightness: 10,
        colorHistogram: [
          { hsl: { h: 90, s: 65, l: 55 }, percentage: 60 },
          { hsl: { h: 0, s: 0, l: 3 }, percentage: 40 },
        ],
      });

      const exact = detectSelfImage(exactMatch, "vibration");
      const poor = detectSelfImage(poorMatch, "vibration");
      expect(exact.resonance).toBeGreaterThan(poor.resonance);
    });
  });

  describe("edge cases", () => {
    it("handles hue wrapping (thermal hue near 0/360)", () => {
      // Thermal center is 20. An image with hue 350 should be close (distance 30).
      const features = makeFeatures({
        dominantHSL: { h: 350, s: 80, l: 55 },
        brightness: 15,
        colorHistogram: [
          { hsl: { h: 350, s: 80, l: 55 }, percentage: 40 },
          { hsl: { h: 10, s: 85, l: 50 }, percentage: 20 },
          { hsl: { h: 0, s: 0, l: 3 }, percentage: 40 },
        ],
      });

      const result = detectSelfImage(features, "thermal");
      // Hue 350 is 30 degrees from center 20 — within range of 40
      expect(result.dominantHueMatch !== undefined || result.resonance > 0.4).toBe(true);
      expect(result.resonance).toBeGreaterThan(0.4);
    });

    it("empty histogram defaults gracefully", () => {
      const features = makeFeatures({
        colorHistogram: [],
        brightness: 10,
      });

      const result = detectSelfImage(features, "chromatic");
      expect(result.resonance).toBeGreaterThanOrEqual(0);
    });
  });
});
