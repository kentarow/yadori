/**
 * End-to-End Test: First Encounter System
 *
 * Verifies the complete First Encounter lifecycle:
 *   Entity is born (genesis) -> first message arrives -> species x temperament
 *   reaction is generated -> expression, inner experience, status effect,
 *   memory imprint -> diary entry -> second interaction returns null
 *
 * Tests the First Encounter Engine (first-encounter.ts) integrated through
 * the Status Manager (status-manager.ts) using real engine functions with no mocks.
 *
 * Coverage:
 *   1. All 6 species produce unique first encounter expressions
 *   2. All 4 temperaments affect the encounter differently
 *   3. Species x temperament matrix (6 x 4 = 24 combinations)
 *   4. First encounter diary entry generation
 *   5. First encounter status effects (mood/curiosity/comfort changes)
 *   6. First encounter is one-time only (second interaction returns null)
 *   7. Memory imprint from first encounter
 *   8. Edge cases: empty message, very long message
 */

import { describe, it, expect } from "vitest";
import { createFixedSeed } from "../../engine/src/genesis/seed-generator.js";
import {
  isFirstEncounter,
  generateFirstEncounter,
  formatFirstEncounterDiary,
  type FirstEncounterReaction,
} from "../../engine/src/encounter/first-encounter.js";
import {
  createEntityState,
  processInteraction,
  type EntityState,
  type InteractionResult,
} from "../../engine/src/status/status-manager.js";
import type { InteractionContext } from "../../engine/src/mood/mood-engine.js";
import type {
  HardwareBody,
  PerceptionMode,
  Temperament,
} from "../../engine/src/types.js";

// ---------------------------------------------------------------------------
// Constants and fixtures
// ---------------------------------------------------------------------------

const ALL_SPECIES: PerceptionMode[] = [
  "chromatic",
  "vibration",
  "geometric",
  "thermal",
  "temporal",
  "chemical",
];

const ALL_TEMPERAMENTS: Temperament[] = [
  "curious-cautious",
  "bold-impulsive",
  "calm-observant",
  "restless-exploratory",
];

const TEST_HW: HardwareBody = {
  platform: "darwin",
  arch: "arm64",
  totalMemoryGB: 16,
  cpuModel: "Apple M4",
  storageGB: 256,
};

const BIRTH_TIME = new Date("2026-02-01T00:00:00Z");
const NOW = new Date("2026-02-20T14:00:00Z");

function makeSeed(
  overrides: Partial<Parameters<typeof createFixedSeed>[0]> = {},
) {
  return createFixedSeed({
    hardwareBody: TEST_HW,
    createdAt: BIRTH_TIME.toISOString(),
    ...overrides,
  });
}

function makeContext(
  overrides: Partial<InteractionContext> = {},
): InteractionContext {
  return {
    minutesSinceLastInteraction: 30,
    userInitiated: true,
    messageLength: 50,
    ...overrides,
  };
}

/** Run processInteraction for a fresh entity and return the result */
function firstInteraction(
  perception: PerceptionMode,
  temperament: Temperament,
): InteractionResult {
  const seed = makeSeed({ perception, temperament });
  const state = createEntityState(seed, BIRTH_TIME);
  return processInteraction(state, makeContext(), NOW);
}

// ============================================================
// 1. All 6 species produce unique first encounter expressions
// ============================================================

