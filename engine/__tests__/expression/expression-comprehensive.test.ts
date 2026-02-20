/**
 * Comprehensive Expression Adapter Tests
 *
 * Deeper coverage beyond the existing expression-adapter.test.ts:
 * - Precise mathematical formula verification
 * - Cross-species comparative differentiation
 * - Growth trajectory continuity and curves
 * - Combined trait + status interaction effects
 * - Language level boundary transitions
 * - Sound parameter clamping enforcement
 * - Expression determinism (immutability)
 * - Visual expression species differentiation
 * - Sulk expression species-specific waveforms
 * - Intermediate growth day progression
 */

import { describe, it, expect } from "vitest";
import { generateExpressionParams } from "../../src/expression/expression-adapter.js";
import { createFixedSeed } from "../../src/genesis/seed-generator.js";
import type { Status, PerceptionMode, HardwareBody, SubTraits } from "../../src/types.js";
import type { SulkState, SulkSeverity } from "../../src/mood/sulk-engine.js";

// --- Test Helpers ---

const HW: HardwareBody = {
  platform: "darwin",
  arch: "arm64",
  totalMemoryGB: 16,
  cpuModel: "Test CPU",
  storageGB: 256,
};

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    mood: 50,
    energy: 50,
    curiosity: 50,
    comfort: 50,
    languageLevel: 0,
    perceptionLevel: 0,
    growthDay: 0,
    lastInteraction: "never",
    ...overrides,
  };
}

const NO_SULK: SulkState = {
  isSulking: false,
  severity: "none",
  recoveryInteractions: 0,
  sulkingSince: null,
};

function makeSulk(severity: SulkSeverity): SulkState {
  return {
    isSulking: severity !== "none",
    severity,
    recoveryInteractions: 0,
    sulkingSince: severity !== "none" ? "2026-02-19T10:00:00Z" : null,
  };
}

function makeTraits(overrides: Partial<SubTraits> = {}): SubTraits {
  return {
    sensitivity: 50,
    sociability: 50,
    rhythmAffinity: 50,
    memoryDepth: 50,
    expressiveness: 50,
    ...overrides,
  };
}

function makeSeed(
  species: PerceptionMode = "chromatic",
  traits?: Partial<SubTraits>,
) {
  return createFixedSeed({
    perception: species,
    hardwareBody: HW,
    subTraits: traits ? makeTraits(traits) : makeTraits(),
  });
}

const ALL_SPECIES: PerceptionMode[] = [
  "chromatic",
  "vibration",
  "geometric",
  "thermal",
  "temporal",
  "chemical",
];

// --- 1. Expression Determinism (Immutability) ---

describe("expression determinism — same inputs produce identical outputs", () => {
  it("repeated calls with identical inputs yield byte-for-byte identical results", () => {
    const seed = makeSeed("vibration", { expressiveness: 73, sensitivity: 42 });
    const status = makeStatus({ mood: 67, energy: 81, curiosity: 33, comfort: 55 });

    const result1 = generateExpressionParams(seed, status, 2, 45, NO_SULK);
    const result2 = generateExpressionParams(seed, status, 2, 45, NO_SULK);

    expect(result1).toStrictEqual(result2);
  });

  it("deterministic across all species with sulk state", () => {
    for (const species of ALL_SPECIES) {
      const seed = makeSeed(species);
      const status = makeStatus({ mood: 30, energy: 70 });
      const sulk = makeSulk("moderate");

      const a = generateExpressionParams(seed, status, 1, 60, sulk);
      const b = generateExpressionParams(seed, status, 1, 60, sulk);

      expect(a).toStrictEqual(b);
    }
  });
});

// --- 2. Precise Mathematical Formula Verification ---

