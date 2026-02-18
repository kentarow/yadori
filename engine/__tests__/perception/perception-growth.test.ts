import { describe, it, expect } from "vitest";
import {
  createInitialPerceptionGrowthState,
  evaluatePerceptionLevel,
  recordSensoryInput,
} from "../../src/perception/perception-growth.js";
import { PerceptionLevel } from "../../src/types.js";

describe("createInitialPerceptionGrowthState", () => {
  it("starts at Level 0 with zero inputs", () => {
    const state = createInitialPerceptionGrowthState();
    expect(state.level).toBe(PerceptionLevel.Minimal);
    expect(state.totalSensoryInputs).toBe(0);
    expect(state.modalitiesEncountered).toBe(0);
  });
});

describe("evaluatePerceptionLevel", () => {
  it("Level 0 at day 0", () => {
    const state = createInitialPerceptionGrowthState();
    expect(evaluatePerceptionLevel(state, 0)).toBe(PerceptionLevel.Minimal);
  });

  it("Level 1 at day 7", () => {
    const state = createInitialPerceptionGrowthState();
    expect(evaluatePerceptionLevel(state, 7)).toBe(PerceptionLevel.Basic);
  });

  it("Level 2 at day 21", () => {
    const state = createInitialPerceptionGrowthState();
    expect(evaluatePerceptionLevel(state, 21)).toBe(PerceptionLevel.Structured);
  });

  it("Level 3 at day 60", () => {
    const state = createInitialPerceptionGrowthState();
    expect(evaluatePerceptionLevel(state, 60)).toBe(PerceptionLevel.Relational);
  });

  it("Level 4 at day 120", () => {
    const state = createInitialPerceptionGrowthState();
    expect(evaluatePerceptionLevel(state, 120)).toBe(PerceptionLevel.Full);
  });

  it("sensory exposure accelerates growth", () => {
    // With 200+ inputs, day threshold drops by 5
    const state = recordSensoryInput(createInitialPerceptionGrowthState(), 200, 1);
    // Day 16 + 5 (exposure) + 2 (1 modality) = effective 23 → Level 2
    expect(evaluatePerceptionLevel(state, 16)).toBe(PerceptionLevel.Structured);
    // Without exposure, day 16 = still Level 1
    expect(evaluatePerceptionLevel(createInitialPerceptionGrowthState(), 16)).toBe(PerceptionLevel.Basic);
  });

  it("multiple modalities also accelerate growth", () => {
    const state = recordSensoryInput(createInitialPerceptionGrowthState(), 10, 3);
    // Day 5 + 5 (3 modalities) = effective 10 → Level 1
    expect(evaluatePerceptionLevel(state, 5)).toBe(PerceptionLevel.Basic);
    // Without modalities, day 5 = still Level 0
    expect(evaluatePerceptionLevel(createInitialPerceptionGrowthState(), 5)).toBe(PerceptionLevel.Minimal);
  });

  it("exposure + modalities stack", () => {
    // 1000 inputs (10 day reduction) + 5 modalities (10 day reduction) = 20 bonus days
    const state = recordSensoryInput(createInitialPerceptionGrowthState(), 1000, 5);
    // Day 40 + 20 = effective 60 → Level 3
    expect(evaluatePerceptionLevel(state, 40)).toBe(PerceptionLevel.Relational);
  });
});

describe("recordSensoryInput", () => {
  it("accumulates input count", () => {
    let state = createInitialPerceptionGrowthState();
    state = recordSensoryInput(state, 10, 1);
    expect(state.totalSensoryInputs).toBe(10);

    state = recordSensoryInput(state, 5, 0);
    expect(state.totalSensoryInputs).toBe(15);
  });

  it("accumulates modality count", () => {
    let state = createInitialPerceptionGrowthState();
    state = recordSensoryInput(state, 1, 2);
    expect(state.modalitiesEncountered).toBe(2);

    state = recordSensoryInput(state, 1, 1);
    expect(state.modalitiesEncountered).toBe(3);
  });
});
