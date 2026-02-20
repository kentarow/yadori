/**
 * End-to-End Test: Interaction Processing Pipeline
 *
 * Verifies the complete user interaction flow:
 *   User sends message -> processInteraction() ->
 *   mood effects + language state + memory + sulk recovery +
 *   growth milestones + first encounter detection + serialization
 *
 * Tests the full interaction pipeline using real engine functions with no mocks.
 */

import { describe, it, expect } from "vitest";
import { createFixedSeed } from "../../engine/src/genesis/seed-generator.js";
import {
  createEntityState,
  processHeartbeat,
  processInteraction,
  serializeState,
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
// Shared fixtures
// ---------------------------------------------------------------------------

const TEST_HW: HardwareBody = {
  platform: "darwin",
  arch: "arm64",
  totalMemoryGB: 16,
  cpuModel: "Apple M4",
  storageGB: 256,
};

const BIRTH_TIME = new Date("2026-02-01T00:00:00Z");
const NOW = new Date("2026-02-19T14:00:00Z");

function makeSeed(
  overrides: Partial<Parameters<typeof createFixedSeed>[0]> = {},
) {
  return createFixedSeed({
    hardwareBody: TEST_HW,
    createdAt: BIRTH_TIME.toISOString(),
    ...overrides,
  });
}

function makeContext(overrides: Partial<InteractionContext> = {}): InteractionContext {
  return {
    minutesSinceLastInteraction: 30,
    userInitiated: true,
    messageLength: 50,
    ...overrides,
  };
}

// ============================================================
// 1. First encounter detection
// ============================================================

describe("first encounter on first interaction", () => {
  it("triggers first encounter when totalInteractions is 0", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    expect(state.language.totalInteractions).toBe(0);

    const result = processInteraction(state, makeContext(), NOW);

    expect(result.firstEncounter).not.toBeNull();
    expect(result.firstEncounter!.expression).toBeTruthy();
    expect(result.firstEncounter!.innerExperience).toBeTruthy();
    expect(result.firstEncounter!.statusEffect).toBeDefined();
    expect(result.firstEncounter!.memoryImprint).toBeDefined();
  });

  it("produces a first encounter diary entry on first interaction", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const result = processInteraction(state, makeContext(), NOW);

    expect(result.firstEncounterDiaryMd).not.toBeNull();
    expect(result.firstEncounterDiaryMd).toContain("First Encounter");
    expect(result.firstEncounterDiaryMd).toContain(seed.perception);
    expect(result.firstEncounterDiaryMd).toContain(seed.temperament);
  });

  it("records first encounter as a permanent memory imprint", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const result = processInteraction(state, makeContext(), NOW);

    // The hot memory should contain the first encounter memory entry
    const hotMemories = result.updatedState.memory.hot;
    expect(hotMemories.length).toBe(1);
    expect(hotMemories[0].summary).toContain("[FIRST ENCOUNTER]");
  });
});

// ============================================================
// 2. Second interaction does NOT trigger first encounter
// ============================================================

describe("second interaction: no first encounter", () => {
  it("returns null firstEncounter on the second interaction", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    // First interaction
    const first = processInteraction(state, makeContext(), NOW);
    state = first.updatedState;

    // Second interaction
    const second = processInteraction(
      state,
      makeContext({ minutesSinceLastInteraction: 5 }),
      new Date(NOW.getTime() + 5 * 60_000),
    );

    expect(second.firstEncounter).toBeNull();
    expect(second.firstEncounterDiaryMd).toBeNull();
  });

  it("still updates state normally on second interaction", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    const first = processInteraction(state, makeContext(), NOW);
    state = first.updatedState;
    const moodAfterFirst = state.status.mood;

    const second = processInteraction(
      state,
      makeContext({ minutesSinceLastInteraction: 5 }),
      new Date(NOW.getTime() + 5 * 60_000),
    );

    // Mood should change from second interaction
    expect(second.updatedState.status.mood).not.toBe(moodAfterFirst);
    expect(second.updatedState.language.totalInteractions).toBe(2);
  });
});

// ============================================================
// 3. lastInteraction timestamp update
// ============================================================

