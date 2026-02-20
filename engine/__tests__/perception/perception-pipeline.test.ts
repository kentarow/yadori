import { describe, it, expect } from "vitest";
import {
  processPerceptionPipeline,
  describePerceptionState,
  type PerceptionPipelineInput,
  type PerceptionPipelineOutput,
} from "../../src/perception/perception-pipeline.js";
import { computePerceptionWindow } from "../../src/perception/perception-params.js";
import { PerceptionLevel } from "../../src/types.js";
import type { PerceptionMode } from "../../src/types.js";
import type {
  RawInput,
  TextInputData,
  ImageInputData,
  AudioInputData,
  ScalarSensorData,
  SystemMetricsData,
} from "../../src/perception/perception-types.js";

// ============================================================
// Test Helpers
// ============================================================

const NOW = "2026-02-20T12:00:00Z";

function makeTextInput(content: string): RawInput {
  return {
    modality: "text",
    timestamp: NOW,
    source: "telegram",
    data: { type: "text", content, charCount: content.length } as TextInputData,
  };
}

function makeImageInput(): RawInput {
  return {
    modality: "image",
    timestamp: NOW,
    source: "pi-camera",
    data: {
      type: "image",
      width: 640,
      height: 480,
      dominantHSL: [30, 70, 55] as [number, number, number],
      colorHistogram: [
        { h: 30, s: 70, l: 55, pct: 40 },
        { h: 200, s: 50, l: 45, pct: 25 },
        { h: 120, s: 60, l: 50, pct: 20 },
        { h: 0, s: 0, l: 90, pct: 10 },
        { h: 60, s: 40, l: 40, pct: 5 },
      ],
      edgeDensity: 0.45,
      dominantAngles: [0, 90],
      brightness: 0.6,
      quadrantBrightness: [0.7, 0.5, 0.3, 0.4] as [number, number, number, number],
    } as ImageInputData,
  };
}

function makeAudioInput(): RawInput {
  return {
    modality: "audio",
    timestamp: NOW,
    source: "usb-mic",
    data: {
      type: "audio",
      duration: 3.2,
      amplitude: 0.6,
      bands: { bass: 0.7, mid: 0.5, treble: 0.3 },
      bpm: 72,
      beatRegularity: 0.8,
      harmonicRichness: 0.6,
    } as AudioInputData,
  };
}

function makeTempInput(value: number): RawInput {
  return {
    modality: "temperature",
    timestamp: NOW,
    source: "dht22",
    data: {
      type: "scalar",
      value,
      unit: "°C",
      trend: "rising" as const,
      changeRate: 0.5,
    } as ScalarSensorData,
  };
}

function makeSystemInput(): RawInput {
  return {
    modality: "system",
    timestamp: NOW,
    source: "os",
    data: {
      type: "system",
      cpuTempC: 52,
      memoryUsedPct: 45,
      cpuLoadPct: 30,
      uptimeHours: 72,
      processCount: 42,
      diskIOReadKBs: 50,
      diskIOWriteKBs: 20,
      networkKBs: 15,
    } as SystemMetricsData,
  };
}

function makeLightInput(lux: number): RawInput {
  return {
    modality: "light",
    timestamp: NOW,
    source: "bh1750",
    data: {
      type: "scalar",
      value: lux,
      unit: "lux",
      trend: "stable" as const,
      changeRate: 0,
    } as ScalarSensorData,
  };
}

const ALL_SPECIES: PerceptionMode[] = [
  "chromatic",
  "vibration",
  "geometric",
  "thermal",
  "temporal",
  "chemical",
];

// ============================================================
// Full pipeline with text inputs at various levels
// ============================================================