describe("all 6 species produce unique first encounter expressions", () => {
  it("chromatic species generates a valid first encounter expression", () => {
    const result = firstInteraction("chromatic", "curious-cautious");
    expect(result.firstEncounter).not.toBeNull();
    expect(result.firstEncounter!.expression.length).toBeGreaterThan(0);
    expect(result.firstEncounter!.expression).toContain("☆"); // chromatic other symbol
  });

  it("vibration species generates a valid first encounter expression", () => {
    const result = firstInteraction("vibration", "curious-cautious");
    expect(result.firstEncounter).not.toBeNull();
    expect(result.firstEncounter!.expression.length).toBeGreaterThan(0);
    expect(result.firstEncounter!.expression).toContain("△"); // vibration other symbol
  });

  it("geometric species generates a valid first encounter expression", () => {
    const result = firstInteraction("geometric", "curious-cautious");
    expect(result.firstEncounter).not.toBeNull();
    expect(result.firstEncounter!.expression.length).toBeGreaterThan(0);
    expect(result.firstEncounter!.expression).toContain("◇"); // geometric other symbol
  });

  it("thermal species generates a valid first encounter expression", () => {
    const result = firstInteraction("thermal", "curious-cautious");
    expect(result.firstEncounter).not.toBeNull();
    expect(result.firstEncounter!.expression.length).toBeGreaterThan(0);
    expect(result.firstEncounter!.expression).toContain("◎"); // thermal other symbol
  });

  it("temporal species generates a valid first encounter expression", () => {
    const result = firstInteraction("temporal", "curious-cautious");
    expect(result.firstEncounter).not.toBeNull();
    expect(result.firstEncounter!.expression.length).toBeGreaterThan(0);
    expect(result.firstEncounter!.expression).toContain("◉"); // temporal other symbol
  });

  it("chemical species generates a valid first encounter expression", () => {
    const result = firstInteraction("chemical", "curious-cautious");
    expect(result.firstEncounter).not.toBeNull();
    expect(result.firstEncounter!.expression.length).toBeGreaterThan(0);
    expect(result.firstEncounter!.expression).toContain("★"); // chemical other symbol
  });

  it("all 6 species produce mutually distinct expressions for the same temperament", () => {
    const expressions = new Set<string>();
    for (const species of ALL_SPECIES) {
      const result = firstInteraction(species, "bold-impulsive");
      expressions.add(result.firstEncounter!.expression);
    }
    expect(expressions.size).toBe(6);
  });
});

// ============================================================
// 2. All 4 temperaments affect the encounter differently
// ============================================================

describe("all 4 temperaments affect the encounter differently", () => {
  it("curious-cautious produces gentle-style expression with spaced symbols", () => {
    const reaction = generateFirstEncounter("chromatic", "curious-cautious", NOW);
    // Gentle style: pauses between symbols
    expect(reaction.expression).toContain(" ");
    expect(reaction.innerExperience).toContain("carefully");
  });

  it("bold-impulsive produces excited-style expression with dense bursts", () => {
    const reaction = generateFirstEncounter("chromatic", "bold-impulsive", NOW);
    // Excited style: continuous symbols (burst)
    expect(reaction.expression).toMatch(/[◎○]{2,}/);
    expect(reaction.innerExperience).toContain("immediately");
  });

  it("calm-observant produces still-style expression with extended pauses", () => {
    const reaction = generateFirstEncounter("chromatic", "calm-observant", NOW);
    // Still style: long whitespace
    expect(reaction.expression).toMatch(/\s{3,}/);
    expect(reaction.innerExperience).toContain("watch");
  });

  it("restless-exploratory produces probing-style expression surrounding the other", () => {
    const reaction = generateFirstEncounter("chromatic", "restless-exploratory", NOW);
    // Probing style: otherSymbol appears multiple times
    const otherCount = (reaction.expression.match(/☆/g) ?? []).length;
    expect(otherCount).toBeGreaterThanOrEqual(2);
    expect(reaction.innerExperience).toContain("circle");
  });

  it("all 4 temperaments produce distinct expressions for the same species", () => {
    const expressions = new Set<string>();
    for (const temperament of ALL_TEMPERAMENTS) {
      const reaction = generateFirstEncounter("vibration", temperament, NOW);
      expressions.add(reaction.expression);
    }
    expect(expressions.size).toBe(4);
  });

  it("all 4 temperaments produce distinct inner experience text", () => {
    const experiences = new Set<string>();
    for (const temperament of ALL_TEMPERAMENTS) {
      const reaction = generateFirstEncounter("geometric", temperament, NOW);
      experiences.add(reaction.innerExperience);
    }
    expect(experiences.size).toBe(4);
  });
});

// ============================================================
// 3. Species x temperament matrix (24 unique combinations)
// ============================================================

