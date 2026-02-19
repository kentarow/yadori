/**
 * End-to-End Integration Test
 *
 * Verifies the complete data pipeline:
 *   Seed → EntityState → serializeState → STATUS.md → parseStatusMd → Dashboard
 *
 * This test ensures that values survive the full round-trip from
 * engine state through file serialization to dashboard parsing,
 * catching any format mismatches between writers and readers.
 */

import { describe, it, expect } from "vitest";
import { createFixedSeed } from "../../engine/src/genesis/seed-generator.js";
import {
  createEntityState,
  processHeartbeat,
  processInteraction,
  serializeState,
} from "../../engine/src/status/status-manager.js";
import { parseStatusMd, parseSeedMd, computeCoexistenceMetrics } from "../../visual/parsers.js";
import type { HardwareBody, PerceptionMode, Temperament, SelfForm } from "../../engine/src/types.js";

const TEST_HW: HardwareBody = {
  platform: "darwin",
  arch: "arm64",
  totalMemoryGB: 16,
  cpuModel: "Apple M4",
  storageGB: 256,
};

const NOW = new Date("2026-02-19T14:00:00Z");

// ============================================================
// Round-trip: EntityState → STATUS.md → parseStatusMd
// ============================================================

describe("round-trip: engine state → STATUS.md → dashboard parser", () => {
  it("initial state round-trips correctly", () => {
    const seed = createFixedSeed({ hardwareBody: TEST_HW });
    const state = createEntityState(seed, NOW);
    const { statusMd } = serializeState(state);

    // Parse with dashboard parser
    const parsed = parseStatusMd(statusMd);

    // Values must match exactly
    expect(parsed.mood).toBe(state.status.mood);
    expect(parsed.energy).toBe(state.status.energy);
    expect(parsed.curiosity).toBe(state.status.curiosity);
    expect(parsed.comfort).toBe(state.status.comfort);
    expect(parsed.languageLevel).toBe(state.status.languageLevel);
    expect(parsed.growthDay).toBe(state.status.growthDay);
    expect(parsed.perceptionLevel).toBe(state.status.perceptionLevel);
  });

  it("post-heartbeat state round-trips correctly", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: "2026-02-01T00:00:00Z", // 18 days old
    });
    const state = createEntityState(seed, new Date("2026-02-01T00:00:00Z"));

    // Process a heartbeat at midday (active hours)
    const result = processHeartbeat(state, NOW);
    const { statusMd } = serializeState(result.updatedState);
    const parsed = parseStatusMd(statusMd);

    expect(parsed.mood).toBe(result.updatedState.status.mood);
    expect(parsed.energy).toBe(result.updatedState.status.energy);
    expect(parsed.curiosity).toBe(result.updatedState.status.curiosity);
    expect(parsed.comfort).toBe(result.updatedState.status.comfort);
    expect(parsed.growthDay).toBe(result.updatedState.status.growthDay);
    expect(parsed.perceptionLevel).toBe(result.updatedState.status.perceptionLevel);
  });

  it("post-interaction state round-trips correctly", () => {
    const seed = createFixedSeed({ hardwareBody: TEST_HW });
    const state = createEntityState(seed, NOW);

    const result = processInteraction(
      state,
      { tone: "positive", messageLength: 50 },
      NOW,
      "User said hello",
    );

    const { statusMd } = serializeState(result.updatedState);
    const parsed = parseStatusMd(statusMd);

    expect(parsed.mood).toBe(result.updatedState.status.mood);
    expect(parsed.energy).toBe(result.updatedState.status.energy);
  });

  it("handles multiple interactions (mood diverges from initial)", () => {
    const seed = createFixedSeed({ hardwareBody: TEST_HW });
    let state = createEntityState(seed, NOW);

    // 5 positive interactions
    for (let i = 0; i < 5; i++) {
      const result = processInteraction(
        state,
        { tone: "positive", messageLength: 100 },
        new Date(NOW.getTime() + i * 60_000),
        `Message ${i}`,
      );
      state = result.updatedState;
    }

    const { statusMd } = serializeState(state);
    const parsed = parseStatusMd(statusMd);

    // Mood should have increased from interactions
    expect(parsed.mood).toBeGreaterThan(50);
    expect(parsed.mood).toBe(state.status.mood);
  });
});

