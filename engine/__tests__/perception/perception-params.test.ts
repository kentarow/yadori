import { describe, it, expect } from "vitest";
import {
  computePerceptionWindow,
  getSpeciesPerceptionProfile,
  type PerceptionWindow,
} from "../../src/perception/perception-params.js";
import { PerceptionLevel } from "../../src/types.js";
import type { PerceptionMode } from "../../src/types.js";

// ============================================================
// Helper: collect all numeric channel values from a PerceptionWindow
// ============================================================

function numericChannels(w: PerceptionWindow): number[] {
  return [
    w.imageResolution,
    w.colorDepth,
    w.textAccess,
    w.semanticDepth,
    w.frequencyRange,
    w.temporalResolution,
    w.sensorAccess,
  ];
}

// ============================================================
// Level 0 — Very limited perception
// ============================================================

describe("Level 0 (Minimal) has very limited perception", () => {
  const allSpecies: PerceptionMode[] = [
    "chromatic",
    "vibration",
    "geometric",
    "thermal",
    "temporal",
    "chemical",
  ];

  for (const species of allSpecies) {
    it(`${species}: all channels are low at level 0, day 0`, () => {
      const w = computePerceptionWindow(PerceptionLevel.Minimal, species, 0);
      // imageResolution should be 1 (histogram only) or very close
      expect(w.imageResolution).toBeLessThanOrEqual(2);
      expect(w.imageResolution).toBeGreaterThanOrEqual(1);
      // colorDepth very low
      expect(w.colorDepth).toBeLessThanOrEqual(20);
      // No spatial awareness
      expect(w.spatialAwareness).toBe(false);
      // textAccess very low
      expect(w.textAccess).toBeLessThanOrEqual(15);
      // semanticDepth near zero
      expect(w.semanticDepth).toBeLessThanOrEqual(5);
      // frequencyRange low
      expect(w.frequencyRange).toBeLessThanOrEqual(20);
      // temporalResolution low
      expect(w.temporalResolution).toBeLessThanOrEqual(15);
      // No speech detection
      expect(w.canDetectSpeech).toBe(false);
      // sensorAccess low
      expect(w.sensorAccess).toBeLessThanOrEqual(20);
    });
  }
});

// ============================================================
// Level 4 — Near-full perception
// ============================================================

describe("Level 4 (Full) has near-full perception", () => {
  const allSpecies: PerceptionMode[] = [
    "chromatic",
    "vibration",
    "geometric",
    "thermal",
    "temporal",
    "chemical",
  ];

  for (const species of allSpecies) {
    it(`${species}: all channels are high at level 4, day 120`, () => {
      const w = computePerceptionWindow(PerceptionLevel.Full, species, 120);
      // imageResolution should be at or near 5
      expect(w.imageResolution).toBeGreaterThanOrEqual(4);
      // colorDepth high
      expect(w.colorDepth).toBeGreaterThanOrEqual(85);
      // spatial awareness on
      expect(w.spatialAwareness).toBe(true);
      // textAccess high
      expect(w.textAccess).toBeGreaterThanOrEqual(85);
      // semanticDepth high
      expect(w.semanticDepth).toBeGreaterThanOrEqual(85);
      // frequencyRange high
      expect(w.frequencyRange).toBeGreaterThanOrEqual(85);
      // temporalResolution high
      expect(w.temporalResolution).toBeGreaterThanOrEqual(85);
      // Speech detection on
      expect(w.canDetectSpeech).toBe(true);
      // sensorAccess high
      expect(w.sensorAccess).toBeGreaterThanOrEqual(85);
    });
  }
});

// ============================================================
// Monotonic increase: level N+1 >= level N for all channels
// ============================================================

describe("Monotonic increase across levels", () => {
  const allSpecies: PerceptionMode[] = [
    "chromatic",
    "vibration",
    "geometric",
    "thermal",
    "temporal",
    "chemical",
  ];

  const levels = [
    { level: PerceptionLevel.Minimal, day: 0 },
    { level: PerceptionLevel.Basic, day: 7 },
    { level: PerceptionLevel.Structured, day: 21 },
    { level: PerceptionLevel.Relational, day: 60 },
    { level: PerceptionLevel.Full, day: 120 },
  ];

  for (const species of allSpecies) {
    it(`${species}: each level's numeric values >= previous level`, () => {
      for (let i = 1; i < levels.length; i++) {
        const prev = computePerceptionWindow(levels[i - 1].level, species, levels[i - 1].day);
        const curr = computePerceptionWindow(levels[i].level, species, levels[i].day);

        const prevNums = numericChannels(prev);
        const currNums = numericChannels(curr);

        for (let j = 0; j < prevNums.length; j++) {
          expect(currNums[j]).toBeGreaterThanOrEqual(prevNums[j]);
        }
      }
    });
  }
});

// ============================================================
// Species modifier: chromatic has higher image values than vibration
// ============================================================

