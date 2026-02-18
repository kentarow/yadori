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

  it("initializes memory, growth, and sulk", () => {
    const state = createEntityState(makeSeed(), NOW);
    expect(state.memory.hot).toEqual([]);
    expect(state.growth.milestones.length).toBeGreaterThan(0); // first_breath
    expect(state.sulk.isSulking).toBe(false);
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
});
