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

function makeSeed() {
  return createFixedSeed({ hardwareBody: TEST_HW, createdAt: "2026-01-01T00:00:00Z" });
}

describe("createEntityState", () => {
  it("creates initial state from seed", () => {
    const state = createEntityState(makeSeed());
    expect(state.status.mood).toBe(50);
    expect(state.status.energy).toBe(50);
    expect(state.status.curiosity).toBe(70);
    expect(state.status.growthDay).toBe(0);
    expect(state.language.level).toBe(LanguageLevel.SymbolsOnly);
  });

  it("uses seed perception for language native symbols", () => {
    const state = createEntityState(makeSeed());
    expect(state.language.nativeSymbols.length).toBeGreaterThan(0);
  });
});

describe("processHeartbeat", () => {
  it("returns updated state", () => {
    const state = createEntityState(makeSeed());
    const now = new Date("2026-02-18T09:00:00Z"); // morning
    const result = processHeartbeat(state, now);
    expect(result.updatedState.status).toBeDefined();
  });

  it("generates diary in evening", () => {
    const state = createEntityState(makeSeed());
    const evening = new Date("2026-02-18T19:00:00Z");
    const result = processHeartbeat(state, evening);
    expect(result.diary).not.toBeNull();
    expect(result.diary?.date).toBe("2026-02-18");
  });

  it("computes growth day from seed creation date", () => {
    const state = createEntityState(makeSeed()); // created 2026-01-01
    const now = new Date("2026-02-18T12:00:00Z"); // 48 days later
    const result = processHeartbeat(state, now);
    expect(result.updatedState.status.growthDay).toBe(48);
  });

  it("signals wake in morning", () => {
    const state = createEntityState(makeSeed());
    const morning = new Date("2026-02-18T09:00:00Z");
    const result = processHeartbeat(state, morning);
    expect(result.wakeSignal).toBe(true);
  });

  it("signals sleep at night", () => {
    const state = createEntityState(makeSeed());
    const night = new Date("2026-02-18T22:00:00Z");
    const result = processHeartbeat(state, night);
    expect(result.sleepSignal).toBe(true);
  });
});

describe("processInteraction", () => {
  const context: InteractionContext = {
    minutesSinceLastInteraction: 30,
    userInitiated: true,
    messageLength: 25,
  };

  it("updates lastInteraction", () => {
    const state = createEntityState(makeSeed());
    const now = new Date("2026-02-18T12:00:00Z");
    const result = processInteraction(state, context, now);
    expect(result.updatedState.status.lastInteraction).toBe(now.toISOString());
  });

  it("increments language interaction count", () => {
    const state = createEntityState(makeSeed());
    const now = new Date("2026-02-18T12:00:00Z");
    const result = processInteraction(state, context, now);
    expect(result.updatedState.language.totalInteractions).toBe(1);
  });

  it("changes mood values", () => {
    const state = createEntityState(makeSeed());
    const now = new Date("2026-02-18T12:00:00Z");
    const result = processInteraction(state, context, now);
    // User-initiated interaction should increase mood
    expect(result.updatedState.status.mood).toBeGreaterThanOrEqual(state.status.mood);
  });

  it("accumulates interactions over multiple calls", () => {
    let state = createEntityState(makeSeed());
    const now = new Date("2026-02-18T12:00:00Z");
    for (let i = 0; i < 5; i++) {
      const result = processInteraction(state, context, now);
      state = result.updatedState;
    }
    expect(state.language.totalInteractions).toBe(5);
  });
});

describe("serializeState", () => {
  it("produces statusMd with all fields", () => {
    const state = createEntityState(makeSeed());
    const { statusMd } = serializeState(state);
    expect(statusMd).toContain("**mood**: 50");
    expect(statusMd).toContain("**energy**: 50");
    expect(statusMd).toContain("**curiosity**: 70");
    expect(statusMd).toContain("**comfort**: 50");
  });

  it("produces languageMd with level info", () => {
    const state = createEntityState(makeSeed());
    const { languageMd } = serializeState(state);
    expect(languageMd).toContain("Symbols Only");
  });
});