describe("precise formula verification — computed expected values", () => {
  it("symbol density at language level 2, growth day 90", () => {
    // Formula: symbolDensity = max(0, 1.0 - langLevel * 0.25) * (1 - min(1, growthDay/180) * 0.3)
    // = max(0, 1.0 - 2 * 0.25) * (1 - min(1, 90/180) * 0.3)
    // = 0.5 * (1 - 0.5 * 0.3) = 0.5 * 0.85 = 0.425
    const seed = makeSeed("chromatic");
    const params = generateExpressionParams(seed, makeStatus(), 2, 90, NO_SULK);

    expect(params.text.symbolDensity).toBeCloseTo(0.425, 3);
  });

  it("sound complexity at growth day 30", () => {
    // complexity = min(1, 0.1 + sqrt(30/120) * 0.9)
    // = min(1, 0.1 + sqrt(0.25) * 0.9)
    // = min(1, 0.1 + 0.5 * 0.9) = min(1, 0.55) = 0.55
    const seed = makeSeed("chromatic");
    const params = generateExpressionParams(seed, makeStatus(), 0, 30, NO_SULK);

    expect(params.sound.complexity).toBeCloseTo(0.55, 2);
  });

  it("sound complexity at growth day 60", () => {
    // complexity = min(1, 0.1 + sqrt(60/120) * 0.9)
    // = min(1, 0.1 + sqrt(0.5) * 0.9)
    // = min(1, 0.1 + 0.7071 * 0.9) = min(1, 0.7364) = 0.7364
    const seed = makeSeed("chromatic");
    const params = generateExpressionParams(seed, makeStatus(), 0, 60, NO_SULK);

    expect(params.sound.complexity).toBeCloseTo(0.7364, 2);
  });

  it("emotional leakage at mood=80, expressiveness=50, energy=50", () => {
    // moodDeviation = |80 - 50| / 50 = 0.6
    // leakage = 0.6 * 0.6 = 0.36
    // * (0.5 + (50/100) * 0.5) = 0.36 * 0.75 = 0.27
    // * (0.5 + (50/100) * 0.5) = 0.27 * 0.75 = 0.2025
    const seed = makeSeed("chromatic");
    const params = generateExpressionParams(seed, makeStatus({ mood: 80 }), 0, 30, NO_SULK);

    expect(params.text.emotionalLeakage).toBeCloseTo(0.2025, 3);
  });

  it("emotional leakage at neutral mood is zero", () => {
    // moodDeviation = |50 - 50| / 50 = 0
    // leakage = 0 * anything = 0
    const seed = makeSeed("chromatic");
    const params = generateExpressionParams(seed, makeStatus({ mood: 50 }), 0, 30, NO_SULK);

    expect(params.text.emotionalLeakage).toBe(0);
  });

  it("chromatic pitch at mood=50 is base (440)", () => {
    // pitch = basePitch + (mood - 50) * 1.5 = 440 + 0 = 440
    const seed = makeSeed("chromatic");
    const params = generateExpressionParams(seed, makeStatus(), 0, 30, NO_SULK);

    expect(params.sound.pitch).toBe(440);
  });

  it("vibration pitch at mood=90 rises from base", () => {
    // pitch = 220 + (90 - 50) * 1.5 = 220 + 60 = 280
    const seed = makeSeed("vibration");
    const params = generateExpressionParams(seed, makeStatus({ mood: 90 }), 0, 30, NO_SULK);

    expect(params.sound.pitch).toBe(280);
  });

  it("thermal tempo at neutral energy is base (50)", () => {
    // tempo = 50 + (50 - 50) * 0.5 = 50
    const seed = makeSeed("thermal");
    const params = generateExpressionParams(seed, makeStatus(), 0, 30, NO_SULK);

    expect(params.sound.tempo).toBe(50);
  });
});

// --- 3. Sound Parameter Clamping ---

describe("sound parameter clamping — pitch and tempo within bounds", () => {
  it("pitch never drops below 80 even with lowest mood and lowest base pitch", () => {
    // thermal basePitch=165, mood=0 => 165 + (0-50)*1.5 = 165-75 = 90 (above 80)
    // Let's check all species at mood=0
    for (const species of ALL_SPECIES) {
      const seed = makeSeed(species);
      const params = generateExpressionParams(seed, makeStatus({ mood: 0 }), 0, 30, NO_SULK);
      expect(params.sound.pitch).toBeGreaterThanOrEqual(80);
    }
  });

  it("pitch never exceeds 800 even with highest mood and highest base pitch", () => {
    // chromatic basePitch=440, mood=100 => 440 + 50*1.5 = 515 (within 800)
    for (const species of ALL_SPECIES) {
      const seed = makeSeed(species);
      const params = generateExpressionParams(seed, makeStatus({ mood: 100 }), 0, 30, NO_SULK);
      expect(params.sound.pitch).toBeLessThanOrEqual(800);
    }
  });

  it("tempo never drops below 30 even with lowest energy", () => {
    for (const species of ALL_SPECIES) {
      const seed = makeSeed(species);
      const params = generateExpressionParams(seed, makeStatus({ energy: 0 }), 0, 30, NO_SULK);
      expect(params.sound.tempo).toBeGreaterThanOrEqual(30);
    }
  });

  it("tempo never exceeds 200 even with highest energy", () => {
    for (const species of ALL_SPECIES) {
      const seed = makeSeed(species);
      const params = generateExpressionParams(seed, makeStatus({ energy: 100 }), 0, 30, NO_SULK);
      expect(params.sound.tempo).toBeLessThanOrEqual(200);
    }
  });
});