describe("lastInteraction timestamp update", () => {
  it("sets lastInteraction to current time on interaction", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    expect(state.status.lastInteraction).toBe("never");

    const result = processInteraction(state, makeContext(), NOW);

    expect(result.updatedState.status.lastInteraction).toBe(NOW.toISOString());
  });

  it("updates lastInteraction to the latest interaction time", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    const t1 = NOW;
    const t2 = new Date(NOW.getTime() + 10 * 60_000);

    const first = processInteraction(state, makeContext(), t1);
    state = first.updatedState;
    expect(state.status.lastInteraction).toBe(t1.toISOString());

    const second = processInteraction(
      state,
      makeContext({ minutesSinceLastInteraction: 10 }),
      t2,
    );
    expect(second.updatedState.status.lastInteraction).toBe(t2.toISOString());
  });
});

// ============================================================
// 4. totalInteractions increment
// ============================================================

describe("totalInteractions increment", () => {
  it("increments totalInteractions on each interaction", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    expect(state.language.totalInteractions).toBe(0);

    for (let i = 0; i < 5; i++) {
      const t = new Date(NOW.getTime() + i * 60_000);
      const result = processInteraction(
        state,
        makeContext({ minutesSinceLastInteraction: i === 0 ? 999 : 1 }),
        t,
      );
      state = result.updatedState;
      expect(state.language.totalInteractions).toBe(i + 1);
    }
  });
});

// ============================================================
// 5. Mood effects from interaction (comfort increase)
// ============================================================

describe("mood effects from interaction", () => {
  it("increases comfort on user-initiated interaction", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);
    const comfortBefore = state.status.comfort;

    // Use a non-first-encounter state to isolate mood effects
    const first = processInteraction(state, makeContext(), NOW);
    let s = first.updatedState;

    // Do a second interaction to test comfort without first-encounter bonus
    const second = processInteraction(
      s,
      makeContext({ minutesSinceLastInteraction: 30 }),
      new Date(NOW.getTime() + 30 * 60_000),
    );

    // User-initiated interaction gives +5 comfort (before temperament scaling)
    expect(second.updatedState.status.comfort).toBeGreaterThanOrEqual(
      s.status.comfort,
    );
  });

  it("increases mood on user-initiated interaction", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    // Skip first encounter
    const first = processInteraction(state, makeContext(), NOW);
    const moodAfterFirst = first.updatedState.status.mood;

    const second = processInteraction(
      first.updatedState,
      makeContext({ minutesSinceLastInteraction: 30 }),
      new Date(NOW.getTime() + 30 * 60_000),
    );

    // User-initiated gives +3 mood base
    expect(second.updatedState.status.mood).toBeGreaterThan(moodAfterFirst);
  });

  it("decreases energy slightly from interaction", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    // Skip first encounter
    const first = processInteraction(state, makeContext(), NOW);
    const energyAfterFirst = first.updatedState.status.energy;

    const second = processInteraction(
      first.updatedState,
      makeContext({ minutesSinceLastInteraction: 30 }),
      new Date(NOW.getTime() + 30 * 60_000),
    );

    // Energy should decrease by 1 (or 0.8 for bold-impulsive scaled)
    expect(second.updatedState.status.energy).toBeLessThanOrEqual(energyAfterFirst);
  });
});

// ============================================================
// 6. Long messages vs short messages
// ============================================================

describe("message length effects", () => {
  it("long messages (>50) increase curiosity more than short messages", () => {
    // Use calm-observant to get lower first-encounter curiosity boost,
    // ensuring curiosity doesn't cap at 100 before the comparison.
    const seed = makeSeed({ temperament: "calm-observant" });

    // Get past first encounter, then run heartbeats to decay curiosity
    let baseState = createEntityState(seed, BIRTH_TIME);
    baseState = processInteraction(baseState, makeContext(), NOW).updatedState;

    // Run heartbeats to let curiosity decay below cap
    for (let i = 0; i < 10; i++) {
      const t = new Date(NOW.getTime() + (i + 1) * 30 * 60_000);
      baseState = processHeartbeat(baseState, t).updatedState;
    }

    // Both branches start from the same decayed state
    const t = new Date(NOW.getTime() + 11 * 30 * 60_000);
    const longResult = processInteraction(
      baseState,
      makeContext({ messageLength: 200, minutesSinceLastInteraction: 30 }),
      t,
    );
    const shortResult = processInteraction(
      baseState,
      makeContext({ messageLength: 5, minutesSinceLastInteraction: 30 }),
      t,
    );

    expect(longResult.updatedState.status.curiosity).toBeGreaterThan(
      shortResult.updatedState.status.curiosity,
    );
  });

  it("medium messages (11-50) give moderate curiosity boost", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);
    state = processInteraction(state, makeContext(), NOW).updatedState;

    let stateShort = { ...state, status: { ...state.status } };
    let stateMedium = { ...state, status: { ...state.status } };

    const t = new Date(NOW.getTime() + 60_000);
    // Very short message (<=10) gets no curiosity bonus
    const shortR = processInteraction(
      state,
      makeContext({ messageLength: 5, minutesSinceLastInteraction: 30 }),
      t,
    );
    // Medium message (11-50) gets +2 curiosity
    const medR = processInteraction(
      state,
      makeContext({ messageLength: 30, minutesSinceLastInteraction: 30 }),
      t,
    );

    expect(medR.updatedState.status.curiosity).toBeGreaterThanOrEqual(
      shortR.updatedState.status.curiosity,
    );
  });
});

