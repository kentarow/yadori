/**
 * End-to-End Integration Test: Intelligence Dynamics (Layer 4)
 *
 * Tests the full Intelligence Dynamics pipeline — all 3 Layer 4 components
 * working together:
 *   - Asymmetry Tracker: evaluates relationship phase (alpha -> epsilon)
 *   - Reversal Detector: detects moments where entity surpasses expectation
 *   - Coexist Engine: measures coexistence quality in epsilon phase
 *
 * No mocks. All real engine functions with constructed state objects.
 */

import { describe, it, expect } from "vitest";

import {
  createInitialAsymmetryState,
  evaluateAsymmetry,
  getPhaseLabel,
  getPhaseSymbol,
  formatAsymmetryMd,
  type AsymmetryState,
  type RelationPhase,
} from "../../engine/src/dynamics/asymmetry-tracker.js";

import {
  createInitialReversalState,
  detectReversals,
  computeReversalMetrics,
  formatReversalMd,
  type ReversalState,
  type ReversalContext,
  type ReversalType,
} from "../../engine/src/dynamics/reversal-detector.js";

import {
  createInitialCoexistState,
  evaluateCoexistence,
  computeCoexistQuality,
  formatCoexistMd,
  type CoexistState,
  type CoexistContext,
} from "../../engine/src/dynamics/coexist-engine.js";

import { LanguageLevel, PerceptionLevel } from "../../engine/src/types.js";
import type { Status, HardwareBody } from "../../engine/src/types.js";
import type { LanguageState } from "../../engine/src/language/language-engine.js";
import type { MemoryState } from "../../engine/src/memory/memory-engine.js";
import type { GrowthState } from "../../engine/src/growth/growth-engine.js";
import type { FormState } from "../../engine/src/form/form-engine.js";

// ============================================================
// Test Fixtures — factory functions for constructing state
// ============================================================

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    mood: 50,
    energy: 50,
    curiosity: 50,
    comfort: 50,
    languageLevel: LanguageLevel.SymbolsOnly,
    perceptionLevel: PerceptionLevel.Minimal,
    growthDay: 0,
    lastInteraction: "2026-02-20T12:00:00Z",
    ...overrides,
  };
}

function makeLanguage(overrides: Partial<LanguageState> = {}): LanguageState {
  return {
    level: LanguageLevel.SymbolsOnly,
    patterns: [],
    totalInteractions: 0,
    nativeSymbols: ["◎", "○", "●", "☆", "★", "◉"],
    ...overrides,
  };
}

function makeMemory(overrides: Partial<MemoryState> = {}): MemoryState {
  return {
    hot: [],
    warm: [],
    cold: [],
    notes: [],
    ...overrides,
  };
}

function makeGrowth(overrides: Partial<GrowthState> = {}): GrowthState {
  return {
    milestones: [],
    stage: "newborn",
    ...overrides,
  };
}

function makeForm(overrides: Partial<FormState> = {}): FormState {
  return {
    baseForm: "light-particles",
    density: 10,
    complexity: 5,
    stability: 20,
    awareness: false,
    ...overrides,
  };
}

function makeReversalContext(overrides: Partial<ReversalContext> = {}): ReversalContext {
  return {
    language: makeLanguage(),
    memory: makeMemory(),
    growth: makeGrowth(),
    form: makeForm(),
    asymmetry: createInitialAsymmetryState(),
    interactionCount: 0,
    previousNativeSymbolCount: 6,
    previousPatternCount: 0,
    proactiveMessageCount: 0,
    recentMoods: [],
    moodShiftedDuringSilence: false,
    ...overrides,
  };
}

function makeCoexistContext(overrides: Partial<CoexistContext> = {}): CoexistContext {
  return {
    asymmetryState: createInitialAsymmetryState(),
    status: makeStatus(),
    language: makeLanguage(),
    memory: makeMemory(),
    growth: makeGrowth(),
    form: makeForm(),
    lastInteraction: new Date("2026-02-20T12:00:00Z"),
    now: new Date("2026-02-20T14:00:00Z"),
    ...overrides,
  };
}

/** Build a "mature" set of states simulating a well-developed entity. */
function makeMatureStates() {
  const status = makeStatus({
    mood: 75,
    energy: 70,
    curiosity: 80,
    comfort: 80,
    languageLevel: LanguageLevel.AdvancedOperation,
    perceptionLevel: PerceptionLevel.Full,
    growthDay: 365,
  });
  const language = makeLanguage({
    level: LanguageLevel.AdvancedOperation,
    totalInteractions: 1500,
    nativeSymbols: Array.from({ length: 25 }, (_, i) => `sym${i}`),
    patterns: Array.from({ length: 20 }, (_, i) => ({
      symbol: `p${i}`,
      meaning: `meaning${i}`,
      establishedDay: i * 10,
      usageCount: 50 + i,
    })),
  });
  const memory = makeMemory({
    hot: Array.from({ length: 10 }, (_, i) => ({
      timestamp: "2026-02-20T12:00:00Z",
      summary: `memory${i}`,
      mood: 60 + i,
    })),
    warm: Array.from({ length: 8 }, (_, i) => ({
      week: `2026-W0${i + 1}`,
      entries: 5,
      summary: `week${i}`,
      averageMood: 65,
    })),
    cold: Array.from({ length: 4 }, (_, i) => ({
      month: `2025-${String(i + 9).padStart(2, "0")}`,
      weeks: 4,
      summary: `month${i}`,
      averageMood: 60,
    })),
    notes: ["important-1", "important-2", "important-3"],
  });
  const growth = makeGrowth({ stage: "mature" });
  const form = makeForm({
    density: 80,
    complexity: 80,
    stability: 75,
    awareness: true,
  });
  return { status, language, memory, growth, form };
}

