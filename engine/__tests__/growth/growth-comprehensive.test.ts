/**
 * Comprehensive tests for Growth Engine
 *
 * Covers: stage transitions, milestone triggers, duplicate prevention,
 * multiple milestones per evaluation, edge cases, interaction thresholds,
 * stage regression prevention, markdown serialization, and boundary days.
 */
import { describe, it, expect } from "vitest";
import {
  createInitialGrowthState,
  evaluateGrowth,
  computeStage,
  formatMilestonesMd,
  parseMilestonesMd,
  type GrowthState,
  type GrowthStage,
  type Milestone,
} from "../../src/growth/growth-engine.js";
import { createInitialMemoryState } from "../../src/memory/memory-engine.js";
import { LanguageLevel } from "../../src/types.js";
import type { Status } from "../../src/types.js";
import type { LanguageState } from "../../src/language/language-engine.js";
import type { MemoryState } from "../../src/memory/memory-engine.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date("2026-02-20T12:00:00.000Z");

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    mood: 50,
    energy: 50,
    curiosity: 50,
    comfort: 50,
    languageLevel: LanguageLevel.SymbolsOnly,
    perceptionLevel: 0,
    growthDay: 0,
    lastInteraction: "never",
    ...overrides,
  };
}

function makeLanguage(overrides: Partial<LanguageState> = {}): LanguageState {
  return {
    level: LanguageLevel.SymbolsOnly,
    patterns: [],
    totalInteractions: 0,
    nativeSymbols: ["◎", "○", "●"],
    ...overrides,
  };
}

function makeMemory(overrides: Partial<MemoryState> = {}): MemoryState {
  return {
    ...createInitialMemoryState(),
    ...overrides,
  };
}

/** Convenience: evaluate from initial state with given context. */
function evalFromBirth(
  statusOverrides: Partial<Status> = {},
  langOverrides: Partial<LanguageState> = {},
  memOverrides: Partial<MemoryState> = {},
  date: Date = NOW,
) {
  const growth = createInitialGrowthState(date);
  const status = makeStatus(statusOverrides);
  const lang = makeLanguage(langOverrides);
  const mem = makeMemory(memOverrides);
  return evaluateGrowth(growth, status, lang, mem, date);
}

/** Extract new milestone IDs as a Set for easy assertions. */
function newIds(result: { newMilestones: Milestone[] }): Set<string> {
  return new Set(result.newMilestones.map((m) => m.id));
}

// ===========================================================================
// 1. Stage Transitions — exact day thresholds
// ===========================================================================