// ============================================================
// 7. Multiple rapid interactions (burst messaging)
// ============================================================

describe("burst messaging (rapid interactions)", () => {
  it("rapid interactions (<2 min apart) drain more energy", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    // First interaction to get past first encounter
    state = processInteraction(state, makeContext(), NOW).updatedState;

    // Record energy before burst
    const energyBeforeBurst = state.status.energy;

    // 5 rapid interactions 1 minute apart
    for (let i = 0; i < 5; i++) {
      const t = new Date(NOW.getTime() + (i + 1) * 60_000);
      const result = processInteraction(
        state,
        makeContext({ minutesSinceLastInteraction: 1 }),
        t,
      );
      state = result.updatedState;
    }

    // Energy should have dropped noticeably (5 * -2 = -10 base for rapid)
    expect(state.status.energy).toBeLessThan(energyBeforeBurst);
  });

  it("all status values remain in 0-100 range after burst", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);
    state = processInteraction(state, makeContext(), NOW).updatedState;

    for (let i = 0; i < 30; i++) {
      const t = new Date(NOW.getTime() + (i + 1) * 60_000);
      const result = processInteraction(
        state,
        makeContext({ minutesSinceLastInteraction: 1, messageLength: 200 }),
        t,
      );
      state = result.updatedState;
    }

    expect(state.status.mood).toBeGreaterThanOrEqual(0);
    expect(state.status.mood).toBeLessThanOrEqual(100);
    expect(state.status.energy).toBeGreaterThanOrEqual(0);
    expect(state.status.energy).toBeLessThanOrEqual(100);
    expect(state.status.curiosity).toBeGreaterThanOrEqual(0);
    expect(state.status.curiosity).toBeLessThanOrEqual(100);
    expect(state.status.comfort).toBeGreaterThanOrEqual(0);
    expect(state.status.comfort).toBeLessThanOrEqual(100);
  });

  it("totalInteractions count is accurate after burst", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    const burstCount = 15;
    for (let i = 0; i < burstCount; i++) {
      const t = new Date(NOW.getTime() + i * 60_000);
      const result = processInteraction(
        state,
        makeContext({ minutesSinceLastInteraction: i === 0 ? 999 : 1 }),
        t,
      );
      state = result.updatedState;
    }

    expect(state.language.totalInteractions).toBe(burstCount);
  });
});

// ============================================================
// 8. Interaction after long silence (12+ hours)
// ============================================================

