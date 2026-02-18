import { describe, it, expect } from "vitest";
import {
  computeInteractionEffect,
  computeNaturalDecay,
  applyMoodDelta,
  type InteractionContext,
} from "../../src/mood/mood-engine.js";
import { LanguageLevel, type Status } from "../../src/types.js";

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    mood: 50,
    energy: 50,
    curiosity: 50,
    comfort: 50,
    languageLevel: LanguageLevel.SymbolsOnly,
    growthDay: 0,
    lastInteraction: "never",
    ...overrides,
  };
}

describe("computeInteractionEffect", () => {
  const baseContext: InteractionContext = {
    minutesSinceLastInteraction: 30,
    userInitiated: true,
    messageLength: 20,
  };

  it("increases mood when user initiates", () => {
    const delta = computeInteractionEffect(makeStatus(), baseContext, "curious-cautious");
    expect(delta.mood).toBeGreaterThan(0);
  });

  it("increases comfort when user initiates", () => {
    const delta = computeInteractionEffect(makeStatus(), baseContext, "curious-cautious");
    expect(delta.comfort).toBeGreaterThan(0);
  });

  it("increases curiosity more with longer messages", () => {
    const short = computeInteractionEffect(
      makeStatus(),
      { ...baseContext, messageLength: 5 },
      "curious-cautious",
    );
    const long = computeInteractionEffect(
      makeStatus(),
      { ...baseContext, messageLength: 100 },
      "curious-cautious",
    );
    expect(long.curiosity).toBeGreaterThan(short.curiosity);
  });

  it("reduces comfort after long absence", () => {
    const delta = computeInteractionEffect(
      makeStatus(),
      { ...baseContext, minutesSinceLastInteraction: 500 },
      "curious-cautious",
    );
    // comfort gets -8 from absence + 5 from user-initiated ≈ net depends on temperament
    // But the absence penalty should be felt
    expect(delta.comfort).toBeLessThan(
      computeInteractionEffect(makeStatus(), baseContext, "curious-cautious").comfort,
    );
  });

  it("applies temperament modifiers for bold-impulsive", () => {
    const bold = computeInteractionEffect(makeStatus(), baseContext, "bold-impulsive");
    const calm = computeInteractionEffect(makeStatus(), baseContext, "calm-observant");
    expect(bold.mood).toBeGreaterThan(calm.mood);
  });
});

describe("computeNaturalDecay", () => {
  it("returns zero-ish deltas with recent interaction", () => {
    const decay = computeNaturalDecay(makeStatus(), 5);
    expect(Math.abs(decay.mood)).toBeLessThanOrEqual(1);
    expect(Math.abs(decay.energy)).toBeLessThanOrEqual(1);
  });

  it("decays comfort over time", () => {
    const decay = computeNaturalDecay(makeStatus(), 120);
    expect(decay.comfort).toBeLessThan(0);
  });

  it("pulls high values back toward baseline", () => {
    const decay = computeNaturalDecay(makeStatus({ mood: 90 }), 120);
    expect(decay.mood).toBeLessThan(0);
  });

  it("pulls low values back toward baseline", () => {
    const decay = computeNaturalDecay(makeStatus({ mood: 10 }), 120);
    expect(decay.mood).toBeGreaterThan(0);
  });
});

describe("applyMoodDelta", () => {
  it("applies positive deltas", () => {
    const result = applyMoodDelta(makeStatus(), {
      mood: 10,
      energy: 5,
      curiosity: 3,
      comfort: 7,
    });
    expect(result.mood).toBe(60);
    expect(result.energy).toBe(55);
    expect(result.curiosity).toBe(53);
    expect(result.comfort).toBe(57);
  });

  it("clamps values at 0", () => {
    const result = applyMoodDelta(makeStatus({ mood: 5 }), {
      mood: -20,
      energy: 0,
      curiosity: 0,
      comfort: 0,
    });
    expect(result.mood).toBe(0);
  });

  it("clamps values at 100", () => {
    const result = applyMoodDelta(makeStatus({ mood: 95 }), {
      mood: 20,
      energy: 0,
      curiosity: 0,
      comfort: 0,
    });
    expect(result.mood).toBe(100);
  });

  it("preserves non-mood fields", () => {
    const status = makeStatus({ growthDay: 5, lastInteraction: "2026-01-01T00:00:00Z" });
    const result = applyMoodDelta(status, { mood: 0, energy: 0, curiosity: 0, comfort: 0 });
    expect(result.growthDay).toBe(5);
    expect(result.lastInteraction).toBe("2026-01-01T00:00:00Z");
  });
});