// ============================================================
// Round-trip: Seed → SEED.md format → parseSeedMd
// ============================================================

describe("round-trip: seed → SEED.md format → dashboard parser", () => {
  // The SEED.md format is written by the setup script. We simulate it here.
  function formatSeedMd(seed: ReturnType<typeof createFixedSeed>): string {
    return `# Entity Seed

**Perception**: ${seed.perception}
**Expression**: ${seed.expression}
**Cognition**: ${seed.cognition}
**Temperament**: ${seed.temperament}
**Form**: ${seed.form}
**Born**: ${seed.createdAt}
**Hardware**: ${seed.hardwareBody.platform}-${seed.hardwareBody.arch}-${seed.hardwareBody.totalMemoryGB}gb
`;
  }

  it("parses all 6 perception types through round-trip", () => {
    const species: PerceptionMode[] = ["chromatic", "vibration", "geometric", "thermal", "temporal", "chemical"];

    for (const perception of species) {
      const seed = createFixedSeed({ perception, hardwareBody: TEST_HW });
      const md = formatSeedMd(seed);
      const parsed = parseSeedMd(md);
      expect(parsed.perception).toBe(perception);
    }
  });

  it("parses all form types through round-trip", () => {
    const forms: SelfForm[] = ["light-particles", "fluid", "crystal", "sound-echo", "mist", "geometric-cluster"];

    for (const form of forms) {
      const seed = createFixedSeed({ form, hardwareBody: TEST_HW });
      const md = formatSeedMd(seed);
      const parsed = parseSeedMd(md);
      expect(parsed.form).toBe(form);
    }
  });

  it("parses all temperament types through round-trip", () => {
    const temps: Temperament[] = ["curious-cautious", "bold-impulsive", "calm-observant", "restless-exploratory"];

    for (const temperament of temps) {
      const seed = createFixedSeed({ temperament, hardwareBody: TEST_HW });
      const md = formatSeedMd(seed);
      const parsed = parseSeedMd(md);
      expect(parsed.temperament).toBe(temperament);
    }
  });
});

// ============================================================
// Coexistence metrics from engine state
// ============================================================

describe("coexistence metrics from engine state", () => {
  it("computes correctly from freshly created entity", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: "2026-02-01T00:00:00Z",
    });
    const state = createEntityState(seed, new Date("2026-02-01T00:00:00Z"));

    const metrics = computeCoexistenceMetrics({
      bornDate: seed.createdAt,
      lastInteraction: state.status.lastInteraction,
      totalInteractions: state.language.totalInteractions,
      now: NOW.getTime(),
    });

    expect(metrics.daysTogether).toBe(18);
    expect(metrics.silenceHours).toBeNull(); // "never" interaction
  });

  it("computes silence after interaction", () => {
    const seed = createFixedSeed({ hardwareBody: TEST_HW });
    const state = createEntityState(seed, NOW);

    const result = processInteraction(
      state,
      { tone: "neutral", messageLength: 20 },
      NOW,
    );

    // Check 2 hours after interaction
    const laterNow = NOW.getTime() + 2 * 3600_000;
    const metrics = computeCoexistenceMetrics({
      bornDate: seed.createdAt,
      lastInteraction: result.updatedState.status.lastInteraction,
      totalInteractions: result.updatedState.language.totalInteractions,
      now: laterNow,
    });

    expect(metrics.silenceHours).toBe(2);
  });
});

// ============================================================
// Visual parameter ranges (ensures dashboard won't break)
// ============================================================