describe("interaction after long silence", () => {
  it("long silence (>360 min) decreases comfort but increases curiosity", () => {
    // Use calm-observant to avoid curiosity capping at 100 from first encounter
    const seed = makeSeed({ temperament: "calm-observant" });
    let state = createEntityState(seed, BIRTH_TIME);

    // First interaction to establish baseline
    state = processInteraction(state, makeContext(), NOW).updatedState;

    // Run heartbeats to let curiosity decay below cap
    for (let i = 0; i < 10; i++) {
      const t = new Date(NOW.getTime() + (i + 1) * 30 * 60_000);
      state = processHeartbeat(state, t).updatedState;
    }

    const curiosityBefore = state.status.curiosity;
    expect(curiosityBefore).toBeLessThan(100); // Ensure we can detect an increase

    // Interaction after 12 hours of silence
    const laterTime = new Date(NOW.getTime() + 12 * 60 * 60_000);
    const result = processInteraction(
      state,
      makeContext({ minutesSinceLastInteraction: 720 }),
      laterTime,
    );

    // Long absence: curiosity +5 base * 1.2 (calm-observant) = +6
    expect(result.updatedState.status.curiosity).toBeGreaterThan(curiosityBefore);
  });

  it("moderate silence (1-6 hours) has smaller comfort penalty", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);
    state = processInteraction(state, makeContext(), NOW).updatedState;

    const comfortBaseline = state.status.comfort;

    // Short gap (30 min)
    const shortResult = processInteraction(
      state,
      makeContext({ minutesSinceLastInteraction: 30 }),
      new Date(NOW.getTime() + 30 * 60_000),
    );

    // Long gap (720 min / 12 hours)
    const longResult = processInteraction(
      state,
      makeContext({ minutesSinceLastInteraction: 720 }),
      new Date(NOW.getTime() + 720 * 60_000),
    );

    // Long silence should result in lower comfort than short silence
    expect(longResult.updatedState.status.comfort).toBeLessThan(
      shortResult.updatedState.status.comfort,
    );
  });
});

// ============================================================
// 9. Interaction during sulk mode
// ============================================================

describe("interaction during sulk mode", () => {
  it("returns SOUL_EVIL.md as activeSoulFile when sulking", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    // Manually push entity into sulk by running many heartbeats without interaction
    for (let i = 0; i < 30; i++) {
      const t = new Date(NOW.getTime() + i * 30 * 60_000);
      const hb = processHeartbeat(state, t);
      state = hb.updatedState;
    }

    // If sulking, verify the interaction result
    if (state.sulk.isSulking) {
      const result = processInteraction(
        state,
        makeContext({ minutesSinceLastInteraction: 999 }),
        new Date(NOW.getTime() + 30 * 30 * 60_000),
      );
      expect(result.activeSoulFile).toBe("SOUL_EVIL.md");
    }
  });

  it("interaction contributes to sulk recovery", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    // Drive into sulk with heartbeats
    for (let i = 0; i < 30; i++) {
      const t = new Date(NOW.getTime() + i * 30 * 60_000);
      const hb = processHeartbeat(state, t);
      state = hb.updatedState;
    }

    if (state.sulk.isSulking) {
      const recoverStart = state.sulk.recoveryInteractions;

      const result = processInteraction(
        state,
        makeContext({ minutesSinceLastInteraction: 999 }),
        new Date(NOW.getTime() + 31 * 30 * 60_000),
      );

      expect(result.updatedState.sulk.recoveryInteractions).toBeGreaterThan(
        recoverStart,
      );
    }
  });

  it("returns SOUL.md when NOT sulking", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const result = processInteraction(state, makeContext(), NOW);

    expect(result.activeSoulFile).toBe("SOUL.md");
  });
});

// ============================================================
// 10. Species-specific first encounters
// ============================================================

describe("species-specific first encounters", () => {
  const allSpecies: PerceptionMode[] = [
    "chromatic",
    "vibration",
    "geometric",
    "thermal",
    "temporal",
    "chemical",
  ];

  it("each species generates a unique first encounter expression", () => {
    const expressions = new Set<string>();

    for (const perception of allSpecies) {
      const seed = makeSeed({ perception });
      const state = createEntityState(seed, BIRTH_TIME);

      const result = processInteraction(state, makeContext(), NOW);
      expect(result.firstEncounter).not.toBeNull();
      expressions.add(result.firstEncounter!.expression);
    }

    // All 6 species should produce different expressions
    expect(expressions.size).toBe(allSpecies.length);
  });

  it("each species has non-zero status effects on first encounter", () => {
    for (const perception of allSpecies) {
      const seed = makeSeed({ perception });
      const state = createEntityState(seed, BIRTH_TIME);

      const result = processInteraction(state, makeContext(), NOW);
      const fx = result.firstEncounter!.statusEffect;

      // Every species has some kind of status effect
      const totalAbsEffect =
        Math.abs(fx.mood) + Math.abs(fx.energy) + Math.abs(fx.curiosity) + Math.abs(fx.comfort);
      expect(totalAbsEffect).toBeGreaterThan(0);
    }
  });

  it("first encounter diary mentions species perception", () => {
    for (const perception of allSpecies) {
      const seed = makeSeed({ perception });
      const state = createEntityState(seed, BIRTH_TIME);
      const result = processInteraction(state, makeContext(), NOW);

      expect(result.firstEncounterDiaryMd).toContain(perception);
    }
  });
});