describe("species x temperament matrix — 24 unique combinations", () => {
  it("all 24 combinations produce distinct expressions", () => {
    const expressions = new Set<string>();
    for (const species of ALL_SPECIES) {
      for (const temperament of ALL_TEMPERAMENTS) {
        const reaction = generateFirstEncounter(species, temperament, NOW);
        expressions.add(reaction.expression);
      }
    }
    expect(expressions.size).toBe(24);
  });

  it("all 24 combinations produce non-empty expression strings", () => {
    for (const species of ALL_SPECIES) {
      for (const temperament of ALL_TEMPERAMENTS) {
        const reaction = generateFirstEncounter(species, temperament, NOW);
        expect(reaction.expression.length).toBeGreaterThan(0);
      }
    }
  });

  it("all 24 combinations have non-empty inner experience text", () => {
    for (const species of ALL_SPECIES) {
      for (const temperament of ALL_TEMPERAMENTS) {
        const reaction = generateFirstEncounter(species, temperament, NOW);
        expect(reaction.innerExperience.length).toBeGreaterThan(0);
      }
    }
  });

  it("all 24 combinations produce valid status effects (mood delta)", () => {
    for (const species of ALL_SPECIES) {
      for (const temperament of ALL_TEMPERAMENTS) {
        const reaction = generateFirstEncounter(species, temperament, NOW);
        const fx = reaction.statusEffect;
        expect(typeof fx.mood).toBe("number");
        expect(typeof fx.energy).toBe("number");
        expect(typeof fx.curiosity).toBe("number");
        expect(typeof fx.comfort).toBe("number");
      }
    }
  });

  it("all 24 combinations have a valid memory imprint", () => {
    for (const species of ALL_SPECIES) {
      for (const temperament of ALL_TEMPERAMENTS) {
        const reaction = generateFirstEncounter(species, temperament, NOW);
        expect(reaction.memoryImprint.timestamp).toBe(NOW.toISOString());
        expect(reaction.memoryImprint.summary).toMatch(/^\[FIRST ENCOUNTER\]/);
        expect(typeof reaction.memoryImprint.mood).toBe("number");
      }
    }
  });
});

// ============================================================
// 4. First encounter diary entry generation
// ============================================================

describe("first encounter diary entry generation", () => {
  it("diary contains the date of the encounter", () => {
    const reaction = generateFirstEncounter("chromatic", "curious-cautious", NOW);
    const diary = formatFirstEncounterDiary(reaction, "chromatic", "curious-cautious", NOW);
    expect(diary).toContain("2026-02-20");
  });

  it("diary contains the species perception type", () => {
    for (const species of ALL_SPECIES) {
      const reaction = generateFirstEncounter(species, "bold-impulsive", NOW);
      const diary = formatFirstEncounterDiary(reaction, species, "bold-impulsive", NOW);
      expect(diary).toContain(species);
    }
  });

  it("diary contains the temperament", () => {
    for (const temperament of ALL_TEMPERAMENTS) {
      const reaction = generateFirstEncounter("thermal", temperament, NOW);
      const diary = formatFirstEncounterDiary(reaction, "thermal", temperament, NOW);
      expect(diary).toContain(temperament);
    }
  });

  it("diary contains the entity's first expression", () => {
    const reaction = generateFirstEncounter("chemical", "restless-exploratory", NOW);
    const diary = formatFirstEncounterDiary(reaction, "chemical", "restless-exploratory", NOW);
    expect(diary).toContain(reaction.expression);
  });

  it("diary contains the inner experience narrative", () => {
    const reaction = generateFirstEncounter("vibration", "calm-observant", NOW);
    const diary = formatFirstEncounterDiary(reaction, "vibration", "calm-observant", NOW);
    expect(diary).toContain(reaction.innerExperience);
  });

  it("diary contains signed status effect numbers", () => {
    const reaction = generateFirstEncounter("temporal", "bold-impulsive", NOW);
    const diary = formatFirstEncounterDiary(reaction, "temporal", "bold-impulsive", NOW);
    // Positive effects should have a + prefix
    expect(diary).toContain("+");
    // Should contain mood/energy/curiosity/comfort labels
    expect(diary).toContain("mood:");
    expect(diary).toContain("energy:");
    expect(diary).toContain("curiosity:");
    expect(diary).toContain("comfort:");
  });

  it("diary contains the commemorative closing line", () => {
    const reaction = generateFirstEncounter("geometric", "curious-cautious", NOW);
    const diary = formatFirstEncounterDiary(reaction, "geometric", "curious-cautious", NOW);
    expect(diary).toContain("first awareness of another");
  });

  it("diary is generated via processInteraction on first message", () => {
    const result = firstInteraction("chromatic", "bold-impulsive");
    expect(result.firstEncounterDiaryMd).not.toBeNull();
    expect(result.firstEncounterDiaryMd!).toContain("First Encounter");
    expect(result.firstEncounterDiaryMd!).toContain("chromatic");
    expect(result.firstEncounterDiaryMd!).toContain("bold-impulsive");
  });
});