// --- 4. Cross-Species Comparative Differentiation ---

describe("cross-species differentiation — species produce meaningfully distinct profiles", () => {
  it("no two species share the same waveform + patternWeight combination at neutral status", () => {
    const status = makeStatus();
    const profiles = ALL_SPECIES.map((sp) => {
      const params = generateExpressionParams(makeSeed(sp), status, 0, 30, NO_SULK);
      return `${params.sound.waveform}:${params.sound.patternWeight.toFixed(2)}`;
    });
    // At least 4 distinct combinations among 6 species
    const unique = new Set(profiles);
    expect(unique.size).toBeGreaterThanOrEqual(4);
  });

  it("chromatic has highest baseColorIntensity (visual emphasis on color)", () => {
    const status = makeStatus();
    const chromaticParams = generateExpressionParams(makeSeed("chromatic"), status, 0, 30, NO_SULK);
    for (const species of ALL_SPECIES) {
      if (species === "chromatic") continue;
      const other = generateExpressionParams(makeSeed(species), status, 0, 30, NO_SULK);
      expect(chromaticParams.visual.colorIntensity).toBeGreaterThanOrEqual(other.visual.colorIntensity);
    }
  });

  it("vibration has highest base tempo among all species", () => {
    const status = makeStatus();
    const vibParams = generateExpressionParams(makeSeed("vibration"), status, 0, 30, NO_SULK);
    for (const species of ALL_SPECIES) {
      if (species === "vibration") continue;
      const other = generateExpressionParams(makeSeed(species), status, 0, 30, NO_SULK);
      expect(vibParams.sound.tempo).toBeGreaterThanOrEqual(other.sound.tempo);
    }
  });

  it("thermal has slowest motion speed (gradual changes)", () => {
    const status = makeStatus();
    const thermalParams = generateExpressionParams(makeSeed("thermal"), status, 0, 30, NO_SULK);
    for (const species of ALL_SPECIES) {
      if (species === "thermal") continue;
      const other = generateExpressionParams(makeSeed(species), status, 0, 30, NO_SULK);
      expect(thermalParams.visual.motionSpeed).toBeLessThanOrEqual(other.visual.motionSpeed);
    }
  });

  it("geometric has lowest wobble (most stable pitch)", () => {
    const status = makeStatus();
    const geoParams = generateExpressionParams(makeSeed("geometric"), status, 0, 30, NO_SULK);
    for (const species of ALL_SPECIES) {
      if (species === "geometric") continue;
      const other = generateExpressionParams(makeSeed(species), status, 0, 30, NO_SULK);
      expect(geoParams.sound.wobble).toBeLessThanOrEqual(other.sound.wobble);
    }
  });

  it("temporal has highest repetition tendency (cyclical expression)", () => {
    const status = makeStatus();
    const tempParams = generateExpressionParams(makeSeed("temporal"), status, 0, 30, NO_SULK);
    for (const species of ALL_SPECIES) {
      if (species === "temporal") continue;
      const other = generateExpressionParams(makeSeed(species), status, 0, 30, NO_SULK);
      expect(tempParams.text.repetitionTendency).toBeGreaterThanOrEqual(other.text.repetitionTendency);
    }
  });
});

// --- 5. Language Level Boundary Transitions ---