describe("Species modifier: chromatic has higher image values than vibration", () => {
  const levels = [
    { level: PerceptionLevel.Minimal, day: 0 },
    { level: PerceptionLevel.Basic, day: 7 },
    { level: PerceptionLevel.Structured, day: 21 },
    { level: PerceptionLevel.Relational, day: 60 },
  ];

  for (const { level, day } of levels) {
    it(`at level ${level}: chromatic.imageResolution >= vibration.imageResolution`, () => {
      const chromatic = computePerceptionWindow(level, "chromatic", day);
      const vibration = computePerceptionWindow(level, "vibration", day);
      expect(chromatic.imageResolution).toBeGreaterThanOrEqual(vibration.imageResolution);
    });

    it(`at level ${level}: chromatic.colorDepth >= vibration.colorDepth`, () => {
      const chromatic = computePerceptionWindow(level, "chromatic", day);
      const vibration = computePerceptionWindow(level, "vibration", day);
      expect(chromatic.colorDepth).toBeGreaterThanOrEqual(vibration.colorDepth);
    });
  }
});

// ============================================================
// Species modifier: vibration has higher audio values than chromatic
// ============================================================

describe("Species modifier: vibration has higher audio values than chromatic", () => {
  const levels = [
    { level: PerceptionLevel.Minimal, day: 0 },
    { level: PerceptionLevel.Basic, day: 7 },
    { level: PerceptionLevel.Structured, day: 21 },
    { level: PerceptionLevel.Relational, day: 60 },
  ];

  for (const { level, day } of levels) {
    it(`at level ${level}: vibration.frequencyRange >= chromatic.frequencyRange`, () => {
      const chromatic = computePerceptionWindow(level, "chromatic", day);
      const vibration = computePerceptionWindow(level, "vibration", day);
      expect(vibration.frequencyRange).toBeGreaterThanOrEqual(chromatic.frequencyRange);
    });

    it(`at level ${level}: vibration.temporalResolution >= chromatic.temporalResolution`, () => {
      const chromatic = computePerceptionWindow(level, "chromatic", day);
      const vibration = computePerceptionWindow(level, "vibration", day);
      expect(vibration.temporalResolution).toBeGreaterThanOrEqual(chromatic.temporalResolution);
    });
  }
});

// ============================================================
// getSpeciesPerceptionProfile returns correct primary channels
// ============================================================

describe("getSpeciesPerceptionProfile", () => {
  it("chromatic: primary channel is image", () => {
    const profile = getSpeciesPerceptionProfile("chromatic");
    expect(profile.primaryChannel).toBe("image");
    expect(profile.channelStrengths.image).toBeGreaterThan(1.0);
  });

  it("vibration: primary channel is audio", () => {
    const profile = getSpeciesPerceptionProfile("vibration");
    expect(profile.primaryChannel).toBe("audio");
    expect(profile.channelStrengths.audio).toBeGreaterThan(1.0);
  });

  it("geometric: primary channel is image", () => {
    const profile = getSpeciesPerceptionProfile("geometric");
    expect(profile.primaryChannel).toBe("image");
    expect(profile.channelStrengths.image).toBeGreaterThan(1.0);
  });

  it("thermal: primary channel is sensor", () => {
    const profile = getSpeciesPerceptionProfile("thermal");
    expect(profile.primaryChannel).toBe("sensor");
    expect(profile.channelStrengths.sensor).toBeGreaterThan(1.0);
  });

  it("temporal: primary channel is audio", () => {
    const profile = getSpeciesPerceptionProfile("temporal");
    expect(profile.primaryChannel).toBe("audio");
    expect(profile.channelStrengths.audio).toBeGreaterThan(1.0);
  });

  it("chemical: primary channel is sensor", () => {
    const profile = getSpeciesPerceptionProfile("chemical");
    expect(profile.primaryChannel).toBe("sensor");
    expect(profile.channelStrengths.sensor).toBeGreaterThan(1.0);
  });

  it("returns a copy (mutations do not affect source)", () => {
    const p1 = getSpeciesPerceptionProfile("chromatic");
    p1.channelStrengths.image = 99;
    const p2 = getSpeciesPerceptionProfile("chromatic");
    expect(p2.channelStrengths.image).not.toBe(99);
  });
});

// ============================================================
// growthDay adds fine-grained interpolation between levels
// ============================================================

