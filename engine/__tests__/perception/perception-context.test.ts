import { describe, it, expect } from "vitest";
import { buildPerceptionContext } from "../../src/perception/perception-context.js";
import type { FilteredPerception } from "../../src/perception/perception-types.js";
import type { PerceptionMode } from "../../src/types.js";

const ALL_SPECIES: PerceptionMode[] = [
  "chromatic", "vibration", "geometric", "thermal", "temporal", "chemical",
];

describe("buildPerceptionContext", () => {
  it("returns species-specific empty context when no perceptions", () => {
    for (const species of ALL_SPECIES) {
      const ctx = buildPerceptionContext(species, []);
      expect(ctx).toContain("What You Perceive Right Now");
      expect(ctx.length).toBeGreaterThan(20);
    }
  });

  it("chromatic empty context mentions darkness", () => {
    const ctx = buildPerceptionContext("chromatic", []);
    expect(ctx).toContain("Darkness");
  });

  it("vibration empty context mentions stillness", () => {
    const ctx = buildPerceptionContext("vibration", []);
    expect(ctx).toContain("Stillness");
  });

  it("includes perceptions as list items", () => {
    const perceptions: FilteredPerception[] = [
      { description: "11 marks", sourceModality: "text" },
      { description: "warm (bright)", sourceModality: "image" },
    ];

    const ctx = buildPerceptionContext("chromatic", perceptions);
    expect(ctx).toContain("- 11 marks");
    expect(ctx).toContain("- warm (bright)");
  });

  it("includes species-specific prelude", () => {
    const perceptions: FilteredPerception[] = [
      { description: "tremor", sourceModality: "vibration" },
    ];

    const ctx = buildPerceptionContext("vibration", perceptions);
    expect(ctx).toContain("vibration and rhythm");
  });

  it("includes boundary statement", () => {
    const perceptions: FilteredPerception[] = [
      { description: "something", sourceModality: "text" },
    ];

    const ctx = buildPerceptionContext("chromatic", perceptions);
    expect(ctx).toContain("cannot perceive anything beyond");
  });

  it("each species has unique empty context", () => {
    const contexts = ALL_SPECIES.map(s => buildPerceptionContext(s, []));
    const unique = new Set(contexts);
    expect(unique.size).toBe(6);
  });
});