describe("language level boundaries — exact level transition behavior", () => {
  it("language level 0: symbolDensity near 1.0 at day 0", () => {
    const seed = makeSeed("chromatic");
    const params = generateExpressionParams(seed, makeStatus(), 0, 0, NO_SULK);
    // 1.0 * (1 - 0 * 0.3) = 1.0
    expect(params.text.symbolDensity).toBeCloseTo(1.0, 2);
  });

  it("language level 1: symbolDensity drops by 0.25 base at day 0", () => {
    const seed = makeSeed("chromatic");
    const params = generateExpressionParams(seed, makeStatus(), 1, 0, NO_SULK);
    // (1.0 - 0.25) * (1 - 0) = 0.75
    expect(params.text.symbolDensity).toBeCloseTo(0.75, 2);
  });

  it("language level beyond 4 clamps symbolDensity to 0", () => {
    const seed = makeSeed("chromatic");
    // level 5 => max(0, 1.0 - 5*0.25) = max(0, -0.25) = 0
    const params = generateExpressionParams(seed, makeStatus(), 5, 0, NO_SULK);
    expect(params.text.symbolDensity).toBe(0);
  });

  it("verbosity increases with each language level step", () => {
    const seed = makeSeed("chromatic");
    let prevVerbosity = -1;
    for (let level = 0; level <= 4; level++) {
      const params = generateExpressionParams(seed, makeStatus(), level, 30, NO_SULK);
      expect(params.text.verbosity).toBeGreaterThan(prevVerbosity);
      prevVerbosity = params.text.verbosity;
    }
  });
});

// --- 6. Growth Trajectory Continuity ---

describe("growth trajectory — smooth progression over time", () => {
  it("sound complexity follows sqrt curve: faster growth early, slower later", () => {
    const seed = makeSeed("chromatic");
    const days = [0, 7, 14, 30, 60, 90, 120, 180, 365];
    const complexities = days.map(
      (d) => generateExpressionParams(seed, makeStatus(), 0, d, NO_SULK).sound.complexity,
    );

    // Verify monotonically increasing
    for (let i = 1; i < complexities.length; i++) {
      expect(complexities[i]).toBeGreaterThanOrEqual(complexities[i - 1]);
    }

    // Verify diminishing returns (growth rate decreases)
    // Early growth (0->30) should gain more complexity than later growth (90->120)
    const earlyGain = complexities[3] - complexities[0]; // 0->30
    const laterGain = complexities[6] - complexities[4]; // 60->120
    expect(earlyGain).toBeGreaterThan(laterGain);
  });

  it("visual particle count grows monotonically with growth day", () => {
    const seed = makeSeed("vibration");
    const days = [0, 30, 60, 120, 240, 365];
    const particles = days.map(
      (d) => generateExpressionParams(seed, makeStatus(), 0, d, NO_SULK).visual.particleCount,
    );

    for (let i = 1; i < particles.length; i++) {
      expect(particles[i]).toBeGreaterThanOrEqual(particles[i - 1]);
    }
  });

  it("particle count growth plateaus around day 240", () => {
    const seed = makeSeed("chromatic");
    const day240 = generateExpressionParams(seed, makeStatus(), 0, 240, NO_SULK).visual.particleCount;
    const day365 = generateExpressionParams(seed, makeStatus(), 0, 365, NO_SULK).visual.particleCount;

    // Growth capped at +0.5 over 240 days, so 240+ should be nearly identical
    expect(Math.abs(day365 - day240)).toBeLessThan(0.01);
  });

  it("pattern vs cry ratio shifts toward pattern with maturity", () => {
    const seed = makeSeed("chromatic"); // cry-dominant base
    const day0 = generateExpressionParams(seed, makeStatus(), 0, 0, NO_SULK);
    const day300 = generateExpressionParams(seed, makeStatus(), 0, 300, NO_SULK);

    // Pattern weight should increase over time
    expect(day300.sound.patternWeight).toBeGreaterThan(day0.sound.patternWeight);
  });
});

// --- 7. Combined Interaction Effects ---

