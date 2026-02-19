import { describe, it, expect } from "vitest";
import { generateExpressionParams } from "../../src/expression/expression-adapter.js";
import { createFixedSeed } from "../../src/genesis/seed-generator.js";
import type { Status, PerceptionMode, HardwareBody } from "../../src/types.js";
import type { SulkState, SulkSeverity } from "../../src/mood/sulk-engine.js";

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

const ALL_SPECIES: PerceptionMode[] = ["chromatic", "vibration", "geometric", "thermal", "temporal", "chemical"];

describe("generateExpressionParams — basic", () => {
  it("returns all three channels (text, sound, visual)", () => {
    const seed = createFixedSeed({ hardwareBody: HW });
    const params = generateExpressionParams(seed, makeStatus(), 0, 0, NO_SULK);

    expect(params).toHaveProperty("text");
    expect(params).toHaveProperty("sound");
    expect(params).toHaveProperty("visual");
  });

  it("all output values are finite numbers", () => {
    const seed = createFixedSeed({ hardwareBody: HW });
    const params = generateExpressionParams(seed, makeStatus(), 0, 0, NO_SULK);

    for (const [, v] of Object.entries(params.text)) expect(Number.isFinite(v)).toBe(true);
    for (const [k, v] of Object.entries(params.sound)) {
      if (k === "waveform") continue;
      expect(Number.isFinite(v as number)).toBe(true);
    }
    for (const [, v] of Object.entries(params.visual)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("generateExpressionParams — species differentiation", () => {
  it("produces different sound waveforms per species", () => {
    const waveforms = new Set<string>();
    for (const species of ALL_SPECIES) {
      const seed = createFixedSeed({ perception: species, hardwareBody: HW });
      const params = generateExpressionParams(seed, makeStatus(), 0, 30, NO_SULK);
      waveforms.add(params.sound.waveform);
    }
    // At least 3 distinct waveforms across 6 species
    expect(waveforms.size).toBeGreaterThanOrEqual(3);
  });

  it("vibration is pattern-dominant, chromatic is cry-dominant", () => {
    const vibSeed = createFixedSeed({ perception: "vibration", hardwareBody: HW });
    const chrSeed = createFixedSeed({ perception: "chromatic", hardwareBody: HW });

    const vib = generateExpressionParams(vibSeed, makeStatus(), 0, 30, NO_SULK);
    const chr = generateExpressionParams(chrSeed, makeStatus(), 0, 30, NO_SULK);

    expect(vib.sound.patternWeight).toBeGreaterThan(vib.sound.cryWeight);
    expect(chr.sound.cryWeight).toBeGreaterThan(chr.sound.patternWeight);
  });

  it("geometric has minimal wobble", () => {
    const seed = createFixedSeed({ perception: "geometric", hardwareBody: HW });
    const params = generateExpressionParams(seed, makeStatus({ comfort: 80 }), 0, 30, NO_SULK);

    expect(params.sound.wobble).toBeLessThan(0.3);
  });

  it("thermal has slow tempo", () => {
    const seed = createFixedSeed({ perception: "thermal", hardwareBody: HW });
    const params = generateExpressionParams(seed, makeStatus(), 0, 30, NO_SULK);

    expect(params.sound.tempo).toBeLessThan(80);
  });
});

describe("generateExpressionParams — status modulation", () => {
  it("high mood raises pitch", () => {
    const seed = createFixedSeed({ hardwareBody: HW });
    const low = generateExpressionParams(seed, makeStatus({ mood: 10 }), 0, 30, NO_SULK);
    const high = generateExpressionParams(seed, makeStatus({ mood: 90 }), 0, 30, NO_SULK);

    expect(high.sound.pitch).toBeGreaterThan(low.sound.pitch);
  });

  it("high energy increases tempo", () => {
    const seed = createFixedSeed({ hardwareBody: HW });
    const low = generateExpressionParams(seed, makeStatus({ energy: 10 }), 0, 30, NO_SULK);
    const high = generateExpressionParams(seed, makeStatus({ energy: 90 }), 0, 30, NO_SULK);

    expect(high.sound.tempo).toBeGreaterThan(low.sound.tempo);
  });

  it("high energy increases visual brightness", () => {
    const seed = createFixedSeed({ hardwareBody: HW });
    const low = generateExpressionParams(seed, makeStatus({ energy: 10, mood: 10 }), 0, 30, NO_SULK);
    const high = generateExpressionParams(seed, makeStatus({ energy: 90, mood: 90 }), 0, 30, NO_SULK);

    expect(high.visual.brightness).toBeGreaterThan(low.visual.brightness);
  });

  it("low comfort increases wobble (pitch instability)", () => {
    const seed = createFixedSeed({ hardwareBody: HW });
    const comfortable = generateExpressionParams(seed, makeStatus({ comfort: 90 }), 0, 30, NO_SULK);
    const uncomfortable = generateExpressionParams(seed, makeStatus({ comfort: 10 }), 0, 30, NO_SULK);

    expect(uncomfortable.sound.wobble).toBeGreaterThan(comfortable.sound.wobble);
  });
});

describe("generateExpressionParams — growth evolution", () => {
  it("symbol density decreases with language level", () => {
    const seed = createFixedSeed({ hardwareBody: HW });
    const lv0 = generateExpressionParams(seed, makeStatus(), 0, 0, NO_SULK);
    const lv2 = generateExpressionParams(seed, makeStatus(), 2, 30, NO_SULK);
    const lv4 = generateExpressionParams(seed, makeStatus(), 4, 90, NO_SULK);

    expect(lv0.text.symbolDensity).toBeGreaterThan(lv2.text.symbolDensity);
    expect(lv2.text.symbolDensity).toBeGreaterThan(lv4.text.symbolDensity);
  });

  it("sound complexity increases with growth day", () => {
    const seed = createFixedSeed({ hardwareBody: HW });
    const day1 = generateExpressionParams(seed, makeStatus(), 0, 1, NO_SULK);
    const day60 = generateExpressionParams(seed, makeStatus(), 0, 60, NO_SULK);
    const day120 = generateExpressionParams(seed, makeStatus(), 0, 120, NO_SULK);

    expect(day60.sound.complexity).toBeGreaterThan(day1.sound.complexity);
    expect(day120.sound.complexity).toBeGreaterThan(day60.sound.complexity);
  });

  it("visual particle count grows with maturity", () => {
    const seed = createFixedSeed({ hardwareBody: HW });
    const young = generateExpressionParams(seed, makeStatus(), 0, 0, NO_SULK);
    const mature = generateExpressionParams(seed, makeStatus(), 0, 180, NO_SULK);

    expect(mature.visual.particleCount).toBeGreaterThan(young.visual.particleCount);
  });
});

describe("generateExpressionParams — sulk suppression", () => {
  it("mild sulk reduces expression", () => {
    const seed = createFixedSeed({ hardwareBody: HW });
    const normal = generateExpressionParams(seed, makeStatus(), 0, 30, NO_SULK);
    const mild = generateExpressionParams(seed, makeStatus(), 0, 30, makeSulk("mild"));

    expect(mild.sound.volume).toBeLessThan(normal.sound.volume);
    expect(mild.visual.brightness).toBeLessThan(normal.visual.brightness);
  });

  it("severe sulk nearly silences all expression", () => {
    const seed = createFixedSeed({ hardwareBody: HW });
    const severe = generateExpressionParams(seed, makeStatus(), 0, 30, makeSulk("severe"));

    expect(severe.sound.volume).toBeLessThan(0.05);
    expect(severe.visual.brightness).toBeLessThan(0.1);
    expect(severe.visual.motionSpeed).toBeLessThan(0.1);
    expect(severe.text.verbosity).toBeLessThan(0.05);
  });

  it("sulk forces high symbol density (regression to symbols)", () => {
    const seed = createFixedSeed({ hardwareBody: HW });
    const severe = generateExpressionParams(seed, makeStatus(), 4, 180, makeSulk("severe"));

    // Even at language level 4, sulking reverts to symbols
    expect(severe.text.symbolDensity).toBeGreaterThan(0.9);
  });

  it("sulk severity ordering: none < mild < moderate < severe suppression", () => {
    const seed = createFixedSeed({ hardwareBody: HW });
    const severities: SulkSeverity[] = ["none", "mild", "moderate", "severe"];
    const volumes = severities.map(s => {
      const params = generateExpressionParams(seed, makeStatus(), 0, 30, makeSulk(s));
      return params.sound.volume;
    });

    for (let i = 1; i < volumes.length; i++) {
      expect(volumes[i]).toBeLessThanOrEqual(volumes[i - 1]);
    }
  });
});

describe("generateExpressionParams — value bounds", () => {
  it("all 0-1 params stay within bounds under extreme states", () => {
    const extremes = [
      makeStatus({ mood: 0, energy: 0, curiosity: 0, comfort: 0 }),
      makeStatus({ mood: 100, energy: 100, curiosity: 100, comfort: 100 }),
    ];

    for (const species of ALL_SPECIES) {
      const seed = createFixedSeed({ perception: species, hardwareBody: HW });
      for (const status of extremes) {
        for (const langLevel of [0, 4]) {
          for (const day of [0, 365]) {
            const params = generateExpressionParams(seed, status, langLevel, day, NO_SULK);

            // Text
            expect(params.text.symbolDensity).toBeGreaterThanOrEqual(0);
            expect(params.text.symbolDensity).toBeLessThanOrEqual(1);
            expect(params.text.emotionalLeakage).toBeGreaterThanOrEqual(0);
            expect(params.text.emotionalLeakage).toBeLessThanOrEqual(1);
            expect(params.text.verbosity).toBeGreaterThanOrEqual(0);
            expect(params.text.verbosity).toBeLessThanOrEqual(1);

            // Sound
            expect(params.sound.volume).toBeGreaterThanOrEqual(0);
            expect(params.sound.volume).toBeLessThanOrEqual(1);
            expect(params.sound.pitch).toBeGreaterThanOrEqual(80);
            expect(params.sound.pitch).toBeLessThanOrEqual(800);
            expect(params.sound.tempo).toBeGreaterThanOrEqual(30);
            expect(params.sound.tempo).toBeLessThanOrEqual(200);

            // Visual
            expect(params.visual.brightness).toBeGreaterThanOrEqual(0);
            expect(params.visual.brightness).toBeLessThanOrEqual(1);
            expect(params.visual.particleCount).toBeGreaterThan(0);
            expect(params.visual.motionSpeed).toBeGreaterThanOrEqual(0);
            expect(params.visual.motionSpeed).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});