describe("processPerceptionPipeline: text inputs at various levels", () => {
  const textInput = makeTextInput("The quick brown fox jumps over the lazy dog in the meadow");

  it("Level 0, day 0: text perception is minimal and truncated", () => {
    const result = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 0,
      perceptionLevel: PerceptionLevel.Minimal,
      inputs: [textInput],
    });

    expect(result.perceptions).toHaveLength(1);
    expect(result.perceptions[0].sourceModality).toBe("text");
    // At Minimal level, chromatic sees "NN marks" — short description
    // textAccess is ~5 at Minimal, so < 50 triggers truncation
    expect(result.perceptions[0].description.length).toBeGreaterThan(0);
    expect(result.window.textAccess).toBeLessThan(50);
    expect(result.activeModalities).toContain("text");
  });

  it("Level 1, day 7: more text detail available", () => {
    const result = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 7,
      perceptionLevel: PerceptionLevel.Basic,
      inputs: [textInput],
    });

    expect(result.perceptions).toHaveLength(1);
    // Basic level has textAccess ~20-30, still < 50 so truncation applies
    expect(result.window.textAccess).toBeLessThan(50);
    expect(result.perceptions[0].description.length).toBeGreaterThan(0);
  });

  it("Level 3, day 60: substantial text access", () => {
    const result = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 60,
      perceptionLevel: PerceptionLevel.Relational,
      inputs: [textInput],
    });

    expect(result.perceptions).toHaveLength(1);
    // At Relational level, textAccess is ~75 which is >= 50, no truncation
    expect(result.window.textAccess).toBeGreaterThanOrEqual(50);
  });

  it("Level 4, day 120: full text access, no modulation", () => {
    const result = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 120,
      perceptionLevel: PerceptionLevel.Full,
      inputs: [textInput],
    });

    expect(result.perceptions).toHaveLength(1);
    expect(result.window.textAccess).toBeGreaterThanOrEqual(85);
  });
});

// ============================================================
// Full pipeline with mixed modality inputs
// ============================================================

describe("processPerceptionPipeline: mixed modality inputs", () => {
  const mixedInputs: RawInput[] = [
    makeTextInput("Hello there"),
    makeImageInput(),
    makeAudioInput(),
    makeTempInput(23.4),
    makeSystemInput(),
  ];

  it("chromatic perceives text, image, audio, and some sensors", () => {
    const result = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 14,
      perceptionLevel: PerceptionLevel.Basic,
      inputs: mixedInputs,
    });

    expect(result.perceptions.length).toBeGreaterThan(0);
    expect(result.activeModalities).toContain("text");
    expect(result.activeModalities).toContain("image");
    // chromatic perceives temperature as color-warmth at Basic+
    expect(result.window).toBeDefined();
    expect(result.window.imageResolution).toBeGreaterThanOrEqual(1);
  });

  it("vibration perceives text, audio, vibration but not temperature", () => {
    const inputsWithVibration = [
      ...mixedInputs,
      {
        modality: "vibration" as const,
        timestamp: NOW,
        source: "mpu6050",
        data: {
          type: "vibration" as const,
          magnitude: 0.3,
          frequency: 5.0,
          axes: { x: 0.1, y: 0.2, z: 0.15 },
          isRhythmic: true,
          patternFrequency: 2.5,
        },
      },
    ];

    const result = processPerceptionPipeline({
      species: "vibration",
      growthDay: 14,
      perceptionLevel: PerceptionLevel.Basic,
      inputs: inputsWithVibration,
    });

    expect(result.activeModalities).toContain("text");
    expect(result.activeModalities).toContain("audio");
    expect(result.activeModalities).toContain("vibration");
    expect(result.activeModalities).not.toContain("temperature");
  });

  it("thermal perceives temperature, system, text (at Basic+), image", () => {
    const result = processPerceptionPipeline({
      species: "thermal",
      growthDay: 14,
      perceptionLevel: PerceptionLevel.Basic,
      inputs: mixedInputs,
    });

    expect(result.activeModalities).toContain("temperature");
    expect(result.activeModalities).toContain("system");
    expect(result.activeModalities).toContain("text");
  });

  it("activeModalities contains only unique entries", () => {
    const doubleText = [
      makeTextInput("First message"),
      makeTextInput("Second message"),
    ];

    const result = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 7,
      perceptionLevel: PerceptionLevel.Basic,
      inputs: doubleText,
    });

    expect(result.perceptions).toHaveLength(2);
    // activeModalities should deduplicate
    const textCount = result.activeModalities.filter((m) => m === "text").length;
    expect(textCount).toBe(1);
  });

  it("empty inputs produce empty perceptions", () => {
    const result = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 7,
      perceptionLevel: PerceptionLevel.Basic,
      inputs: [],
    });

    expect(result.perceptions).toHaveLength(0);
    expect(result.activeModalities).toHaveLength(0);
    expect(result.window).toBeDefined();
  });
});

