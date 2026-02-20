import { describe, it, expect } from "vitest";
import { generateExpressionParams } from "../../src/expression/expression-adapter.js";
import { createFixedSeed } from "../../src/genesis/seed-generator.js";
import type { Status, PerceptionMode, HardwareBody, SubTraits } from "../../src/types.js";
import type { SulkState, SulkSeverity } from "../../src/mood/sulk-engine.js";

// --- Test helpers ---

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
    subTraits: traits ? makeTraits(traits) : undefined,
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

// --- 1. Basic output structure ---

describe("generateExpressionParams — basic output structure", () => {
  it("returns all three channels (text, sound, visual)", () => {
    const params = generateExpressionParams(makeSeed(), makeStatus(), 0, 0, NO_SULK);

    expect(params).toHaveProperty("text");
    expect(params).toHaveProperty("sound");
    expect(params).toHaveProperty("visual");
  });

  it("text params have all required fields", () => {
    const params = generateExpressionParams(makeSeed(), makeStatus(), 0, 0, NO_SULK);

    expect(params.text).toHaveProperty("symbolDensity");
    expect(params.text).toHaveProperty("emotionalLeakage");
    expect(params.text).toHaveProperty("verbosity");
    expect(params.text).toHaveProperty("repetitionTendency");
  });

  it("sound params have all required fields", () => {
    const params = generateExpressionParams(makeSeed(), makeStatus(), 0, 0, NO_SULK);

    expect(params.sound).toHaveProperty("patternWeight");
    expect(params.sound).toHaveProperty("cryWeight");
    expect(params.sound).toHaveProperty("complexity");
    expect(params.sound).toHaveProperty("volume");
    expect(params.sound).toHaveProperty("tempo");
    expect(params.sound).toHaveProperty("pitch");
    expect(params.sound).toHaveProperty("waveform");
    expect(params.sound).toHaveProperty("wobble");
  });

  it("visual params have all required fields", () => {
    const params = generateExpressionParams(makeSeed(), makeStatus(), 0, 0, NO_SULK);

    expect(params.visual).toHaveProperty("brightness");
    expect(params.visual).toHaveProperty("particleCount");
    expect(params.visual).toHaveProperty("colorIntensity");
    expect(params.visual).toHaveProperty("motionSpeed");
  });

  it("all numeric values are finite numbers", () => {
    const params = generateExpressionParams(makeSeed(), makeStatus(), 0, 0, NO_SULK);

    for (const [, v] of Object.entries(params.text)) {
      expect(Number.isFinite(v)).toBe(true);
    }
    for (const [k, v] of Object.entries(params.sound)) {
      if (k === "waveform") continue;
      expect(Number.isFinite(v as number)).toBe(true);
    }
    for (const [, v] of Object.entries(params.visual)) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("every species produces valid output at neutral status", () => {
    for (const species of ALL_SPECIES) {
      const params = generateExpressionParams(
        makeSeed(species),
        makeStatus(),
        0,
        30,
        NO_SULK,
      );

      expect(params.text.symbolDensity).toBeGreaterThanOrEqual(0);
      expect(params.text.symbolDensity).toBeLessThanOrEqual(1);
      expect(params.sound.volume).toBeGreaterThanOrEqual(0);
      expect(params.sound.volume).toBeLessThanOrEqual(1);
      expect(params.visual.brightness).toBeGreaterThanOrEqual(0);
      expect(params.visual.brightness).toBeLessThanOrEqual(1);
      expect(["sine", "square", "triangle", "sawtooth"]).toContain(params.sound.waveform);
    }
  });
});

// --- 2. Status modulation ---

describe("generateExpressionParams — status modulation", () => {
  it("high mood raises pitch, low mood lowers pitch", () => {
    const seed = makeSeed();
    const low = generateExpressionParams(seed, makeStatus({ mood: 10 }), 0, 30, NO_SULK);
    const high = generateExpressionParams(seed, makeStatus({ mood: 90 }), 0, 30, NO_SULK);

    expect(high.sound.pitch).toBeGreaterThan(low.sound.pitch);
  });

  it("high mood raises brightness, low mood lowers brightness", () => {
    const seed = makeSeed();
    const low = generateExpressionParams(seed, makeStatus({ mood: 10 }), 0, 30, NO_SULK);
    const high = generateExpressionParams(seed, makeStatus({ mood: 90 }), 0, 30, NO_SULK);

    expect(high.visual.brightness).toBeGreaterThan(low.visual.brightness);
  });

  it("high energy increases tempo", () => {
    const seed = makeSeed();
    const low = generateExpressionParams(seed, makeStatus({ energy: 10 }), 0, 30, NO_SULK);
    const high = generateExpressionParams(seed, makeStatus({ energy: 90 }), 0, 30, NO_SULK);

    expect(high.sound.tempo).toBeGreaterThan(low.sound.tempo);
  });

  it("high energy increases particle count", () => {
    const seed = makeSeed();
    const low = generateExpressionParams(seed, makeStatus({ energy: 10 }), 0, 30, NO_SULK);
    const high = generateExpressionParams(seed, makeStatus({ energy: 90 }), 0, 30, NO_SULK);

    expect(high.visual.particleCount).toBeGreaterThan(low.visual.particleCount);
  });

  it("high energy increases volume", () => {
    const seed = makeSeed();
    const low = generateExpressionParams(seed, makeStatus({ energy: 10 }), 0, 30, NO_SULK);
    const high = generateExpressionParams(seed, makeStatus({ energy: 90 }), 0, 30, NO_SULK);

    expect(high.sound.volume).toBeGreaterThan(low.sound.volume);
  });

  it("low energy results in slower tempo and fewer particles", () => {
    const seed = makeSeed();
    const low = generateExpressionParams(seed, makeStatus({ energy: 5 }), 0, 30, NO_SULK);
    const mid = generateExpressionParams(seed, makeStatus({ energy: 50 }), 0, 30, NO_SULK);

    expect(low.sound.tempo).toBeLessThan(mid.sound.tempo);
    expect(low.visual.particleCount).toBeLessThan(mid.visual.particleCount);
  });

  it("high curiosity increases motion speed", () => {
    const seed = makeSeed();
    const low = generateExpressionParams(seed, makeStatus({ curiosity: 10 }), 0, 30, NO_SULK);
    const high = generateExpressionParams(seed, makeStatus({ curiosity: 90 }), 0, 30, NO_SULK);

    expect(high.visual.motionSpeed).toBeGreaterThan(low.visual.motionSpeed);
  });

  it("low comfort increases wobble (pitch instability)", () => {
    const seed = makeSeed();
    const comfy = generateExpressionParams(seed, makeStatus({ comfort: 90 }), 0, 30, NO_SULK);
    const uncomfy = generateExpressionParams(seed, makeStatus({ comfort: 10 }), 0, 30, NO_SULK);

    expect(uncomfy.sound.wobble).toBeGreaterThan(comfy.sound.wobble);
  });

  it("extreme mood deviations increase emotional leakage", () => {
    const seed = makeSeed();
    const neutral = generateExpressionParams(seed, makeStatus({ mood: 50 }), 0, 30, NO_SULK);
    const extreme = generateExpressionParams(seed, makeStatus({ mood: 5 }), 0, 30, NO_SULK);

    expect(extreme.text.emotionalLeakage).toBeGreaterThan(neutral.text.emotionalLeakage);
  });

  it("extreme mood (high) also increases emotional leakage compared to neutral", () => {
    const seed = makeSeed();
    const neutral = generateExpressionParams(seed, makeStatus({ mood: 50 }), 0, 30, NO_SULK);
    const highMood = generateExpressionParams(seed, makeStatus({ mood: 95 }), 0, 30, NO_SULK);

    expect(highMood.text.emotionalLeakage).toBeGreaterThan(neutral.text.emotionalLeakage);
  });
});

// --- 3. Growth effects ---

describe("generateExpressionParams — growth effects", () => {
  it("day 0: high symbol density", () => {
    const seed = makeSeed();
    const params = generateExpressionParams(seed, makeStatus(), 0, 0, NO_SULK);

    expect(params.text.symbolDensity).toBeGreaterThan(0.8);
  });

  it("day 120: lower symbol density than day 0 (same language level)", () => {
    const seed = makeSeed();
    const day0 = generateExpressionParams(seed, makeStatus(), 0, 0, NO_SULK);
    const day120 = generateExpressionParams(seed, makeStatus(), 0, 120, NO_SULK);

    expect(day120.text.symbolDensity).toBeLessThan(day0.text.symbolDensity);
  });

  it("language level 0: maximum symbol density (near 1.0)", () => {
    const seed = makeSeed();
    const params = generateExpressionParams(seed, makeStatus(), 0, 0, NO_SULK);

    // At lang 0, growth day 0, symbol density should be at or near 1.0
    expect(params.text.symbolDensity).toBeGreaterThanOrEqual(0.95);
  });

  it("language level 4: very low symbol density", () => {
    const seed = makeSeed();
    const params = generateExpressionParams(seed, makeStatus(), 4, 180, NO_SULK);

    expect(params.text.symbolDensity).toBeLessThan(0.1);
  });

  it("symbol density decreases monotonically with language level", () => {
    const seed = makeSeed();
    let prev = 2.0; // Higher than any possible value
    for (let lvl = 0; lvl <= 4; lvl++) {
      const params = generateExpressionParams(seed, makeStatus(), lvl, 30, NO_SULK);
      expect(params.text.symbolDensity).toBeLessThan(prev);
      prev = params.text.symbolDensity;
    }
  });

  it("sound complexity increases with growth day", () => {
    const seed = makeSeed();
    const day1 = generateExpressionParams(seed, makeStatus(), 0, 1, NO_SULK);
    const day60 = generateExpressionParams(seed, makeStatus(), 0, 60, NO_SULK);
    const day120 = generateExpressionParams(seed, makeStatus(), 0, 120, NO_SULK);

    expect(day60.sound.complexity).toBeGreaterThan(day1.sound.complexity);
    expect(day120.sound.complexity).toBeGreaterThan(day60.sound.complexity);
  });

  it("day 0: low sound complexity", () => {
    const seed = makeSeed();
    const params = generateExpressionParams(seed, makeStatus(), 0, 0, NO_SULK);

    // complexity = 0.1 + sqrt(0/120) * 0.9 = 0.1
    expect(params.sound.complexity).toBeCloseTo(0.1, 1);
  });

  it("visual particle count grows with maturity", () => {
    const seed = makeSeed();
    const young = generateExpressionParams(seed, makeStatus(), 0, 0, NO_SULK);
    const mature = generateExpressionParams(seed, makeStatus(), 0, 180, NO_SULK);

    expect(mature.visual.particleCount).toBeGreaterThan(young.visual.particleCount);
  });
});

// --- 4. Species profiles ---

describe("generateExpressionParams — species profiles", () => {
  it("chromatic: sine waveform", () => {
    const params = generateExpressionParams(makeSeed("chromatic"), makeStatus(), 0, 30, NO_SULK);
    expect(params.sound.waveform).toBe("sine");
  });

  it("chromatic: cry-dominant (cryWeight > patternWeight)", () => {
    const params = generateExpressionParams(makeSeed("chromatic"), makeStatus(), 0, 30, NO_SULK);
    expect(params.sound.cryWeight).toBeGreaterThan(params.sound.patternWeight);
  });

  it("vibration: square waveform", () => {
    const params = generateExpressionParams(makeSeed("vibration"), makeStatus(), 0, 30, NO_SULK);
    expect(params.sound.waveform).toBe("square");
  });

  it("vibration: pattern-dominant (patternWeight > cryWeight)", () => {
    const params = generateExpressionParams(makeSeed("vibration"), makeStatus(), 0, 30, NO_SULK);
    expect(params.sound.patternWeight).toBeGreaterThan(params.sound.cryWeight);
  });

  it("geometric: triangle waveform", () => {
    const params = generateExpressionParams(makeSeed("geometric"), makeStatus(), 0, 30, NO_SULK);
    expect(params.sound.waveform).toBe("triangle");
  });

  it("geometric: highest pattern ratio among species", () => {
    const status = makeStatus();
    const geoParams = generateExpressionParams(makeSeed("geometric"), status, 0, 30, NO_SULK);

    for (const species of ALL_SPECIES) {
      if (species === "geometric") continue;
      const other = generateExpressionParams(makeSeed(species), status, 0, 30, NO_SULK);
      expect(geoParams.sound.patternWeight).toBeGreaterThanOrEqual(other.sound.patternWeight);
    }
  });

  it("thermal: sine waveform, low tempo, low pitch", () => {
    const params = generateExpressionParams(makeSeed("thermal"), makeStatus(), 0, 30, NO_SULK);

    expect(params.sound.waveform).toBe("sine");
    expect(params.sound.tempo).toBeLessThan(80);
    expect(params.sound.pitch).toBeLessThan(200);
  });

  it("temporal: triangle waveform", () => {
    const params = generateExpressionParams(makeSeed("temporal"), makeStatus(), 0, 30, NO_SULK);
    expect(params.sound.waveform).toBe("triangle");
  });

  it("chemical: sawtooth waveform, high wobble", () => {
    const params = generateExpressionParams(makeSeed("chemical"), makeStatus(), 0, 30, NO_SULK);

    expect(params.sound.waveform).toBe("sawtooth");
    // Chemical has baseWobble 0.55, the highest among species
    expect(params.sound.wobble).toBeGreaterThan(0.4);
  });

  it("at least 3 distinct waveforms across 6 species", () => {
    const waveforms = new Set<string>();
    for (const species of ALL_SPECIES) {
      const params = generateExpressionParams(makeSeed(species), makeStatus(), 0, 30, NO_SULK);
      waveforms.add(params.sound.waveform);
    }
    expect(waveforms.size).toBeGreaterThanOrEqual(3);
  });
});

// --- 5. Sulk suppression ---

describe("generateExpressionParams — sulk suppression", () => {
  it("mild sulk reduces volume and brightness compared to normal", () => {
    const seed = makeSeed();
    const normal = generateExpressionParams(seed, makeStatus(), 0, 30, NO_SULK);
    const mild = generateExpressionParams(seed, makeStatus(), 0, 30, makeSulk("mild"));

    expect(mild.sound.volume).toBeLessThan(normal.sound.volume);
    expect(mild.visual.brightness).toBeLessThan(normal.visual.brightness);
  });

  it("moderate sulk: more suppression than mild", () => {
    const seed = makeSeed();
    const mild = generateExpressionParams(seed, makeStatus(), 0, 30, makeSulk("mild"));
    const moderate = generateExpressionParams(seed, makeStatus(), 0, 30, makeSulk("moderate"));

    expect(moderate.sound.volume).toBeLessThan(mild.sound.volume);
    expect(moderate.visual.brightness).toBeLessThan(mild.visual.brightness);
    expect(moderate.visual.motionSpeed).toBeLessThan(mild.visual.motionSpeed);
  });

  it("severe sulk: near-total suppression", () => {
    const seed = makeSeed();
    const severe = generateExpressionParams(seed, makeStatus(), 0, 30, makeSulk("severe"));

    expect(severe.sound.volume).toBeLessThanOrEqual(0.05);
    expect(severe.visual.brightness).toBeLessThanOrEqual(0.05);
    expect(severe.visual.motionSpeed).toBeLessThanOrEqual(0.05);
    expect(severe.text.verbosity).toBeLessThan(0.02);
  });

  it("sulk severity ordering: suppression increases with severity", () => {
    const seed = makeSeed();
    const severities: SulkSeverity[] = ["none", "mild", "moderate", "severe"];
    const volumes = severities.map((s) => {
      const params = generateExpressionParams(seed, makeStatus(), 0, 30, makeSulk(s));
      return params.sound.volume;
    });

    for (let i = 1; i < volumes.length; i++) {
      expect(volumes[i]).toBeLessThanOrEqual(volumes[i - 1]);
    }
  });

  it("sulk forces high symbol density even at high language level", () => {
    const seed = makeSeed();
    const severe = generateExpressionParams(seed, makeStatus(), 4, 180, makeSulk("severe"));

    // Even at language level 4 with 180 days of growth, sulking reverts to symbols
    expect(severe.text.symbolDensity).toBeGreaterThan(0.9);
  });

  it("sensitivity trait affects leakage during sulk", () => {
    const lowSens = makeSeed("chromatic", { sensitivity: 10 });
    const highSens = makeSeed("chromatic", { sensitivity: 90 });

    const lowParams = generateExpressionParams(lowSens, makeStatus(), 0, 30, makeSulk("mild"));
    const highParams = generateExpressionParams(highSens, makeStatus(), 0, 30, makeSulk("mild"));

    // Higher sensitivity = more emotional leakage even during sulk
    expect(highParams.text.emotionalLeakage).toBeGreaterThan(lowParams.text.emotionalLeakage);
  });

  it("sulk preserves species waveform", () => {
    for (const species of ALL_SPECIES) {
      const seed = makeSeed(species);
      const normal = generateExpressionParams(seed, makeStatus(), 0, 30, NO_SULK);
      const sulk = generateExpressionParams(seed, makeStatus(), 0, 30, makeSulk("moderate"));

      expect(sulk.sound.waveform).toBe(normal.sound.waveform);
    }
  });
});

// --- 6. Sub-trait effects ---

describe("generateExpressionParams — sub-trait effects", () => {
  it("high expressiveness increases emotional leakage", () => {
    const lowExpr = makeSeed("chromatic", { expressiveness: 10 });
    const highExpr = makeSeed("chromatic", { expressiveness: 90 });
    // Use non-neutral mood to generate leakage
    const status = makeStatus({ mood: 80 });

    const low = generateExpressionParams(lowExpr, status, 0, 30, NO_SULK);
    const high = generateExpressionParams(highExpr, status, 0, 30, NO_SULK);

    expect(high.text.emotionalLeakage).toBeGreaterThan(low.text.emotionalLeakage);
  });

  it("high sociability increases verbosity", () => {
    const lowSoc = makeSeed("chromatic", { sociability: 10 });
    const highSoc = makeSeed("chromatic", { sociability: 90 });

    const low = generateExpressionParams(lowSoc, makeStatus(), 0, 30, NO_SULK);
    const high = generateExpressionParams(highSoc, makeStatus(), 0, 30, NO_SULK);

    expect(high.text.verbosity).toBeGreaterThan(low.text.verbosity);
  });

  it("high rhythm affinity increases repetition tendency", () => {
    const lowRhythm = makeSeed("chromatic", { rhythmAffinity: 10 });
    const highRhythm = makeSeed("chromatic", { rhythmAffinity: 90 });

    const low = generateExpressionParams(lowRhythm, makeStatus(), 0, 30, NO_SULK);
    const high = generateExpressionParams(highRhythm, makeStatus(), 0, 30, NO_SULK);

    expect(high.text.repetitionTendency).toBeGreaterThan(low.text.repetitionTendency);
  });

  it("high sensitivity increases wobble", () => {
    const lowSens = makeSeed("chromatic", { sensitivity: 10 });
    const highSens = makeSeed("chromatic", { sensitivity: 90 });

    const low = generateExpressionParams(lowSens, makeStatus(), 0, 30, NO_SULK);
    const high = generateExpressionParams(highSens, makeStatus(), 0, 30, NO_SULK);

    expect(high.sound.wobble).toBeGreaterThan(low.sound.wobble);
  });

  it("high expressiveness increases sound volume", () => {
    const lowExpr = makeSeed("chromatic", { expressiveness: 10 });
    const highExpr = makeSeed("chromatic", { expressiveness: 90 });

    const low = generateExpressionParams(lowExpr, makeStatus(), 0, 30, NO_SULK);
    const high = generateExpressionParams(highExpr, makeStatus(), 0, 30, NO_SULK);

    expect(high.sound.volume).toBeGreaterThan(low.sound.volume);
  });

  it("high expressiveness increases color intensity", () => {
    const lowExpr = makeSeed("chromatic", { expressiveness: 10 });
    const highExpr = makeSeed("chromatic", { expressiveness: 90 });

    const low = generateExpressionParams(lowExpr, makeStatus(), 0, 30, NO_SULK);
    const high = generateExpressionParams(highExpr, makeStatus(), 0, 30, NO_SULK);

    expect(high.visual.colorIntensity).toBeGreaterThan(low.visual.colorIntensity);
  });
});

// --- 7. Edge cases ---

describe("generateExpressionParams — edge cases", () => {
  it("all status values at 0: no NaN or negative values", () => {
    for (const species of ALL_SPECIES) {
      const seed = makeSeed(species);
      const status = makeStatus({ mood: 0, energy: 0, curiosity: 0, comfort: 0 });
      const params = generateExpressionParams(seed, status, 0, 0, NO_SULK);

      expect(params.text.symbolDensity).toBeGreaterThanOrEqual(0);
      expect(params.text.emotionalLeakage).toBeGreaterThanOrEqual(0);
      expect(params.text.verbosity).toBeGreaterThanOrEqual(0);
      expect(params.text.repetitionTendency).toBeGreaterThanOrEqual(0);
      expect(params.sound.volume).toBeGreaterThanOrEqual(0);
      expect(params.sound.wobble).toBeGreaterThanOrEqual(0);
      expect(params.sound.pitch).toBeGreaterThanOrEqual(80);
      expect(params.sound.tempo).toBeGreaterThanOrEqual(30);
      expect(params.visual.brightness).toBeGreaterThanOrEqual(0);
      expect(params.visual.particleCount).toBeGreaterThan(0);
      expect(params.visual.motionSpeed).toBeGreaterThanOrEqual(0);
      expect(params.visual.colorIntensity).toBeGreaterThanOrEqual(0);
    }
  });

  it("all status values at 100: no values exceed upper bounds", () => {
    for (const species of ALL_SPECIES) {
      const seed = makeSeed(species);
      const status = makeStatus({ mood: 100, energy: 100, curiosity: 100, comfort: 100 });
      const params = generateExpressionParams(seed, status, 4, 365, NO_SULK);

      expect(params.text.symbolDensity).toBeLessThanOrEqual(1);
      expect(params.text.emotionalLeakage).toBeLessThanOrEqual(1);
      expect(params.text.verbosity).toBeLessThanOrEqual(1);
      expect(params.text.repetitionTendency).toBeLessThanOrEqual(1);
      expect(params.sound.volume).toBeLessThanOrEqual(1);
      expect(params.sound.wobble).toBeLessThanOrEqual(1);
      expect(params.sound.pitch).toBeLessThanOrEqual(800);
      expect(params.sound.tempo).toBeLessThanOrEqual(200);
      expect(params.visual.brightness).toBeLessThanOrEqual(1);
      expect(params.visual.motionSpeed).toBeLessThanOrEqual(1);
      expect(params.visual.colorIntensity).toBeLessThanOrEqual(1);
    }
  });

  it("growth day 0: minimal complexity and no maturity effects", () => {
    const seed = makeSeed();
    const params = generateExpressionParams(seed, makeStatus(), 0, 0, NO_SULK);

    expect(params.sound.complexity).toBeLessThan(0.2);
    expect(params.text.symbolDensity).toBeGreaterThan(0.9);
  });

  it("growth day 365: near-maximum complexity and growth effects", () => {
    const seed = makeSeed();
    const params = generateExpressionParams(seed, makeStatus(), 0, 365, NO_SULK);

    // complexity = min(1, 0.1 + sqrt(365/120) * 0.9) = min(1, 0.1 + 1.744 * 0.9) = 1.0
    expect(params.sound.complexity).toBeCloseTo(1.0, 1);
  });

  it("all sub-traits at 0: valid output, lower expression", () => {
    const seed = makeSeed("chromatic", {
      sensitivity: 0,
      sociability: 0,
      rhythmAffinity: 0,
      memoryDepth: 0,
      expressiveness: 0,
    });
    const params = generateExpressionParams(seed, makeStatus({ mood: 80 }), 0, 30, NO_SULK);

    // All values should still be valid
    expect(params.text.emotionalLeakage).toBeGreaterThanOrEqual(0);
    expect(params.sound.volume).toBeGreaterThanOrEqual(0);
    expect(params.visual.colorIntensity).toBeGreaterThanOrEqual(0);
    expect(params.sound.wobble).toBeGreaterThanOrEqual(0);
  });

  it("all sub-traits at 100: valid output, higher expression", () => {
    const seed = makeSeed("chromatic", {
      sensitivity: 100,
      sociability: 100,
      rhythmAffinity: 100,
      memoryDepth: 100,
      expressiveness: 100,
    });
    const params = generateExpressionParams(seed, makeStatus({ mood: 80 }), 0, 30, NO_SULK);

    // All values should still be clamped to valid ranges
    expect(params.text.emotionalLeakage).toBeLessThanOrEqual(1);
    expect(params.text.verbosity).toBeLessThanOrEqual(1);
    expect(params.text.repetitionTendency).toBeLessThanOrEqual(1);
    expect(params.sound.volume).toBeLessThanOrEqual(1);
    expect(params.sound.wobble).toBeLessThanOrEqual(1);
    expect(params.visual.colorIntensity).toBeLessThanOrEqual(1);
  });

  it("all sub-traits at max produce stronger expression than all at min", () => {
    const minTraits = makeSeed("chromatic", {
      sensitivity: 0,
      sociability: 0,
      rhythmAffinity: 0,
      memoryDepth: 0,
      expressiveness: 0,
    });
    const maxTraits = makeSeed("chromatic", {
      sensitivity: 100,
      sociability: 100,
      rhythmAffinity: 100,
      memoryDepth: 100,
      expressiveness: 100,
    });
    const status = makeStatus({ mood: 80 });

    const min = generateExpressionParams(minTraits, status, 0, 30, NO_SULK);
    const max = generateExpressionParams(maxTraits, status, 0, 30, NO_SULK);

    expect(max.text.emotionalLeakage).toBeGreaterThan(min.text.emotionalLeakage);
    expect(max.text.verbosity).toBeGreaterThan(min.text.verbosity);
    expect(max.sound.volume).toBeGreaterThan(min.sound.volume);
    expect(max.sound.wobble).toBeGreaterThan(min.sound.wobble);
  });

  it("combined extremes: all status at 0, all traits at 0, day 0, lang 0, severe sulk", () => {
    const seed = makeSeed("chromatic", {
      sensitivity: 0,
      sociability: 0,
      rhythmAffinity: 0,
      memoryDepth: 0,
      expressiveness: 0,
    });
    const status = makeStatus({ mood: 0, energy: 0, curiosity: 0, comfort: 0 });
    const params = generateExpressionParams(seed, status, 0, 0, makeSulk("severe"));

    // Should produce valid, extremely suppressed output
    expect(params.sound.volume).toBeLessThan(0.02);
    expect(params.visual.brightness).toBeLessThanOrEqual(0.05);
    expect(params.text.symbolDensity).toBeGreaterThan(0.9);
    expect(params.text.verbosity).toBeCloseTo(0, 1);
    // Leakage should be near zero (low sensitivity + severe sulk)
    expect(params.text.emotionalLeakage).toBeCloseTo(0, 2);
  });

  it("combined extremes: all status at 100, all traits at 100, day 365, lang 4, no sulk", () => {
    const seed = makeSeed("vibration", {
      sensitivity: 100,
      sociability: 100,
      rhythmAffinity: 100,
      memoryDepth: 100,
      expressiveness: 100,
    });
    const status = makeStatus({ mood: 100, energy: 100, curiosity: 100, comfort: 100 });
    const params = generateExpressionParams(seed, status, 4, 365, NO_SULK);

    // Should produce valid, maximally expressive output
    expect(params.sound.volume).toBeGreaterThan(0.5);
    expect(params.visual.brightness).toBeGreaterThan(0.5);
    expect(params.text.symbolDensity).toBeLessThan(0.1);
    expect(params.sound.complexity).toBeCloseTo(1.0, 1);
    // All still within bounds
    expect(params.sound.volume).toBeLessThanOrEqual(1);
    expect(params.visual.brightness).toBeLessThanOrEqual(1);
    expect(params.sound.pitch).toBeLessThanOrEqual(800);
    expect(params.sound.tempo).toBeLessThanOrEqual(200);
  });
});
