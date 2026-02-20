import { describe, it, expect } from "vitest";
import {
  createEntityState,
  processHeartbeat,
  processInteraction,
  serializeState,
} from "../../src/status/status-manager.js";
import { createFixedSeed } from "../../src/genesis/seed-generator.js";
import { LanguageLevel } from "../../src/types.js";
import type { InteractionContext } from "../../src/mood/mood-engine.js";

const TEST_HW = {
  platform: "darwin",
  arch: "arm64",
  totalMemoryGB: 16,
  cpuModel: "Apple M4",
  storageGB: 256,
};

const NOW = new Date("2026-02-18T12:00:00Z");

function makeSeed() {
  return createFixedSeed({ hardwareBody: TEST_HW, createdAt: "2026-01-01T00:00:00Z" });
}

describe("createEntityState", () => {
  it("creates initial state from seed", () => {
    const state = createEntityState(makeSeed(), NOW);
    expect(state.status.mood).toBe(50);
    expect(state.status.energy).toBe(50);
    expect(state.status.curiosity).toBe(70);
    expect(state.status.growthDay).toBe(0);
    expect(state.language.level).toBe(LanguageLevel.SymbolsOnly);
  });

  it("uses seed perception for language native symbols", () => {
    const state = createEntityState(makeSeed(), NOW);
    expect(state.language.nativeSymbols.length).toBeGreaterThan(0);
  });

  it("initializes memory, growth, sulk, form, and asymmetry", () => {
    const state = createEntityState(makeSeed(), NOW);
    expect(state.memory.hot).toEqual([]);
    expect(state.growth.milestones.length).toBeGreaterThan(0); // first_breath
    expect(state.sulk.isSulking).toBe(false);
    expect(state.form.baseForm).toBe("light-particles"); // from fixed seed
    expect(state.form.awareness).toBe(false);
    expect(state.asymmetry.phase).toBe("alpha");
    expect(state.asymmetry.score).toBe(0);
    expect(state.asymmetry.transitions).toEqual([]);
  });
});