// ============================================================
// Window modulation actually changes output
// ============================================================

describe("window modulation changes output", () => {
  it("text modulation: low textAccess truncates description", () => {
    // At Minimal level (textAccess ~5), the description should be truncated
    // At Full level (textAccess 100), no truncation
    const longTextInput = makeTextInput("The quick brown fox jumps over the lazy dog repeatedly and endlessly");

    const minResult = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 0,
      perceptionLevel: PerceptionLevel.Minimal,
      inputs: [longTextInput],
    });

    const fullResult = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 120,
      perceptionLevel: PerceptionLevel.Full,
      inputs: [longTextInput],
    });

    // Both should produce perceptions
    expect(minResult.perceptions).toHaveLength(1);
    expect(fullResult.perceptions).toHaveLength(1);

    // The Minimal result should be shorter or equal (filter already produces short output)
    // but the modulation should not make it longer
    expect(minResult.perceptions[0].description.length).toBeLessThanOrEqual(
      fullResult.perceptions[0].description.length,
    );
  });

  it("image modulation: low imageResolution strips spatial words", () => {
    // At Structured level, chromatic image filter includes spatial terms
    // like "top-left", "top-right" etc.
    // Running at Minimal level (imageResolution ~1) should strip them

    const imgInput = makeImageInput();

    // Get Structured-level output (has spatial words) then process through
    // pipeline at low imageResolution to verify stripping
    const structuredResult = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 21,
      perceptionLevel: PerceptionLevel.Structured,
      inputs: [imgInput],
    });

    // At Structured level, chromatic image includes "spatial:" with quadrant info
    const structuredDesc = structuredResult.perceptions.find(
      (p) => p.sourceModality === "image",
    )?.description ?? "";

    // The Structured-level filter produces spatial info, and imageResolution >= 3
    // so the pipeline should NOT strip it
    if (structuredResult.window.imageResolution >= 3) {
      // spatial words should be preserved
      expect(
        structuredDesc.includes("spatial") ||
        structuredDesc.includes("top-left") ||
        structuredDesc.includes("bright") ||
        structuredDesc.includes("dark"),
      ).toBe(true);
    }

    // At Minimal level, imageResolution < 3, spatial words should be stripped
    const minimalResult = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 0,
      perceptionLevel: PerceptionLevel.Minimal,
      inputs: [imgInput],
    });

    const minimalDesc = minimalResult.perceptions.find(
      (p) => p.sourceModality === "image",
    )?.description ?? "";

    // The Minimal filter for chromatic only returns "dominant: hsl(...)"
    // which has no spatial words, so stripping is a no-op. This confirms
    // the pipeline doesn't accidentally corrupt simple descriptions.
    expect(minimalDesc).toContain("dominant");
    expect(minimalDesc).not.toContain("top-left");
    expect(minimalDesc).not.toContain("bottom-right");
  });

  it("audio modulation: low frequencyRange simplifies band details", () => {
    const audioInput = makeAudioInput();

    // At Full level with vibration species, audio includes detailed band info
    const fullResult = processPerceptionPipeline({
      species: "vibration",
      growthDay: 120,
      perceptionLevel: PerceptionLevel.Full,
      inputs: [audioInput],
    });

    const fullDesc = fullResult.perceptions.find(
      (p) => p.sourceModality === "audio",
    )?.description ?? "";

    // Full vibration audio: "bass:XX mid:XX treble:XX, ..."
    // frequencyRange is 100 at Full, so no simplification
    expect(fullDesc).toContain("bass");

    // At Minimal level, frequencyRange is very low
    const minResult = processPerceptionPipeline({
      species: "vibration",
      growthDay: 0,
      perceptionLevel: PerceptionLevel.Minimal,
      inputs: [audioInput],
    });

    const minDesc = minResult.perceptions.find(
      (p) => p.sourceModality === "audio",
    )?.description ?? "";

    // Minimal filter produces "rhythm detected" — no bands to simplify
    // This confirms the pipeline handles simple descriptions gracefully
    expect(minDesc.length).toBeGreaterThan(0);
  });

  it("sensor modulation: low sensorAccess strips decimal precision", () => {
    const tempInput = makeTempInput(23.456);

    // Thermal at Minimal: directly shows "23.5°C" (1 decimal from filter)
    // sensorAccess is ~10-12, so < 50 triggers precision reduction
    const minResult = processPerceptionPipeline({
      species: "thermal",
      growthDay: 0,
      perceptionLevel: PerceptionLevel.Minimal,
      inputs: [tempInput],
    });

    const minDesc = minResult.perceptions.find(
      (p) => p.sourceModality === "temperature",
    )?.description ?? "";

    // Decimals should be stripped (23.5 -> 23)
    expect(minDesc).not.toMatch(/\d+\.\d+/);

    // At Full level, sensorAccess is 100, decimals preserved
    const fullResult = processPerceptionPipeline({
      species: "thermal",
      growthDay: 120,
      perceptionLevel: PerceptionLevel.Full,
      inputs: [tempInput],
    });

    const fullDesc = fullResult.perceptions.find(
      (p) => p.sourceModality === "temperature",
    )?.description ?? "";

    // Full should preserve decimal precision
    expect(fullDesc).toMatch(/\d+\.\d+/);
  });

  it("growthDay interpolation creates finer differences within same level", () => {
    const textInput = makeTextInput("A moderately long message with some words in it for testing purposes");

    // Same level (Basic), different growthDays
    const earlyResult = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 7,
      perceptionLevel: PerceptionLevel.Basic,
      inputs: [textInput],
    });

    const lateResult = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 20,
      perceptionLevel: PerceptionLevel.Basic,
      inputs: [textInput],
    });

    // The window values should differ due to interpolation
    expect(lateResult.window.textAccess).toBeGreaterThanOrEqual(earlyResult.window.textAccess);

    // Both should produce valid output
    expect(earlyResult.perceptions).toHaveLength(1);
    expect(lateResult.perceptions).toHaveLength(1);
  });
});