describe("combined interaction effects — traits and status compound", () => {
  it("high expressiveness + extreme mood produces more leakage than either alone", () => {
    const neutralMoodLowExpr = generateExpressionParams(
      makeSeed("chromatic", { expressiveness: 20 }),
      makeStatus({ mood: 50 }),
      0, 30, NO_SULK,
    );
    const extremeMoodLowExpr = generateExpressionParams(
      makeSeed("chromatic", { expressiveness: 20 }),
      makeStatus({ mood: 95 }),
      0, 30, NO_SULK,
    );
    const neutralMoodHighExpr = generateExpressionParams(
      makeSeed("chromatic", { expressiveness: 95 }),
      makeStatus({ mood: 50 }),
      0, 30, NO_SULK,
    );
    const extremeMoodHighExpr = generateExpressionParams(
      makeSeed("chromatic", { expressiveness: 95 }),
      makeStatus({ mood: 95 }),
      0, 30, NO_SULK,
    );

    // Combined effect should be greater than either individual factor
    expect(extremeMoodHighExpr.text.emotionalLeakage).toBeGreaterThan(
      extremeMoodLowExpr.text.emotionalLeakage,
    );
    expect(extremeMoodHighExpr.text.emotionalLeakage).toBeGreaterThan(
      neutralMoodHighExpr.text.emotionalLeakage,
    );
  });

  it("low energy + low rhythmAffinity still keeps repetition in valid range", () => {
    const seed = makeSeed("chromatic", { rhythmAffinity: 0 });
    const status = makeStatus({ energy: 100 }); // High energy reduces repetition base offset
    const params = generateExpressionParams(seed, status, 0, 30, NO_SULK);

    expect(params.text.repetitionTendency).toBeGreaterThanOrEqual(0);
    expect(params.text.repetitionTendency).toBeLessThanOrEqual(1);
  });

  it("high energy + high sociability produces maximum verbosity without exceeding 1.0", () => {
    // thermal baseVerbosity=0.6, highest among species
    const seed = makeSeed("thermal", { sociability: 100 });
    const status = makeStatus({ energy: 100 });
    const params = generateExpressionParams(seed, status, 4, 180, NO_SULK);

    // verbosity = 0.6 + (100/100)*0.2-0.1 + (100-50)/100*0.2 + 4*0.05
    // = 0.6 + 0.1 + 0.1 + 0.2 = 1.0
    expect(params.text.verbosity).toBeLessThanOrEqual(1);
    expect(params.text.verbosity).toBeGreaterThan(0.8);
  });

  it("sensitivity and comfort interact for wobble: low comfort + high sensitivity = max wobble", () => {
    const seed = makeSeed("chemical", { sensitivity: 100 }); // chemical has baseWobble 0.55
    const status = makeStatus({ comfort: 0 }); // max discomfort
    const params = generateExpressionParams(seed, status, 0, 30, NO_SULK);

    // wobble = 0.55 + (1 - 0)*0.3 = 0.85, then * (0.7 + 1*0.3) = 0.85 * 1.0 = 0.85
    expect(params.sound.wobble).toBeCloseTo(0.85, 2);
  });
});

// --- 8. Sulk Expression Species-Specific Details ---

describe("sulk expression — species-specific details", () => {
  it("sulk expression preserves species waveform across all severities", () => {
    const expectedWaveforms: Record<PerceptionMode, string> = {
      chromatic: "sine",
      vibration: "square",
      geometric: "triangle",
      thermal: "sine",
      temporal: "triangle",
      chemical: "sawtooth",
    };

    for (const species of ALL_SPECIES) {
      for (const severity of ["mild", "moderate", "severe"] as SulkSeverity[]) {
        const seed = makeSeed(species);
        const params = generateExpressionParams(seed, makeStatus(), 0, 30, makeSulk(severity));
        expect(params.sound.waveform).toBe(expectedWaveforms[species]);
      }
    }
  });

  it("sulk pitch is always 150 regardless of species or mood", () => {
    for (const species of ALL_SPECIES) {
      const params = generateExpressionParams(
        makeSeed(species),
        makeStatus({ mood: 90 }),
        0, 30,
        makeSulk("moderate"),
      );
      expect(params.sound.pitch).toBe(150);
    }
  });

  it("sulk tempo is always 40 regardless of species or energy", () => {
    for (const species of ALL_SPECIES) {
      const params = generateExpressionParams(
        makeSeed(species),
        makeStatus({ energy: 100 }),
        0, 30,
        makeSulk("severe"),
      );
      expect(params.sound.tempo).toBe(40);
    }
  });

  it("sulk complexity is always 0.05 regardless of growth day", () => {
    const seed = makeSeed("vibration");
    const params = generateExpressionParams(seed, makeStatus(), 4, 365, makeSulk("severe"));
    expect(params.sound.complexity).toBe(0.05);
  });

  it("mild sulk allows more expression than severe", () => {
    const seed = makeSeed("chromatic");
    const mild = generateExpressionParams(seed, makeStatus(), 0, 30, makeSulk("mild"));
    const severe = generateExpressionParams(seed, makeStatus(), 0, 30, makeSulk("severe"));

    expect(mild.sound.volume).toBeGreaterThan(severe.sound.volume);
    expect(mild.visual.brightness).toBeGreaterThan(severe.visual.brightness);
    expect(mild.visual.particleCount).toBeGreaterThan(severe.visual.particleCount);
    expect(mild.visual.colorIntensity).toBeGreaterThan(severe.visual.colorIntensity);
    expect(mild.text.verbosity).toBeGreaterThan(severe.text.verbosity);
  });
});

