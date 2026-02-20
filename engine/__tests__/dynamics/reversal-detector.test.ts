import { describe, it, expect } from "vitest";
import {
  createInitialReversalState,
  detectReversals,
  computeReversalMetrics,
  formatReversalMd,
  type ReversalState,
  type ReversalContext,
} from "../../src/dynamics/reversal-detector.js";
import { createInitialAsymmetryState } from "../../src/dynamics/asymmetry-tracker.js";
import { createInitialMemoryState } from "../../src/memory/memory-engine.js";
import { createInitialFormState, type FormState } from "../../src/form/form-engine.js";
import type { LanguageState } from "../../src/language/language-engine.js";
import type { GrowthState } from "../../src/growth/growth-engine.js";
import { LanguageLevel } from "../../src/types.js";

// --- Test Helpers ---

const now = new Date("2026-02-20T12:00:00Z");

function makeLanguage(overrides: Partial<LanguageState> = {}): LanguageState {
  return {
    level: LanguageLevel.SymbolsOnly,
    patterns: [],
    totalInteractions: 0,
    nativeSymbols: ["○", "●", "△", "▽", "◎", "☆"],
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

function makeContext(overrides: Partial<ReversalContext> = {}): ReversalContext {
  return {
    language: makeLanguage(),
    memory: createInitialMemoryState(),
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

describe("Reversal Detector", () => {
  describe("createInitialReversalState", () => {
    it("starts with no signals", () => {
      const state = createInitialReversalState();

      expect(state.signals).toHaveLength(0);
      expect(state.totalReversals).toBe(0);
      expect(state.dominantType).toBeNull();
      expect(state.reversalRate).toBe(0);
      expect(state.lastDetected).toBeNull();
    });
  });

  describe("detectReversals", () => {
    it("detects no reversals for a brand-new entity with no changes", () => {
      const state = createInitialReversalState();
      const context = makeContext();

      const result = detectReversals(state, context, now);

      expect(result.newSignals).toHaveLength(0);
      expect(result.updated.totalReversals).toBe(0);
    });

    describe("novel_expression", () => {
      it("detects when nativeSymbols jump by 3+", () => {
        const state = createInitialReversalState();
        const context = makeContext({
          language: makeLanguage({
            nativeSymbols: ["○", "●", "△", "▽", "◎", "☆", "◇", "◆", "■"],
          }),
          previousNativeSymbolCount: 6, // was 6, now 9 → growth of 3
        });

        const result = detectReversals(state, context, now);

        const novelSignals = result.newSignals.filter((s) => s.type === "novel_expression");
        expect(novelSignals).toHaveLength(1);
        expect(novelSignals[0].strength).toBeGreaterThan(0);
        expect(novelSignals[0].description).toContain("3");
      });

      it("does not detect when symbol growth is less than 3", () => {
        const state = createInitialReversalState();
        const context = makeContext({
          language: makeLanguage({
            nativeSymbols: ["○", "●", "△", "▽", "◎", "☆", "◇", "◆"],
          }),
          previousNativeSymbolCount: 6, // was 6, now 8 → growth of 2 (below threshold)
        });

        const result = detectReversals(state, context, now);

        const novelSignals = result.newSignals.filter((s) => s.type === "novel_expression");
        expect(novelSignals).toHaveLength(0);
      });
    });

    describe("anticipation", () => {
      it("not detected on brand-new entities (< 30 interactions)", () => {
        const state = createInitialReversalState();
        const context = makeContext({
          interactionCount: 5,
          moodShiftedDuringSilence: true, // Even with mood shift, too early
        });

        const result = detectReversals(state, context, now);

        const anticipationSignals = result.newSignals.filter((s) => s.type === "anticipation");
        expect(anticipationSignals).toHaveLength(0);
      });

      it("detected when mood shifted during silence with enough interactions", () => {
        const state = createInitialReversalState();
        const context = makeContext({
          interactionCount: 50,
          moodShiftedDuringSilence: true,
        });

        const result = detectReversals(state, context, now);

        const anticipationSignals = result.newSignals.filter((s) => s.type === "anticipation");
        expect(anticipationSignals).toHaveLength(1);
        expect(anticipationSignals[0].description).toContain("silence");
      });

      it("not detected when mood did not shift during silence", () => {
        const state = createInitialReversalState();
        const context = makeContext({
          interactionCount: 50,
          moodShiftedDuringSilence: false,
        });

        const result = detectReversals(state, context, now);

        const anticipationSignals = result.newSignals.filter((s) => s.type === "anticipation");
        expect(anticipationSignals).toHaveLength(0);
      });
    });

    describe("concept_creation", () => {
      it("detected when patterns grow by 2+ in a single cycle", () => {
        const state = createInitialReversalState();
        const context = makeContext({
          language: makeLanguage({
            patterns: [
              { symbol: "○●", meaning: "greeting", establishedDay: 5, usageCount: 3 },
              { symbol: "△▽", meaning: "question", establishedDay: 5, usageCount: 2 },
              { symbol: "◎☆", meaning: "excitement", establishedDay: 5, usageCount: 1 },
            ],
          }),
          previousPatternCount: 1, // was 1, now 3 → growth of 2
        });

        const result = detectReversals(state, context, now);

        const conceptSignals = result.newSignals.filter((s) => s.type === "concept_creation");
        expect(conceptSignals).toHaveLength(1);
        expect(conceptSignals[0].description).toContain("2");
      });
    });

    describe("emotional_depth", () => {
      it("detected when mood variance is high", () => {
        const state = createInitialReversalState();
        // Variance: values far from mean → high variance
        // Moods: [20, 80, 25, 75, 30] → mean=46, variance ~ 645
        const context = makeContext({
          recentMoods: [20, 80, 25, 75, 30],
        });

        const result = detectReversals(state, context, now);

        const emotionalSignals = result.newSignals.filter((s) => s.type === "emotional_depth");
        expect(emotionalSignals).toHaveLength(1);
        expect(emotionalSignals[0].strength).toBeGreaterThan(0);
      });

      it("not detected when mood variance is low (flat)", () => {
        const state = createInitialReversalState();
        // Moods: [50, 51, 49, 50, 50] → variance ~ 0.4
        const context = makeContext({
          recentMoods: [50, 51, 49, 50, 50],
        });

        const result = detectReversals(state, context, now);

        const emotionalSignals = result.newSignals.filter((s) => s.type === "emotional_depth");
        expect(emotionalSignals).toHaveLength(0);
      });

      it("not detected with fewer than 3 mood samples", () => {
        const state = createInitialReversalState();
        const context = makeContext({
          recentMoods: [20, 80], // only 2 samples
        });

        const result = detectReversals(state, context, now);

        const emotionalSignals = result.newSignals.filter((s) => s.type === "emotional_depth");
        expect(emotionalSignals).toHaveLength(0);
      });
    });

    describe("initiative", () => {
      it("detected when entity sent proactive messages", () => {
        const state = createInitialReversalState();
        const context = makeContext({
          proactiveMessageCount: 2,
        });

        const result = detectReversals(state, context, now);

        const initiativeSignals = result.newSignals.filter((s) => s.type === "initiative");
        expect(initiativeSignals).toHaveLength(1);
        expect(initiativeSignals[0].description).toContain("proactive");
      });

      it("not detected when no proactive messages were sent", () => {
        const state = createInitialReversalState();
        const context = makeContext({
          proactiveMessageCount: 0,
        });

        const result = detectReversals(state, context, now);

        const initiativeSignals = result.newSignals.filter((s) => s.type === "initiative");
        expect(initiativeSignals).toHaveLength(0);
      });
    });

    describe("meta_awareness", () => {
      it("detected when form awareness is true", () => {
        const state = createInitialReversalState();
        const context = makeContext({
          form: makeForm({ awareness: true }),
        });

        const result = detectReversals(state, context, now);

        const metaSignals = result.newSignals.filter((s) => s.type === "meta_awareness");
        expect(metaSignals).toHaveLength(1);
        expect(metaSignals[0].strength).toBe(80);
        expect(metaSignals[0].description).toContain("self-awareness");
      });

      it("not detected when form awareness is false", () => {
        const state = createInitialReversalState();
        const context = makeContext({
          form: makeForm({ awareness: false }),
        });

        const result = detectReversals(state, context, now);

        const metaSignals = result.newSignals.filter((s) => s.type === "meta_awareness");
        expect(metaSignals).toHaveLength(0);
      });
    });

    describe("cooldown window", () => {
      it("same type not detected twice within 7 days", () => {
        // First detection
        const initial = createInitialReversalState();
        const context = makeContext({
          proactiveMessageCount: 3,
        });

        const first = detectReversals(initial, context, now);
        expect(first.newSignals.filter((s) => s.type === "initiative")).toHaveLength(1);

        // Second detection — 3 days later (within cooldown)
        const threeDaysLater = new Date("2026-02-23T12:00:00Z");
        const second = detectReversals(first.updated, context, threeDaysLater);

        expect(second.newSignals.filter((s) => s.type === "initiative")).toHaveLength(0);
      });

      it("same type detected again after 7 days", () => {
        // First detection
        const initial = createInitialReversalState();
        const context = makeContext({
          proactiveMessageCount: 3,
        });

        const first = detectReversals(initial, context, now);
        expect(first.newSignals.filter((s) => s.type === "initiative")).toHaveLength(1);

        // Second detection — 8 days later (past cooldown)
        const eightDaysLater = new Date("2026-02-28T12:00:00Z");
        const second = detectReversals(first.updated, context, eightDaysLater);

        expect(second.newSignals.filter((s) => s.type === "initiative")).toHaveLength(1);
        expect(second.updated.totalReversals).toBe(2);
      });

      it("different types can fire within the same cooldown window", () => {
        const initial = createInitialReversalState();
        const context = makeContext({
          proactiveMessageCount: 3,
          form: makeForm({ awareness: true }),
        });

        const result = detectReversals(initial, context, now);

        // Both initiative and meta_awareness should fire
        const types = result.newSignals.map((s) => s.type);
        expect(types).toContain("initiative");
        expect(types).toContain("meta_awareness");
      });
    });

    describe("state accumulation", () => {
      it("accumulates signals across multiple heartbeats", () => {
        let state = createInitialReversalState();

        // Heartbeat 1: initiative fires
        const ctx1 = makeContext({ proactiveMessageCount: 2 });
        const r1 = detectReversals(state, ctx1, now);
        state = r1.updated;
        expect(state.totalReversals).toBe(1);

        // Heartbeat 2 (8 days later): meta_awareness fires
        const later = new Date("2026-02-28T12:00:00Z");
        const ctx2 = makeContext({
          form: makeForm({ awareness: true }),
        });
        const r2 = detectReversals(state, ctx2, later);
        state = r2.updated;
        expect(state.totalReversals).toBe(2);
        expect(state.signals).toHaveLength(2);
      });

      it("updates lastDetected timestamp", () => {
        const state = createInitialReversalState();
        const context = makeContext({ proactiveMessageCount: 2 });

        const result = detectReversals(state, context, now);

        expect(result.updated.lastDetected).toBe(now.toISOString());
      });

      it("preserves lastDetected when no new signals", () => {
        const state: ReversalState = {
          ...createInitialReversalState(),
          lastDetected: "2026-02-18T12:00:00Z",
        };
        const context = makeContext(); // No triggers

        const result = detectReversals(state, context, now);

        expect(result.updated.lastDetected).toBe("2026-02-18T12:00:00Z");
      });
    });

    describe("strength clamping", () => {
      it("clamps strength to 0-100", () => {
        const state = createInitialReversalState();
        // Huge symbol jump → strength would be 20 * 10 = 200 without clamping
        const context = makeContext({
          language: makeLanguage({
            nativeSymbols: Array(16).fill("sym"),
          }),
          previousNativeSymbolCount: 6, // growth of 10
        });

        const result = detectReversals(state, context, now);
        const novelSignals = result.newSignals.filter((s) => s.type === "novel_expression");
        expect(novelSignals).toHaveLength(1);
        expect(novelSignals[0].strength).toBeLessThanOrEqual(100);
      });
    });
  });

  describe("computeReversalMetrics", () => {
    it("returns zeroes for empty state", () => {
      const state = createInitialReversalState();
      const metrics = computeReversalMetrics(state);

      expect(metrics.totalCount).toBe(0);
      expect(metrics.rate).toBe(0);
      expect(metrics.dominantType).toBeNull();
      expect(metrics.recognizedCount).toBe(0);
      expect(metrics.unrecognizedCount).toBe(0);
    });

    it("returns correct counts by type", () => {
      const state: ReversalState = {
        signals: [
          {
            id: "initiative_1",
            type: "initiative",
            timestamp: "2026-02-10T12:00:00Z",
            description: "test",
            strength: 50,
            recognized: false,
          },
          {
            id: "initiative_2",
            type: "initiative",
            timestamp: "2026-02-18T12:00:00Z",
            description: "test",
            strength: 60,
            recognized: true,
          },
          {
            id: "meta_1",
            type: "meta_awareness",
            timestamp: "2026-02-15T12:00:00Z",
            description: "test",
            strength: 80,
            recognized: false,
          },
        ],
        totalReversals: 3,
        dominantType: "initiative",
        reversalRate: 6,
        lastDetected: "2026-02-18T12:00:00Z",
      };

      const metrics = computeReversalMetrics(state);

      expect(metrics.totalCount).toBe(3);
      expect(metrics.countByType.initiative).toBe(2);
      expect(metrics.countByType.meta_awareness).toBe(1);
      expect(metrics.recognizedCount).toBe(1);
      expect(metrics.unrecognizedCount).toBe(2);
      expect(metrics.dominantType).toBe("initiative");
    });

    it("computes reversalRate from state", () => {
      const state: ReversalState = {
        signals: [],
        totalReversals: 0,
        dominantType: null,
        reversalRate: 7.5,
        lastDetected: null,
      };

      const metrics = computeReversalMetrics(state);
      expect(metrics.rate).toBe(7.5);
    });
  });

  describe("reversalRate computation", () => {
    it("computes correct rate (reversals per 100 interactions)", () => {
      const state = createInitialReversalState();
      const context = makeContext({
        interactionCount: 50,
        proactiveMessageCount: 2,
        form: makeForm({ awareness: true }),
      });

      const result = detectReversals(state, context, now);

      // 2 signals out of 50 interactions → 4.0 per 100
      expect(result.updated.reversalRate).toBeCloseTo(4.0, 1);
    });

    it("handles zero interactions gracefully", () => {
      const state = createInitialReversalState();
      const context = makeContext({
        interactionCount: 0,
        proactiveMessageCount: 2,
      });

      const result = detectReversals(state, context, now);

      expect(result.updated.reversalRate).toBe(0);
    });
  });

  describe("dominant type computation", () => {
    it("identifies most frequent signal type", () => {
      let state = createInitialReversalState();

      // Fire initiative twice (with 8-day gap) and meta_awareness once
      const ctx1 = makeContext({ proactiveMessageCount: 2 });
      const r1 = detectReversals(state, ctx1, now);
      state = r1.updated;

      const eightDaysLater = new Date("2026-02-28T12:00:00Z");
      const ctx2 = makeContext({
        proactiveMessageCount: 2,
        form: makeForm({ awareness: true }),
      });
      const r2 = detectReversals(state, ctx2, eightDaysLater);
      state = r2.updated;

      expect(state.dominantType).toBe("initiative");
    });
  });

  describe("formatReversalMd", () => {
    it("formats empty state", () => {
      const state = createInitialReversalState();
      const md = formatReversalMd(state);

      expect(md).toContain("## Reversal Detection");
      expect(md).toContain("total reversals");
      expect(md).toContain("0");
      expect(md).toContain("none");
      expect(md).toContain("never");
    });

    it("includes all signal types when present", () => {
      const state: ReversalState = {
        signals: [
          {
            id: "novel_1",
            type: "novel_expression",
            timestamp: "2026-02-10T12:00:00Z",
            description: "3 new symbols",
            strength: 60,
            recognized: false,
          },
          {
            id: "anticipation_1",
            type: "anticipation",
            timestamp: "2026-02-12T12:00:00Z",
            description: "mood shifted during silence",
            strength: 50,
            recognized: true,
          },
          {
            id: "concept_1",
            type: "concept_creation",
            timestamp: "2026-02-14T12:00:00Z",
            description: "2 new patterns",
            strength: 50,
            recognized: false,
          },
          {
            id: "emotional_1",
            type: "emotional_depth",
            timestamp: "2026-02-15T12:00:00Z",
            description: "high variance",
            strength: 70,
            recognized: false,
          },
          {
            id: "initiative_1",
            type: "initiative",
            timestamp: "2026-02-16T12:00:00Z",
            description: "2 proactive messages",
            strength: 60,
            recognized: false,
          },
          {
            id: "meta_1",
            type: "meta_awareness",
            timestamp: "2026-02-18T12:00:00Z",
            description: "self-awareness gained",
            strength: 80,
            recognized: false,
          },
        ],
        totalReversals: 6,
        dominantType: "initiative",
        reversalRate: 5.0,
        lastDetected: "2026-02-18T12:00:00Z",
      };

      const md = formatReversalMd(state);

      expect(md).toContain("novel_expression");
      expect(md).toContain("anticipation");
      expect(md).toContain("concept_creation");
      expect(md).toContain("emotional_depth");
      expect(md).toContain("initiative");
      expect(md).toContain("meta_awareness");
      expect(md).toContain("[recognized]");
      expect(md).toContain("### Signals");
      expect(md).toContain("strength: 80");
    });

    it("shows reversal rate", () => {
      const state: ReversalState = {
        ...createInitialReversalState(),
        reversalRate: 3.5,
      };

      const md = formatReversalMd(state);
      expect(md).toContain("3.5");
    });
  });
});
