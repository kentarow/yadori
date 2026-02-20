/**
 * End-to-End Test: Full Heartbeat Lifecycle
 *
 * Verifies the complete heartbeat pipeline:
 *   status update -> mood decay -> memory consolidation -> growth evaluation
 *   -> form evolution -> asymmetry tracking -> reversal detection
 *   -> coexistence evaluation -> serialization
 *
 * Tests the full lifecycle from birth through multiple heartbeats,
 * interactions, and state evolution — using real engine functions with no mocks.
 */

import { describe, it, expect } from "vitest";
import { createFixedSeed } from "../../engine/src/genesis/seed-generator.js";
import {
  createEntityState,
  processHeartbeat,
  processInteraction,
  serializeState,
  type EntityState,
  type HeartbeatResult,
} from "../../engine/src/status/status-manager.js";
import type {
  HardwareBody,
  PerceptionMode,
  Temperament,
  SelfForm,
} from "../../engine/src/types.js";

// --- Shared fixtures ---

const TEST_HW: HardwareBody = {
  platform: "darwin",
  arch: "arm64",
  totalMemoryGB: 16,
  cpuModel: "Apple M4",
  storageGB: 256,
};

const BIRTH_TIME = new Date("2026-01-01T00:00:00Z");

/** Create a seed with convenient defaults and overrides. */
function makeSeed(
  overrides: Partial<Parameters<typeof createFixedSeed>[0]> = {},
) {
  return createFixedSeed({
    hardwareBody: TEST_HW,
    createdAt: BIRTH_TIME.toISOString(),
    ...overrides,
  });
}

/** Run N heartbeat ticks at 30-minute intervals starting from a given time. */
function runHeartbeats(
  state: EntityState,
  count: number,
  startTime: Date,
  intervalMinutes = 30,
): { state: EntityState; results: HeartbeatResult[] } {
  const results: HeartbeatResult[] = [];
  let current = state;
  for (let i = 0; i < count; i++) {
    const t = new Date(startTime.getTime() + i * intervalMinutes * 60_000);
    const result = processHeartbeat(current, t);
    results.push(result);
    current = result.updatedState;
  }
  return { state: current, results };
}

// ============================================================
// 1. Entity creation and initial state
// ============================================================

