import { describe, it, expect } from "vitest";
import {
  createInitialGrowthState,
  evaluateGrowth,
  computeStage,
  formatMilestonesMd,
  parseMilestonesMd,
  type GrowthState,
} from "../../src/growth/growth-engine.js";
import { createInitialMemoryState } from "../../src/memory/memory-engine.js";
import { LanguageLevel } from "../../src/types.js";
import type { Status } from "../../src/types.js";
import type { LanguageState } from "../../src/language/language-engine.js";

const NOW = new Date("2026-02-18T12:00:00.000Z");

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

describe("Growth Engine", () => {
  describe("createInitialGrowthState", () => {
    it("starts with first_breath milestone", () => {
      const state = createInitialGrowthState(NOW);
      expect(state.milestones).toHaveLength(1);
      expect(state.milestones[0].id).toBe("first_breath");
      expect(state.stage).toBe("newborn");
    });
  });

  describe("computeStage", () => {
    it("returns newborn for day 0-2", () => {
      expect(computeStage(0)).toBe("newborn");
      expect(computeStage(2)).toBe("newborn");
    });

    it("returns infant for day 3-13", () => {
      expect(computeStage(3)).toBe("infant");
      expect(computeStage(13)).toBe("infant");
    });

    it("returns child for day 14-44", () => {
      expect(computeStage(14)).toBe("child");
      expect(computeStage(44)).toBe("child");
    });

    it("returns adolescent for day 45-89", () => {
      expect(computeStage(45)).toBe("adolescent");
      expect(computeStage(89)).toBe("adolescent");
    });

    it("returns mature for day 90+", () => {
      expect(computeStage(90)).toBe("mature");
      expect(computeStage(365)).toBe("mature");
    });
  });

  describe("evaluateGrowth", () => {
    it("achieves first_interaction milestone", () => {
      const growth = createInitialGrowthState(NOW);
      const status = makeStatus({ growthDay: 1 });
      const lang = makeLanguage({ totalInteractions: 1 });
      const memory = createInitialMemoryState();

      const { updated, newMilestones } = evaluateGrowth(growth, status, lang, memory, NOW);

      expect(newMilestones.some((m) => m.id === "first_interaction")).toBe(true);
      expect(updated.milestones.length).toBeGreaterThan(1);
    });

    it("does not re-achieve existing milestones", () => {
      const growth = createInitialGrowthState(NOW);
      const status = makeStatus();
      const lang = makeLanguage();
      const memory = createInitialMemoryState();

      const { newMilestones } = evaluateGrowth(growth, status, lang, memory, NOW);

      // first_breath already achieved, should not appear again
      expect(newMilestones.find((m) => m.id === "first_breath")).toBeUndefined();
    });

    it("achieves first_week milestone at day 7", () => {
      const growth = createInitialGrowthState(NOW);
      const status = makeStatus({ growthDay: 7 });
      const lang = makeLanguage();
      const memory = createInitialMemoryState();

      const { newMilestones } = evaluateGrowth(growth, status, lang, memory, NOW);

      expect(newMilestones.some((m) => m.id === "first_week")).toBe(true);
    });

    it("achieves language_level_1 when conditions met", () => {
      const growth = createInitialGrowthState(NOW);
      const status = makeStatus({
        growthDay: 10,
        languageLevel: LanguageLevel.PatternEstablishment,
      });
      const lang = makeLanguage({ totalInteractions: 30 });
      const memory = createInitialMemoryState();

      const { newMilestones } = evaluateGrowth(growth, status, lang, memory, NOW);

      expect(newMilestones.some((m) => m.id === "language_level_1")).toBe(true);
    });

    it("updates stage based on growth day", () => {
      const growth = createInitialGrowthState(NOW);
      const status = makeStatus({ growthDay: 14 });
      const lang = makeLanguage();
      const memory = createInitialMemoryState();

      const { updated } = evaluateGrowth(growth, status, lang, memory, NOW);

      expect(updated.stage).toBe("child");
    });

    it("achieves multiple milestones at once", () => {
      const growth = createInitialGrowthState(NOW);
      const status = makeStatus({ growthDay: 8 });
      const lang = makeLanguage({ totalInteractions: 12 });
      const memory = createInitialMemoryState();

      const { newMilestones } = evaluateGrowth(growth, status, lang, memory, NOW);

      const ids = newMilestones.map((m) => m.id);
      expect(ids).toContain("first_interaction");
      expect(ids).toContain("10_interactions");
      expect(ids).toContain("first_week");
    });
  });

  describe("formatMilestonesMd / parseMilestonesMd", () => {
    it("round-trips milestones", () => {
      const state: GrowthState = {
        stage: "infant",
        milestones: [
          { id: "first_breath", label: "First Breath — Entity was born", achievedDay: 0, achievedAt: NOW.toISOString() },
          { id: "first_interaction", label: "First Contact — Someone spoke to the entity", achievedDay: 1, achievedAt: NOW.toISOString() },
        ],
      };

      const md = formatMilestonesMd(state);
      expect(md).toContain("Current Stage: **infant**");
      expect(md).toContain("**Day 0**: First Breath");

      const parsed = parseMilestonesMd(md);
      expect(parsed.stage).toBe("infant");
      expect(parsed.milestones).toHaveLength(2);
    });
  });
});
