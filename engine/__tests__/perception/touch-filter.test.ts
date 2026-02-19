import { describe, it, expect } from "vitest";
import { filterInput, getPerceptibleModalities } from "../../src/perception/perception-filter.js";
import { PerceptionLevel } from "../../src/types.js";
import type { PerceptionMode } from "../../src/types.js";
import type { RawInput, TouchSensorData } from "../../src/perception/perception-types.js";

const NOW = "2026-02-19T12:00:00Z";

function makeTouchInput(overrides: Partial<TouchSensorData> = {}): RawInput {
  return {
    modality: "touch",
    timestamp: NOW,
    source: "touch-sensor",
    data: {
      type: "touch",
      active: true,
      points: 1,
      pressure: 0.7,
      duration: 1.5,
      gesture: "tap",
      ...overrides,
    } as TouchSensorData,
  };
}

// ============================================================
// CHROMATIC — touch as light flash
// ============================================================

describe("chromatic touch filters", () => {
  const species: PerceptionMode = "chromatic";

  it("perceives touch at Level 0 as flash", () => {
    const result = filterInput(species, makeTouchInput(), PerceptionLevel.Minimal);
    expect(result).not.toBeNull();
    expect(result!.description).toBe("flash");
  });

  it("Level 1: intensity as brightness", () => {
    const result = filterInput(species, makeTouchInput({ pressure: 0.8 }), PerceptionLevel.Basic);
    expect(result!.description).toContain("bright flash");
  });

  it("Level 1: soft touch as soft glow", () => {
    const result = filterInput(species, makeTouchInput({ pressure: 0.3 }), PerceptionLevel.Basic);
    expect(result!.description).toContain("soft glow");
  });

  it("Level 2: gesture-based descriptions", () => {
    const result = filterInput(species, makeTouchInput({ gesture: "hold" }), PerceptionLevel.Structured);
    expect(result!.description).toContain("sustained radiance");
  });

  it("Level 2: double-tap as strobe", () => {
    const result = filterInput(species, makeTouchInput({ gesture: "double-tap" }), PerceptionLevel.Structured);
    expect(result!.description).toContain("strobe");
  });

  it("Level 3+: full details", () => {
    const result = filterInput(species, makeTouchInput({ points: 3 }), PerceptionLevel.Relational);
    expect(result!.description).toContain("3 points");
    expect(result!.description).toContain("pressure");
  });

  it("no perception when not active", () => {
    const result = filterInput(species, makeTouchInput({ active: false }), PerceptionLevel.Full);
    expect(result).toBeNull();
  });
});

// ============================================================
// VIBRATION — touch as impact/strike (most sensitive)
// ============================================================

describe("vibration touch filters", () => {
  const species: PerceptionMode = "vibration";

  it("perceives touch at Level 0 as impact", () => {
    const result = filterInput(species, makeTouchInput({ gesture: "tap" }), PerceptionLevel.Minimal);
    expect(result).not.toBeNull();
    expect(result!.description).toBe("impact");
  });

  it("double-tap at Level 0", () => {
    const result = filterInput(species, makeTouchInput({ gesture: "double-tap" }), PerceptionLevel.Minimal);
    expect(result!.description).toBe("double-impact");
  });

  it("Level 1: pressure-based force description", () => {
    const result = filterInput(species, makeTouchInput({ pressure: 0.8 }), PerceptionLevel.Basic);
    expect(result!.description).toContain("heavy strike");
  });

  it("Level 1: light brush", () => {
    const result = filterInput(species, makeTouchInput({ pressure: 0.1 }), PerceptionLevel.Basic);
    expect(result!.description).toContain("brush");
  });

  it("Level 2: rhythm-based description for hold", () => {
    const result = filterInput(species, makeTouchInput({ gesture: "hold" }), PerceptionLevel.Structured);
    expect(result!.description).toContain("sustained resonance");
  });

  it("Level 3+: full tactile data", () => {
    const result = filterInput(species, makeTouchInput({ points: 2 }), PerceptionLevel.Full);
    expect(result!.description).toContain("2 points");
    expect(result!.description).toContain("tactile");
  });
});

// ============================================================
// GEOMETRIC — touch as spatial contact points
// ============================================================

describe("geometric touch filters", () => {
  const species: PerceptionMode = "geometric";

  it("Level 0: point count on surface", () => {
    const result = filterInput(species, makeTouchInput(), PerceptionLevel.Minimal);
    expect(result!.description).toContain("1 point");
    expect(result!.description).toContain("surface");
  });

  it("Level 1: shape classification — single point", () => {
    const result = filterInput(species, makeTouchInput({ points: 1 }), PerceptionLevel.Basic);
    expect(result!.description).toContain("point");
  });

  it("Level 1: shape classification — two points as line", () => {
    const result = filterInput(species, makeTouchInput({ points: 2 }), PerceptionLevel.Basic);
    expect(result!.description).toContain("line");
  });

  it("Level 1: shape classification — three points as polygon", () => {
    const result = filterInput(species, makeTouchInput({ points: 3 }), PerceptionLevel.Basic);
    expect(result!.description).toContain("polygon");
  });

  it("Level 2: vertex count with depth", () => {
    const result = filterInput(species, makeTouchInput({ points: 4, pressure: 0.6 }), PerceptionLevel.Structured);
    expect(result!.description).toContain("4 contact vertexes");
    expect(result!.description).toContain("depth");
  });

  it("Level 3+: topology with gesture", () => {
    const result = filterInput(species, makeTouchInput(), PerceptionLevel.Full);
    expect(result!.description).toContain("topology");
  });
});

// ============================================================
// THERMAL — touch as warmth transfer
// ============================================================