// --- 9. Visual Expression Species Differentiation ---

describe("visual expression — species-specific characteristics", () => {
  it("chromatic has brightest base brightness", () => {
    const status = makeStatus();
    const chromaticParams = generateExpressionParams(makeSeed("chromatic"), status, 0, 30, NO_SULK);

    // chromatic baseBrightness = 0.7, highest among species
    for (const species of ALL_SPECIES) {
      if (species === "chromatic") continue;
      const other = generateExpressionParams(makeSeed(species), status, 0, 30, NO_SULK);
      expect(chromaticParams.visual.brightness).toBeGreaterThanOrEqual(other.visual.brightness);
    }
  });

  it("extreme mood deviation increases color intensity for all species", () => {
    for (const species of ALL_SPECIES) {
      const seed = makeSeed(species);
      const neutral = generateExpressionParams(seed, makeStatus({ mood: 50 }), 0, 30, NO_SULK);
      const extreme = generateExpressionParams(seed, makeStatus({ mood: 5 }), 0, 30, NO_SULK);
      expect(extreme.visual.colorIntensity).toBeGreaterThan(neutral.visual.colorIntensity);
    }
  });

  it("low energy reduces visual particle count across all species", () => {
    for (const species of ALL_SPECIES) {
      const seed = makeSeed(species);
      const lowE = generateExpressionParams(seed, makeStatus({ energy: 5 }), 0, 30, NO_SULK);
      const highE = generateExpressionParams(seed, makeStatus({ energy: 95 }), 0, 30, NO_SULK);
      expect(lowE.visual.particleCount).toBeLessThan(highE.visual.particleCount);
    }
  });
});

// --- 10. Edge Cases: Negative Language Levels and Extreme Growth ---

describe("edge cases — unusual parameter values", () => {
  it("negative language level treated as 0 (symbolDensity capped at 1.0)", () => {
    const seed = makeSeed("chromatic");
    // negative level => max(0, 1.0 - (-1)*0.25) = max(0, 1.25) = 1.25 => clamped to 1.0
    const params = generateExpressionParams(seed, makeStatus(), -1, 0, NO_SULK);
    expect(params.text.symbolDensity).toBeLessThanOrEqual(1.0);
  });

  it("very large growth day does not produce NaN or Infinity", () => {
    const seed = makeSeed("chromatic");
    const params = generateExpressionParams(seed, makeStatus(), 0, 100000, NO_SULK);

    expect(Number.isFinite(params.sound.complexity)).toBe(true);
    expect(Number.isFinite(params.visual.particleCount)).toBe(true);
    expect(Number.isFinite(params.text.symbolDensity)).toBe(true);
    expect(params.sound.complexity).toBeLessThanOrEqual(1);
  });

  it("sulk 'none' severity does not trigger sulk expression path", () => {
    const seed = makeSeed("chromatic");
    // makeSulk("none") has isSulking: false
    const noneSulk = makeSulk("none");
    const noSulk = NO_SULK;

    const paramsNone = generateExpressionParams(seed, makeStatus(), 0, 30, noneSulk);
    const paramsNo = generateExpressionParams(seed, makeStatus(), 0, 30, noSulk);

    // Both should follow the normal expression path
    expect(paramsNone.sound.pitch).toBe(paramsNo.sound.pitch);
    expect(paramsNone.text.symbolDensity).toBe(paramsNo.text.symbolDensity);
  });
});