// ============================================================
// 5. First encounter status effects
// ============================================================

describe("first encounter status effects", () => {
  it("curiosity always increases on first encounter for all combinations", () => {
    for (const species of ALL_SPECIES) {
      for (const temperament of ALL_TEMPERAMENTS) {
        const reaction = generateFirstEncounter(species, temperament, NOW);
        expect(reaction.statusEffect.curiosity).toBeGreaterThan(0);
      }
    }
  });

  it("mood always increases on first encounter for all combinations", () => {
    for (const species of ALL_SPECIES) {
      for (const temperament of ALL_TEMPERAMENTS) {
        const reaction = generateFirstEncounter(species, temperament, NOW);
        expect(reaction.statusEffect.mood).toBeGreaterThan(0);
      }
    }
  });

  it("energy always increases on first encounter for all combinations", () => {
    for (const species of ALL_SPECIES) {
      for (const temperament of ALL_TEMPERAMENTS) {
        const reaction = generateFirstEncounter(species, temperament, NOW);
        expect(reaction.statusEffect.energy).toBeGreaterThan(0);
      }
    }
  });

  it("bold-impulsive amplifies mood more than calm-observant", () => {
    for (const species of ALL_SPECIES) {
      const bold = generateFirstEncounter(species, "bold-impulsive", NOW);
      const calm = generateFirstEncounter(species, "calm-observant", NOW);
      expect(bold.statusEffect.mood).toBeGreaterThan(calm.statusEffect.mood);
    }
  });

  it("restless-exploratory has highest curiosity boost among temperaments", () => {
    for (const species of ALL_SPECIES) {
      const restless = generateFirstEncounter(species, "restless-exploratory", NOW);
      for (const temperament of ALL_TEMPERAMENTS) {
        if (temperament === "restless-exploratory") continue;
        const other = generateFirstEncounter(species, temperament, NOW);
        expect(restless.statusEffect.curiosity).toBeGreaterThanOrEqual(
          other.statusEffect.curiosity,
        );
      }
    }
  });

  it("bold-impulsive has highest energy boost among temperaments", () => {
    for (const species of ALL_SPECIES) {
      const bold = generateFirstEncounter(species, "bold-impulsive", NOW);
      for (const temperament of ALL_TEMPERAMENTS) {
        if (temperament === "bold-impulsive") continue;
        const other = generateFirstEncounter(species, temperament, NOW);
        expect(bold.statusEffect.energy).toBeGreaterThanOrEqual(
          other.statusEffect.energy,
        );
      }
    }
  });

  it("first encounter status effect is applied to entity state via processInteraction", () => {
    const seed = makeSeed({ perception: "chromatic", temperament: "bold-impulsive" });
    const state = createEntityState(seed, BIRTH_TIME);
    const baseMood = state.status.mood;

    const result = processInteraction(state, makeContext(), NOW);

    // The first encounter mood boost is on top of the normal interaction effect,
    // so mood should have increased significantly
    expect(result.updatedState.status.mood).toBeGreaterThan(baseMood);
  });

  it("all status values remain in 0-100 range after first encounter", () => {
    for (const species of ALL_SPECIES) {
      for (const temperament of ALL_TEMPERAMENTS) {
        const result = firstInteraction(species, temperament);
        const s = result.updatedState.status;
        expect(s.mood).toBeGreaterThanOrEqual(0);
        expect(s.mood).toBeLessThanOrEqual(100);
        expect(s.energy).toBeGreaterThanOrEqual(0);
        expect(s.energy).toBeLessThanOrEqual(100);
        expect(s.curiosity).toBeGreaterThanOrEqual(0);
        expect(s.curiosity).toBeLessThanOrEqual(100);
        expect(s.comfort).toBeGreaterThanOrEqual(0);
        expect(s.comfort).toBeLessThanOrEqual(100);
      }
    }
  });
});

// ============================================================
// 6. First encounter is one-time only
// ============================================================

