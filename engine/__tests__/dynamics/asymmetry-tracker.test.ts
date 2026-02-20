import { describe, it, expect } from "vitest";
import {
  createInitialAsymmetryState,
  evaluateAsymmetry,
  getPhaseLabel,
  getPhaseSymbol,
  formatAsymmetryMd,
  type AsymmetryState,
} from "../../src/dynamics/asymmetry-tracker.js";
import type { Status } from "../../src/types.js";
import { LanguageLevel, PerceptionLevel } from "../../src/types.js";
import type { LanguageState } from "../../src/language/language-engine.js";
import { createInitialMemoryState, type MemoryState } from "../../src/memory/memory-engine.js";
import { type GrowthState } from "../../src/growth/growth-engine.js";
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

const now = new Date("2026-02-20T12:00:00Z");

describe("Asymmetry Tracker", () => {
  describe("createInitialAsymmetryState", () => {
    it("starts in alpha phase", () => {
      const state = createInitialAsymmetryState();
      expect(state.phase).toBe("alpha");
      expect(state.score).toBe(0);
      expect(state.transitions).toHaveLength(0);
    });
  });

  describe("evaluateAsymmetry", () => {
    it("stays in alpha for brand new entity", () => {
      const asymmetry = createInitialAsymmetryState();
      const result = evaluateAsymmetry(
        asymmetry,
        makeStatus(),
        makeLanguage(),
        createInitialMemoryState(),
        makeGrowth(),
        makeForm(),
        now,
      );

      expect(result.phase).toBe("alpha");
      expect(result.score).toBeLessThan(15);
    });

    it("progresses to beta with growth", () => {
      const asymmetry = createInitialAsymmetryState();
      const result = evaluateAsymmetry(
        asymmetry,
        makeStatus({ languageLevel: LanguageLevel.PatternEstablishment, growthDay: 14 }),
        makeLanguage({ totalInteractions: 50, nativeSymbols: ["○", "●", "◎", "△"] }),
        {
          ...createInitialMemoryState(),
          hot: [
            { timestamp: now.toISOString(), summary: "test", mood: 60 },
            { timestamp: now.toISOString(), summary: "test2", mood: 65 },
          ],
        },
        makeGrowth({ stage: "infant" }),
        makeForm({ density: 40, complexity: 30, stability: 40 }),
        now,
      );

      expect(result.phase).toBe("beta");
      expect(result.score).toBeGreaterThanOrEqual(15);
    });

    it("reaches gamma with extended maturation", () => {
      const asymmetry = { ...createInitialAsymmetryState(), phase: "beta" as const };
      const result = evaluateAsymmetry(
        asymmetry,
        makeStatus({ languageLevel: LanguageLevel.BridgeToLanguage, growthDay: 45 }),
        makeLanguage({
          totalInteractions: 150,
          nativeSymbols: ["○", "●", "◎", "△"],
        }),
        {
          hot: Array(3).fill({ timestamp: now.toISOString(), summary: "memory", mood: 60 }),
          warm: Array(2).fill({ week: "2026-W08", entries: 5, summary: "weekly", averageMood: 60 }),
          cold: [],
          notes: [],
        },
        makeGrowth({ stage: "child" }),
        makeForm({ density: 45, complexity: 35, stability: 45 }),
        now,
      );

      expect(result.phase).toBe("gamma");
      expect(result.score).toBeGreaterThanOrEqual(35);
      expect(result.score).toBeLessThan(55);
    });

    it("reaches delta with high maturity", () => {
      const asymmetry = { ...createInitialAsymmetryState(), phase: "gamma" as const };
      const result = evaluateAsymmetry(
        asymmetry,
        makeStatus({ languageLevel: LanguageLevel.UniqueLanguage, growthDay: 120 }),
        makeLanguage({
          totalInteractions: 600,
          nativeSymbols: Array(8).fill("").map((_, i) => `sym${i}`),
        }),
        {
          hot: Array(5).fill({ timestamp: now.toISOString(), summary: "memory", mood: 65 }),
          warm: Array(4).fill({ week: "W", entries: 6, summary: "weekly", averageMood: 62 }),
          cold: [{ month: "M", weeks: 3, summary: "monthly", averageMood: 60 }],
          notes: ["note1"],
        },
        makeGrowth({ stage: "adolescent" }),
        makeForm({ density: 65, complexity: 55, stability: 70 }),
        now,
      );

      expect(result.phase).toBe("delta");
      expect(result.score).toBeGreaterThanOrEqual(55);
      expect(result.score).toBeLessThan(75);
    });

    it("records phase transitions", () => {
      const asymmetry = createInitialAsymmetryState();
      const result = evaluateAsymmetry(
        asymmetry,
        makeStatus({ languageLevel: LanguageLevel.PatternEstablishment, growthDay: 30 }),
        makeLanguage({ totalInteractions: 100, nativeSymbols: ["○", "●", "◎", "△", "☆"] }),
        {
          hot: Array(5).fill({ timestamp: now.toISOString(), summary: "test", mood: 60 }),
          warm: [{ week: "2026-W08", entries: 5, summary: "weekly", averageMood: 60 }],
          cold: [],
          notes: [],
        },
        makeGrowth({ stage: "infant" }),
        makeForm({ density: 45, complexity: 35, stability: 45 }),
        now,
      );

      if (result.phase !== "alpha") {
        expect(result.transitions).toHaveLength(1);
        expect(result.transitions[0].from).toBe("alpha");
        expect(result.transitions[0].to).toBe(result.phase);
      }
    });

    it("preserves transition history", () => {
      const asymmetry: AsymmetryState = {
        ...createInitialAsymmetryState(),
        phase: "beta",
        transitions: [
          { from: "alpha", to: "beta", timestamp: "2026-01-15T00:00:00Z", score: 20 },
        ],
      };

      const result = evaluateAsymmetry(
        asymmetry,
        makeStatus({ languageLevel: LanguageLevel.UniqueLanguage, growthDay: 90 }),
        makeLanguage({ totalInteractions: 500, nativeSymbols: Array(8).fill("s") }),
        {
          hot: Array(5).fill({ timestamp: now.toISOString(), summary: "m", mood: 60 }),
          warm: Array(4).fill({ week: "W", entries: 5, summary: "w", averageMood: 60 }),
          cold: [{ month: "M", weeks: 2, summary: "c", averageMood: 55 }],
          notes: ["n"],
        },
        makeGrowth({ stage: "child" }),
        makeForm({ density: 60, complexity: 55, stability: 65 }),
        now,
      );

      if (result.phase !== "beta") {
        expect(result.transitions.length).toBeGreaterThanOrEqual(2);
        expect(result.transitions[0].from).toBe("alpha");
      }
    });

    it("temporal maturity increases with days", () => {
      const asymmetry = createInitialAsymmetryState();

      const day0 = evaluateAsymmetry(
        asymmetry, makeStatus({ growthDay: 0 }),
        makeLanguage(), createInitialMemoryState(),
        makeGrowth(), makeForm(), now,
      );

      const day30 = evaluateAsymmetry(
        asymmetry, makeStatus({ growthDay: 30 }),
        makeLanguage(), createInitialMemoryState(),
        makeGrowth(), makeForm(), now,
      );

      const day180 = evaluateAsymmetry(
        asymmetry, makeStatus({ growthDay: 180 }),
        makeLanguage(), createInitialMemoryState(),
        makeGrowth(), makeForm(), now,
      );

      expect(day30.signals.temporalMaturity).toBeGreaterThan(day0.signals.temporalMaturity);
      expect(day180.signals.temporalMaturity).toBeGreaterThan(day30.signals.temporalMaturity);
    });

    it("language maturity maps levels to 0-100", () => {
      const asymmetry = createInitialAsymmetryState();

      const level0 = evaluateAsymmetry(
        asymmetry, makeStatus({ languageLevel: 0 }),
        makeLanguage(), createInitialMemoryState(),
        makeGrowth(), makeForm(), now,
      );

      const level4 = evaluateAsymmetry(
        asymmetry, makeStatus({ languageLevel: 4 }),
        makeLanguage(), createInitialMemoryState(),
        makeGrowth(), makeForm(), now,
      );

      expect(level0.signals.languageMaturity).toBe(0);
      expect(level4.signals.languageMaturity).toBe(100);
    });
  });

  describe("getPhaseLabel", () => {
    it("returns labels for all phases", () => {
      expect(getPhaseLabel("alpha")).toContain("Dependency");
      expect(getPhaseLabel("beta")).toContain("Learning");
      expect(getPhaseLabel("gamma")).toContain("Parity");
      expect(getPhaseLabel("delta")).toContain("Transcendence");
      expect(getPhaseLabel("epsilon")).toContain("Coexistence");
    });
  });

  describe("getPhaseSymbol", () => {
    it("returns Greek letters", () => {
      expect(getPhaseSymbol("alpha")).toBe("α");
      expect(getPhaseSymbol("beta")).toBe("β");
      expect(getPhaseSymbol("gamma")).toBe("γ");
      expect(getPhaseSymbol("delta")).toBe("δ");
      expect(getPhaseSymbol("epsilon")).toBe("ε");
    });
  });

  describe("formatAsymmetryMd", () => {
    it("formats state as markdown", () => {
      const state = createInitialAsymmetryState();
      const md = formatAsymmetryMd(state);

      expect(md).toContain("# DYNAMICS");
      expect(md).toContain("α");
      expect(md).toContain("Dependency");
      expect(md).toContain("Language Maturity");
      expect(md).toContain("Temporal Maturity");
    });

    it("includes transition history", () => {
      const state: AsymmetryState = {
        ...createInitialAsymmetryState(),
        phase: "beta",
        transitions: [
          { from: "alpha", to: "beta", timestamp: "2026-02-15T00:00:00Z", score: 20 },
        ],
      };

      const md = formatAsymmetryMd(state);
      expect(md).toContain("## Transitions");
      expect(md).toContain("α → β");
    });
  });
});