describe("visual parameter safety (extreme states produce valid visuals)", () => {
  it("sulking entity produces valid dashboard data", () => {
    const seed = createFixedSeed({ hardwareBody: TEST_HW });
    let state = createEntityState(seed, NOW);

    // Simulate many heartbeats without interaction to trigger sulk
    for (let i = 0; i < 20; i++) {
      const result = processHeartbeat(state, new Date(NOW.getTime() + i * 30 * 60_000));
      state = result.updatedState;
    }

    const { statusMd } = serializeState(state);
    const parsed = parseStatusMd(statusMd);

    // All values must be within valid range for dashboard rendering
    expect(parsed.mood).toBeGreaterThanOrEqual(0);
    expect(parsed.mood).toBeLessThanOrEqual(100);
    expect(parsed.energy).toBeGreaterThanOrEqual(0);
    expect(parsed.energy).toBeLessThanOrEqual(100);
    expect(parsed.curiosity).toBeGreaterThanOrEqual(0);
    expect(parsed.curiosity).toBeLessThanOrEqual(100);
    expect(parsed.comfort).toBeGreaterThanOrEqual(0);
    expect(parsed.comfort).toBeLessThanOrEqual(100);
  });

  it("highly stimulated entity produces valid dashboard data", () => {
    const seed = createFixedSeed({ hardwareBody: TEST_HW });
    let state = createEntityState(seed, NOW);

    // Many rapid positive interactions
    for (let i = 0; i < 30; i++) {
      const result = processInteraction(
        state,
        { tone: "positive", messageLength: 200 },
        new Date(NOW.getTime() + i * 60_000),
        `Exciting message ${i}`,
      );
      state = result.updatedState;
    }

    const { statusMd } = serializeState(state);
    const parsed = parseStatusMd(statusMd);

    // Values capped within 0-100
    expect(parsed.mood).toBeGreaterThanOrEqual(0);
    expect(parsed.mood).toBeLessThanOrEqual(100);
    expect(parsed.energy).toBeGreaterThanOrEqual(0);
    expect(parsed.energy).toBeLessThanOrEqual(100);
  });

  it("status-to-visual formulas produce finite numbers", () => {
    const seed = createFixedSeed({ hardwareBody: TEST_HW });
    const state = createEntityState(seed, NOW);
    const { statusMd } = serializeState(state);
    const parsed = parseStatusMd(statusMd);

    // Dashboard visual formulas (from index.html)
    const breathSpeed = 0.3 + (parsed.energy / 100) * 0.7;
    const drift = 5 + (parsed.curiosity / 100) * 25;
    const soundInterval = 2000 + (1 - parsed.energy / 100) * 6000;

    expect(Number.isFinite(breathSpeed)).toBe(true);
    expect(Number.isFinite(drift)).toBe(true);
    expect(Number.isFinite(soundInterval)).toBe(true);
    expect(breathSpeed).toBeGreaterThan(0);
    expect(drift).toBeGreaterThan(0);
    expect(soundInterval).toBeGreaterThan(0);
  });
});

// ============================================================
// Entity lifecycle simulation
// ============================================================

describe("entity lifecycle: birth → interactions → heartbeats → dashboard", () => {
  it("simulates first day of life", () => {
    const birthTime = new Date("2026-02-19T08:00:00Z");
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: birthTime.toISOString(),
    });
    let state = createEntityState(seed, birthTime);

    // First encounter
    const firstResult = processInteraction(
      state,
      { tone: "neutral", messageLength: 10 },
      new Date("2026-02-19T09:00:00Z"),
    );
    expect(firstResult.firstEncounter).not.toBeNull();
    state = firstResult.updatedState;

    // Heartbeat at noon
    const hbResult = processHeartbeat(state, new Date("2026-02-19T12:00:00Z"));
    state = hbResult.updatedState;

    // Another interaction
    const secondResult = processInteraction(
      state,
      { tone: "positive", messageLength: 50 },
      new Date("2026-02-19T14:00:00Z"),
    );
    expect(secondResult.firstEncounter).toBeNull(); // Only once
    state = secondResult.updatedState;

    // Evening heartbeat (may generate diary)
    const eveningHb = processHeartbeat(state, new Date("2026-02-19T22:00:00Z"));
    state = eveningHb.updatedState;

    // Final state round-trips to dashboard
    const { statusMd } = serializeState(state);
    const parsed = parseStatusMd(statusMd);

    expect(parsed.mood).toBe(state.status.mood);
    expect(parsed.growthDay).toBe(0); // Same day as birth
    expect(parsed.languageLevel).toBe(0); // Day 0: symbols only
    expect(state.language.totalInteractions).toBe(2);
  });
});