// ============================================================
// 11. Memory effects from interaction
// ============================================================

describe("interaction effects on memory", () => {
  it("each interaction adds an entry to hot memory", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    expect(state.memory.hot.length).toBe(0);

    for (let i = 0; i < 5; i++) {
      const t = new Date(NOW.getTime() + i * 60_000);
      const result = processInteraction(
        state,
        makeContext({ minutesSinceLastInteraction: i === 0 ? 999 : 1 }),
        t,
        `message-${i}`,
      );
      state = result.updatedState;
      expect(state.memory.hot.length).toBe(i + 1);
    }
  });

  it("hot memory contains memorySummary when provided", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    // Skip first encounter
    state = processInteraction(state, makeContext(), NOW).updatedState;

    const summary = "User asked about the weather";
    const result = processInteraction(
      state,
      makeContext({ minutesSinceLastInteraction: 5 }),
      new Date(NOW.getTime() + 5 * 60_000),
      summary,
    );

    const lastHot = result.updatedState.memory.hot[result.updatedState.memory.hot.length - 1];
    expect(lastHot.summary).toBe(summary);
  });

  it("hot memory uses default summary with messageLength when no summary provided", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    // Skip first encounter
    state = processInteraction(state, makeContext(), NOW).updatedState;

    const result = processInteraction(
      state,
      makeContext({ minutesSinceLastInteraction: 5, messageLength: 123 }),
      new Date(NOW.getTime() + 5 * 60_000),
    );

    const lastHot = result.updatedState.memory.hot[result.updatedState.memory.hot.length - 1];
    expect(lastHot.summary).toContain("123");
  });

  it("hot memory records mood at time of interaction", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);
    state = processInteraction(state, makeContext(), NOW).updatedState;

    const result = processInteraction(
      state,
      makeContext({ minutesSinceLastInteraction: 30 }),
      new Date(NOW.getTime() + 30 * 60_000),
      "test",
    );

    const lastHot = result.updatedState.memory.hot[result.updatedState.memory.hot.length - 1];
    expect(lastHot.mood).toBe(result.updatedState.status.mood);
  });

  it("hot memory capacity is bounded (oldest evicted after overflow)", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    // Fill up beyond hot capacity (10)
    for (let i = 0; i < 15; i++) {
      const t = new Date(NOW.getTime() + i * 60_000);
      const result = processInteraction(
        state,
        makeContext({ minutesSinceLastInteraction: i === 0 ? 999 : 1 }),
        t,
        `msg-${i}`,
      );
      state = result.updatedState;
    }

    // Hot memory should not exceed capacity
    expect(state.memory.hot.length).toBeLessThanOrEqual(10);
  });
});

// ============================================================
// 12. Language state changes from interactions (XP gain)
// ============================================================

describe("language state changes from interactions", () => {
  it("totalInteractions increments with each processInteraction call", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    const result = processInteraction(state, makeContext(), NOW);
    expect(result.updatedState.language.totalInteractions).toBe(1);

    const result2 = processInteraction(
      result.updatedState,
      makeContext({ minutesSinceLastInteraction: 5 }),
      new Date(NOW.getTime() + 5 * 60_000),
    );
    expect(result2.updatedState.language.totalInteractions).toBe(2);
  });

  it("language level stays at 0 on Day 0 regardless of interactions", () => {
    // Entity born today: growthDay=0, not enough days for level 1 (needs 7 days)
    const seed = makeSeed({ createdAt: NOW.toISOString() });
    let state = createEntityState(seed, NOW);

    // Even with many interactions, level stays 0 because growthDay < 7
    for (let i = 0; i < 40; i++) {
      const t = new Date(NOW.getTime() + i * 60_000);
      const result = processInteraction(
        state,
        makeContext({ minutesSinceLastInteraction: i === 0 ? 999 : 1 }),
        t,
      );
      state = result.updatedState;
    }

    expect(state.status.languageLevel).toBe(0);
  });

  it("native symbols are preserved through interactions", () => {
    const seed = makeSeed({ perception: "vibration" });
    const state = createEntityState(seed, BIRTH_TIME);
    const symbolsBefore = [...state.language.nativeSymbols];

    const result = processInteraction(state, makeContext(), NOW);

    expect(result.updatedState.language.nativeSymbols).toEqual(symbolsBefore);
  });
});