describe("Growth Engine — Comprehensive", () => {
  describe("Stage transitions (computeStage)", () => {
    it("Day 0 is newborn", () => {
      expect(computeStage(0)).toBe("newborn");
    });

    it("Day 1 is newborn", () => {
      expect(computeStage(1)).toBe("newborn");
    });

    it("Day 2 (upper boundary) is still newborn", () => {
      expect(computeStage(2)).toBe("newborn");
    });

    it("Day 3 transitions to infant", () => {
      expect(computeStage(3)).toBe("infant");
    });

    it("Day 13 (upper boundary) is still infant", () => {
      expect(computeStage(13)).toBe("infant");
    });

    it("Day 14 transitions to child", () => {
      expect(computeStage(14)).toBe("child");
    });

    it("Day 44 (upper boundary) is still child", () => {
      expect(computeStage(44)).toBe("child");
    });

    it("Day 45 transitions to adolescent", () => {
      expect(computeStage(45)).toBe("adolescent");
    });

    it("Day 89 (upper boundary) is still adolescent", () => {
      expect(computeStage(89)).toBe("adolescent");
    });

    it("Day 90 transitions to mature", () => {
      expect(computeStage(90)).toBe("mature");
    });

    it("Day 365 remains mature", () => {
      expect(computeStage(365)).toBe("mature");
    });

    it("Very high day number (Day 10000) remains mature", () => {
      expect(computeStage(10000)).toBe("mature");
    });
  });

  // =========================================================================
  // 2. Stage set via evaluateGrowth matches computeStage
  // =========================================================================

  describe("evaluateGrowth sets stage correctly", () => {
    const dayStagePairs: [number, GrowthStage][] = [
      [0, "newborn"],
      [2, "newborn"],
      [3, "infant"],
      [13, "infant"],
      [14, "child"],
      [44, "child"],
      [45, "adolescent"],
      [89, "adolescent"],
      [90, "mature"],
      [200, "mature"],
    ];

    for (const [day, expected] of dayStagePairs) {
      it(`Day ${day} → stage "${expected}"`, () => {
        const { updated } = evalFromBirth({ growthDay: day });
        expect(updated.stage).toBe(expected);
      });
    }
  });

  // =========================================================================
  // 3. Individual milestone triggers
  // =========================================================================

  describe("Milestone: first_breath", () => {
    it("is present immediately in initial state", () => {
      const state = createInitialGrowthState(NOW);
      expect(state.milestones).toHaveLength(1);
      expect(state.milestones[0].id).toBe("first_breath");
      expect(state.milestones[0].achievedDay).toBe(0);
      expect(state.milestones[0].achievedAt).toBe(NOW.toISOString());
    });

    it("is not re-emitted during evaluation", () => {
      const ids = newIds(evalFromBirth());
      expect(ids.has("first_breath")).toBe(false);
    });
  });

  describe("Milestone: first_interaction", () => {
    it("triggers at exactly 1 interaction", () => {
      const ids = newIds(evalFromBirth({ growthDay: 1 }, { totalInteractions: 1 }));
      expect(ids.has("first_interaction")).toBe(true);
    });

    it("does NOT trigger at 0 interactions", () => {
      const ids = newIds(evalFromBirth({ growthDay: 1 }, { totalInteractions: 0 }));
      expect(ids.has("first_interaction")).toBe(false);
    });
  });

  describe("Milestone: 10_interactions", () => {
    it("triggers at exactly 10 interactions", () => {
      const ids = newIds(evalFromBirth({ growthDay: 2 }, { totalInteractions: 10 }));
      expect(ids.has("10_interactions")).toBe(true);
    });

    it("does NOT trigger at 9 interactions", () => {
      const ids = newIds(evalFromBirth({ growthDay: 2 }, { totalInteractions: 9 }));
      expect(ids.has("10_interactions")).toBe(false);
    });
  });

  describe("Milestone: first_pattern", () => {
    it("triggers when at least one pattern exists", () => {
      const ids = newIds(
        evalFromBirth(
          { growthDay: 5 },
          {
            totalInteractions: 5,
            patterns: [{ symbol: "◎", meaning: "greeting", establishedDay: 4, usageCount: 3 }],
          },
        ),
      );
      expect(ids.has("first_pattern")).toBe(true);
    });

    it("does NOT trigger with empty patterns", () => {
      const ids = newIds(evalFromBirth({ growthDay: 5 }, { patterns: [] }));
      expect(ids.has("first_pattern")).toBe(false);
    });
  });

  describe("Milestone: first_week", () => {
    it("triggers at exactly day 7", () => {
      const ids = newIds(evalFromBirth({ growthDay: 7 }));
      expect(ids.has("first_week")).toBe(true);
    });

    it("does NOT trigger at day 6", () => {
      const ids = newIds(evalFromBirth({ growthDay: 6 }));
      expect(ids.has("first_week")).toBe(false);
    });
  });

  describe("Milestone: language_level_1 (PatternEstablishment)", () => {
    it("triggers when languageLevel >= 1", () => {
      const ids = newIds(
        evalFromBirth({ growthDay: 10, languageLevel: LanguageLevel.PatternEstablishment }),
      );
      expect(ids.has("language_level_1")).toBe(true);
    });

    it("also triggers at higher language levels", () => {
      const ids = newIds(
        evalFromBirth({ growthDay: 30, languageLevel: LanguageLevel.BridgeToLanguage }),
      );
      expect(ids.has("language_level_1")).toBe(true);
    });

    it("does NOT trigger at SymbolsOnly", () => {
      const ids = newIds(evalFromBirth({ growthDay: 10, languageLevel: LanguageLevel.SymbolsOnly }));
      expect(ids.has("language_level_1")).toBe(false);
    });
  });

  describe("Milestone: first_memory_warm", () => {
    it("triggers when warm memory has at least one entry", () => {
      const ids = newIds(
        evalFromBirth(
          { growthDay: 10 },
          {},
          {
            warm: [
              { week: "2026-W08", entries: 5, summary: "First week summary", averageMood: 55 },
            ],
          },
        ),
      );
      expect(ids.has("first_memory_warm")).toBe(true);
    });

    it("does NOT trigger with empty warm memory", () => {
      const ids = newIds(evalFromBirth({ growthDay: 10 }, {}, { warm: [] }));
      expect(ids.has("first_memory_warm")).toBe(false);
    });
  });

  describe("Milestone: 50_interactions", () => {
    it("triggers at exactly 50 interactions", () => {
      const ids = newIds(evalFromBirth({ growthDay: 15 }, { totalInteractions: 50 }));
      expect(ids.has("50_interactions")).toBe(true);
    });

    it("does NOT trigger at 49 interactions", () => {
      const ids = newIds(evalFromBirth({ growthDay: 15 }, { totalInteractions: 49 }));
      expect(ids.has("50_interactions")).toBe(false);
    });
  });

  describe("Milestone: language_level_2 (BridgeToLanguage)", () => {
    it("triggers at BridgeToLanguage", () => {
      const ids = newIds(
        evalFromBirth({ growthDay: 25, languageLevel: LanguageLevel.BridgeToLanguage }),
      );
      expect(ids.has("language_level_2")).toBe(true);
    });
  });

  describe("Milestone: first_month", () => {
    it("triggers at exactly day 30", () => {
      const ids = newIds(evalFromBirth({ growthDay: 30 }));
      expect(ids.has("first_month")).toBe(true);
    });

    it("does NOT trigger at day 29", () => {
      const ids = newIds(evalFromBirth({ growthDay: 29 }));
      expect(ids.has("first_month")).toBe(false);
    });
  });

  describe("Milestone: 100_interactions", () => {
    it("triggers at exactly 100 interactions", () => {
      const ids = newIds(evalFromBirth({ growthDay: 30 }, { totalInteractions: 100 }));
      expect(ids.has("100_interactions")).toBe(true);
    });

    it("does NOT trigger at 99 interactions", () => {
      const ids = newIds(evalFromBirth({ growthDay: 30 }, { totalInteractions: 99 }));
      expect(ids.has("100_interactions")).toBe(false);
    });
  });

  describe("Milestone: language_level_3 (UniqueLanguage)", () => {
    it("triggers at UniqueLanguage", () => {
      const ids = newIds(
        evalFromBirth({ growthDay: 50, languageLevel: LanguageLevel.UniqueLanguage }),
      );
      expect(ids.has("language_level_3")).toBe(true);
    });
  });

  describe("Milestone: three_months", () => {
    it("triggers at exactly day 90", () => {
      const ids = newIds(evalFromBirth({ growthDay: 90 }));
      expect(ids.has("three_months")).toBe(true);
    });

    it("does NOT trigger at day 89", () => {
      const ids = newIds(evalFromBirth({ growthDay: 89 }));
      expect(ids.has("three_months")).toBe(false);
    });
  });

  describe("Milestone: language_level_4 (AdvancedOperation)", () => {
    it("triggers at AdvancedOperation", () => {
      const ids = newIds(
        evalFromBirth({ growthDay: 100, languageLevel: LanguageLevel.AdvancedOperation }),
      );
      expect(ids.has("language_level_4")).toBe(true);
    });

    it("does NOT trigger at UniqueLanguage", () => {
      const ids = newIds(
        evalFromBirth({ growthDay: 100, languageLevel: LanguageLevel.UniqueLanguage }),
      );
      expect(ids.has("language_level_4")).toBe(false);
    });
  });

  // =========================================================================
  // 4. Duplicate prevention — same milestone should not fire twice
  // =========================================================================

  describe("Milestone duplicate prevention", () => {
    it("never re-emits already-achieved milestones across evaluations", () => {
      const state0 = createInitialGrowthState(NOW);
      const status = makeStatus({ growthDay: 8 });
      const lang = makeLanguage({ totalInteractions: 12 });
      const mem = makeMemory();

      // First evaluation — several milestones fire
      const { updated: state1, newMilestones: first } = evaluateGrowth(
        state0, status, lang, mem, NOW,
      );
      expect(first.length).toBeGreaterThan(0);
      const firstIds = new Set(first.map((m) => m.id));

      // Second evaluation with same state — no new milestones
      const { newMilestones: second } = evaluateGrowth(state1, status, lang, mem, NOW);
      expect(second).toHaveLength(0);

      // Third evaluation, even with more days, previously achieved should not repeat
      const status2 = makeStatus({ growthDay: 30 });
      const { newMilestones: third } = evaluateGrowth(state1, status2, lang, mem, NOW);
      for (const m of third) {
        expect(firstIds.has(m.id)).toBe(false);
      }
    });

    it("first_breath never appears in newMilestones regardless of context", () => {
      // Try with maximum conditions
      const result = evalFromBirth(
        { growthDay: 100, languageLevel: LanguageLevel.AdvancedOperation },
        { totalInteractions: 500 },
        {
          warm: [{ week: "2026-W08", entries: 5, summary: "test", averageMood: 50 }],
        },
      );
      expect(result.newMilestones.find((m) => m.id === "first_breath")).toBeUndefined();
    });
  });

  // =========================================================================
  // 5. Multiple milestones in a single evaluation
  // =========================================================================

  describe("Multiple milestones in single evaluation", () => {
    it("triggers first_interaction, 10_interactions, and first_week together", () => {
      const ids = newIds(evalFromBirth({ growthDay: 8 }, { totalInteractions: 12 }));
      expect(ids.has("first_interaction")).toBe(true);
      expect(ids.has("10_interactions")).toBe(true);
      expect(ids.has("first_week")).toBe(true);
    });

    it("triggers all time-based milestones at day 90", () => {
      const ids = newIds(evalFromBirth({ growthDay: 90 }));
      expect(ids.has("first_week")).toBe(true);
      expect(ids.has("first_month")).toBe(true);
      expect(ids.has("three_months")).toBe(true);
    });

    it("triggers all interaction milestones at 100 interactions", () => {
      const ids = newIds(evalFromBirth({ growthDay: 0 }, { totalInteractions: 100 }));
      expect(ids.has("first_interaction")).toBe(true);
      expect(ids.has("10_interactions")).toBe(true);
      expect(ids.has("50_interactions")).toBe(true);
      expect(ids.has("100_interactions")).toBe(true);
    });

    it("triggers all language level milestones at AdvancedOperation", () => {
      const ids = newIds(
        evalFromBirth({ growthDay: 0, languageLevel: LanguageLevel.AdvancedOperation }),
      );
      expect(ids.has("language_level_1")).toBe(true);
      expect(ids.has("language_level_2")).toBe(true);
      expect(ids.has("language_level_3")).toBe(true);
      expect(ids.has("language_level_4")).toBe(true);
    });

    it("accumulates all milestones in updated.milestones", () => {
      const { updated } = evalFromBirth(
        { growthDay: 90, languageLevel: LanguageLevel.AdvancedOperation },
        {
          totalInteractions: 100,
          patterns: [{ symbol: "◎", meaning: "hello", establishedDay: 2, usageCount: 5 }],
        },
        {
          warm: [{ week: "2026-W08", entries: 3, summary: "first week", averageMood: 60 }],
        },
      );
      // 1 (first_breath from initial) + 13 (all other defined milestones) = 14
      expect(updated.milestones).toHaveLength(14);
    });
  });

  // =========================================================================
  // 6. Stage should never go backwards (regression prevention)
  // =========================================================================

  describe("Stage regression prevention", () => {
    it("computeStage always returns a stage >= previous for monotonically increasing days", () => {
      const stageOrder: GrowthStage[] = ["newborn", "infant", "child", "adolescent", "mature"];
      let prevIndex = 0;
      for (let day = 0; day <= 100; day++) {
        const stage = computeStage(day);
        const index = stageOrder.indexOf(stage);
        expect(index).toBeGreaterThanOrEqual(prevIndex);
        prevIndex = index;
      }
    });

    it("evaluateGrowth preserves advanced stage even if re-evaluated at same day", () => {
      const state0 = createInitialGrowthState(NOW);
      const status = makeStatus({ growthDay: 50 });
      const lang = makeLanguage();
      const mem = makeMemory();

      const { updated: state1 } = evaluateGrowth(state0, status, lang, mem, NOW);
      expect(state1.stage).toBe("adolescent");

      // Re-evaluate same state
      const { updated: state2 } = evaluateGrowth(state1, status, lang, mem, NOW);
      expect(state2.stage).toBe("adolescent");
    });
  });

  // =========================================================================
  // 7. Growth day calculation accuracy (via evaluateGrowth)
  // =========================================================================

  describe("Growth day in milestone records", () => {
    it("newly achieved milestones record the correct growthDay", () => {
      const { newMilestones } = evalFromBirth({ growthDay: 7 });
      const weekMilestone = newMilestones.find((m) => m.id === "first_week");
      expect(weekMilestone).toBeDefined();
      expect(weekMilestone!.achievedDay).toBe(7);
    });

    it("newly achieved milestones record the correct timestamp", () => {
      const specificTime = new Date("2026-03-15T08:30:00.000Z");
      const growth = createInitialGrowthState(NOW);
      const status = makeStatus({ growthDay: 7 });
      const lang = makeLanguage();
      const mem = makeMemory();

      const { newMilestones } = evaluateGrowth(growth, status, lang, mem, specificTime);
      for (const m of newMilestones) {
        expect(m.achievedAt).toBe(specificTime.toISOString());
      }
    });
  });

  // =========================================================================
  // 8. Edge cases
  // =========================================================================

  describe("Edge cases", () => {
    it("Day 0 with no interactions yields no new milestones (only first_breath already present)", () => {
      const { newMilestones } = evalFromBirth({ growthDay: 0 }, { totalInteractions: 0 });
      expect(newMilestones).toHaveLength(0);
    });

    it("Day 1 with 0 interactions yields no new milestones", () => {
      const { newMilestones } = evalFromBirth({ growthDay: 1 }, { totalInteractions: 0 });
      expect(newMilestones).toHaveLength(0);
    });

    it("evaluateGrowth with empty pre-existing milestones still checks all definitions", () => {
      // Simulates a corrupted state where first_breath was lost
      const emptyState: GrowthState = { milestones: [], stage: "newborn" };
      const status = makeStatus({ growthDay: 0 });
      const lang = makeLanguage();
      const mem = makeMemory();

      const { updated, newMilestones } = evaluateGrowth(emptyState, status, lang, mem, NOW);
      // first_breath check always returns true, so it should be re-added
      expect(newMilestones.some((m) => m.id === "first_breath")).toBe(true);
      expect(updated.milestones.some((m) => m.id === "first_breath")).toBe(true);
    });

    it("handles very large interaction counts gracefully", () => {
      const { updated, newMilestones } = evalFromBirth(
        { growthDay: 0 },
        { totalInteractions: 999999 },
      );
      // Should fire all interaction milestones
      const ids = new Set(newMilestones.map((m) => m.id));
      expect(ids.has("first_interaction")).toBe(true);
      expect(ids.has("100_interactions")).toBe(true);
      // State is valid
      expect(updated.stage).toBe("newborn");
    });

    it("handles many patterns without issues", () => {
      const manyPatterns = Array.from({ length: 50 }, (_, i) => ({
        symbol: `S${i}`,
        meaning: `meaning${i}`,
        establishedDay: i,
        usageCount: i + 1,
      }));
      const ids = newIds(evalFromBirth({ growthDay: 5 }, { patterns: manyPatterns }));
      expect(ids.has("first_pattern")).toBe(true);
    });
  });

  // =========================================================================
  // 9. Incremental evaluation (multi-step simulation)
  // =========================================================================

  describe("Multi-step growth simulation", () => {
    it("entity progresses through stages with incremental evaluations", () => {
      let state = createInitialGrowthState(NOW);
      const mem = makeMemory();

      // Day 0: birth
      expect(state.stage).toBe("newborn");
      expect(state.milestones).toHaveLength(1);

      // Day 1: first interaction
      let result = evaluateGrowth(
        state,
        makeStatus({ growthDay: 1 }),
        makeLanguage({ totalInteractions: 1 }),
        mem,
        NOW,
      );
      state = result.updated;
      expect(state.stage).toBe("newborn");
      expect(result.newMilestones.some((m) => m.id === "first_interaction")).toBe(true);

      // Day 7: first week, 12 interactions
      result = evaluateGrowth(
        state,
        makeStatus({ growthDay: 7 }),
        makeLanguage({ totalInteractions: 12 }),
        mem,
        NOW,
      );
      state = result.updated;
      expect(state.stage).toBe("infant");
      expect(result.newMilestones.some((m) => m.id === "first_week")).toBe(true);
      expect(result.newMilestones.some((m) => m.id === "10_interactions")).toBe(true);

      // Day 30: first month
      result = evaluateGrowth(
        state,
        makeStatus({ growthDay: 30 }),
        makeLanguage({ totalInteractions: 55 }),
        mem,
        NOW,
      );
      state = result.updated;
      expect(state.stage).toBe("child");
      expect(result.newMilestones.some((m) => m.id === "first_month")).toBe(true);
      expect(result.newMilestones.some((m) => m.id === "50_interactions")).toBe(true);

      // Day 90: three months, mature
      result = evaluateGrowth(
        state,
        makeStatus({ growthDay: 90, languageLevel: LanguageLevel.AdvancedOperation }),
        makeLanguage({ totalInteractions: 120 }),
        mem,
        NOW,
      );
      state = result.updated;
      expect(state.stage).toBe("mature");
      expect(result.newMilestones.some((m) => m.id === "three_months")).toBe(true);
      expect(result.newMilestones.some((m) => m.id === "100_interactions")).toBe(true);
    });
  });

  // =========================================================================
  // 10. Markdown serialization edge cases
  // =========================================================================

  describe("Markdown serialization", () => {
    it("formatMilestonesMd includes all milestones", () => {
      const state: GrowthState = {
        stage: "child",
        milestones: [
          { id: "first_breath", label: "First Breath — Entity was born", achievedDay: 0, achievedAt: NOW.toISOString() },
          { id: "first_interaction", label: "First Contact — Someone spoke to the entity", achievedDay: 1, achievedAt: NOW.toISOString() },
          { id: "first_week", label: "One Week — Survived the first week", achievedDay: 7, achievedAt: NOW.toISOString() },
        ],
      };
      const md = formatMilestonesMd(state);
      expect(md).toContain("Current Stage: **child**");
      expect(md).toContain("**Day 0**: First Breath");
      expect(md).toContain("**Day 1**: First Contact");
      expect(md).toContain("**Day 7**: One Week");
    });

    it("formatMilestonesMd handles empty milestones", () => {
      const state: GrowthState = { stage: "newborn", milestones: [] };
      const md = formatMilestonesMd(state);
      expect(md).toContain("No milestones yet.");
      expect(md).toContain("Current Stage: **newborn**");
    });

    it("parseMilestonesMd recovers stage from markdown", () => {
      for (const stage of ["newborn", "infant", "child", "adolescent", "mature"] as GrowthStage[]) {
        const state: GrowthState = { stage, milestones: [] };
        const md = formatMilestonesMd(state);
        const parsed = parseMilestonesMd(md);
        expect(parsed.stage).toBe(stage);
      }
    });

    it("parseMilestonesMd defaults to newborn when stage is missing", () => {
      const md = "# Growth Milestones\n\nNo milestones yet.\n";
      const parsed = parseMilestonesMd(md);
      expect(parsed.stage).toBe("newborn");
    });

    it("parseMilestonesMd correctly parses milestone days", () => {
      const md = [
        "# Growth Milestones",
        "",
        "Current Stage: **mature**",
        "",
        "- **Day 0**: First Breath — Entity was born",
        "- **Day 30**: One Month — A full month together",
        "- **Day 90**: Three Months — A season together",
        "",
      ].join("\n");

      const parsed = parseMilestonesMd(md);
      expect(parsed.milestones).toHaveLength(3);
      expect(parsed.milestones[0].achievedDay).toBe(0);
      expect(parsed.milestones[1].achievedDay).toBe(30);
      expect(parsed.milestones[2].achievedDay).toBe(90);
    });
  });
});