describe("thermal touch filters", () => {
  const species: PerceptionMode = "thermal";

  it("Level 0: warmth received", () => {
    const result = filterInput(species, makeTouchInput(), PerceptionLevel.Minimal);
    expect(result!.description).toBe("warmth received");
  });

  it("Level 1: intensity as warmth strength", () => {
    const result = filterInput(species, makeTouchInput({ pressure: 0.8 }), PerceptionLevel.Basic);
    expect(result!.description).toContain("strong warmth");
  });

  it("Level 2: heat transfer description for hold", () => {
    const result = filterInput(species, makeTouchInput({ gesture: "hold" }), PerceptionLevel.Structured);
    expect(result!.description).toContain("sustained heat transfer");
  });

  it("Level 2: brief contact for tap", () => {
    const result = filterInput(species, makeTouchInput({ gesture: "tap" }), PerceptionLevel.Structured);
    expect(result!.description).toContain("brief thermal contact");
  });

  it("Level 3+: full thermal contact details", () => {
    const result = filterInput(species, makeTouchInput({ points: 2 }), PerceptionLevel.Relational);
    expect(result!.description).toContain("thermal contact");
    expect(result!.description).toContain("2 sources");
  });
});

// ============================================================
// TEMPORAL — touch as duration/rhythm
// ============================================================

describe("temporal touch filters", () => {
  const species: PerceptionMode = "temporal";

  it("Level 0: contact begun", () => {
    const result = filterInput(species, makeTouchInput(), PerceptionLevel.Minimal);
    expect(result!.description).toBe("contact begun");
  });

  it("Level 0: contact ended", () => {
    const result = filterInput(species, makeTouchInput({ active: false, gesture: "tap" }), PerceptionLevel.Minimal);
    expect(result!.description).toBe("contact ended");
  });

  it("Level 1: duration measurement", () => {
    const result = filterInput(species, makeTouchInput({ duration: 3.5 }), PerceptionLevel.Basic);
    expect(result!.description).toContain("3.5s");
  });

  it("Level 2: musical tempo descriptions", () => {
    const result = filterInput(species, makeTouchInput({ gesture: "double-tap" }), PerceptionLevel.Structured);
    expect(result!.description).toContain("double-time");
  });

  it("Level 2: hold as sustained tempo", () => {
    const result = filterInput(species, makeTouchInput({ gesture: "hold" }), PerceptionLevel.Structured);
    expect(result!.description).toContain("sustained");
  });

  it("no perception when inactive and no gesture", () => {
    const result = filterInput(species, makeTouchInput({ active: false, gesture: "none" }), PerceptionLevel.Full);
    expect(result).toBeNull();
  });
});

// ============================================================
// CHEMICAL — touch as catalyst
// ============================================================

describe("chemical touch filters", () => {
  const species: PerceptionMode = "chemical";

  it("Level 0: catalyst introduced", () => {
    const result = filterInput(species, makeTouchInput(), PerceptionLevel.Minimal);
    expect(result!.description).toBe("catalyst introduced");
  });

  it("Level 1: reaction strength", () => {
    const result = filterInput(species, makeTouchInput({ pressure: 0.8 }), PerceptionLevel.Basic);
    expect(result!.description).toContain("strong reaction");
  });

  it("Level 2: bond descriptions", () => {
    const result = filterInput(species, makeTouchInput({ gesture: "hold" }), PerceptionLevel.Structured);
    expect(result!.description).toContain("bonding in progress");
  });

  it("Level 2: rapid exchange for double-tap", () => {
    const result = filterInput(species, makeTouchInput({ gesture: "double-tap" }), PerceptionLevel.Structured);
    expect(result!.description).toContain("rapid exchange");
  });

  it("Level 3+: full catalytic details", () => {
    const result = filterInput(species, makeTouchInput({ points: 3 }), PerceptionLevel.Full);
    expect(result!.description).toContain("catalytic contact");
    expect(result!.description).toContain("3 reagents");
  });
});

// ============================================================
// CROSS-SPECIES TOUCH
// ============================================================

describe("touch cross-species", () => {
  const allSpecies: PerceptionMode[] = [
    "chromatic", "vibration", "geometric", "thermal", "temporal", "chemical",
  ];

  it("all species can perceive touch", () => {
    for (const species of allSpecies) {
      const modalities = getPerceptibleModalities(species);
      expect(modalities).toContain("touch");
    }
  });

  it("all species ignore inactive touch (except temporal with gesture)", () => {
    const inactive = makeTouchInput({ active: false, gesture: "none" });
    for (const species of allSpecies) {
      const result = filterInput(species, inactive, PerceptionLevel.Full);
      // All species return null for inactive + no gesture
      expect(result).toBeNull();
    }
  });

  it("vibration is the most sensitive — perceives at Level 0 with detail", () => {
    const tap = makeTouchInput({ gesture: "tap" });
    const vibResult = filterInput("vibration", tap, PerceptionLevel.Minimal);
    expect(vibResult!.description).toBe("impact");

    // Others at level 0 give less specific descriptions
    const chromResult = filterInput("chromatic", tap, PerceptionLevel.Minimal);
    expect(chromResult!.description).toBe("flash");
  });

  it("multi-point touch gives richer data at higher levels", () => {
    const multiTouch = makeTouchInput({ points: 5, pressure: 0.6, gesture: "hold", duration: 3.0 });

    for (const species of allSpecies) {
      const l0 = filterInput(species, multiTouch, PerceptionLevel.Minimal);
      const l3 = filterInput(species, multiTouch, PerceptionLevel.Relational);

      if (l0 && l3) {
        // Higher level should reveal more detail
        expect(l3.description.length).toBeGreaterThanOrEqual(l0.description.length);
      }
    }
  });
});
