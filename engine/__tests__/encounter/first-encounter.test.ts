import { describe, it, expect } from "vitest";
import {
  isFirstEncounter,
  generateFirstEncounter,
  formatFirstEncounterDiary,
} from "../../src/encounter/first-encounter.js";
import type { PerceptionMode, Temperament } from "../../src/types.js";

const ALL_PERCEPTIONS: PerceptionMode[] = [
  "chromatic", "vibration", "geometric", "thermal", "temporal", "chemical",
];

const ALL_TEMPERAMENTS: Temperament[] = [
  "curious-cautious", "bold-impulsive", "calm-observant", "restless-exploratory",
];

const NOW = new Date("2026-01-15T12:00:00Z");

describe("isFirstEncounter", () => {
  it("returns true when totalInteractions is 0", () => {
    expect(isFirstEncounter(0)).toBe(true);
  });

  it("returns false when totalInteractions is 1 or more", () => {
    expect(isFirstEncounter(1)).toBe(false);
    expect(isFirstEncounter(10)).toBe(false);
    expect(isFirstEncounter(100)).toBe(false);
  });
});

describe("generateFirstEncounter", () => {
  it("generates a reaction with all required fields", () => {
    const reaction = generateFirstEncounter("chromatic", "curious-cautious", NOW);

    expect(reaction.expression).toBeTruthy();
    expect(reaction.innerExperience).toBeTruthy();
    expect(reaction.statusEffect).toBeDefined();
    expect(reaction.memoryImprint).toBeDefined();
  });

  it("expression is a non-empty string", () => {
    for (const perception of ALL_PERCEPTIONS) {
      for (const temperament of ALL_TEMPERAMENTS) {
        const reaction = generateFirstEncounter(perception, temperament, NOW);
        expect(reaction.expression.length).toBeGreaterThan(0);
      }
    }
  });

  it("inner experience contains species-specific content", () => {
    const chromatic = generateFirstEncounter("chromatic", "curious-cautious", NOW);
    expect(chromatic.innerExperience).toContain("color");

    const vibration = generateFirstEncounter("vibration", "bold-impulsive", NOW);
    expect(vibration.innerExperience).toContain("tremor");

    const geometric = generateFirstEncounter("geometric", "calm-observant", NOW);
    expect(geometric.innerExperience).toContain("form");

    const thermal = generateFirstEncounter("thermal", "restless-exploratory", NOW);
    expect(thermal.innerExperience).toContain("Warmth");

    const temporal = generateFirstEncounter("temporal", "curious-cautious", NOW);
    expect(temporal.innerExperience).toContain("rhythm");

    const chemical = generateFirstEncounter("chemical", "bold-impulsive", NOW);
    expect(chemical.innerExperience).toContain("element");
  });

  it("inner experience also contains temperament-specific flavor", () => {
    const cautious = generateFirstEncounter("chromatic", "curious-cautious", NOW);
    expect(cautious.innerExperience).toContain("carefully");

    const bold = generateFirstEncounter("chromatic", "bold-impulsive", NOW);
    expect(bold.innerExperience).toContain("immediately");

    const calm = generateFirstEncounter("chromatic", "calm-observant", NOW);
    expect(calm.innerExperience).toContain("watch");

    const restless = generateFirstEncounter("chromatic", "restless-exploratory", NOW);
    expect(restless.innerExperience).toContain("circle");
  });

  describe("status effects", () => {
    it("curiosity always increases", () => {
      for (const perception of ALL_PERCEPTIONS) {
        for (const temperament of ALL_TEMPERAMENTS) {
          const reaction = generateFirstEncounter(perception, temperament, NOW);
          expect(reaction.statusEffect.curiosity).toBeGreaterThan(0);
        }
      }
    });

    it("mood always increases (meeting another is positive)", () => {
      for (const perception of ALL_PERCEPTIONS) {
        for (const temperament of ALL_TEMPERAMENTS) {
          const reaction = generateFirstEncounter(perception, temperament, NOW);
          expect(reaction.statusEffect.mood).toBeGreaterThan(0);
        }
      }
    });

    it("energy always increases (the shock of first contact)", () => {
      for (const perception of ALL_PERCEPTIONS) {
        for (const temperament of ALL_TEMPERAMENTS) {
          const reaction = generateFirstEncounter(perception, temperament, NOW);
          expect(reaction.statusEffect.energy).toBeGreaterThan(0);
        }
      }
    });

    it("bold-impulsive has higher mood effect than calm-observant", () => {
      const bold = generateFirstEncounter("chromatic", "bold-impulsive", NOW);
      const calm = generateFirstEncounter("chromatic", "calm-observant", NOW);
      expect(bold.statusEffect.mood).toBeGreaterThan(calm.statusEffect.mood);
    });

    it("restless-exploratory has highest curiosity boost", () => {
      const restless = generateFirstEncounter("chromatic", "restless-exploratory", NOW);
      const calm = generateFirstEncounter("chromatic", "calm-observant", NOW);
      expect(restless.statusEffect.curiosity).toBeGreaterThan(calm.statusEffect.curiosity);
    });
  });

  describe("memory imprint", () => {
    it("has timestamp from now", () => {
      const reaction = generateFirstEncounter("chromatic", "curious-cautious", NOW);
      expect(reaction.memoryImprint.timestamp).toBe(NOW.toISOString());
    });

    it("summary starts with [FIRST ENCOUNTER]", () => {
      for (const perception of ALL_PERCEPTIONS) {
        const reaction = generateFirstEncounter(perception, "curious-cautious", NOW);
        expect(reaction.memoryImprint.summary).toMatch(/^\[FIRST ENCOUNTER\]/);
      }
    });

    it("mood reflects the positive status effect", () => {
      const reaction = generateFirstEncounter("chromatic", "bold-impulsive", NOW);
      expect(reaction.memoryImprint.mood).toBeGreaterThan(50);
    });
  });

  describe("expression styles by temperament", () => {
    it("gentle (curious-cautious) uses wider spacing", () => {
      const reaction = generateFirstEncounter("chromatic", "curious-cautious", NOW);
      // Gentle style has pauses between symbols
      expect(reaction.expression).toContain(" ");
    });

    it("excited (bold-impulsive) has dense symbol clusters", () => {
      const reaction = generateFirstEncounter("chromatic", "bold-impulsive", NOW);
      // Excited has continuous symbols (no pauses within burst)
      expect(reaction.expression).toMatch(/[◎○]{2,}/);
    });

    it("still (calm-observant) is minimal with long pauses", () => {
      const reaction = generateFirstEncounter("chromatic", "calm-observant", NOW);
      // Still style has extended whitespace
      expect(reaction.expression).toMatch(/\s{3,}/);
    });

    it("probing (restless-exploratory) surrounds the other", () => {
      const reaction = generateFirstEncounter("chromatic", "restless-exploratory", NOW);
      // Probing style has otherSymbol appearing multiple times
      const otherCount = (reaction.expression.match(/☆/g) ?? []).length;
      expect(otherCount).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("formatFirstEncounterDiary", () => {
  it("formats a complete diary entry", () => {
    const reaction = generateFirstEncounter("chromatic", "curious-cautious", NOW);
    const diary = formatFirstEncounterDiary(reaction, "chromatic", "curious-cautious", NOW);

    expect(diary).toContain("# First Encounter");
    expect(diary).toContain("2026-01-15");
    expect(diary).toContain("chromatic");
    expect(diary).toContain("curious-cautious");
    expect(diary).toContain(reaction.expression);
    expect(diary).toContain(reaction.innerExperience);
    expect(diary).toContain("first awareness of another");
  });

  it("includes signed status effect numbers", () => {
    const reaction = generateFirstEncounter("vibration", "bold-impulsive", NOW);
    const diary = formatFirstEncounterDiary(reaction, "vibration", "bold-impulsive", NOW);

    expect(diary).toContain("+"); // Positive effects have + sign
  });

  it("works for all species", () => {
    for (const perception of ALL_PERCEPTIONS) {
      const reaction = generateFirstEncounter(perception, "calm-observant", NOW);
      const diary = formatFirstEncounterDiary(reaction, perception, "calm-observant", NOW);
      expect(diary).toContain(perception);
      expect(diary).toContain("First Encounter");
    }
  });
});

describe("24 unique combinations", () => {
  it("all 6 × 4 = 24 species × temperament combos produce distinct expressions", () => {
    const expressions = new Set<string>();

    for (const perception of ALL_PERCEPTIONS) {
      for (const temperament of ALL_TEMPERAMENTS) {
        const reaction = generateFirstEncounter(perception, temperament, NOW);
        expressions.add(reaction.expression);
      }
    }

    // All 24 combinations should produce distinct expressions
    expect(expressions.size).toBe(24);
  });
});