describe("growthDay interpolation within a level", () => {
  it("mid-level day has higher values than level start day", () => {
    // Level 1 starts at day 7, next level at day 21
    // Day 14 is halfway through level 1
    const atStart = computePerceptionWindow(PerceptionLevel.Basic, "chromatic", 7);
    const atMid = computePerceptionWindow(PerceptionLevel.Basic, "chromatic", 14);

    // At least some numeric channels should be higher at day 14 than day 7
    const startNums = numericChannels(atStart);
    const midNums = numericChannels(atMid);

    let anyHigher = false;
    for (let i = 0; i < startNums.length; i++) {
      expect(midNums[i]).toBeGreaterThanOrEqual(startNums[i]);
      if (midNums[i] > startNums[i]) anyHigher = true;
    }
    expect(anyHigher).toBe(true);
  });

  it("day near next level threshold approaches next level values", () => {
    // Level 1 (Basic) at day 20 (just before Structured at day 21)
    // should be close to Level 2 base values
    const nearEnd = computePerceptionWindow(PerceptionLevel.Basic, "chromatic", 20);
    const nextStart = computePerceptionWindow(PerceptionLevel.Structured, "chromatic", 21);

    // The values at day 20 should be close to (but not exceed) day 21 values
    const nearNums = numericChannels(nearEnd);
    const nextNums = numericChannels(nextStart);

    for (let i = 0; i < nearNums.length; i++) {
      // Should not exceed the next level's start
      expect(nearNums[i]).toBeLessThanOrEqual(nextNums[i] + 1); // +1 tolerance for rounding
    }
  });

  it("Level Full (day 120) has no interpolation — already at max", () => {
    const atFull = computePerceptionWindow(PerceptionLevel.Full, "chromatic", 120);
    const atFullLater = computePerceptionWindow(PerceptionLevel.Full, "chromatic", 200);

    const fullNums = numericChannels(atFull);
    const laterNums = numericChannels(atFullLater);

    // At max level, day doesn't matter — values should be identical
    for (let i = 0; i < fullNums.length; i++) {
      expect(laterNums[i]).toBe(fullNums[i]);
    }
  });

  it("day 0 at Level Minimal produces the lowest possible values", () => {
    const w = computePerceptionWindow(PerceptionLevel.Minimal, "chromatic", 0);
    // These should match the base Minimal values (with species modifier)
    // chromatic image modifier is 1.2, so imageResolution = round(1 * 1.2) = 1.2 -> 1.2
    // But clamped to min 1, so still 1
    expect(w.imageResolution).toBeGreaterThanOrEqual(1);
    expect(w.canDetectSpeech).toBe(false);
    expect(w.spatialAwareness).toBe(false);
  });
});

// ============================================================
// Additional species-specific checks
// ============================================================

describe("Additional species modifier checks", () => {
  it("thermal has higher sensor access than chromatic at same level", () => {
    const thermal = computePerceptionWindow(PerceptionLevel.Basic, "thermal", 10);
    const chromatic = computePerceptionWindow(PerceptionLevel.Basic, "chromatic", 10);
    expect(thermal.sensorAccess).toBeGreaterThanOrEqual(chromatic.sensorAccess);
  });

  it("geometric has image and text strengths both above 1.0", () => {
    const profile = getSpeciesPerceptionProfile("geometric");
    expect(profile.channelStrengths.image).toBeGreaterThan(1.0);
    expect(profile.channelStrengths.text).toBeGreaterThan(1.0);
  });

  it("chemical has sensor strength > 1.0 and text strength >= 1.0", () => {
    const profile = getSpeciesPerceptionProfile("chemical");
    expect(profile.channelStrengths.sensor).toBeGreaterThan(1.0);
    expect(profile.channelStrengths.text).toBeGreaterThanOrEqual(1.0);
  });

  it("temporal has both audio and sensor strengths above baseline", () => {
    const profile = getSpeciesPerceptionProfile("temporal");
    expect(profile.channelStrengths.audio).toBeGreaterThan(1.0);
    expect(profile.channelStrengths.sensor).toBeGreaterThan(1.0);
  });
});

// ============================================================
// Edge cases
// ============================================================

describe("Edge cases", () => {
  it("values never exceed 100 (for 0-100 fields) even with species boost", () => {
    // At Full level, chromatic boosts image by 20%.
    // colorDepth base is 100 → 100 * 1.2 = 120, but should be clamped to 100.
    const w = computePerceptionWindow(PerceptionLevel.Full, "chromatic", 120);
    expect(w.colorDepth).toBeLessThanOrEqual(100);
    expect(w.textAccess).toBeLessThanOrEqual(100);
    expect(w.semanticDepth).toBeLessThanOrEqual(100);
    expect(w.frequencyRange).toBeLessThanOrEqual(100);
    expect(w.temporalResolution).toBeLessThanOrEqual(100);
    expect(w.sensorAccess).toBeLessThanOrEqual(100);
  });

  it("imageResolution never exceeds 5", () => {
    const w = computePerceptionWindow(PerceptionLevel.Full, "chromatic", 120);
    expect(w.imageResolution).toBeLessThanOrEqual(5);
  });

  it("values never go below minimum (imageResolution >= 1, others >= 0)", () => {
    // vibration has -10% image. At Minimal, imageResolution = 1 * 0.9 = 0.9
    // But it should be clamped to minimum 1
    const w = computePerceptionWindow(PerceptionLevel.Minimal, "vibration", 0);
    expect(w.imageResolution).toBeGreaterThanOrEqual(1);
    expect(w.colorDepth).toBeGreaterThanOrEqual(0);
    expect(w.textAccess).toBeGreaterThanOrEqual(0);
    expect(w.semanticDepth).toBeGreaterThanOrEqual(0);
    expect(w.frequencyRange).toBeGreaterThanOrEqual(0);
    expect(w.temporalResolution).toBeGreaterThanOrEqual(0);
    expect(w.sensorAccess).toBeGreaterThanOrEqual(0);
  });
});