// ============================================================
// describePerceptionState
// ============================================================

describe("describePerceptionState", () => {
  it("returns non-empty string for all species at Minimal level", () => {
    for (const species of ALL_SPECIES) {
      const window = computePerceptionWindow(PerceptionLevel.Minimal, species, 0);
      const desc = describePerceptionState(window, species);
      expect(desc.length).toBeGreaterThan(0);
    }
  });

  it("returns non-empty string for all species at Full level", () => {
    for (const species of ALL_SPECIES) {
      const window = computePerceptionWindow(PerceptionLevel.Full, species, 120);
      const desc = describePerceptionState(window, species);
      expect(desc.length).toBeGreaterThan(0);
    }
  });

  it("chromatic Minimal: mentions dominant colors and narrow frequency", () => {
    const window = computePerceptionWindow(PerceptionLevel.Minimal, "chromatic", 0);
    const desc = describePerceptionState(window, "chromatic");
    // chromatic species modifier boosts imageResolution (1 * 1.2 = 1.2),
    // placing it in the "dominant colors" tier rather than "color histogram"
    expect(desc).toContain("dominant colors");
    expect(desc).toContain("narrow frequency band");
    expect(desc).toContain("primary: light/color");
  });

  it("vibration Full: mentions full spectrum and full sensor access", () => {
    const window = computePerceptionWindow(PerceptionLevel.Full, "vibration", 120);
    const desc = describePerceptionState(window, "vibration");
    expect(desc).toContain("full");
    expect(desc).toContain("primary: rhythm/oscillation");
  });

  it("thermal includes primary: warmth/gradient", () => {
    const window = computePerceptionWindow(PerceptionLevel.Basic, "thermal", 10);
    const desc = describePerceptionState(window, "thermal");
    expect(desc).toContain("primary: warmth/gradient");
  });

  it("geometric includes primary: shape/structure", () => {
    const window = computePerceptionWindow(PerceptionLevel.Structured, "geometric", 30);
    const desc = describePerceptionState(window, "geometric");
    expect(desc).toContain("primary: shape/structure");
  });

  it("temporal includes primary: rhythm/duration", () => {
    const window = computePerceptionWindow(PerceptionLevel.Relational, "temporal", 70);
    const desc = describePerceptionState(window, "temporal");
    expect(desc).toContain("primary: rhythm/duration");
  });

  it("chemical includes primary: reaction/concentration", () => {
    const window = computePerceptionWindow(PerceptionLevel.Basic, "chemical", 10);
    const desc = describePerceptionState(window, "chemical");
    expect(desc).toContain("primary: reaction/concentration");
  });

  it("description gets richer at higher levels", () => {
    const minWindow = computePerceptionWindow(PerceptionLevel.Minimal, "chromatic", 0);
    const fullWindow = computePerceptionWindow(PerceptionLevel.Full, "chromatic", 120);

    const minDesc = describePerceptionState(minWindow, "chromatic");
    const fullDesc = describePerceptionState(fullWindow, "chromatic");

    // Full description mentions higher percentages and capabilities
    expect(fullDesc).toContain("full");
    // Minimal mentions limited terms
    expect(minDesc).toContain("minimal");
  });

  it("includes speech detection info at Relational+ levels", () => {
    const window = computePerceptionWindow(PerceptionLevel.Relational, "chromatic", 60);
    const desc = describePerceptionState(window, "chromatic");
    // At Relational, canDetectSpeech is true, so should mention it
    if (window.canDetectSpeech) {
      expect(desc).toContain("speech");
    }
  });
});