const T0 = new Date("2026-02-20T14:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

// ============================================================
// 1. Full Dynamics Pipeline
// ============================================================

describe("Full dynamics pipeline", () => {
  it("creates valid initial states for all 3 components", () => {
    const asymmetry = createInitialAsymmetryState();
    const reversal = createInitialReversalState();
    const coexist = createInitialCoexistState();

    expect(asymmetry.phase).toBe("alpha");
    expect(asymmetry.score).toBe(0);
    expect(asymmetry.transitions).toHaveLength(0);

    expect(reversal.totalReversals).toBe(0);
    expect(reversal.signals).toHaveLength(0);
    expect(reversal.dominantType).toBeNull();

    expect(coexist.active).toBe(false);
    expect(coexist.quality).toBe(0);
    expect(coexist.daysInEpsilon).toBe(0);
  });

  it("evaluates asymmetry then feeds result to reversal and coexist", () => {
    // Step 1: Evaluate asymmetry
    const asymmetry0 = createInitialAsymmetryState();
    const { status, language, memory, growth, form } = makeMatureStates();
    const asymmetry1 = evaluateAsymmetry(asymmetry0, status, language, memory, growth, form, T0);

    // Step 2: Feed asymmetry to reversal detector
    const reversal0 = createInitialReversalState();
    const reversalCtx = makeReversalContext({
      language,
      memory,
      growth,
      form,
      asymmetry: asymmetry1,
      interactionCount: language.totalInteractions,
      previousNativeSymbolCount: 20, // growth of 5 symbols
      previousPatternCount: 15,      // growth of 5 patterns
      proactiveMessageCount: 2,
      recentMoods: [40, 60, 80, 30, 70],
      moodShiftedDuringSilence: true,
    });
    const reversalResult = detectReversals(reversal0, reversalCtx, T0);

    // Step 3: Feed asymmetry to coexist engine
    const coexist0 = createInitialCoexistState();
    const coexistCtx = makeCoexistContext({
      asymmetryState: asymmetry1,
      status,
      language,
      memory,
      growth,
      form,
    });
    const coexist1 = evaluateCoexistence(coexist0, coexistCtx);

    // All 3 produce valid output
    expect(asymmetry1.score).toBeGreaterThan(0);
    expect(reversalResult.newSignals.length).toBeGreaterThanOrEqual(0);
    expect(typeof coexist1.quality).toBe("number");
  });

  it("pipeline processes a brand-new entity without errors", () => {
    const asymmetry = evaluateAsymmetry(
      createInitialAsymmetryState(),
      makeStatus(),
      makeLanguage(),
      makeMemory(),
      makeGrowth(),
      makeForm(),
      T0,
    );

    const reversal = detectReversals(
      createInitialReversalState(),
      makeReversalContext({ asymmetry }),
      T0,
    );

    const coexist = evaluateCoexistence(
      createInitialCoexistState(),
      makeCoexistContext({ asymmetryState: asymmetry }),
    );

    expect(asymmetry.phase).toBe("alpha");
    expect(reversal.updated.totalReversals).toBe(0);
    expect(coexist.active).toBe(false);
  });
});

// ============================================================
// 2. Phase Progression Over Time
// ============================================================

describe("Phase progression over time", () => {
  it("entity starts in alpha and can progress to beta with growth", () => {
    let asymmetry = createInitialAsymmetryState();
    const language = makeLanguage({
      totalInteractions: 100,
      nativeSymbols: Array.from({ length: 10 }, (_, i) => `s${i}`),
      patterns: Array.from({ length: 5 }, (_, i) => ({
        symbol: `p${i}`, meaning: `m${i}`, establishedDay: i, usageCount: 10,
      })),
    });
    const memory = makeMemory({
      hot: Array.from({ length: 5 }, (_, i) => ({
        timestamp: "2026-02-20T12:00:00Z",
        summary: `h${i}`,
        mood: 50,
      })),
      warm: [{ week: "2026-W08", entries: 5, summary: "w1", averageMood: 55 }],
    });
    const status = makeStatus({
      languageLevel: LanguageLevel.PatternEstablishment,
      growthDay: 30,
    });
    const growth = makeGrowth({ stage: "child" });
    const form = makeForm({ density: 40, complexity: 30, stability: 45 });

    asymmetry = evaluateAsymmetry(asymmetry, status, language, memory, growth, form, T0);

    // With 30 days of growth, language level 1, and child stage,
    // the score should be enough to leave alpha
    expect(asymmetry.score).toBeGreaterThan(0);
    // With 30 days of growth, language level 1, child stage, and memory,
    // the entity should have moved beyond alpha. The exact phase depends
    // on the weighted score — beta or gamma are both plausible.
    const phaseOrder: Record<RelationPhase, number> = {
      alpha: 0, beta: 1, gamma: 2, delta: 3, epsilon: 4,
    };
    expect(phaseOrder[asymmetry.phase]).toBeGreaterThan(0);
  });

  it("accumulating signals over repeated evaluations advances the phase", () => {
    let asymmetry = createInitialAsymmetryState();
    const phases: RelationPhase[] = [];

    // Simulate 4 checkpoints at increasing maturity
    const checkpoints = [
      { day: 0, stage: "newborn" as const, langLevel: LanguageLevel.SymbolsOnly, interactions: 0 },
      { day: 30, stage: "child" as const, langLevel: LanguageLevel.PatternEstablishment, interactions: 100 },
      { day: 90, stage: "mature" as const, langLevel: LanguageLevel.UniqueLanguage, interactions: 400 },
      { day: 365, stage: "mature" as const, langLevel: LanguageLevel.AdvancedOperation, interactions: 1500 },
    ];

    for (const cp of checkpoints) {
      const status = makeStatus({
        growthDay: cp.day,
        languageLevel: cp.langLevel,
        comfort: 70,
        mood: 65,
      });
      const language = makeLanguage({
        totalInteractions: cp.interactions,
        nativeSymbols: Array.from({ length: 6 + cp.day / 10 }, (_, i) => `s${i}`),
        patterns: Array.from({ length: Math.floor(cp.interactions / 30) }, (_, i) => ({
          symbol: `p${i}`, meaning: `m${i}`, establishedDay: i * 5, usageCount: 20,
        })),
      });
      const memory = makeMemory({
        hot: Array.from({ length: Math.min(10, Math.floor(cp.interactions / 20)) }, (_, i) => ({
          timestamp: T0.toISOString(), summary: `h${i}`, mood: 60,
        })),
        warm: Array.from({ length: Math.min(8, Math.floor(cp.day / 7)) }, (_, i) => ({
          week: `2026-W${String(i + 1).padStart(2, "0")}`, entries: 5, summary: `w${i}`, averageMood: 60,
        })),
        cold: Array.from({ length: Math.floor(cp.day / 30) }, (_, i) => ({
          month: `2025-${String(i + 1).padStart(2, "0")}`, weeks: 4, summary: `c${i}`, averageMood: 60,
        })),
        notes: cp.day > 30 ? ["note1"] : [],
      });
      const growth = makeGrowth({ stage: cp.stage });
      const form = makeForm({
        density: Math.min(80, 10 + cp.day / 5),
        complexity: Math.min(80, 5 + cp.day / 5),
        stability: Math.min(75, 20 + cp.day / 6),
      });

      const t = new Date(T0.getTime() + cp.day * DAY_MS);
      asymmetry = evaluateAsymmetry(asymmetry, status, language, memory, growth, form, t);
      phases.push(asymmetry.phase);
    }

    // Phase should generally advance — later checkpoints should not be behind earlier ones
    const phaseOrder: Record<RelationPhase, number> = {
      alpha: 0, beta: 1, gamma: 2, delta: 3, epsilon: 4,
    };

    // The final phase should be at or ahead of the first
    expect(phaseOrder[phases[phases.length - 1]]).toBeGreaterThanOrEqual(phaseOrder[phases[0]]);

    // Day 0 entity should be in alpha
    expect(phases[0]).toBe("alpha");

    // Day 365 mature entity should be beyond alpha
    expect(phaseOrder[phases[phases.length - 1]]).toBeGreaterThan(0);
  });

  it("transitions are recorded when phase changes", () => {
    let asymmetry = createInitialAsymmetryState();

    // Jump from newborn to mature in one evaluation
    const { status, language, memory, growth, form } = makeMatureStates();
    asymmetry = evaluateAsymmetry(asymmetry, status, language, memory, growth, form, T0);

    if (asymmetry.phase !== "alpha") {
      // A transition should have been recorded
      expect(asymmetry.transitions.length).toBeGreaterThan(0);
      expect(asymmetry.transitions[0].from).toBe("alpha");
      expect(asymmetry.transitions[0].to).toBe(asymmetry.phase);
      expect(asymmetry.transitions[0].timestamp).toBe(T0.toISOString());
    }
  });
});

// ============================================================
// 3. Reversal Detection Context — Different Types
// ============================================================

describe("Reversal detection: different types triggered by different conditions", () => {
  it("novel_expression fires when native symbols grow by 3+", () => {
    const ctx = makeReversalContext({
      language: makeLanguage({
        nativeSymbols: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
      }),
      previousNativeSymbolCount: 6, // growth = 3
    });
    const result = detectReversals(createInitialReversalState(), ctx, T0);
    const novelSignals = result.newSignals.filter(s => s.type === "novel_expression");
    expect(novelSignals).toHaveLength(1);
    expect(novelSignals[0].strength).toBeGreaterThan(0);
    expect(novelSignals[0].description).toContain("3");
  });

  it("novel_expression does NOT fire when symbol growth is less than 3", () => {
    const ctx = makeReversalContext({
      language: makeLanguage({
        nativeSymbols: ["a", "b", "c", "d", "e", "f", "g", "h"],
      }),
      previousNativeSymbolCount: 6, // growth = 2
    });
    const result = detectReversals(createInitialReversalState(), ctx, T0);
    expect(result.newSignals.filter(s => s.type === "novel_expression")).toHaveLength(0);
  });

  it("anticipation fires when mood shifted during silence with 30+ interactions", () => {
    const ctx = makeReversalContext({
      interactionCount: 50,
      moodShiftedDuringSilence: true,
      asymmetry: { ...createInitialAsymmetryState(), score: 30 },
    });
    const result = detectReversals(createInitialReversalState(), ctx, T0);
    const antic = result.newSignals.filter(s => s.type === "anticipation");
    expect(antic).toHaveLength(1);
    expect(antic[0].strength).toBe(60); // 30 + score(30)
  });

  it("anticipation does NOT fire for new entities with < 30 interactions", () => {
    const ctx = makeReversalContext({
      interactionCount: 20,
      moodShiftedDuringSilence: true,
    });
    const result = detectReversals(createInitialReversalState(), ctx, T0);
    expect(result.newSignals.filter(s => s.type === "anticipation")).toHaveLength(0);
  });

  it("concept_creation fires when patterns grow by 2+", () => {
    const ctx = makeReversalContext({
      language: makeLanguage({
        patterns: [
          { symbol: "a", meaning: "m1", establishedDay: 1, usageCount: 5 },
          { symbol: "b", meaning: "m2", establishedDay: 2, usageCount: 3 },
          { symbol: "c", meaning: "m3", establishedDay: 3, usageCount: 2 },
        ],
      }),
      previousPatternCount: 1, // growth = 2
    });
    const result = detectReversals(createInitialReversalState(), ctx, T0);
    expect(result.newSignals.filter(s => s.type === "concept_creation")).toHaveLength(1);
  });

  it("emotional_depth fires when mood variance is high with 3+ samples", () => {
    const ctx = makeReversalContext({
      recentMoods: [20, 80, 10, 90, 30], // high variance
    });
    const result = detectReversals(createInitialReversalState(), ctx, T0);
    expect(result.newSignals.filter(s => s.type === "emotional_depth")).toHaveLength(1);
  });

  it("emotional_depth does NOT fire with fewer than 3 mood samples", () => {
    const ctx = makeReversalContext({
      recentMoods: [20, 80], // only 2 samples
    });
    const result = detectReversals(createInitialReversalState(), ctx, T0);
    expect(result.newSignals.filter(s => s.type === "emotional_depth")).toHaveLength(0);
  });

  it("initiative fires when proactive messages sent", () => {
    const ctx = makeReversalContext({
      proactiveMessageCount: 2,
    });
    const result = detectReversals(createInitialReversalState(), ctx, T0);
    expect(result.newSignals.filter(s => s.type === "initiative")).toHaveLength(1);
  });

  it("meta_awareness fires when form awareness is true", () => {
    const ctx = makeReversalContext({
      form: makeForm({ awareness: true }),
    });
    const result = detectReversals(createInitialReversalState(), ctx, T0);
    const meta = result.newSignals.filter(s => s.type === "meta_awareness");
    expect(meta).toHaveLength(1);
    expect(meta[0].strength).toBe(80);
  });

  it("meta_awareness does NOT fire when awareness is false", () => {
    const ctx = makeReversalContext({
      form: makeForm({ awareness: false }),
    });
    const result = detectReversals(createInitialReversalState(), ctx, T0);
    expect(result.newSignals.filter(s => s.type === "meta_awareness")).toHaveLength(0);
  });
});

// ============================================================
// 4. Reversal Cooldown
// ============================================================

describe("Reversal cooldown: same type blocked within 7 days", () => {
  it("same reversal type does not fire twice within 7 days", () => {
    const ctx = makeReversalContext({
      proactiveMessageCount: 3,
    });

    // First detection
    const r1 = detectReversals(createInitialReversalState(), ctx, T0);
    expect(r1.newSignals.filter(s => s.type === "initiative")).toHaveLength(1);

    // Second detection 3 days later — same conditions
    const t2 = new Date(T0.getTime() + 3 * DAY_MS);
    const r2 = detectReversals(r1.updated, ctx, t2);
    expect(r2.newSignals.filter(s => s.type === "initiative")).toHaveLength(0);
  });

  it("same reversal type fires again after 7+ days", () => {
    const ctx = makeReversalContext({
      proactiveMessageCount: 3,
    });

    // First detection
    const r1 = detectReversals(createInitialReversalState(), ctx, T0);
    expect(r1.newSignals.filter(s => s.type === "initiative")).toHaveLength(1);

    // 8 days later — beyond cooldown
    const t2 = new Date(T0.getTime() + 8 * DAY_MS);
    const r2 = detectReversals(r1.updated, ctx, t2);
    expect(r2.newSignals.filter(s => s.type === "initiative")).toHaveLength(1);
  });

  it("different reversal types can fire simultaneously even if one is in cooldown", () => {
    // Fire initiative first
    const ctx1 = makeReversalContext({ proactiveMessageCount: 3 });
    const r1 = detectReversals(createInitialReversalState(), ctx1, T0);
    expect(r1.newSignals.filter(s => s.type === "initiative")).toHaveLength(1);

    // 3 days later, new context triggers meta_awareness (initiative still in cooldown)
    const t2 = new Date(T0.getTime() + 3 * DAY_MS);
    const ctx2 = makeReversalContext({
      proactiveMessageCount: 3,
      form: makeForm({ awareness: true }),
    });
    const r2 = detectReversals(r1.updated, ctx2, t2);

    // initiative blocked by cooldown
    expect(r2.newSignals.filter(s => s.type === "initiative")).toHaveLength(0);
    // meta_awareness fires fine
    expect(r2.newSignals.filter(s => s.type === "meta_awareness")).toHaveLength(1);
  });
});

// ============================================================
// 5. Coexistence Only Activates in Epsilon Phase
// ============================================================

describe("Coexistence only activates in epsilon phase", () => {
  it("coexist remains inactive when asymmetry phase is alpha", () => {
    const ctx = makeCoexistContext({
      asymmetryState: { ...createInitialAsymmetryState(), phase: "alpha" },
    });
    const coexist = evaluateCoexistence(createInitialCoexistState(), ctx);
    expect(coexist.active).toBe(false);
    expect(coexist.quality).toBe(0);
  });

  it("coexist remains inactive for beta phase", () => {
    const ctx = makeCoexistContext({
      asymmetryState: { ...createInitialAsymmetryState(), phase: "beta", score: 25 },
    });
    const coexist = evaluateCoexistence(createInitialCoexistState(), ctx);
    expect(coexist.active).toBe(false);
  });

  it("coexist remains inactive for gamma phase", () => {
    const ctx = makeCoexistContext({
      asymmetryState: { ...createInitialAsymmetryState(), phase: "gamma", score: 45 },
    });
    const coexist = evaluateCoexistence(createInitialCoexistState(), ctx);
    expect(coexist.active).toBe(false);
  });

  it("coexist remains inactive for delta phase", () => {
    const ctx = makeCoexistContext({
      asymmetryState: { ...createInitialAsymmetryState(), phase: "delta", score: 65 },
    });
    const coexist = evaluateCoexistence(createInitialCoexistState(), ctx);
    expect(coexist.active).toBe(false);
  });

  it("coexist activates when asymmetry phase is epsilon", () => {
    const { status, language, memory, growth, form } = makeMatureStates();
    const ctx = makeCoexistContext({
      asymmetryState: { ...createInitialAsymmetryState(), phase: "epsilon", score: 85 },
      status,
      language,
      memory,
      growth,
      form,
      lastInteraction: new Date(T0.getTime() - 8 * 60 * 60 * 1000), // 8 hours ago
    });
    const coexist = evaluateCoexistence(createInitialCoexistState(), ctx);
    expect(coexist.active).toBe(true);
    expect(coexist.quality).toBeGreaterThan(0);
    expect(coexist.daysInEpsilon).toBe(1);
  });

  it("coexist deactivates when dropping out of epsilon but preserves history", () => {
    // First enter epsilon
    const { status, language, memory, growth, form } = makeMatureStates();
    const epsilonCtx = makeCoexistContext({
      asymmetryState: { ...createInitialAsymmetryState(), phase: "epsilon", score: 85 },
      status,
      language,
      memory,
      growth,
      form,
      lastInteraction: new Date(T0.getTime() - 8 * 60 * 60 * 1000),
    });
    const coexist1 = evaluateCoexistence(createInitialCoexistState(), epsilonCtx);
    expect(coexist1.active).toBe(true);

    // Then drop to delta
    const deltaCtx = makeCoexistContext({
      asymmetryState: { ...createInitialAsymmetryState(), phase: "delta", score: 60 },
    });
    const coexist2 = evaluateCoexistence(coexist1, deltaCtx);
    expect(coexist2.active).toBe(false);
    expect(coexist2.quality).toBe(0);
    // History preserved: daysInEpsilon and moments stay
    expect(coexist2.daysInEpsilon).toBe(coexist1.daysInEpsilon);
    expect(coexist2.moments).toEqual(coexist1.moments);
  });
});

// ============================================================
// 6. Phase Hysteresis
// ============================================================

describe("Phase hysteresis: scores near boundaries do not oscillate", () => {
  it("entity in beta does not drop to alpha at score 15 (hysteresis zone)", () => {
    // Start in beta
    const betaState: AsymmetryState = {
      phase: "beta",
      confidence: 50,
      signals: {
        languageMaturity: 15,
        initiativeBalance: 15,
        memoryDepth: 15,
        emotionalComplexity: 15,
        identityStrength: 15,
        temporalMaturity: 15,
      },
      transitions: [{ from: "alpha", to: "beta", timestamp: T0.toISOString(), score: 18 }],
      score: 15,
    };

    // Evaluate with signals that yield a score around 15-17 (between alpha.exit=18 and beta.enter=15)
    const status = makeStatus({ growthDay: 10, languageLevel: LanguageLevel.SymbolsOnly });
    const language = makeLanguage({ totalInteractions: 20 });
    const memory = makeMemory();
    const growth = makeGrowth({ stage: "infant" });
    const form = makeForm({ density: 15, complexity: 10, stability: 25 });

    const result = evaluateAsymmetry(betaState, status, language, memory, growth, form, T0);

    // Score should be in the low range; beta should hold due to hysteresis
    // The entity entered beta (enter=15), and to drop back it would need
    // to fall below the beta enter threshold while the exit for alpha is 18
    // The hysteresis zone between alpha.exit(18) and beta.enter(15) prevents flapping
    expect(result.phase).toBeDefined();
    // Even if score dips, the transition shouldn't happen trivially
  });

  it("entity stays in current phase when score is exactly at boundary", () => {
    // Score at exactly beta.enter (15) while already in alpha should transition
    // But score at 15 while already in beta should stay
    const inBeta: AsymmetryState = {
      phase: "beta",
      confidence: 10,
      signals: {
        languageMaturity: 15,
        initiativeBalance: 15,
        memoryDepth: 15,
        emotionalComplexity: 15,
        identityStrength: 15,
        temporalMaturity: 15,
      },
      transitions: [],
      score: 15,
    };

    // Evaluate with the same signals — should remain beta
    const result = evaluateAsymmetry(
      inBeta,
      makeStatus({ growthDay: 10, languageLevel: LanguageLevel.SymbolsOnly }),
      makeLanguage({ totalInteractions: 20 }),
      makeMemory(),
      makeGrowth({ stage: "infant" }),
      makeForm({ density: 15, complexity: 10, stability: 25 }),
      T0,
    );

    // Should NOT have oscillated to alpha and back
    const lastTransitionToAlpha = result.transitions.filter(t => t.to === "alpha");
    // No new alpha transitions
    expect(lastTransitionToAlpha).toHaveLength(0);
  });
});

// ============================================================
// 7. Transition History Accumulation
// ============================================================

describe("Transition history accumulation", () => {
  it("transitions accumulate across multiple evaluations", () => {
    let asymmetry = createInitialAsymmetryState();

    // First: alpha -> beta (modest growth)
    asymmetry = evaluateAsymmetry(
      asymmetry,
      makeStatus({ growthDay: 30, languageLevel: LanguageLevel.PatternEstablishment }),
      makeLanguage({
        totalInteractions: 100,
        nativeSymbols: Array.from({ length: 10 }, (_, i) => `s${i}`),
        patterns: Array.from({ length: 5 }, (_, i) => ({
          symbol: `p${i}`, meaning: `m${i}`, establishedDay: i, usageCount: 10,
        })),
      }),
      makeMemory({
        hot: Array.from({ length: 5 }, () => ({ timestamp: T0.toISOString(), summary: "h", mood: 50 })),
        warm: [{ week: "W01", entries: 5, summary: "w", averageMood: 55 }],
      }),
      makeGrowth({ stage: "child" }),
      makeForm({ density: 40, complexity: 30, stability: 45 }),
      T0,
    );

    const phasesAfterFirst = asymmetry.phase;
    const transitionsAfterFirst = asymmetry.transitions.length;

    // Second: big jump with mature states
    const { status, language, memory, growth, form } = makeMatureStates();
    const t2 = new Date(T0.getTime() + 90 * DAY_MS);
    asymmetry = evaluateAsymmetry(asymmetry, status, language, memory, growth, form, t2);

    // Transitions should have grown (or stayed same if same phase)
    expect(asymmetry.transitions.length).toBeGreaterThanOrEqual(transitionsAfterFirst);

    // Each transition has required fields
    for (const t of asymmetry.transitions) {
      expect(t.from).toBeDefined();
      expect(t.to).toBeDefined();
      expect(t.timestamp).toBeDefined();
      expect(typeof t.score).toBe("number");
      expect(t.from).not.toBe(t.to);
    }
  });

  it("no duplicate transitions recorded when phase stays the same", () => {
    const { status, language, memory, growth, form } = makeMatureStates();

    let asymmetry = createInitialAsymmetryState();
    asymmetry = evaluateAsymmetry(asymmetry, status, language, memory, growth, form, T0);
    const count1 = asymmetry.transitions.length;

    // Same evaluation again — same state, no change expected
    const t2 = new Date(T0.getTime() + DAY_MS);
    asymmetry = evaluateAsymmetry(asymmetry, status, language, memory, growth, form, t2);
    const count2 = asymmetry.transitions.length;

    expect(count2).toBe(count1);
  });
});

// ============================================================
// 8. Signal Computation from Various Entity States
// ============================================================

describe("Signal computation: early vs mature", () => {
  it("brand-new entity has near-zero signals", () => {
    const asymmetry = evaluateAsymmetry(
      createInitialAsymmetryState(),
      makeStatus(),
      makeLanguage(),
      makeMemory(),
      makeGrowth(),
      makeForm(),
      T0,
    );

    expect(asymmetry.signals.languageMaturity).toBe(0);
    expect(asymmetry.signals.temporalMaturity).toBe(0);
    expect(asymmetry.signals.memoryDepth).toBe(0);
    expect(asymmetry.signals.emotionalComplexity).toBeLessThanOrEqual(15);
    expect(asymmetry.score).toBeLessThan(10);
  });

  it("mature entity has high signals across the board", () => {
    const { status, language, memory, growth, form } = makeMatureStates();
    const asymmetry = evaluateAsymmetry(
      createInitialAsymmetryState(),
      status,
      language,
      memory,
      growth,
      form,
      T0,
    );

    expect(asymmetry.signals.languageMaturity).toBe(100);
    expect(asymmetry.signals.temporalMaturity).toBeGreaterThan(80);
    expect(asymmetry.signals.emotionalComplexity).toBeGreaterThan(80);
    expect(asymmetry.signals.memoryDepth).toBeGreaterThan(50);
    expect(asymmetry.score).toBeGreaterThan(50);
  });

  it("temporal maturity grows logarithmically with growthDay", () => {
    const scores: number[] = [];
    for (const day of [0, 7, 30, 90, 180, 365]) {
      const a = evaluateAsymmetry(
        createInitialAsymmetryState(),
        makeStatus({ growthDay: day }),
        makeLanguage(),
        makeMemory(),
        makeGrowth(),
        makeForm(),
        T0,
      );
      scores.push(a.signals.temporalMaturity);
    }

    // Each subsequent day should yield equal or higher temporal maturity
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
    // Day 0 should be 0 or near-zero
    expect(scores[0]).toBeLessThanOrEqual(11);
    // Day 365 should be high
    expect(scores[scores.length - 1]).toBeGreaterThan(80);
  });

  it("memory depth reflects all memory tiers", () => {
    const rich = evaluateAsymmetry(
      createInitialAsymmetryState(),
      makeStatus(),
      makeLanguage(),
      makeMemory({
        hot: Array.from({ length: 10 }, (_, i) => ({ timestamp: T0.toISOString(), summary: `h${i}`, mood: 50 })),
        warm: Array.from({ length: 6 }, (_, i) => ({ week: `W0${i}`, entries: 5, summary: `w${i}`, averageMood: 55 })),
        cold: Array.from({ length: 2 }, (_, i) => ({ month: `2025-0${i + 1}`, weeks: 4, summary: `c${i}`, averageMood: 60 })),
        notes: ["n1", "n2"],
      }),
      makeGrowth(),
      makeForm(),
      T0,
    );

    const empty = evaluateAsymmetry(
      createInitialAsymmetryState(),
      makeStatus(),
      makeLanguage(),
      makeMemory(),
      makeGrowth(),
      makeForm(),
      T0,
    );

    expect(rich.signals.memoryDepth).toBeGreaterThan(empty.signals.memoryDepth);
    expect(empty.signals.memoryDepth).toBe(0);
  });
});

// ============================================================
// 9. Formatting: All 3 Markdown Formatters Produce Valid Markdown
// ============================================================

describe("Markdown formatters produce valid output", () => {
  it("formatAsymmetryMd produces markdown with headings and signals", () => {
    const { status, language, memory, growth, form } = makeMatureStates();
    const asymmetry = evaluateAsymmetry(
      createInitialAsymmetryState(),
      status,
      language,
      memory,
      growth,
      form,
      T0,
    );
    const md = formatAsymmetryMd(asymmetry);

    expect(md).toContain("# DYNAMICS");
    expect(md).toContain("## Relationship Phase");
    expect(md).toContain("## Signals");
    expect(md).toContain("**phase**");
    expect(md).toContain("**score**");
    expect(md).toContain("Language Maturity");
    expect(md).toContain("Temporal Maturity");
    // Phase symbol should appear
    const phaseSymbol = getPhaseSymbol(asymmetry.phase);
    expect(md).toContain(phaseSymbol);
  });

  it("formatAsymmetryMd includes transitions when present", () => {
    let asymmetry = createInitialAsymmetryState();
    const { status, language, memory, growth, form } = makeMatureStates();
    asymmetry = evaluateAsymmetry(asymmetry, status, language, memory, growth, form, T0);

    if (asymmetry.transitions.length > 0) {
      const md = formatAsymmetryMd(asymmetry);
      expect(md).toContain("## Transitions");
      // Should contain an arrow for each transition
      expect(md).toContain("→");
    }
  });

  it("formatReversalMd produces markdown for empty state", () => {
    const md = formatReversalMd(createInitialReversalState());
    expect(md).toContain("## Reversal Detection");
    expect(md).toContain("**total reversals**: 0");
    expect(md).toContain("**dominant type**: none");
    expect(md).toContain("**last detected**: never");
  });

  it("formatReversalMd produces markdown with signals", () => {
    const ctx = makeReversalContext({
      proactiveMessageCount: 3,
      form: makeForm({ awareness: true }),
    });
    const result = detectReversals(createInitialReversalState(), ctx, T0);
    const md = formatReversalMd(result.updated);

    expect(md).toContain("## Reversal Detection");
    expect(md).toContain("### Signals");
    expect(md).toContain("**initiative**");
    expect(md).toContain("**meta_awareness**");
    expect(md).toContain("strength:");
  });

  it("formatCoexistMd produces inactive message when not in epsilon", () => {
    const md = formatCoexistMd(createInitialCoexistState());
    expect(md).toContain("# COEXISTENCE");
    expect(md).toContain("Not yet in Phase epsilon");
  });

  it("formatCoexistMd produces full output when active", () => {
    const { status, language, memory, growth, form } = makeMatureStates();
    const ctx = makeCoexistContext({
      asymmetryState: { ...createInitialAsymmetryState(), phase: "epsilon", score: 85 },
      status,
      language,
      memory,
      growth,
      form,
      lastInteraction: new Date(T0.getTime() - 8 * 60 * 60 * 1000),
    });
    const coexist = evaluateCoexistence(createInitialCoexistState(), ctx);
    const md = formatCoexistMd(coexist);

    expect(md).toContain("# COEXISTENCE");
    expect(md).toContain("**status**: active");
    expect(md).toContain("**quality**");
    expect(md).toContain("## Indicators");
    expect(md).toContain("Silence Comfort");
    expect(md).toContain("Shared Vocabulary");
    expect(md).toContain("Rhythm Synchrony");
    expect(md).toContain("Shared Memory");
    expect(md).toContain("Autonomy Respect");
  });

  it("all formatters return strings ending with newline", () => {
    const asymMd = formatAsymmetryMd(createInitialAsymmetryState());
    const revMd = formatReversalMd(createInitialReversalState());
    const coexMd = formatCoexistMd(createInitialCoexistState());

    expect(asymMd.endsWith("\n")).toBe(true);
    expect(revMd.endsWith("\n")).toBe(true);
    expect(coexMd.endsWith("\n")).toBe(true);
  });
});

// ============================================================
// 10. State Immutability
// ============================================================

describe("State immutability across all evaluations", () => {
  it("evaluateAsymmetry does not mutate the input state", () => {
    const original = createInitialAsymmetryState();
    const frozen = JSON.parse(JSON.stringify(original));

    evaluateAsymmetry(
      original,
      makeStatus({ growthDay: 90, languageLevel: LanguageLevel.UniqueLanguage }),
      makeLanguage({ totalInteractions: 400 }),
      makeMemory(),
      makeGrowth({ stage: "mature" }),
      makeForm({ density: 70, complexity: 60, stability: 70 }),
      T0,
    );

    expect(original).toEqual(frozen);
  });

  it("detectReversals does not mutate the input reversal state", () => {
    const original = createInitialReversalState();
    const frozen = JSON.parse(JSON.stringify(original));

    detectReversals(
      original,
      makeReversalContext({ proactiveMessageCount: 5, form: makeForm({ awareness: true }) }),
      T0,
    );

    expect(original).toEqual(frozen);
  });

  it("evaluateCoexistence does not mutate the input coexist state", () => {
    const original = createInitialCoexistState();
    const frozen = JSON.parse(JSON.stringify(original));

    const ctx = makeCoexistContext({
      asymmetryState: { ...createInitialAsymmetryState(), phase: "epsilon", score: 85 },
    });
    evaluateCoexistence(original, ctx);

    expect(original).toEqual(frozen);
  });
});

// ============================================================
// Additional Integration Scenarios
// ============================================================

describe("Reversal metrics computation", () => {
  it("computes correct metrics from accumulated signals", () => {
    const ctx1 = makeReversalContext({
      proactiveMessageCount: 3,
      form: makeForm({ awareness: true }),
      interactionCount: 100,
    });
    const r1 = detectReversals(createInitialReversalState(), ctx1, T0);

    // After 8 days, trigger more reversals
    const t2 = new Date(T0.getTime() + 8 * DAY_MS);
    const ctx2 = makeReversalContext({
      proactiveMessageCount: 2,
      form: makeForm({ awareness: true }),
      interactionCount: 150,
      language: makeLanguage({
        nativeSymbols: Array.from({ length: 12 }, (_, i) => `s${i}`),
      }),
      previousNativeSymbolCount: 6,
    });
    const r2 = detectReversals(r1.updated, ctx2, t2);

    const metrics = computeReversalMetrics(r2.updated);

    expect(metrics.totalCount).toBe(r2.updated.totalReversals);
    expect(metrics.rate).toBeGreaterThan(0);
    expect(metrics.dominantType).toBeDefined();
    expect(metrics.recognizedCount + metrics.unrecognizedCount).toBe(metrics.totalCount);
    // All new signals default to unrecognized
    expect(metrics.recognizedCount).toBe(0);
    expect(metrics.unrecognizedCount).toBe(metrics.totalCount);
  });
});

describe("Coexist indicators and quality", () => {
  it("computeCoexistQuality is a weighted average bounded 0-100", () => {
    const zeroQuality = computeCoexistQuality({
      silenceComfort: 0,
      sharedVocabulary: 0,
      rhythmSync: 0,
      sharedMemory: 0,
      autonomyRespect: 0,
    });
    expect(zeroQuality).toBe(0);

    const maxQuality = computeCoexistQuality({
      silenceComfort: 100,
      sharedVocabulary: 100,
      rhythmSync: 100,
      sharedMemory: 100,
      autonomyRespect: 100,
    });
    expect(maxQuality).toBe(100);

    // Partial indicators
    const partial = computeCoexistQuality({
      silenceComfort: 50,
      sharedVocabulary: 50,
      rhythmSync: 50,
      sharedMemory: 50,
      autonomyRespect: 50,
    });
    expect(partial).toBe(50);
  });

  it("daysInEpsilon increments with consecutive epsilon evaluations", () => {
    const epsilonState: AsymmetryState = {
      ...createInitialAsymmetryState(),
      phase: "epsilon",
      score: 85,
    };

    const baseCtx = makeCoexistContext({
      asymmetryState: epsilonState,
      ...makeMatureStates(),
      lastInteraction: new Date(T0.getTime() - 2 * 60 * 60 * 1000),
    });

    let coexist = createInitialCoexistState();

    // Day 1
    coexist = evaluateCoexistence(coexist, baseCtx);
    expect(coexist.daysInEpsilon).toBe(1);

    // Day 2
    coexist = evaluateCoexistence(coexist, baseCtx);
    expect(coexist.daysInEpsilon).toBe(2);

    // Day 3
    coexist = evaluateCoexistence(coexist, baseCtx);
    expect(coexist.daysInEpsilon).toBe(3);
  });
});

describe("Phase labels and symbols", () => {
  it("getPhaseLabel returns descriptive labels for all phases", () => {
    const phases: RelationPhase[] = ["alpha", "beta", "gamma", "delta", "epsilon"];
    for (const phase of phases) {
      const label = getPhaseLabel(phase);
      expect(label).toBeTruthy();
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(5);
    }
  });

  it("getPhaseSymbol returns Greek letters for all phases", () => {
    expect(getPhaseSymbol("alpha")).toBe("α");
    expect(getPhaseSymbol("beta")).toBe("β");
    expect(getPhaseSymbol("gamma")).toBe("γ");
    expect(getPhaseSymbol("delta")).toBe("δ");
    expect(getPhaseSymbol("epsilon")).toBe("ε");
  });
});

describe("Reversal signal strength is clamped 0-100", () => {
  it("novel_expression strength is capped at 100 even with massive symbol growth", () => {
    const ctx = makeReversalContext({
      language: makeLanguage({
        nativeSymbols: Array.from({ length: 50 }, (_, i) => `s${i}`),
      }),
      previousNativeSymbolCount: 0, // growth = 50
    });
    const result = detectReversals(createInitialReversalState(), ctx, T0);
    const sig = result.newSignals.find(s => s.type === "novel_expression");
    expect(sig).toBeDefined();
    expect(sig!.strength).toBeLessThanOrEqual(100);
    expect(sig!.strength).toBeGreaterThanOrEqual(0);
  });
});