describe("processHeartbeat", () => {
  it("returns updated state with new fields", () => {
    const state = createEntityState(makeSeed(), NOW);
    const now = new Date("2026-02-18T09:00:00Z");
    const result = processHeartbeat(state, now);
    expect(result.updatedState.status).toBeDefined();
    expect(result.activeSoulFile).toBe("SOUL.md");
    expect(result.newMilestones).toBeDefined();
  });

  it("generates diary in evening", () => {
    const state = createEntityState(makeSeed(), NOW);
    const evening = new Date("2026-02-18T19:00:00Z");
    const result = processHeartbeat(state, evening);
    expect(result.diary).not.toBeNull();
    expect(result.diary?.date).toBe("2026-02-18");
  });

  it("computes growth day from seed creation date", () => {
    const state = createEntityState(makeSeed(), NOW);
    const now = new Date("2026-02-18T12:00:00Z"); // 48 days after 2026-01-01
    const result = processHeartbeat(state, now);
    expect(result.updatedState.status.growthDay).toBe(48);
  });

  it("signals wake in morning", () => {
    const state = createEntityState(makeSeed(), NOW);
    const morning = new Date("2026-02-18T09:00:00Z");
    const result = processHeartbeat(state, morning);
    expect(result.wakeSignal).toBe(true);
  });

  it("signals sleep at night", () => {
    const state = createEntityState(makeSeed(), NOW);
    const night = new Date("2026-02-18T22:00:00Z");
    const result = processHeartbeat(state, night);
    expect(result.sleepSignal).toBe(true);
  });

  it("detects sulk mode when comfort and mood are low", () => {
    const state = createEntityState(makeSeed(), NOW);
    // Force low comfort and mood
    state.status = { ...state.status, comfort: 15, mood: 20 };
    const result = processHeartbeat(state, NOW);
    expect(result.updatedState.sulk.isSulking).toBe(true);
    expect(result.activeSoulFile).toBe("SOUL_EVIL.md");
  });

  it("generates species-specific SOUL_EVIL.md when sulking", () => {
    const state = createEntityState(makeSeed(), NOW);
    state.status = { ...state.status, comfort: 15, mood: 20 };
    const result = processHeartbeat(state, NOW);
    expect(result.soulEvilMd).not.toBeNull();
    expect(result.soulEvilMd).toContain("chromatic"); // seed perception
  });

  it("does not generate soulEvilMd when not sulking", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processHeartbeat(state, NOW);
    expect(result.soulEvilMd).toBeNull();
  });

  it("evolves form during heartbeat", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processHeartbeat(state, NOW);
    expect(result.updatedState.form).toBeDefined();
    expect(result.updatedState.form.baseForm).toBe("light-particles");
  });

  it("consolidates memory on Sunday night", () => {
    const state = createEntityState(makeSeed(), NOW);
    // Add some hot memories
    state.memory.hot = [
      { timestamp: NOW.toISOString(), summary: "test memory", mood: 50 },
    ];
    // 2026-02-22 is a Sunday
    const sundayNight = new Date("2026-02-22T22:00:00Z");
    const result = processHeartbeat(state, sundayNight);
    expect(result.memoryConsolidated).toBe(true);
    expect(result.updatedState.memory.hot).toHaveLength(0);
    expect(result.updatedState.memory.warm).toHaveLength(1);
  });

  it("does not consolidate memory on non-Sunday", () => {
    const state = createEntityState(makeSeed(), NOW);
    state.memory.hot = [
      { timestamp: NOW.toISOString(), summary: "test memory", mood: 50 },
    ];
    // Wednesday night
    const wedNight = new Date("2026-02-18T22:00:00Z");
    const result = processHeartbeat(state, wedNight);
    expect(result.memoryConsolidated).toBe(false);
    expect(result.updatedState.memory.hot).toHaveLength(1);
  });

  it("updates asymmetry state during heartbeat", () => {
    const state = createEntityState(makeSeed(), NOW);
    const now = new Date("2026-02-18T12:00:00Z");
    const result = processHeartbeat(state, now);
    expect(result.updatedState.asymmetry).toBeDefined();
    // At day 48, temporal maturity may push phase beyond alpha
    expect(["alpha", "beta"]).toContain(result.updatedState.asymmetry.phase);
    expect(result.updatedState.asymmetry.signals).toBeDefined();
    expect(result.updatedState.asymmetry.signals.temporalMaturity).toBeGreaterThan(0);
    expect(result.updatedState.asymmetry.score).toBeGreaterThanOrEqual(0);
  });

  it("asymmetry score increases with growth day", () => {
    const seed = makeSeed();
    // Simulate an entity created 90 days ago
    const oldSeed = { ...seed, createdAt: "2025-11-20T00:00:00Z" };
    const state = createEntityState(oldSeed, NOW);
    const now = new Date("2026-02-18T12:00:00Z");
    const result = processHeartbeat(state, now);
    // 90 days of temporal maturity should push score above 0
    expect(result.updatedState.asymmetry.score).toBeGreaterThan(0);
    expect(result.updatedState.asymmetry.signals.temporalMaturity).toBeGreaterThan(0);
  });
});

describe("processInteraction", () => {
  const context: InteractionContext = {
    minutesSinceLastInteraction: 30,
    userInitiated: true,
    messageLength: 25,
  };

  it("updates lastInteraction", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processInteraction(state, context, NOW);
    expect(result.updatedState.status.lastInteraction).toBe(NOW.toISOString());
  });

  it("increments language interaction count", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processInteraction(state, context, NOW);
    expect(result.updatedState.language.totalInteractions).toBe(1);
  });

  it("changes mood values", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processInteraction(state, context, NOW);
    expect(result.updatedState.status.mood).toBeGreaterThanOrEqual(state.status.mood);
  });

  it("accumulates interactions over multiple calls", () => {
    let state = createEntityState(makeSeed(), NOW);
    for (let i = 0; i < 5; i++) {
      const result = processInteraction(state, context, NOW);
      state = result.updatedState;
    }
    expect(state.language.totalInteractions).toBe(5);
  });

  it("adds memory entries on interaction", () => {
    const state = createEntityState(makeSeed(), NOW);
    // Pre-increment so it's not a first encounter
    state.language = { ...state.language, totalInteractions: 1 };
    const result = processInteraction(state, context, NOW, "User said hello");
    expect(result.updatedState.memory.hot).toHaveLength(1);
    expect(result.updatedState.memory.hot[0].summary).toBe("User said hello");
  });

  it("returns active soul file", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processInteraction(state, context, NOW);
    expect(result.activeSoulFile).toBe("SOUL.md");
  });

  it("achieves first_interaction milestone", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processInteraction(state, context, NOW);
    expect(result.newMilestones.some((m) => m.id === "first_interaction")).toBe(true);
  });
});

