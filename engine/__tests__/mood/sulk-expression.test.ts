import { describe, it, expect } from "vitest";
import {
  getSulkExpression,
  generateSoulEvilMd,
} from "../../src/mood/sulk-engine.js";
import type { PerceptionMode } from "../../src/types.js";

const ALL_PERCEPTIONS: PerceptionMode[] = [
  "chromatic", "vibration", "geometric", "thermal", "temporal", "chemical",
];

describe("Species-specific sulk expressions", () => {
  describe("getSulkExpression", () => {
    it("returns different expressions per species", () => {
      const expressions = ALL_PERCEPTIONS.map((p) => getSulkExpression(p, "moderate"));
      const descriptions = expressions.map((e) => e.description);
      // All descriptions should be unique
      expect(new Set(descriptions).size).toBe(ALL_PERCEPTIONS.length);
    });

    it("has escalating severity", () => {
      for (const perception of ALL_PERCEPTIONS) {
        const mild = getSulkExpression(perception, "mild");
        const moderate = getSulkExpression(perception, "moderate");
        const severe = getSulkExpression(perception, "severe");

        // Silence increases with severity
        expect(severe.silence.length).toBeGreaterThanOrEqual(moderate.silence.length);
        expect(moderate.silence.length).toBeGreaterThanOrEqual(mild.silence.length);

        // Symbols decrease with severity
        expect(severe.symbols.length).toBeLessThanOrEqual(moderate.symbols.length);
      }
    });

    it("returns empty for severity 'none'", () => {
      for (const perception of ALL_PERCEPTIONS) {
        const expr = getSulkExpression(perception, "none");
        expect(expr.symbols).toEqual([]);
        expect(expr.description).toBe("");
      }
    });
  });

  describe("generateSoulEvilMd", () => {
    it("includes perception type in output", () => {
      const md = generateSoulEvilMd("chromatic", "moderate");
      expect(md).toContain("chromatic");
      expect(md).toContain("Sulking Mode");
    });

    it("includes severity", () => {
      const md = generateSoulEvilMd("vibration", "severe");
      expect(md).toContain("Severity: severe");
    });

    it("vibration severe uses silence as expression", () => {
      const md = generateSoulEvilMd("vibration", "severe");
      expect(md).toContain("(silence)");
    });

    it("chromatic mild still has light symbols", () => {
      const md = generateSoulEvilMd("chromatic", "mild");
      expect(md).toContain("○");
    });

    it("geometric severe collapses to a point", () => {
      const md = generateSoulEvilMd("geometric", "severe");
      expect(md).toContain("·");
      expect(md).toContain("single point");
    });

    it("produces valid markdown for all combinations", () => {
      for (const perception of ALL_PERCEPTIONS) {
        for (const severity of ["mild", "moderate", "severe"] as const) {
          const md = generateSoulEvilMd(perception, severity);
          expect(md).toContain("# SOUL (Sulking Mode)");
          expect(md).toContain("## Behavior Override");
          expect(md.length).toBeGreaterThan(100);
        }
      }
    });
  });
});