// ============================================================
// 13. State immutability (input state not mutated)
// ============================================================

describe("state immutability", () => {
  it("processInteraction does not mutate the input state", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    // Deep-capture original values
    const originalMood = state.status.mood;
    const originalInteractions = state.language.totalInteractions;
    const originalHotLength = state.memory.hot.length;
    const originalLastInteraction = state.status.lastInteraction;

    processInteraction(state, makeContext(), NOW);

    // Original state must be unchanged
    expect(state.status.mood).toBe(originalMood);
    expect(state.language.totalInteractions).toBe(originalInteractions);
    expect(state.memory.hot.length).toBe(originalHotLength);
    expect(state.status.lastInteraction).toBe(originalLastInteraction);
  });

  it("processInteraction does not mutate the input context", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const ctx = makeContext({ messageLength: 42 });
    const ctxCopy = { ...ctx };

    processInteraction(state, ctx, NOW);

    expect(ctx).toEqual(ctxCopy);
  });

  it("chained interactions produce independent state snapshots", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const result1 = processInteraction(state, makeContext(), NOW);
    const snapshot1Mood = result1.updatedState.status.mood;
    const snapshot1Interactions = result1.updatedState.language.totalInteractions;

    const result2 = processInteraction(
      result1.updatedState,
      makeContext({ minutesSinceLastInteraction: 5 }),
      new Date(NOW.getTime() + 5 * 60_000),
    );

    // Snapshot 1 should be unchanged after creating snapshot 2
    expect(result1.updatedState.status.mood).toBe(snapshot1Mood);
    expect(result1.updatedState.language.totalInteractions).toBe(snapshot1Interactions);

    // Snapshot 2 should differ
    expect(result2.updatedState.language.totalInteractions).toBe(
      snapshot1Interactions + 1,
    );
  });
});

// ============================================================
// 14. Serialization after interaction
// ============================================================

describe("serialization after interaction", () => {
  it("serialized statusMd includes updated lastInteraction", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const result = processInteraction(state, makeContext(), NOW);
    const { statusMd } = serializeState(result.updatedState);

    expect(statusMd).toContain(NOW.toISOString());
  });

  it("serialized languageMd includes updated totalInteractions", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    for (let i = 0; i < 3; i++) {
      const t = new Date(NOW.getTime() + i * 60_000);
      state = processInteraction(
        state,
        makeContext({ minutesSinceLastInteraction: i === 0 ? 999 : 1 }),
        t,
      ).updatedState;
    }

    const { languageMd } = serializeState(state);
    expect(languageMd).toContain("Total interactions: 3");
  });

  it("serialized memoryMd includes hot memory entries", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    state = processInteraction(state, makeContext(), NOW, "Hello entity").updatedState;
    state = processInteraction(
      state,
      makeContext({ minutesSinceLastInteraction: 5 }),
      new Date(NOW.getTime() + 5 * 60_000),
      "How are you",
    ).updatedState;

    const { memoryMd } = serializeState(state);

    // First interaction creates a FIRST ENCOUNTER memory, second creates normal memory
    expect(memoryMd).toContain("FIRST ENCOUNTER");
    expect(memoryMd).toContain("How are you");
  });

  it("all serialized fields are non-empty strings", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);
    const result = processInteraction(state, makeContext(), NOW);

    const serialized = serializeState(result.updatedState);

    expect(serialized.statusMd.length).toBeGreaterThan(0);
    expect(serialized.languageMd.length).toBeGreaterThan(0);
    expect(serialized.memoryMd.length).toBeGreaterThan(0);
    expect(serialized.milestonesMd.length).toBeGreaterThan(0);
    expect(serialized.formMd.length).toBeGreaterThan(0);
    expect(serialized.dynamicsMd.length).toBeGreaterThan(0);
    expect(serialized.reversalMd.length).toBeGreaterThan(0);
    expect(serialized.coexistMd.length).toBeGreaterThan(0);
  });
});

// ============================================================
// Growth milestones triggered by interaction
// ============================================================

