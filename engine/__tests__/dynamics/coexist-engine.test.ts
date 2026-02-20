import { describe, it, expect } from "vitest";
import {
  createInitialCoexistState,
  evaluateCoexistence,
  computeCoexistQuality,
  formatCoexistMd,
  type CoexistState,
  type CoexistIndicators,
  type CoexistContext,
} from "../../src/dynamics/coexist-engine.js";
import {
  createInitialAsymmetryState,
  type AsymmetryState,
} from "../../src/dynamics/asymmetry-tracker.js";
import type { Status } from "../../src/types.js";
import { LanguageLevel, PerceptionLevel } from "../../src/types.js";
import type { LanguageState } from "../../src/language/language-engine.js";
import { createInitialMemoryState, type MemoryState } from "../../src/memory/memory-engine.js";
import type { GrowthState } from "../../src/growth/growth-engine.js";
import { type FormState, createInitialFormState } from "../../src/form/form-engine.js";

// --- Test Helpers ---

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    mood: 50,
    energy: 50,
    curiosity: 50,
    comfort: 50,
    languageLevel: LanguageLevel.SymbolsOnly,
    perceptionLevel: PerceptionLevel.Minimal,
    growthDay: 0,
    lastInteraction: new Date().toISOString(),
    ...overrides,
  };
}

function makeLanguage(overrides: Partial<LanguageState> = {}): LanguageState {
  return {
    level: LanguageLevel.SymbolsOnly,
    patterns: [],
    totalInteractions: 0,
    nativeSymbols: [],
    ...overrides,
  };
}

function makeGrowth(overrides: Partial<GrowthState> = {}): GrowthState {
  return {
    stage: "newborn",
    milestones: [],
    ...overrides,
  };
}

function makeForm(overrides: Partial<FormState> = {}): FormState {
  return {
    ...createInitialFormState("light-particles"),
    ...overrides,
  };
}

function makeAsymmetry(overrides: Partial<AsymmetryState> = {}): AsymmetryState {
  return {
    ...createInitialAsymmetryState(),
    ...overrides,
  };
}

const now = new Date("2026-02-20T12:00:00Z");
const sixHoursAgo = new Date("2026-02-20T06:00:00Z");
const twelveHoursAgo = new Date("2026-02-20T00:00:00Z");
const oneHourAgo = new Date("2026-02-20T11:00:00Z");

function makeContext(overrides: Partial<CoexistContext> = {}): CoexistContext {
  return {
    asymmetryState: makeAsymmetry({ phase: "epsilon", score: 80 }),
    status: makeStatus({ growthDay: 180, languageLevel: LanguageLevel.AdvancedOperation, comfort: 70 }),
    language: makeLanguage({
      totalInteractions: 1000,
      nativeSymbols: Array(15).fill("").map((_, i) => `sym${i}`),
    }),
    memory: {
      hot: Array(5).fill({ timestamp: now.toISOString(), summary: "memory", mood: 65 }),
      warm: Array(6).fill({ week: "W", entries: 6, summary: "weekly", averageMood: 62 }),
      cold: Array(2).fill({ month: "M", weeks: 4, summary: "monthly", averageMood: 60 }),
      notes: ["note1", "note2"],
    },
    growth: makeGrowth({ stage: "mature" }),
    form: makeForm({ density: 80, complexity: 70, stability: 85 }),
    lastInteraction: oneHourAgo,
    now,
    ...overrides,
  };
}