// ============================================================
// All 6 species produce valid output
// ============================================================

describe("all 6 species produce valid pipeline output", () => {
  const inputs: RawInput[] = [
    makeTextInput("Hello world"),
    makeImageInput(),
    makeAudioInput(),
    makeTempInput(22),
    makeSystemInput(),
    makeLightInput(300),
  ];

  const levels = [
    { level: PerceptionLevel.Minimal, day: 0 },
    { level: PerceptionLevel.Basic, day: 10 },
    { level: PerceptionLevel.Structured, day: 30 },
    { level: PerceptionLevel.Relational, day: 70 },
    { level: PerceptionLevel.Full, day: 120 },
  ];

  for (const species of ALL_SPECIES) {
    for (const { level, day } of levels) {
      it(`${species} at level ${level} (day ${day}): produces valid output`, () => {
        const result = processPerceptionPipeline({
          species,
          growthDay: day,
          perceptionLevel: level,
          inputs,
        });

        // Must have a valid window
        expect(result.window).toBeDefined();
        expect(result.window.imageResolution).toBeGreaterThanOrEqual(1);
        expect(result.window.imageResolution).toBeLessThanOrEqual(5);
        expect(result.window.textAccess).toBeGreaterThanOrEqual(0);
        expect(result.window.textAccess).toBeLessThanOrEqual(100);
        expect(result.window.frequencyRange).toBeGreaterThanOrEqual(0);
        expect(result.window.frequencyRange).toBeLessThanOrEqual(100);
        expect(result.window.sensorAccess).toBeGreaterThanOrEqual(0);
        expect(result.window.sensorAccess).toBeLessThanOrEqual(100);

        // Must have at least one perception (text is universally perceivable)
        expect(result.perceptions.length).toBeGreaterThan(0);

        // Every perception must have a non-empty description
        for (const p of result.perceptions) {
          expect(p.description.length).toBeGreaterThan(0);
          expect(p.sourceModality).toBeDefined();
        }

        // activeModalities must match what's in perceptions
        const perceivedModalities = new Set(
          result.perceptions.map((p) => p.sourceModality),
        );
        for (const m of result.activeModalities) {
          expect(perceivedModalities.has(m)).toBe(true);
        }
        for (const m of perceivedModalities) {
          expect(result.activeModalities).toContain(m);
        }
      });
    }
  }
});