describe("first encounter is one-time only", () => {
  it("isFirstEncounter returns true only when totalInteractions is 0", () => {
    expect(isFirstEncounter(0)).toBe(true);
    expect(isFirstEncounter(1)).toBe(false);
    expect(isFirstEncounter(2)).toBe(false);
    expect(isFirstEncounter(100)).toBe(false);
  });

  it("second interaction via processInteraction returns null for firstEncounter", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    const first = processInteraction(state, makeContext(), NOW);
    expect(first.firstEncounter).not.toBeNull();
    state = first.updatedState;

    const second = processInteraction(
      state,
      makeContext({ minutesSinceLastInteraction: 5 }),
      new Date(NOW.getTime() + 5 * 60_000),
    );
    expect(second.firstEncounter).toBeNull();
    expect(second.firstEncounterDiaryMd).toBeNull();
  });

  it("third and subsequent interactions also return null for firstEncounter", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    // First interaction
    state = processInteraction(state, makeContext(), NOW).updatedState;

    // Interactions 2 through 10
    for (let i = 1; i <= 9; i++) {
      const t = new Date(NOW.getTime() + i * 60_000);
      const result = processInteraction(
        state,
        makeContext({ minutesSinceLastInteraction: 1 }),
        t,
      );
      expect(result.firstEncounter).toBeNull();
      expect(result.firstEncounterDiaryMd).toBeNull();
      state = result.updatedState;
    }
  });

  it("second interaction still updates state normally (totalInteractions increments)", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    const first = processInteraction(state, makeContext(), NOW);
    state = first.updatedState;
    expect(state.language.totalInteractions).toBe(1);

    const second = processInteraction(
      state,
      makeContext({ minutesSinceLastInteraction: 5 }),
      new Date(NOW.getTime() + 5 * 60_000),
    );
    expect(second.updatedState.language.totalInteractions).toBe(2);
  });
});

// ============================================================
// 7. Memory imprint from first encounter
// ============================================================

describe("memory imprint from first encounter", () => {
  it("memory imprint timestamp matches the encounter time", () => {
    for (const species of ALL_SPECIES) {
      const reaction = generateFirstEncounter(species, "curious-cautious", NOW);
      expect(reaction.memoryImprint.timestamp).toBe(NOW.toISOString());
    }
  });

  it("memory imprint summary starts with [FIRST ENCOUNTER] tag", () => {
    for (const species of ALL_SPECIES) {
      for (const temperament of ALL_TEMPERAMENTS) {
        const reaction = generateFirstEncounter(species, temperament, NOW);
        expect(reaction.memoryImprint.summary).toMatch(/^\[FIRST ENCOUNTER\]/);
      }
    }
  });

  it("memory imprint mood is above 50 (positive experience)", () => {
    for (const species of ALL_SPECIES) {
      for (const temperament of ALL_TEMPERAMENTS) {
        const reaction = generateFirstEncounter(species, temperament, NOW);
        expect(reaction.memoryImprint.mood).toBeGreaterThan(50);
      }
    }
  });

  it("first encounter memory imprint is recorded in hot memory via processInteraction", () => {
    const seed = makeSeed({ perception: "temporal", temperament: "restless-exploratory" });
    const state = createEntityState(seed, BIRTH_TIME);

    const result = processInteraction(state, makeContext(), NOW);

    const hotMemories = result.updatedState.memory.hot;
    expect(hotMemories.length).toBe(1);
    expect(hotMemories[0].summary).toContain("[FIRST ENCOUNTER]");
    expect(hotMemories[0].timestamp).toBe(NOW.toISOString());
  });

  it("first encounter memory summary contains species-relevant content", () => {
    const chromatic = generateFirstEncounter("chromatic", "bold-impulsive", NOW);
    expect(chromatic.memoryImprint.summary).toContain("color");

    const vibration = generateFirstEncounter("vibration", "calm-observant", NOW);
    expect(vibration.memoryImprint.summary).toContain("tremor");

    const geometric = generateFirstEncounter("geometric", "restless-exploratory", NOW);
    expect(geometric.memoryImprint.summary).toContain("form");

    const thermal = generateFirstEncounter("thermal", "curious-cautious", NOW);
    expect(thermal.memoryImprint.summary).toContain("Warmth");

    const temporal = generateFirstEncounter("temporal", "bold-impulsive", NOW);
    expect(temporal.memoryImprint.summary).toContain("rhythm");

    const chemical = generateFirstEncounter("chemical", "calm-observant", NOW);
    expect(chemical.memoryImprint.summary).toContain("element");
  });
});