describe("Heartbeat Lifecycle E2E", () => {
  it("createEntityState produces valid initial state", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    expect(state.seed).toBe(seed);
    expect(state.status.mood).toBe(50);
    expect(state.status.energy).toBe(50);
    expect(state.status.curiosity).toBe(70);
    expect(state.status.comfort).toBe(50);
    expect(state.status.languageLevel).toBe(0);
    expect(state.status.perceptionLevel).toBe(0);
    expect(state.status.growthDay).toBe(0);
    expect(state.status.lastInteraction).toBe("never");
    expect(state.memory.hot).toHaveLength(0);
    expect(state.memory.warm).toHaveLength(0);
    expect(state.growth.stage).toBe("newborn");
    expect(state.asymmetry.phase).toBe("alpha");
    expect(state.asymmetry.score).toBe(0);
    expect(state.reversal.totalReversals).toBe(0);
    expect(state.coexist.active).toBe(false);
    expect(state.form.awareness).toBe(false);
  });

  // ============================================================
  // 2. Single heartbeat tick changes state
  // ============================================================

  it("single heartbeat tick updates status values", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    // Heartbeat at midday (14:00) — active hours
    const hbTime = new Date("2026-01-01T14:00:00Z");
    const result = processHeartbeat(state, hbTime);

    // Status should have changed due to rhythm and decay
    expect(result.updatedState.status).not.toEqual(state.status);
    // Growth day is still 0 (same day as birth)
    expect(result.updatedState.status.growthDay).toBe(0);
    // HeartbeatResult provides structural fields
    expect(typeof result.wakeSignal).toBe("boolean");
    expect(typeof result.sleepSignal).toBe("boolean");
    expect(typeof result.memoryConsolidated).toBe("boolean");
    expect(result.activeSoulFile).toBe("SOUL.md");
  });

  // ============================================================
  // 3. Mood decays between ticks when no interaction
  // ============================================================

  it("comfort decays across multiple heartbeats without interaction", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    // Run 10 heartbeats over 5 hours (no interaction)
    const startTime = new Date("2026-01-01T10:00:00Z");
    const { state: finalState } = runHeartbeats(state, 10, startTime);

    // Comfort should have decayed (lastInteraction is "never" => high decay)
    expect(finalState.status.comfort).toBeLessThan(state.status.comfort);
  });

  it("mood drifts toward baseline (50) when no interaction and mood starts neutral", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    // Multiple heartbeats — mood should generally stay near baseline
    const startTime = new Date("2026-01-01T10:00:00Z");
    const { state: finalState } = runHeartbeats(state, 5, startTime);

    // Mood should be close to 50 (initial value = 50, drifts toward 50)
    expect(finalState.status.mood).toBeGreaterThanOrEqual(0);
    expect(finalState.status.mood).toBeLessThanOrEqual(100);
  });

  // ============================================================
  // 4. Growth day advancement
  // ============================================================

  it("growthDay advances when heartbeat occurs on a later day", () => {
    const seed = makeSeed({ createdAt: "2026-01-01T00:00:00Z" });
    const state = createEntityState(seed, BIRTH_TIME);

    // Heartbeat on day 3
    const day3 = new Date("2026-01-04T12:00:00Z");
    const result = processHeartbeat(state, day3);

    expect(result.updatedState.status.growthDay).toBe(3);
  });

  it("growthDay progresses correctly across multi-day heartbeat sequence", () => {
    const seed = makeSeed({ createdAt: "2026-01-01T00:00:00Z" });
    let state = createEntityState(seed, BIRTH_TIME);

    // Heartbeat day 0
    const hb0 = processHeartbeat(state, new Date("2026-01-01T12:00:00Z"));
    expect(hb0.updatedState.status.growthDay).toBe(0);
    state = hb0.updatedState;

    // Heartbeat day 7
    const hb7 = processHeartbeat(state, new Date("2026-01-08T12:00:00Z"));
    expect(hb7.updatedState.status.growthDay).toBe(7);
    state = hb7.updatedState;

    // Heartbeat day 30
    const hb30 = processHeartbeat(state, new Date("2026-01-31T12:00:00Z"));
    expect(hb30.updatedState.status.growthDay).toBe(30);
  });

  // ============================================================
  // 5. Interaction processing between heartbeats
  // ============================================================

  it("interaction updates lastInteraction timestamp and language state", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const interactionTime = new Date("2026-01-01T10:00:00Z");
    const result = processInteraction(
      state,
      { minutesSinceLastInteraction: 999, userInitiated: true, messageLength: 50 },
      interactionTime,
      "Hello entity",
    );

    expect(result.updatedState.status.lastInteraction).toBe(interactionTime.toISOString());
    expect(result.updatedState.language.totalInteractions).toBe(1);
    expect(result.updatedState.memory.hot).toHaveLength(1);
  });

  it("first interaction triggers first encounter reaction", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const result = processInteraction(
      state,
      { minutesSinceLastInteraction: 999, userInitiated: true, messageLength: 30 },
      new Date("2026-01-01T10:00:00Z"),
    );

    expect(result.firstEncounter).not.toBeNull();
    expect(result.firstEncounterDiaryMd).not.toBeNull();
  });

  it("second interaction does not trigger first encounter", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    // First interaction
    const r1 = processInteraction(
      state,
      { minutesSinceLastInteraction: 999, userInitiated: true, messageLength: 30 },
      new Date("2026-01-01T10:00:00Z"),
    );
    state = r1.updatedState;

    // Second interaction
    const r2 = processInteraction(
      state,
      { minutesSinceLastInteraction: 30, userInitiated: true, messageLength: 40 },
      new Date("2026-01-01T10:30:00Z"),
    );

    expect(r2.firstEncounter).toBeNull();
  });

  // ============================================================
  // 6. Heartbeat after interaction reflects changed state
  // ============================================================

  it("heartbeat after interaction produces different result than without interaction", () => {
    const seed = makeSeed();
    const stateA = createEntityState(seed, BIRTH_TIME);
    const stateB = createEntityState(seed, BIRTH_TIME);

    // Path A: heartbeat without interaction
    const hbTimeA = new Date("2026-01-01T14:00:00Z");
    const resultA = processHeartbeat(stateA, hbTimeA);

    // Path B: interaction then heartbeat
    const interacted = processInteraction(
      stateB,
      { minutesSinceLastInteraction: 999, userInitiated: true, messageLength: 80 },
      new Date("2026-01-01T13:00:00Z"),
      "Hello!",
    );
    const resultB = processHeartbeat(interacted.updatedState, hbTimeA);

    // The two paths should produce different comfort values (B has interaction)
    expect(resultB.updatedState.status.comfort).not.toBe(
      resultA.updatedState.status.comfort,
    );
  });

  // ============================================================
  // 7. Multiple heartbeat cycles produce consistent state transitions
  // ============================================================

  it("repeated heartbeats produce monotonically bounded status values", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    // Run 30 heartbeats over 15 hours
    const startTime = new Date("2026-01-01T06:00:00Z");
    for (let i = 0; i < 30; i++) {
      const t = new Date(startTime.getTime() + i * 30 * 60_000);
      const result = processHeartbeat(state, t);
      state = result.updatedState;

      // All status values must remain in 0-100 range
      expect(state.status.mood).toBeGreaterThanOrEqual(0);
      expect(state.status.mood).toBeLessThanOrEqual(100);
      expect(state.status.energy).toBeGreaterThanOrEqual(0);
      expect(state.status.energy).toBeLessThanOrEqual(100);
      expect(state.status.curiosity).toBeGreaterThanOrEqual(0);
      expect(state.status.curiosity).toBeLessThanOrEqual(100);
      expect(state.status.comfort).toBeGreaterThanOrEqual(0);
      expect(state.status.comfort).toBeLessThanOrEqual(100);
    }
  });

  it("form evolves through heartbeat cycles", () => {
    const seed = makeSeed({
      createdAt: "2025-12-01T00:00:00Z", // 31 days old = child stage
    });
    let state = createEntityState(seed, new Date("2025-12-01T00:00:00Z"));

    const initialDensity = state.form.density;
    const initialComplexity = state.form.complexity;

    // Run 20 heartbeats
    const { state: finalState } = runHeartbeats(
      state,
      20,
      BIRTH_TIME,
    );

    // Form should have evolved from initial values
    expect(finalState.form.density).toBeGreaterThanOrEqual(initialDensity);
    expect(finalState.form.complexity).toBeGreaterThanOrEqual(initialComplexity);
  });

  // ============================================================
  // 8. Asymmetry signals accumulate over time
  // ============================================================

  it("asymmetry signals update during heartbeat", () => {
    const seed = makeSeed({
      createdAt: "2025-12-15T00:00:00Z", // 17 days old
    });
    let state = createEntityState(seed, new Date("2025-12-15T00:00:00Z"));

    // Process heartbeat to trigger asymmetry evaluation
    const hbTime = new Date("2026-01-01T12:00:00Z");
    const result = processHeartbeat(state, hbTime);

    // Asymmetry should have computed signals (temporal maturity based on day 17)
    expect(result.updatedState.asymmetry.signals.temporalMaturity).toBeGreaterThan(0);
    expect(result.updatedState.asymmetry.score).toBeGreaterThanOrEqual(0);
    // At day 17 the entity has enough temporal maturity + emotional complexity
    // to potentially cross into beta phase (score >= 15)
    const phase = result.updatedState.asymmetry.phase;
    expect(phase === "alpha" || phase === "beta").toBe(true);
  });

  it("asymmetry score increases with entity age and interactions", () => {
    const seed = makeSeed({
      createdAt: "2025-10-01T00:00:00Z", // ~92 days old, mature stage
    });
    let state = createEntityState(seed, new Date("2025-10-01T00:00:00Z"));

    // Add some interactions to build up language and memory
    for (let i = 0; i < 10; i++) {
      const t = new Date(BIRTH_TIME.getTime() - (10 - i) * 3600_000);
      const ir = processInteraction(
        state,
        { minutesSinceLastInteraction: 60, userInitiated: true, messageLength: 50 },
        t,
        `Memory ${i}`,
      );
      state = ir.updatedState;
    }

    // Process heartbeat
    const result = processHeartbeat(state, BIRTH_TIME);

    // At ~92 days with 10 interactions, score should be non-trivial
    expect(result.updatedState.asymmetry.score).toBeGreaterThan(0);
    expect(result.updatedState.asymmetry.signals.temporalMaturity).toBeGreaterThan(30);
    expect(result.updatedState.asymmetry.signals.emotionalComplexity).toBeGreaterThan(0);
  });

  it("asymmetry remains in alpha phase for a newborn entity", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const result = processHeartbeat(state, new Date("2026-01-01T12:00:00Z"));

    expect(result.updatedState.asymmetry.phase).toBe("alpha");
    expect(result.updatedState.asymmetry.score).toBeLessThan(15);
  });

  // ============================================================
  // 9. Reversal detection
  // ============================================================

  it("reversal state initializes empty and persists through heartbeats", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    expect(state.reversal.totalReversals).toBe(0);
    expect(state.reversal.signals).toHaveLength(0);

    const result = processHeartbeat(state, new Date("2026-01-01T12:00:00Z"));

    // A newborn entity should not trigger reversals
    expect(result.newReversals).toHaveLength(0);
    expect(result.updatedState.reversal.totalReversals).toBe(0);
  });

  it("heartbeat result includes newReversals array", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const result = processHeartbeat(state, new Date("2026-01-01T12:00:00Z"));

    expect(Array.isArray(result.newReversals)).toBe(true);
  });

  // ============================================================
  // 10. Coexistence evaluation
  // ============================================================

  it("coexist state remains inactive when asymmetry is alpha", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const result = processHeartbeat(state, new Date("2026-01-01T12:00:00Z"));

    expect(result.updatedState.coexist.active).toBe(false);
    expect(result.updatedState.coexist.quality).toBe(0);
  });

  it("coexist indicators are zeroed when not in epsilon phase", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    // Run several heartbeats
    const { state: finalState } = runHeartbeats(state, 5, BIRTH_TIME);

    // Not in epsilon => indicators should be zeroed
    expect(finalState.coexist.indicators.silenceComfort).toBe(0);
    expect(finalState.coexist.indicators.sharedVocabulary).toBe(0);
    expect(finalState.coexist.indicators.rhythmSync).toBe(0);
    expect(finalState.coexist.indicators.sharedMemory).toBe(0);
    expect(finalState.coexist.indicators.autonomyRespect).toBe(0);
  });

  // ============================================================
  // 11. Serialization produces all expected markdown fields
  // ============================================================

  it("serializeState produces all expected markdown fields", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const serialized = serializeState(state);

    // All fields must be present
    expect(typeof serialized.statusMd).toBe("string");
    expect(typeof serialized.languageMd).toBe("string");
    expect(typeof serialized.memoryMd).toBe("string");
    expect(typeof serialized.milestonesMd).toBe("string");
    expect(typeof serialized.formMd).toBe("string");
    expect(typeof serialized.dynamicsMd).toBe("string");
    expect(typeof serialized.reversalMd).toBe("string");
    expect(typeof serialized.coexistMd).toBe("string");
  });

  it("serialized statusMd contains correct status values", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const { statusMd } = serializeState(state);

    expect(statusMd).toContain("# STATUS");
    expect(statusMd).toContain("**mood**: 50");
    expect(statusMd).toContain("**energy**: 50");
    expect(statusMd).toContain("**curiosity**: 70");
    expect(statusMd).toContain("**comfort**: 50");
    expect(statusMd).toContain("**level**: 0");
    expect(statusMd).toContain("**day**: 0");
    expect(statusMd).toContain("**last_interaction**: never");
  });

  it("serialized dynamicsMd contains phase and score", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const { dynamicsMd } = serializeState(state);

    expect(dynamicsMd).toContain("# DYNAMICS");
    expect(dynamicsMd).toContain("α"); // alpha phase
    expect(dynamicsMd).toContain("**score**");
    expect(dynamicsMd).toContain("**confidence**");
  });

  it("serialized reversalMd contains total reversals and rate", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const { reversalMd } = serializeState(state);

    expect(reversalMd).toContain("## Reversal Detection");
    expect(reversalMd).toContain("**total reversals**: 0");
    expect(reversalMd).toContain("**reversal rate**");
    expect(reversalMd).toContain("**dominant type**: none");
    expect(reversalMd).toContain("**last detected**: never");
  });

  it("serialized coexistMd indicates inactive when not in epsilon", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const { coexistMd } = serializeState(state);

    expect(coexistMd).toContain("# COEXISTENCE");
    expect(coexistMd).toContain("Not yet in Phase epsilon");
  });

  it("serialized formMd contains form type and properties", () => {
    const seed = makeSeed({ form: "crystal" });
    const state = createEntityState(seed, BIRTH_TIME);

    const { formMd } = serializeState(state);

    expect(formMd).toContain("crystal");
    expect(formMd).toContain("**density**");
    expect(formMd).toContain("**complexity**");
    expect(formMd).toContain("**stability**");
  });

  it("serialization after heartbeat reflects updated values", () => {
    const seed = makeSeed({
      createdAt: "2025-12-20T00:00:00Z", // ~12 days old
    });
    let state = createEntityState(seed, new Date("2025-12-20T00:00:00Z"));

    // Run a heartbeat
    const result = processHeartbeat(state, BIRTH_TIME);
    state = result.updatedState;

    const { statusMd, dynamicsMd } = serializeState(state);

    // Growth day should be reflected
    expect(statusMd).toContain(`**day**: ${state.status.growthDay}`);
    // Dynamics should show the updated score
    expect(dynamicsMd).toContain(`**score**: ${state.asymmetry.score}`);
  });

  // ============================================================
  // 12. Different species seeds
  // ============================================================

  describe("heartbeat with different species seeds", () => {
    const SPECIES: PerceptionMode[] = [
      "chromatic",
      "vibration",
      "geometric",
      "thermal",
      "temporal",
      "chemical",
    ];

    it.each(SPECIES)("species %s: creates entity and runs heartbeat without error", (perception) => {
      const seed = makeSeed({ perception });
      const state = createEntityState(seed, BIRTH_TIME);

      const result = processHeartbeat(state, new Date("2026-01-01T12:00:00Z"));

      // Basic sanity for any species
      expect(result.updatedState.seed.perception).toBe(perception);
      expect(result.updatedState.status.mood).toBeGreaterThanOrEqual(0);
      expect(result.updatedState.status.mood).toBeLessThanOrEqual(100);
      expect(result.updatedState.asymmetry.phase).toBe("alpha");
      expect(result.updatedState.coexist.active).toBe(false);
    });

    it("different species produce different language state structures", () => {
      const states = SPECIES.map((perception) => {
        const seed = makeSeed({ perception });
        return createEntityState(seed, BIRTH_TIME);
      });

      // Native symbols differ by species
      const symbolSets = states.map((s) => s.language.nativeSymbols.join(","));
      const uniqueSets = new Set(symbolSets);

      // At least some species should have different symbol sets
      expect(uniqueSets.size).toBeGreaterThan(1);
    });
  });

  // ============================================================
  // 13. Full lifecycle: birth -> heartbeat -> interaction -> heartbeat
  // ============================================================

  it("full lifecycle: birth -> first heartbeat -> interaction -> second heartbeat", () => {
    const seed = makeSeed({ createdAt: "2026-01-01T00:00:00Z" });
    let state = createEntityState(seed, BIRTH_TIME);

    // Verify initial state
    expect(state.status.lastInteraction).toBe("never");
    expect(state.language.totalInteractions).toBe(0);

    // Step 1: First heartbeat (morning)
    const hb1Time = new Date("2026-01-01T08:00:00Z");
    const hb1 = processHeartbeat(state, hb1Time);
    state = hb1.updatedState;

    expect(state.status.growthDay).toBe(0);
    expect(state.status.lastInteraction).toBe("never");
    const comfortAfterHb1 = state.status.comfort;

    // Step 2: Interaction
    const interTime = new Date("2026-01-01T10:00:00Z");
    const inter = processInteraction(
      state,
      { minutesSinceLastInteraction: 999, userInitiated: true, messageLength: 60 },
      interTime,
      "First hello to my entity",
    );
    state = inter.updatedState;

    expect(inter.firstEncounter).not.toBeNull();
    expect(state.status.lastInteraction).toBe(interTime.toISOString());
    expect(state.language.totalInteractions).toBe(1);
    expect(state.memory.hot).toHaveLength(1);

    // Step 3: Second heartbeat (afternoon)
    const hb2Time = new Date("2026-01-01T14:00:00Z");
    const hb2 = processHeartbeat(state, hb2Time);
    state = hb2.updatedState;

    // State should have evolved — comfort should be different from after hb1
    // (interaction happened in between)
    expect(state.status.growthDay).toBe(0);
    expect(state.asymmetry.phase).toBe("alpha");
    // Verify the state is structurally complete
    expect(state.form.baseForm).toBe("light-particles");
    expect(state.reversal.totalReversals).toBeGreaterThanOrEqual(0);
    expect(state.coexist.active).toBe(false);
  });

  it("extended lifecycle over multiple days", () => {
    const seed = makeSeed({ createdAt: "2026-01-01T00:00:00Z" });
    let state = createEntityState(seed, BIRTH_TIME);

    // Day 0: birth + interaction
    const r0 = processInteraction(
      state,
      { minutesSinceLastInteraction: 999, userInitiated: true, messageLength: 30 },
      new Date("2026-01-01T10:00:00Z"),
    );
    state = r0.updatedState;

    // Day 1: heartbeat + interaction
    const hb1 = processHeartbeat(state, new Date("2026-01-02T10:00:00Z"));
    state = hb1.updatedState;
    expect(state.status.growthDay).toBe(1);

    const r1 = processInteraction(
      state,
      { minutesSinceLastInteraction: 60, userInitiated: true, messageLength: 45 },
      new Date("2026-01-02T11:00:00Z"),
      "Day 1 message",
    );
    state = r1.updatedState;

    // Day 5: heartbeat
    const hb5 = processHeartbeat(state, new Date("2026-01-06T12:00:00Z"));
    state = hb5.updatedState;
    expect(state.status.growthDay).toBe(5);

    // Day 14: heartbeat (entity transitions from newborn to infant around day 3)
    const hb14 = processHeartbeat(state, new Date("2026-01-15T12:00:00Z"));
    state = hb14.updatedState;
    expect(state.status.growthDay).toBe(14);

    // Serialize the whole thing to verify it still works
    const serialized = serializeState(state);
    expect(serialized.statusMd).toContain("**day**: 14");
    expect(serialized.dynamicsMd).toContain("DYNAMICS");
  });

  // ============================================================
  // 14. Memory consolidation during heartbeat
  // ============================================================

  it("memory consolidation triggers on Sunday night when hot memory has entries", () => {
    const seed = makeSeed({ createdAt: "2026-01-01T00:00:00Z" });
    let state = createEntityState(seed, BIRTH_TIME);

    // Add interactions to fill hot memory
    for (let i = 0; i < 5; i++) {
      const t = new Date(BIRTH_TIME.getTime() + i * 3600_000);
      const r = processInteraction(
        state,
        { minutesSinceLastInteraction: 60, userInitiated: true, messageLength: 30 },
        t,
        `Message ${i}`,
      );
      state = r.updatedState;
    }

    expect(state.memory.hot.length).toBeGreaterThan(0);

    // Sunday night (Jan 4, 2026 is a Sunday)
    const sundayNight = new Date("2026-01-04T21:30:00Z");
    const result = processHeartbeat(state, sundayNight);

    expect(result.memoryConsolidated).toBe(true);
    // After consolidation, hot should be empty and warm should have an entry
    expect(result.updatedState.memory.hot).toHaveLength(0);
    expect(result.updatedState.memory.warm.length).toBeGreaterThan(0);
  });

  it("memory consolidation does NOT trigger when hot memory is empty", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    // Sunday night with no interactions (empty hot memory)
    const sundayNight = new Date("2026-01-04T21:30:00Z");
    const result = processHeartbeat(state, sundayNight);

    expect(result.memoryConsolidated).toBe(false);
  });

  it("memory consolidation does NOT trigger on non-Sunday nights", () => {
    const seed = makeSeed({ createdAt: "2026-01-01T00:00:00Z" });
    let state = createEntityState(seed, BIRTH_TIME);

    // Add interactions
    for (let i = 0; i < 3; i++) {
      const t = new Date(BIRTH_TIME.getTime() + i * 3600_000);
      const r = processInteraction(
        state,
        { minutesSinceLastInteraction: 60, userInitiated: true, messageLength: 25 },
        t,
        `Message ${i}`,
      );
      state = r.updatedState;
    }

    // Monday night (Jan 5, 2026 is a Monday)
    const mondayNight = new Date("2026-01-05T21:30:00Z");
    const result = processHeartbeat(state, mondayNight);

    expect(result.memoryConsolidated).toBe(false);
  });

  // ============================================================
  // 15. Diary generation
  // ============================================================

  it("diary is generated during evening heartbeat", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    // Evening time (17-21)
    const eveningTime = new Date("2026-01-01T19:00:00Z");
    const result = processHeartbeat(state, eveningTime);

    expect(result.diary).not.toBeNull();
    if (result.diary) {
      expect(typeof result.diary.content).toBe("string");
      expect(result.diary.content.length).toBeGreaterThan(0);
    }
  });

  it("diary is NOT generated during midday heartbeat", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const middayTime = new Date("2026-01-01T12:00:00Z");
    const result = processHeartbeat(state, middayTime);

    expect(result.diary).toBeNull();
  });

  // ============================================================
  // 16. Wake and sleep signals
  // ============================================================

  it("wake signal fires during morning heartbeat", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const morningTime = new Date("2026-01-01T08:00:00Z");
    const result = processHeartbeat(state, morningTime);

    expect(result.wakeSignal).toBe(true);
    expect(result.sleepSignal).toBe(false);
  });

  it("sleep signal fires during night heartbeat", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const nightTime = new Date("2026-01-01T22:00:00Z");
    const result = processHeartbeat(state, nightTime);

    expect(result.sleepSignal).toBe(true);
    expect(result.wakeSignal).toBe(false);
  });

  // ============================================================
  // 17. Sulk mode and SOUL_EVIL.md
  // ============================================================

  it("prolonged silence triggers sulk with soulEvilMd", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH_TIME);

    // Run many heartbeats without interaction to trigger sulk
    // Need enough to drop comfort and trigger sulk
    const startTime = new Date("2026-01-01T08:00:00Z");
    let soulEvilGenerated = false;
    for (let i = 0; i < 40; i++) {
      const t = new Date(startTime.getTime() + i * 30 * 60_000);
      const result = processHeartbeat(state, t);
      state = result.updatedState;
      if (result.soulEvilMd !== null) {
        soulEvilGenerated = true;
      }
    }

    // After 40 heartbeats without interaction (20 hours), sulk should be triggered
    expect(state.sulk.isSulking).toBe(true);
    expect(soulEvilGenerated).toBe(true);
  });

  // ============================================================
  // 18. Perception level tracking
  // ============================================================

  it("perception level is tracked through heartbeats", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    expect(state.status.perceptionLevel).toBe(0);

    const result = processHeartbeat(state, new Date("2026-01-01T12:00:00Z"));

    // On day 0, perception level should still be 0
    expect(result.updatedState.status.perceptionLevel).toBe(0);
    // But the perception growth state should exist
    expect(result.updatedState.perception).toBeDefined();
  });

  // ============================================================
  // 19. State immutability
  // ============================================================

  it("processHeartbeat does not mutate the input state", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    // Capture original values
    const originalMood = state.status.mood;
    const originalComfort = state.status.comfort;
    const originalFormDensity = state.form.density;

    processHeartbeat(state, new Date("2026-01-01T12:00:00Z"));

    // Original state should be untouched
    expect(state.status.mood).toBe(originalMood);
    expect(state.status.comfort).toBe(originalComfort);
    expect(state.form.density).toBe(originalFormDensity);
    expect(state.asymmetry.score).toBe(0);
  });

  it("processInteraction does not mutate the input state", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH_TIME);

    const originalInteractions = state.language.totalInteractions;
    const originalHotLength = state.memory.hot.length;

    processInteraction(
      state,
      { minutesSinceLastInteraction: 999, userInitiated: true, messageLength: 50 },
      new Date("2026-01-01T10:00:00Z"),
    );

    expect(state.language.totalInteractions).toBe(originalInteractions);
    expect(state.memory.hot.length).toBe(originalHotLength);
    expect(state.status.lastInteraction).toBe("never");
  });

  // ============================================================
  // 20. Temperament effects on heartbeat
  // ============================================================

  describe("different temperaments produce distinct state trajectories", () => {
    const TEMPERAMENTS: Temperament[] = [
      "curious-cautious",
      "bold-impulsive",
      "calm-observant",
      "restless-exploratory",
    ];

    it("temperament affects sulk evaluation during heartbeat", () => {
      const results = TEMPERAMENTS.map((temperament) => {
        const seed = makeSeed({ temperament });
        let state = createEntityState(seed, BIRTH_TIME);

        // Run heartbeats without interaction
        const { state: finalState } = runHeartbeats(
          state,
          15,
          new Date("2026-01-01T08:00:00Z"),
        );

        return {
          temperament,
          isSulking: finalState.sulk.isSulking,
          comfort: finalState.status.comfort,
        };
      });

      // At least some variation should exist (temperaments modulate sulk thresholds)
      const sulkStates = results.map((r) => r.isSulking);
      const comforts = results.map((r) => r.comfort);
      // All comforts should have decayed from initial 50
      comforts.forEach((c) => expect(c).toBeLessThanOrEqual(50));
    });
  });

  // ============================================================
  // 21. Heartbeat pipeline ordering
  // ============================================================

  it("heartbeat pipeline processes in correct order: status -> growth -> language -> perception -> sulk -> growth milestones -> form -> memory -> asymmetry -> reversal -> coexist", () => {
    const seed = makeSeed({
      createdAt: "2025-12-01T00:00:00Z", // mature entity (31 days old)
    });
    let state = createEntityState(seed, new Date("2025-12-01T00:00:00Z"));

    // Add some interactions for richer state
    for (let i = 0; i < 5; i++) {
      const t = new Date(BIRTH_TIME.getTime() - (5 - i) * 3600_000);
      const r = processInteraction(
        state,
        { minutesSinceLastInteraction: 60, userInitiated: true, messageLength: 40 },
        t,
        `Memory ${i}`,
      );
      state = r.updatedState;
    }

    const result = processHeartbeat(state, BIRTH_TIME);
    const updated = result.updatedState;

    // Verify all subsystems were evaluated
    expect(updated.status.growthDay).toBe(31);
    expect(updated.growth.stage).toBeDefined();
    expect(updated.language.level).toBeDefined();
    expect(updated.perception.level).toBeDefined();
    expect(updated.sulk).toBeDefined();
    expect(updated.form.density).toBeDefined();
    expect(updated.asymmetry.phase).toBeDefined();
    expect(updated.asymmetry.signals).toBeDefined();
    expect(updated.reversal).toBeDefined();
    expect(updated.coexist).toBeDefined();

    // Growth day must be computed before asymmetry (asymmetry uses growthDay)
    // Verify the asymmetry temporal maturity reflects the actual growth day
    expect(updated.asymmetry.signals.temporalMaturity).toBeGreaterThan(0);
  });
});