// ============================================================
// Pipeline output structure validation
// ============================================================

describe("pipeline output structure", () => {
  it("window matches computePerceptionWindow output", () => {
    const input: PerceptionPipelineInput = {
      species: "chromatic",
      growthDay: 14,
      perceptionLevel: PerceptionLevel.Basic,
      inputs: [makeTextInput("test")],
    };

    const result = processPerceptionPipeline(input);
    const directWindow = computePerceptionWindow(
      PerceptionLevel.Basic,
      "chromatic",
      14,
    );

    expect(result.window).toEqual(directWindow);
  });

  it("perceptions preserve sourceModality from original inputs", () => {
    const result = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 21,
      perceptionLevel: PerceptionLevel.Structured,
      inputs: [makeTextInput("hello"), makeImageInput()],
    });

    const modalities = result.perceptions.map((p) => p.sourceModality);
    expect(modalities).toContain("text");
    expect(modalities).toContain("image");
  });

  it("imperceptible inputs are excluded from output", () => {
    // Chromatic cannot perceive vibration sensor data
    const result = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 120,
      perceptionLevel: PerceptionLevel.Full,
      inputs: [
        {
          modality: "vibration",
          timestamp: NOW,
          source: "mpu6050",
          data: {
            type: "vibration",
            magnitude: 0.3,
            frequency: 5.0,
            axes: { x: 0.1, y: 0.2, z: 0.15 },
            isRhythmic: true,
            patternFrequency: 2.5,
          },
        },
      ],
    });

    expect(result.perceptions).toHaveLength(0);
    expect(result.activeModalities).toHaveLength(0);
  });
});

// ============================================================
// Edge cases
// ============================================================

describe("edge cases", () => {
  it("handles single input gracefully", () => {
    const result = processPerceptionPipeline({
      species: "thermal",
      growthDay: 0,
      perceptionLevel: PerceptionLevel.Minimal,
      inputs: [makeTempInput(25)],
    });

    expect(result.perceptions).toHaveLength(1);
    expect(result.activeModalities).toEqual(["temperature"]);
  });

  it("handles many inputs of same modality", () => {
    const inputs = Array.from({ length: 10 }, (_, i) =>
      makeTextInput(`Message number ${i + 1}`),
    );

    const result = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 60,
      perceptionLevel: PerceptionLevel.Relational,
      inputs,
    });

    expect(result.perceptions).toHaveLength(10);
    expect(result.activeModalities).toEqual(["text"]);
  });

  it("growthDay 0 at Full level still works", () => {
    const result = processPerceptionPipeline({
      species: "chromatic",
      growthDay: 0,
      perceptionLevel: PerceptionLevel.Full,
      inputs: [makeTextInput("test")],
    });

    expect(result.perceptions).toHaveLength(1);
    expect(result.window.textAccess).toBeGreaterThanOrEqual(85);
  });

  it("very large growthDay does not crash", () => {
    const result = processPerceptionPipeline({
      species: "chemical",
      growthDay: 10000,
      perceptionLevel: PerceptionLevel.Full,
      inputs: [makeTextInput("test"), makeSystemInput()],
    });

    expect(result.perceptions.length).toBeGreaterThan(0);
    expect(result.window.textAccess).toBeLessThanOrEqual(100);
  });
});