describe("Coexist Engine", () => {
  describe("createInitialCoexistState", () => {
    it("returns inactive state with zero values", () => {
      const state = createInitialCoexistState();

      expect(state.active).toBe(false);
      expect(state.quality).toBe(0);
      expect(state.daysInEpsilon).toBe(0);
      expect(state.moments).toHaveLength(0);
      expect(state.indicators.silenceComfort).toBe(0);
      expect(state.indicators.sharedVocabulary).toBe(0);
      expect(state.indicators.rhythmSync).toBe(0);
      expect(state.indicators.sharedMemory).toBe(0);
      expect(state.indicators.autonomyRespect).toBe(0);
    });
  });

  describe("evaluateCoexistence — phase gating", () => {
    it("not active when phase is alpha", () => {
      const initial = createInitialCoexistState();
      const context = makeContext({
        asymmetryState: makeAsymmetry({ phase: "alpha" }),
      });

      const result = evaluateCoexistence(initial, context);
      expect(result.active).toBe(false);
      expect(result.quality).toBe(0);
    });

    it("not active when phase is beta", () => {
      const initial = createInitialCoexistState();
      const context = makeContext({
        asymmetryState: makeAsymmetry({ phase: "beta" }),
      });

      const result = evaluateCoexistence(initial, context);
      expect(result.active).toBe(false);
    });

    it("not active when phase is gamma", () => {
      const initial = createInitialCoexistState();
      const context = makeContext({
        asymmetryState: makeAsymmetry({ phase: "gamma" }),
      });

      const result = evaluateCoexistence(initial, context);
      expect(result.active).toBe(false);
    });

    it("not active when phase is delta", () => {
      const initial = createInitialCoexistState();
      const context = makeContext({
        asymmetryState: makeAsymmetry({ phase: "delta" }),
      });

      const result = evaluateCoexistence(initial, context);
      expect(result.active).toBe(false);
    });

    it("activates when phase is epsilon", () => {
      const initial = createInitialCoexistState();
      const context = makeContext({
        asymmetryState: makeAsymmetry({ phase: "epsilon", score: 80 }),
      });

      const result = evaluateCoexistence(initial, context);
      expect(result.active).toBe(true);
      expect(result.quality).toBeGreaterThan(0);
    });
  });

  describe("evaluateCoexistence — indicators", () => {
    it("silenceComfort increases with long silence and high comfort", () => {
      const initial = createInitialCoexistState();

      // Short silence (1 hour ago)
      const shortSilence = evaluateCoexistence(initial, makeContext({
        lastInteraction: oneHourAgo,
        status: makeStatus({ growthDay: 180, languageLevel: LanguageLevel.AdvancedOperation, comfort: 70 }),
      }));

      // Long silence (12 hours ago) with high comfort
      const longSilence = evaluateCoexistence(initial, makeContext({
        lastInteraction: twelveHoursAgo,
        status: makeStatus({ growthDay: 180, languageLevel: LanguageLevel.AdvancedOperation, comfort: 70 }),
      }));

      expect(longSilence.indicators.silenceComfort).toBeGreaterThan(
        shortSilence.indicators.silenceComfort,
      );
    });

    it("silenceComfort is low when comfort drops during silence", () => {
      const initial = createInitialCoexistState();

      const distressedSilence = evaluateCoexistence(initial, makeContext({
        lastInteraction: twelveHoursAgo,
        status: makeStatus({ growthDay: 180, languageLevel: LanguageLevel.AdvancedOperation, comfort: 10 }),
      }));

      const comfortableSilence = evaluateCoexistence(initial, makeContext({
        lastInteraction: twelveHoursAgo,
        status: makeStatus({ growthDay: 180, languageLevel: LanguageLevel.AdvancedOperation, comfort: 70 }),
      }));

      expect(distressedSilence.indicators.silenceComfort).toBeLessThan(
        comfortableSilence.indicators.silenceComfort,
      );
    });

    it("sharedVocabulary increases with native symbols count", () => {
      const initial = createInitialCoexistState();

      const fewSymbols = evaluateCoexistence(initial, makeContext({
        language: makeLanguage({ totalInteractions: 1000, nativeSymbols: ["a", "b"] }),
        status: makeStatus({ growthDay: 180, languageLevel: LanguageLevel.AdvancedOperation, comfort: 70 }),
      }));

      const manySymbols = evaluateCoexistence(initial, makeContext({
        language: makeLanguage({ totalInteractions: 1000, nativeSymbols: Array(20).fill("s") }),
        status: makeStatus({ growthDay: 180, languageLevel: LanguageLevel.AdvancedOperation, comfort: 70 }),
      }));

      expect(manySymbols.indicators.sharedVocabulary).toBeGreaterThan(
        fewSymbols.indicators.sharedVocabulary,
      );
    });

    it("sharedVocabulary increases with language level", () => {
      const initial = createInitialCoexistState();

      const lowLevel = evaluateCoexistence(initial, makeContext({
        status: makeStatus({ growthDay: 180, languageLevel: LanguageLevel.SymbolsOnly, comfort: 70 }),
        language: makeLanguage({ totalInteractions: 1000, nativeSymbols: Array(10).fill("s") }),
      }));

      const highLevel = evaluateCoexistence(initial, makeContext({
        status: makeStatus({ growthDay: 180, languageLevel: LanguageLevel.AdvancedOperation, comfort: 70 }),
        language: makeLanguage({ totalInteractions: 1000, nativeSymbols: Array(10).fill("s") }),
      }));

      expect(highLevel.indicators.sharedVocabulary).toBeGreaterThan(
        lowLevel.indicators.sharedVocabulary,
      );
    });

    it("sharedMemory increases with warm and cold memory count", () => {
      const initial = createInitialCoexistState();

      const fewMemories = evaluateCoexistence(initial, makeContext({
        memory: { hot: [], warm: [], cold: [], notes: [] },
      }));

      const richMemories = evaluateCoexistence(initial, makeContext({
        memory: {
          hot: [],
          warm: Array(6).fill({ week: "W", entries: 5, summary: "w", averageMood: 60 }),
          cold: Array(3).fill({ month: "M", weeks: 4, summary: "c", averageMood: 60 }),
          notes: [],
        },
      }));

      expect(richMemories.indicators.sharedMemory).toBeGreaterThan(
        fewMemories.indicators.sharedMemory,
      );
    });

    it("autonomyRespect increases with form stability and comfort", () => {
      const initial = createInitialCoexistState();

      const unstable = evaluateCoexistence(initial, makeContext({
        form: makeForm({ stability: 10 }),
        status: makeStatus({ growthDay: 180, languageLevel: LanguageLevel.AdvancedOperation, comfort: 10 }),
      }));

      const stable = evaluateCoexistence(initial, makeContext({
        form: makeForm({ stability: 90 }),
        status: makeStatus({ growthDay: 180, languageLevel: LanguageLevel.AdvancedOperation, comfort: 90 }),
      }));

      expect(stable.indicators.autonomyRespect).toBeGreaterThan(
        unstable.indicators.autonomyRespect,
      );
    });
  });

  describe("computeCoexistQuality", () => {
    it("returns 0 for zero indicators", () => {
      const indicators: CoexistIndicators = {
        silenceComfort: 0,
        sharedVocabulary: 0,
        rhythmSync: 0,
        sharedMemory: 0,
        autonomyRespect: 0,
      };
      expect(computeCoexistQuality(indicators)).toBe(0);
    });

    it("returns 100 for maxed indicators", () => {
      const indicators: CoexistIndicators = {
        silenceComfort: 100,
        sharedVocabulary: 100,
        rhythmSync: 100,
        sharedMemory: 100,
        autonomyRespect: 100,
      };
      expect(computeCoexistQuality(indicators)).toBe(100);
    });

    it("returns weighted average for mixed indicators", () => {
      const indicators: CoexistIndicators = {
        silenceComfort: 80,
        sharedVocabulary: 60,
        rhythmSync: 40,
        sharedMemory: 70,
        autonomyRespect: 50,
      };
      const quality = computeCoexistQuality(indicators);

      // Manual calculation:
      // 80*0.25 + 60*0.20 + 40*0.15 + 70*0.20 + 50*0.20
      // = 20 + 12 + 6 + 14 + 10 = 62
      expect(quality).toBe(62);
    });
  });

  describe("evaluateCoexistence — moments", () => {
    it("records moments when indicators cross thresholds", () => {
      // Start with indicators below 70
      const initial: CoexistState = {
        active: true,
        quality: 50,
        indicators: {
          silenceComfort: 60,
          sharedVocabulary: 60,
          rhythmSync: 60,
          sharedMemory: 60,
          autonomyRespect: 60,
        },
        moments: [],
        daysInEpsilon: 5,
      };

      // Context that pushes autonomyRespect above 70
      const context = makeContext({
        form: makeForm({ stability: 90 }),
        status: makeStatus({ growthDay: 180, languageLevel: LanguageLevel.AdvancedOperation, comfort: 90 }),
      });

      const result = evaluateCoexistence(initial, context);

      // autonomyRespect should now be 90 (stability 90/2 + comfort 90/2 = 45 + 45 = 90)
      expect(result.indicators.autonomyRespect).toBeGreaterThanOrEqual(70);

      // Should have recorded an independent_action moment
      const autonomyMoments = result.moments.filter(m => m.type === "independent_action");
      expect(autonomyMoments.length).toBeGreaterThanOrEqual(1);
    });

    it("does not re-record moments for already-crossed thresholds", () => {
      const initial: CoexistState = {
        active: true,
        quality: 80,
        indicators: {
          silenceComfort: 80,
          sharedVocabulary: 80,
          rhythmSync: 80,
          sharedMemory: 80,
          autonomyRespect: 80,
        },
        moments: [
          {
            timestamp: "2026-02-19T00:00:00Z",
            type: "independent_action",
            description: "Already recorded",
          },
        ],
        daysInEpsilon: 10,
      };

      const context = makeContext({
        form: makeForm({ stability: 90 }),
        status: makeStatus({ growthDay: 180, languageLevel: LanguageLevel.AdvancedOperation, comfort: 90 }),
      });

      const result = evaluateCoexistence(initial, context);

      // No new moments should be added since previous indicators were already above 70
      expect(result.moments).toHaveLength(1);
    });
  });

  describe("evaluateCoexistence — daysInEpsilon", () => {
    it("starts at 1 when first entering epsilon", () => {
      const initial = createInitialCoexistState();
      const context = makeContext();

      const result = evaluateCoexistence(initial, context);
      expect(result.daysInEpsilon).toBe(1);
    });

    it("increments when already active", () => {
      const initial: CoexistState = {
        active: true,
        quality: 60,
        indicators: {
          silenceComfort: 60,
          sharedVocabulary: 60,
          rhythmSync: 60,
          sharedMemory: 60,
          autonomyRespect: 60,
        },
        moments: [],
        daysInEpsilon: 5,
      };

      const context = makeContext();
      const result = evaluateCoexistence(initial, context);
      expect(result.daysInEpsilon).toBe(6);
    });

    it("does not increment when not in epsilon", () => {
      const initial: CoexistState = {
        active: true,
        quality: 60,
        indicators: {
          silenceComfort: 60,
          sharedVocabulary: 60,
          rhythmSync: 60,
          sharedMemory: 60,
          autonomyRespect: 60,
        },
        moments: [],
        daysInEpsilon: 5,
      };

      const context = makeContext({
        asymmetryState: makeAsymmetry({ phase: "delta" }),
      });

      const result = evaluateCoexistence(initial, context);
      // daysInEpsilon is preserved but not incremented (state becomes inactive)
      expect(result.active).toBe(false);
      expect(result.daysInEpsilon).toBe(5);
    });
  });

  describe("formatCoexistMd", () => {
    it("shows inactive message when not in epsilon", () => {
      const state = createInitialCoexistState();
      const md = formatCoexistMd(state);

      expect(md).toContain("# COEXISTENCE");
      expect(md).toContain("Not yet in Phase epsilon");
    });

    it("includes all indicators when active", () => {
      const state: CoexistState = {
        active: true,
        quality: 72,
        indicators: {
          silenceComfort: 80,
          sharedVocabulary: 65,
          rhythmSync: 55,
          sharedMemory: 70,
          autonomyRespect: 85,
        },
        moments: [],
        daysInEpsilon: 14,
      };

      const md = formatCoexistMd(state);

      expect(md).toContain("# COEXISTENCE");
      expect(md).toContain("active");
      expect(md).toContain("quality");
      expect(md).toContain("72");
      expect(md).toContain("days in epsilon");
      expect(md).toContain("14");
      expect(md).toContain("Silence Comfort");
      expect(md).toContain("Shared Vocabulary");
      expect(md).toContain("Rhythm Synchrony");
      expect(md).toContain("Shared Memory");
      expect(md).toContain("Autonomy Respect");
    });

    it("includes moments section when moments exist", () => {
      const state: CoexistState = {
        active: true,
        quality: 72,
        indicators: {
          silenceComfort: 80,
          sharedVocabulary: 65,
          rhythmSync: 55,
          sharedMemory: 70,
          autonomyRespect: 85,
        },
        moments: [
          {
            timestamp: "2026-02-18T10:00:00.000Z",
            type: "comfortable_silence",
            description: "Silence has become a shared language.",
          },
          {
            timestamp: "2026-02-19T14:00:00.000Z",
            type: "independent_action",
            description: "The entity moves freely; the user watches with trust.",
          },
        ],
        daysInEpsilon: 14,
      };

      const md = formatCoexistMd(state);

      expect(md).toContain("## Moments");
      expect(md).toContain("comfortable_silence");
      expect(md).toContain("independent_action");
      expect(md).toContain("2026-02-18");
      expect(md).toContain("2026-02-19");
    });

    it("does not include moments section when no moments exist", () => {
      const state: CoexistState = {
        active: true,
        quality: 40,
        indicators: {
          silenceComfort: 40,
          sharedVocabulary: 40,
          rhythmSync: 40,
          sharedMemory: 40,
          autonomyRespect: 40,
        },
        moments: [],
        daysInEpsilon: 3,
      };

      const md = formatCoexistMd(state);
      expect(md).not.toContain("## Moments");
    });
  });
});