// ============================================================
// 8. Edge cases
// ============================================================

describe("edge cases", () => {
  it("first encounter triggers even with zero-length message", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const result = processInteraction(
      state,
      makeContext({ messageLength: 0 }),
      NOW,
    );

    expect(result.firstEncounter).not.toBeNull();
    expect(result.firstEncounter!.expression.length).toBeGreaterThan(0);
    expect(result.firstEncounterDiaryMd).not.toBeNull();
  });

  it("first encounter triggers with very long message (10000 chars)", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const result = processInteraction(
      state,
      makeContext({ messageLength: 10000 }),
      NOW,
    );

    expect(result.firstEncounter).not.toBeNull();
    expect(result.firstEncounter!.expression.length).toBeGreaterThan(0);
    expect(result.firstEncounterDiaryMd).not.toBeNull();
  });

  it("first encounter triggers regardless of minutesSinceLastInteraction value", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    // Even with 0 minutes since last interaction (no prior interaction exists)
    const result = processInteraction(
      state,
      makeContext({ minutesSinceLastInteraction: 0 }),
      NOW,
    );

    expect(result.firstEncounter).not.toBeNull();
  });

  it("first encounter triggers when userInitiated is false (bot-initiated)", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const result = processInteraction(
      state,
      makeContext({ userInitiated: false }),
      NOW,
    );

    expect(result.firstEncounter).not.toBeNull();
    expect(result.firstEncounter!.expression.length).toBeGreaterThan(0);
  });

  it("first encounter reaction is deterministic for same species and temperament", () => {
    const r1 = generateFirstEncounter("chemical", "bold-impulsive", NOW);
    const r2 = generateFirstEncounter("chemical", "bold-impulsive", NOW);

    expect(r1.expression).toBe(r2.expression);
    expect(r1.innerExperience).toBe(r2.innerExperience);
    expect(r1.statusEffect).toEqual(r2.statusEffect);
  });

  it("different timestamps produce different memory imprint timestamps but same expression", () => {
    const t1 = new Date("2026-01-01T00:00:00Z");
    const t2 = new Date("2026-06-15T12:30:00Z");

    const r1 = generateFirstEncounter("thermal", "calm-observant", t1);
    const r2 = generateFirstEncounter("thermal", "calm-observant", t2);

    expect(r1.expression).toBe(r2.expression);
    expect(r1.memoryImprint.timestamp).not.toBe(r2.memoryImprint.timestamp);
    expect(r1.memoryImprint.timestamp).toBe(t1.toISOString());
    expect(r2.memoryImprint.timestamp).toBe(t2.toISOString());
  });
});

// ============================================================
// 9. Species-specific inner experience content
// ============================================================

describe("species-specific inner experience content", () => {
  it("chromatic inner experience mentions color", () => {
    const reaction = generateFirstEncounter("chromatic", "curious-cautious", NOW);
    expect(reaction.innerExperience.toLowerCase()).toContain("color");
  });

  it("vibration inner experience mentions tremor", () => {
    const reaction = generateFirstEncounter("vibration", "bold-impulsive", NOW);
    expect(reaction.innerExperience.toLowerCase()).toContain("tremor");
  });

  it("geometric inner experience mentions form", () => {
    const reaction = generateFirstEncounter("geometric", "calm-observant", NOW);
    expect(reaction.innerExperience.toLowerCase()).toContain("form");
  });

  it("thermal inner experience mentions warmth", () => {
    const reaction = generateFirstEncounter("thermal", "restless-exploratory", NOW);
    expect(reaction.innerExperience.toLowerCase()).toContain("warmth");
  });

  it("temporal inner experience mentions rhythm", () => {
    const reaction = generateFirstEncounter("temporal", "curious-cautious", NOW);
    expect(reaction.innerExperience.toLowerCase()).toContain("rhythm");
  });

  it("chemical inner experience mentions element", () => {
    const reaction = generateFirstEncounter("chemical", "bold-impulsive", NOW);
    expect(reaction.innerExperience.toLowerCase()).toContain("element");
  });
});