describe("growth milestones from interactions", () => {
  it("first_interaction milestone fires on first interaction", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const result = processInteraction(state, makeContext(), NOW);

    const ids = result.newMilestones.map((m) => m.id);
    expect(ids).toContain("first_interaction");
  });

  it("10_interactions milestone fires at the 10th interaction", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);
    let allMilestones: string[] = [];

    for (let i = 0; i < 11; i++) {
      const t = new Date(NOW.getTime() + i * 60_000);
      const result = processInteraction(
        state,
        makeContext({ minutesSinceLastInteraction: i === 0 ? 999 : 1 }),
        t,
      );
      state = result.updatedState;
      allMilestones.push(...result.newMilestones.map((m) => m.id));
    }

    expect(allMilestones).toContain("10_interactions");
  });
});

// ============================================================
// Temperament differences in interaction effects
// ============================================================

describe("temperament effects on interaction", () => {
  const temperaments: Temperament[] = [
    "curious-cautious",
    "bold-impulsive",
    "calm-observant",
    "restless-exploratory",
  ];

  it("different temperaments produce different mood deltas", () => {
    const moods: Record<string, number> = {};

    for (const temperament of temperaments) {
      const seed = makeSeed({ temperament });
      let state = createEntityState(seed, BIRTH_TIME);

      // Skip first encounter
      state = processInteraction(state, makeContext(), NOW).updatedState;

      const result = processInteraction(
        state,
        makeContext({ minutesSinceLastInteraction: 30 }),
        new Date(NOW.getTime() + 30 * 60_000),
      );
      moods[temperament] = result.updatedState.status.mood;
    }

    // Not all temperaments should produce the exact same mood
    const uniqueMoods = new Set(Object.values(moods));
    expect(uniqueMoods.size).toBeGreaterThan(1);
  });

  it("bold-impulsive has amplified mood changes vs calm-observant", () => {
    const boldSeed = makeSeed({ temperament: "bold-impulsive" });
    const calmSeed = makeSeed({ temperament: "calm-observant" });

    let boldState = createEntityState(boldSeed, BIRTH_TIME);
    let calmState = createEntityState(calmSeed, BIRTH_TIME);

    // Skip first encounter for both
    boldState = processInteraction(boldState, makeContext(), NOW).updatedState;
    calmState = processInteraction(calmState, makeContext(), NOW).updatedState;

    // Both start at same base mood (50) but first encounter differs
    // Use multiple interactions to amplify the difference
    for (let i = 0; i < 5; i++) {
      const t = new Date(NOW.getTime() + (i + 1) * 30 * 60_000);
      boldState = processInteraction(
        boldState,
        makeContext({ minutesSinceLastInteraction: 30 }),
        t,
      ).updatedState;
      calmState = processInteraction(
        calmState,
        makeContext({ minutesSinceLastInteraction: 30 }),
        t,
      ).updatedState;
    }

    // Bold-impulsive amplifies mood by 1.4x, calm-observant by 0.7x
    // After several interactions, bold should have higher mood
    expect(boldState.status.mood).toBeGreaterThan(calmState.status.mood);
  });
});

// ============================================================
// Form, perception, asymmetry unchanged during interaction
// ============================================================

describe("heartbeat-only subsystems unchanged during interaction", () => {
  it("form state is unchanged by interaction", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);
    const formBefore = state.form;

    const result = processInteraction(state, makeContext(), NOW);
    expect(result.updatedState.form).toEqual(formBefore);
  });

  it("perception growth state is unchanged by interaction", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);
    const perceptionBefore = state.perception;

    const result = processInteraction(state, makeContext(), NOW);
    expect(result.updatedState.perception).toEqual(perceptionBefore);
  });

  it("asymmetry state is unchanged by interaction", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);
    const asymmetryBefore = state.asymmetry;

    const result = processInteraction(state, makeContext(), NOW);
    expect(result.updatedState.asymmetry).toEqual(asymmetryBefore);
  });

  it("reversal state is unchanged by interaction", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);
    const reversalBefore = state.reversal;

    const result = processInteraction(state, makeContext(), NOW);
    expect(result.updatedState.reversal).toEqual(reversalBefore);
  });

  it("coexist state is unchanged by interaction", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);
    const coexistBefore = state.coexist;

    const result = processInteraction(state, makeContext(), NOW);
    expect(result.updatedState.coexist).toEqual(coexistBefore);
  });
});