describe("first encounter via processInteraction", () => {
  const context: InteractionContext = {
    minutesSinceLastInteraction: 30,
    userInitiated: true,
    messageLength: 25,
  };

  it("triggers first encounter when totalInteractions is 0", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processInteraction(state, context, NOW);
    expect(result.firstEncounter).not.toBeNull();
    expect(result.firstEncounter!.expression).toBeTruthy();
    expect(result.firstEncounter!.innerExperience).toBeTruthy();
  });

  it("generates first encounter diary on first interaction", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processInteraction(state, context, NOW);
    expect(result.firstEncounterDiaryMd).not.toBeNull();
    expect(result.firstEncounterDiaryMd).toContain("# First Encounter");
    expect(result.firstEncounterDiaryMd).toContain("My First Expression");
  });

  it("does not trigger first encounter on subsequent interactions", () => {
    const state = createEntityState(makeSeed(), NOW);
    const first = processInteraction(state, context, NOW);
    const second = processInteraction(first.updatedState, context, NOW);
    expect(second.firstEncounter).toBeNull();
    expect(second.firstEncounterDiaryMd).toBeNull();
  });

  it("applies first encounter status boost on top of normal effect", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processInteraction(state, context, NOW);
    // Curiosity should be boosted significantly (normal + first encounter)
    expect(result.updatedState.status.curiosity).toBeGreaterThan(state.status.curiosity);
  });

  it("stores first encounter memory imprint instead of normal memory", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processInteraction(state, context, NOW, "User said hello");
    expect(result.updatedState.memory.hot).toHaveLength(1);
    expect(result.updatedState.memory.hot[0].summary).toMatch(/\[FIRST ENCOUNTER\]/);
  });

  it("species-specific: vibration seed gets vibration-themed encounter", () => {
    const vibSeed = createFixedSeed({
      perception: "vibration",
      hardwareBody: TEST_HW,
      createdAt: "2026-01-01T00:00:00Z",
    });
    const state = createEntityState(vibSeed, NOW);
    const result = processInteraction(state, context, NOW);
    expect(result.firstEncounter!.innerExperience).toContain("tremor");
  });
});

describe("serializeState", () => {
  it("produces statusMd with all fields", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { statusMd } = serializeState(state);
    expect(statusMd).toContain("**mood**: 50");
    expect(statusMd).toContain("**energy**: 50");
    expect(statusMd).toContain("**curiosity**: 70");
    expect(statusMd).toContain("**comfort**: 50");
  });

  it("produces languageMd with level info", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { languageMd } = serializeState(state);
    expect(languageMd).toContain("Symbols Only");
  });

  it("produces memoryMd", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { memoryMd } = serializeState(state);
    expect(memoryMd).toContain("# MEMORY");
  });

  it("produces milestonesMd", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { milestonesMd } = serializeState(state);
    expect(milestonesMd).toContain("# Growth Milestones");
    expect(milestonesMd).toContain("First Breath");
  });

  it("produces formMd", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { formMd } = serializeState(state);
    expect(formMd).toContain("light-particles");
    expect(formMd).toContain("**density**");
  });

  it("produces dynamicsMd with phase and signals", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { dynamicsMd } = serializeState(state);
    expect(dynamicsMd).toContain("# DYNAMICS");
    expect(dynamicsMd).toContain("Relationship Phase");
    expect(dynamicsMd).toContain("Dependency");
    expect(dynamicsMd).toContain("Signals");
  });
});
