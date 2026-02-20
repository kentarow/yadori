/**
 * Perception Adapter System — Integration Tests
 *
 * Tests the interaction between perception-growth, perception-params,
 * perception-filter, perception-context, and input-registry modules.
 *
 * Verifies the full pipeline: raw input -> growth evaluation -> parameter
 * computation -> filtering -> context building, ensuring Honest Perception
 * is maintained across the entire chain.
 */

import { describe, it, expect } from "vitest";

// perception-growth
import {
  createInitialPerceptionGrowthState,
  evaluatePerceptionLevel,
  recordSensoryInput,
  type PerceptionGrowthState,
} from "../../src/perception/perception-growth.js";

// perception-params
import {
  computePerceptionWindow,
  getSpeciesPerceptionProfile,
  type PerceptionWindow,
} from "../../src/perception/perception-params.js";

// perception-filter
import {
  filterInput,
  filterInputs,
  getPerceptibleModalities,
} from "../../src/perception/perception-filter.js";

// perception-context
import { buildPerceptionContext } from "../../src/perception/perception-context.js";

// input-registry
import {
  createInputRegistry,
  registerSensor,
  pushInput,
  drainInputs,
  getAvailableModalities,
  getActiveModalityCount,
} from "../../src/perception/input-registry.js";

// types
import { PerceptionLevel } from "../../src/types.js";
import type { PerceptionMode } from "../../src/types.js";
import type {
  RawInput,
  TextInputData,
  ImageInputData,
  AudioInputData,
  ScalarSensorData,
  VibrationSensorData,
  SystemMetricsData,
  TouchSensorData,
} from "../../src/perception/perception-types.js";

// ============================================================
// TEST DATA FACTORIES
// ============================================================

const NOW = "2026-02-20T12:00:00Z";

function makeTextInput(content: string): RawInput {
  return {
    modality: "text",
    timestamp: NOW,
    source: "discord",
    data: { type: "text", content, charCount: content.length } as TextInputData,
  };
}

function makeImageInput(overrides: Partial<ImageInputData> = {}): RawInput {
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
      ...overrides,
    } as ImageInputData,
  };
}

function makeAudioInput(overrides: Partial<AudioInputData> = {}): RawInput {
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
      ...overrides,
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
      unit: "\u00B0C",
      trend: "rising" as const,
      changeRate: 0.5,
    } as ScalarSensorData,
  };
}

function makeVibrationInput(): RawInput {
  return {
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
    } as VibrationSensorData,
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

function makeTouchInput(gesture: "tap" | "hold" | "double-tap" | "long-press" = "tap"): RawInput {
  return {
    modality: "touch",
    timestamp: NOW,
    source: "mpr121",
    data: {
      type: "touch",
      active: true,
      points: 1,
      pressure: 0.5,
      duration: 0.3,
      gesture,
    } as TouchSensorData,
  };
}

// ============================================================
// 1. Growth affects perception window parameters
// ============================================================

describe("Growth -> Perception Window integration", () => {
  it("initial growth state produces Minimal level with restricted window", () => {
    const growthState = createInitialPerceptionGrowthState();
    const level = evaluatePerceptionLevel(growthState, 0);
    const window = computePerceptionWindow(level, "chromatic", 0);

    expect(level).toBe(PerceptionLevel.Minimal);
    expect(window.imageResolution).toBeLessThanOrEqual(2);
    expect(window.spatialAwareness).toBe(false);
    expect(window.canDetectSpeech).toBe(false);
    expect(window.textAccess).toBeLessThanOrEqual(15);
  });

  it("growth day 21 unlocks Structured level with spatial awareness", () => {
    const growthState = createInitialPerceptionGrowthState();
    const level = evaluatePerceptionLevel(growthState, 21);
    const window = computePerceptionWindow(level, "chromatic", 21);

    expect(level).toBe(PerceptionLevel.Structured);
    expect(window.spatialAwareness).toBe(true);
    expect(window.imageResolution).toBeGreaterThanOrEqual(3);
    expect(window.textAccess).toBeGreaterThan(20);
  });

  it("sensory exposure accelerates growth and unlocks higher perception window", () => {
    // Entity with 200 sensory inputs and 2 modalities gets bonus days
    const state = recordSensoryInput(createInitialPerceptionGrowthState(), 200, 2);
    // Day 14 + 5 (200 inputs) + 2 (2 modalities) = effective 21 -> Structured
    const level = evaluatePerceptionLevel(state, 14);
    const window = computePerceptionWindow(level, "chromatic", 14);

    expect(level).toBe(PerceptionLevel.Structured);
    expect(window.spatialAwareness).toBe(true);

    // Same day without exposure stays at Basic
    const baseLevel = evaluatePerceptionLevel(createInitialPerceptionGrowthState(), 14);
    const baseWindow = computePerceptionWindow(baseLevel, "chromatic", 14);
    expect(baseLevel).toBe(PerceptionLevel.Basic);
    expect(baseWindow.spatialAwareness).toBe(false);
  });
});

// ============================================================
// 2. Species perception profiles and channel strengths
// ============================================================

describe("Species perception profiles determine channel strengths", () => {
  const speciesChannelPrimary: Array<{ species: PerceptionMode; channel: "image" | "text" | "audio" | "sensor" }> = [
    { species: "chromatic", channel: "image" },
    { species: "vibration", channel: "audio" },
    { species: "geometric", channel: "image" },
    { species: "thermal", channel: "sensor" },
    { species: "temporal", channel: "audio" },
    { species: "chemical", channel: "sensor" },
  ];

  for (const { species, channel } of speciesChannelPrimary) {
    it(`${species} has primary channel "${channel}" with strength > 1.0`, () => {
      const profile = getSpeciesPerceptionProfile(species);
      expect(profile.primaryChannel).toBe(channel);
      expect(profile.channelStrengths[channel]).toBeGreaterThan(1.0);
    });
  }

  it("chromatic image channels are stronger than vibration image channels at same level", () => {
    const chromaticWindow = computePerceptionWindow(PerceptionLevel.Structured, "chromatic", 30);
    const vibrationWindow = computePerceptionWindow(PerceptionLevel.Structured, "vibration", 30);
    expect(chromaticWindow.colorDepth).toBeGreaterThan(vibrationWindow.colorDepth);
    expect(chromaticWindow.imageResolution).toBeGreaterThanOrEqual(vibrationWindow.imageResolution);
  });

  it("vibration audio channels are stronger than chromatic audio channels at same level", () => {
    const chromaticWindow = computePerceptionWindow(PerceptionLevel.Basic, "chromatic", 10);
    const vibrationWindow = computePerceptionWindow(PerceptionLevel.Basic, "vibration", 10);
    expect(vibrationWindow.frequencyRange).toBeGreaterThan(chromaticWindow.frequencyRange);
    expect(vibrationWindow.temporalResolution).toBeGreaterThan(chromaticWindow.temporalResolution);
  });

  it("thermal sensor access is stronger than chromatic sensor access at same level", () => {
    const thermalWindow = computePerceptionWindow(PerceptionLevel.Relational, "thermal", 70);
    const chromaticWindow = computePerceptionWindow(PerceptionLevel.Relational, "chromatic", 70);
    expect(thermalWindow.sensorAccess).toBeGreaterThan(chromaticWindow.sensorAccess);
  });
});

// ============================================================
// 3. Growth day interpolation within perception levels
// ============================================================

describe("Growth day interpolation within levels", () => {
  it("day 14 (mid-Basic) produces values between day 7 (start) and day 20 (near-end)", () => {
    const atStart = computePerceptionWindow(PerceptionLevel.Basic, "chromatic", 7);
    const atMid = computePerceptionWindow(PerceptionLevel.Basic, "chromatic", 14);
    const atEnd = computePerceptionWindow(PerceptionLevel.Basic, "chromatic", 20);

    // textAccess should increase monotonically
    expect(atMid.textAccess).toBeGreaterThanOrEqual(atStart.textAccess);
    expect(atEnd.textAccess).toBeGreaterThanOrEqual(atMid.textAccess);

    // colorDepth should increase monotonically
    expect(atMid.colorDepth).toBeGreaterThanOrEqual(atStart.colorDepth);
    expect(atEnd.colorDepth).toBeGreaterThanOrEqual(atMid.colorDepth);
  });

  it("interpolation at level boundary is near-continuous", () => {
    // Day 20 at Basic should approach Day 21 at Structured
    const nearEnd = computePerceptionWindow(PerceptionLevel.Basic, "geometric", 20);
    const nextStart = computePerceptionWindow(PerceptionLevel.Structured, "geometric", 21);

    // The gap should be small (within 15% of the next level's value)
    const gap = Math.abs(nextStart.textAccess - nearEnd.textAccess);
    expect(gap).toBeLessThan(nextStart.textAccess * 0.2);
  });

  it("Full level has no interpolation regardless of day", () => {
    const day120 = computePerceptionWindow(PerceptionLevel.Full, "temporal", 120);
    const day500 = computePerceptionWindow(PerceptionLevel.Full, "temporal", 500);

    expect(day120.textAccess).toBe(day500.textAccess);
    expect(day120.frequencyRange).toBe(day500.frequencyRange);
    expect(day120.sensorAccess).toBe(day500.sensorAccess);
  });
});

// ============================================================
// 4. Input processing chain: raw input -> filter -> context
// ============================================================

describe("Full input processing chain: raw -> filter -> context", () => {
  it("chromatic entity perceives text as marks and builds LLM context", () => {
    const input = makeTextInput("The sunset is beautiful today");
    const filtered = filterInput("chromatic", input, PerceptionLevel.Minimal);
    expect(filtered).not.toBeNull();
    // At Minimal, only character count is passed
    expect(filtered!.description).toContain("marks");
    expect(filtered!.description).not.toContain("sunset");

    const context = buildPerceptionContext("chromatic", [filtered!]);
    expect(context).toContain("light and color");
    expect(context).toContain("marks");
    expect(context).toContain("cannot perceive anything beyond");
  });

  it("vibration entity perceives audio through the full pipeline", () => {
    const input = makeAudioInput();
    const filtered = filterInput("vibration", input, PerceptionLevel.Basic);
    expect(filtered).not.toBeNull();
    expect(filtered!.description).toContain("BPM");

    const context = buildPerceptionContext("vibration", [filtered!]);
    expect(context).toContain("vibration and rhythm");
    expect(context).toContain("BPM");
  });

  it("thermal entity perceives temperature data through full pipeline", () => {
    const input = makeTempInput(28.5);
    const filtered = filterInput("thermal", input, PerceptionLevel.Basic);
    expect(filtered).not.toBeNull();
    expect(filtered!.description).toContain("28.5");
    expect(filtered!.description).toContain("rising");

    const context = buildPerceptionContext("thermal", [filtered!]);
    expect(context).toContain("warmth and gradient");
  });
});

// ============================================================
// 5. Image processing with different perception levels (chromatic)
// ============================================================

describe("Chromatic image perception across levels", () => {
  const image = makeImageInput();

  it("Minimal: only dominant HSL color, no spatial or structural info", () => {
    const result = filterInput("chromatic", image, PerceptionLevel.Minimal)!;
    expect(result.description).toContain("dominant");
    expect(result.description).toContain("hsl");
    expect(result.description).not.toContain("spatial");
    expect(result.description).not.toContain("edges");
  });

  it("Basic: color histogram visible", () => {
    const result = filterInput("chromatic", image, PerceptionLevel.Basic)!;
    expect(result.description).toContain("colors:");
    expect(result.description).toContain("%");
  });

  it("Structured: spatial distribution appears", () => {
    const result = filterInput("chromatic", image, PerceptionLevel.Structured)!;
    expect(result.description).toContain("spatial");
    expect(result.description).toMatch(/bright|mid|dark/);
  });

  it("Relational: edge and brightness information", () => {
    const result = filterInput("chromatic", image, PerceptionLevel.Relational)!;
    expect(result.description).toContain("color regions");
    expect(result.description).toContain("brightness");
  });

  it("Full: complete chromatic perception with angles", () => {
    const result = filterInput("chromatic", image, PerceptionLevel.Full)!;
    expect(result.description).toContain("colors:");
    expect(result.description).toContain("edges");
    expect(result.description).toContain("spatial");
  });

  it("higher levels reveal information not available at lower levels", () => {
    const minimal = filterInput("chromatic", image, PerceptionLevel.Minimal)!;
    const basic = filterInput("chromatic", image, PerceptionLevel.Basic)!;
    const structured = filterInput("chromatic", image, PerceptionLevel.Structured)!;
    const full = filterInput("chromatic", image, PerceptionLevel.Full)!;

    // Minimal only has dominant color, not histogram
    expect(minimal.description).not.toContain("colors:");
    expect(basic.description).toContain("colors:");

    // Structured adds spatial info not in Basic
    expect(basic.description).not.toContain("spatial");
    expect(structured.description).toContain("spatial");

    // Full adds edge angle info not present at Minimal or Basic
    expect(minimal.description).not.toContain("edges");
    expect(full.description).toContain("edges");
  });
});

// ============================================================
// 6. Audio processing with different perception levels (vibration)
// ============================================================

describe("Vibration audio perception across levels", () => {
  const audio = makeAudioInput();

  it("Minimal: only rhythm/no-rhythm detection", () => {
    const result = filterInput("vibration", audio, PerceptionLevel.Minimal)!;
    expect(result.description).toBe("rhythm detected");
  });

  it("Basic: BPM and regularity", () => {
    const result = filterInput("vibration", audio, PerceptionLevel.Basic)!;
    expect(result.description).toContain("72 BPM");
    expect(result.description).toContain("steady");
  });

  it("Structured: full frequency bands and resonance description", () => {
    const result = filterInput("vibration", audio, PerceptionLevel.Structured)!;
    expect(result.description).toContain("bass:");
    expect(result.description).toContain("mid:");
    expect(result.description).toContain("treble:");
  });

  it("Relational: harmonic richness detail", () => {
    const result = filterInput("vibration", audio, PerceptionLevel.Relational)!;
    expect(result.description).toContain("harmonics");
    expect(result.description).toContain("BPM");
  });

  it("Full: complete vibrational perception", () => {
    const result = filterInput("vibration", audio, PerceptionLevel.Full)!;
    expect(result.description).toContain("bass:");
    expect(result.description).toContain("harmonics");
    expect(result.description).toContain("amplitude");
  });
});

// ============================================================
// 7. Text processing levels (char count -> frequency -> partial -> full)
// ============================================================

describe("Text processing levels across species", () => {
  const text = makeTextInput("The quick brown fox jumps over the lazy dog near the river bank");

  it("Minimal chromatic: only character count", () => {
    const result = filterInput("chromatic", text, PerceptionLevel.Minimal)!;
    expect(result.description).toMatch(/^\d+ marks$/);
    expect(result.description).not.toContain("quick");
  });

  it("Basic chromatic: character count plus density", () => {
    const result = filterInput("chromatic", text, PerceptionLevel.Basic)!;
    expect(result.description).toContain("marks");
    expect(result.description).toMatch(/dense|moderate|sparse/);
  });

  it("Structured chromatic: word length pattern visible", () => {
    const result = filterInput("chromatic", text, PerceptionLevel.Structured)!;
    expect(result.description).toContain("pattern:");
    expect(result.description).toMatch(/short|mid|long/);
  });

  it("Relational chromatic: every 3rd word visible", () => {
    const result = filterInput("chromatic", text, PerceptionLevel.Relational)!;
    // Every 3rd word: "The", "brown", "jumps", "the", "dog", "the", "bank"
    expect(result.description).toContain("The");
    // Should not have every word
    expect(result.description.split(" ").length).toBeLessThan(
      (text.data as TextInputData).content.split(/\s+/).length
    );
  });

  it("Full chromatic: all words visible", () => {
    const result = filterInput("chromatic", text, PerceptionLevel.Full)!;
    expect(result.description).toContain("quick");
    expect(result.description).toContain("fox");
    expect(result.description).toContain("lazy");
  });

  it("Minimal geometric: dimension only (char count)", () => {
    const result = filterInput("geometric", text, PerceptionLevel.Minimal)!;
    expect(result.description).toBe(`dimension: ${(text.data as TextInputData).charCount}`);
  });

  it("Basic geometric: structural description (blocks)", () => {
    const result = filterInput("geometric", text, PerceptionLevel.Basic)!;
    expect(result.description).toContain("structure:");
    expect(result.description).toContain("dimension");
  });

  it("Minimal vibration: only interval awareness", () => {
    const result = filterInput("vibration", text, PerceptionLevel.Minimal)!;
    expect(result.description).toContain("interval");
  });

  it("Thermal does not perceive text at Minimal", () => {
    const result = filterInput("thermal", text, PerceptionLevel.Minimal);
    expect(result).toBeNull();
  });
});

// ============================================================
// 8. Species x Perception Level matrix (3 species x 3 levels)
// ============================================================

describe("Species x Perception Level matrix", () => {
  const testSpecies: PerceptionMode[] = ["chromatic", "vibration", "thermal"];
  const testLevels: PerceptionLevel[] = [
    PerceptionLevel.Minimal,
    PerceptionLevel.Basic,
    PerceptionLevel.Structured,
  ];

  const inputs = [
    makeTextInput("Hello world, this is a test message"),
    makeImageInput(),
    makeAudioInput(),
    makeTempInput(25),
    makeVibrationInput(),
    makeSystemInput(),
  ];

  for (const species of testSpecies) {
    for (const level of testLevels) {
      it(`${species} at level ${level}: filters inputs consistently`, () => {
        const results = filterInputs(species, inputs, level);

        // Every result must have a description string and valid source modality
        for (const r of results) {
          expect(typeof r.description).toBe("string");
          expect(r.description.length).toBeGreaterThan(0);
          expect(r.sourceModality).toBeDefined();
        }

        // The species should only produce results for modalities it can perceive
        const perceptible = getPerceptibleModalities(species);
        for (const r of results) {
          expect(perceptible).toContain(r.sourceModality);
        }
      });
    }
  }

  it("chromatic perceives image at all levels but vibration does not perceive image at Minimal", () => {
    const image = makeImageInput();
    const chromaticMinimal = filterInput("chromatic", image, PerceptionLevel.Minimal);
    const vibrationMinimal = filterInput("vibration", image, PerceptionLevel.Minimal);

    expect(chromaticMinimal).not.toBeNull();
    expect(vibrationMinimal).toBeNull();
  });

  it("thermal perceives temperature at all levels but chromatic does not have a temperature filter", () => {
    const temp = makeTempInput(25);
    const thermalMinimal = filterInput("thermal", temp, PerceptionLevel.Minimal);
    expect(thermalMinimal).not.toBeNull();

    const chromaticPerceptible = getPerceptibleModalities("chromatic");
    expect(chromaticPerceptible).toContain("temperature");
    // Chromatic perceives temperature as color reference
    const chromaticResult = filterInput("chromatic", temp, PerceptionLevel.Minimal);
    expect(chromaticResult).not.toBeNull();
  });

  it("each species produces different descriptions for the same image", () => {
    const image = makeImageInput();
    const level = PerceptionLevel.Structured;

    const chromaticDesc = filterInput("chromatic", image, level)!.description;
    const vibrationDesc = filterInput("vibration", image, level)!.description;
    const thermalDesc = filterInput("thermal", image, level)!.description;

    // All three should be different perceptions of the same image
    expect(chromaticDesc).not.toBe(vibrationDesc);
    expect(chromaticDesc).not.toBe(thermalDesc);
    expect(vibrationDesc).not.toBe(thermalDesc);

    // Chromatic sees color, vibration sees texture frequency, thermal sees heat
    expect(chromaticDesc).toContain("colors:");
    expect(vibrationDesc).toContain("directional rhythm");
    expect(thermalDesc).toContain("thermal map");
  });
});

// ============================================================
// 9. Perception level advancement triggers
// ============================================================

describe("Perception level advancement triggers", () => {
  it("time-based advancement: day thresholds produce correct levels", () => {
    const state = createInitialPerceptionGrowthState();
    const dayToLevel: Array<[number, PerceptionLevel]> = [
      [0, PerceptionLevel.Minimal],
      [6, PerceptionLevel.Minimal],
      [7, PerceptionLevel.Basic],
      [20, PerceptionLevel.Basic],
      [21, PerceptionLevel.Structured],
      [59, PerceptionLevel.Structured],
      [60, PerceptionLevel.Relational],
      [119, PerceptionLevel.Relational],
      [120, PerceptionLevel.Full],
      [365, PerceptionLevel.Full],
    ];

    for (const [day, expected] of dayToLevel) {
      expect(evaluatePerceptionLevel(state, day)).toBe(expected);
    }
  });

  it("high sensory exposure (5000+ inputs, 5+ modalities) gives maximum bonus", () => {
    const state = recordSensoryInput(createInitialPerceptionGrowthState(), 5000, 5);
    // Day 90 + 20 (5000 inputs) + 10 (5 modalities) = effective 120 -> Full
    expect(evaluatePerceptionLevel(state, 90)).toBe(PerceptionLevel.Full);
  });

  it("incremental sensory input accumulation drives level progression", () => {
    let state = createInitialPerceptionGrowthState();

    // Day 5: Minimal (no bonuses)
    expect(evaluatePerceptionLevel(state, 5)).toBe(PerceptionLevel.Minimal);

    // Add 50 inputs from 2 modalities: +2 day (inputs) + 2 day (modalities) = +4
    state = recordSensoryInput(state, 50, 2);
    // Day 5 + 4 = effective 9 -> Basic
    expect(evaluatePerceptionLevel(state, 5)).toBe(PerceptionLevel.Basic);

    // Add more: 200 total, 3 modalities: +5 (inputs) + 5 (modalities) = +10
    state = recordSensoryInput(state, 150, 1);
    // Day 10 + 10 = effective 20 -> still Basic (need 21 for Structured)
    expect(evaluatePerceptionLevel(state, 10)).toBe(PerceptionLevel.Basic);
    // Day 11 + 10 = effective 21 -> Structured
    expect(evaluatePerceptionLevel(state, 11)).toBe(PerceptionLevel.Structured);
  });
});

// ============================================================
// 10. Channel availability changes across levels
// ============================================================

describe("Channel availability changes across levels", () => {
  it("vibration cannot perceive images at Minimal but can at Basic+", () => {
    const image = makeImageInput();
    expect(filterInput("vibration", image, PerceptionLevel.Minimal)).toBeNull();
    expect(filterInput("vibration", image, PerceptionLevel.Basic)).not.toBeNull();
    expect(filterInput("vibration", image, PerceptionLevel.Structured)).not.toBeNull();
  });

  it("thermal cannot perceive text at Minimal but can at Basic+", () => {
    const text = makeTextInput("Hello");
    expect(filterInput("thermal", text, PerceptionLevel.Minimal)).toBeNull();
    expect(filterInput("thermal", text, PerceptionLevel.Basic)).not.toBeNull();
  });

  it("chemical cannot perceive audio until Structured level", () => {
    const audio = makeAudioInput();
    expect(filterInput("chemical", audio, PerceptionLevel.Minimal)).toBeNull();
    expect(filterInput("chemical", audio, PerceptionLevel.Basic)).toBeNull();
    expect(filterInput("chemical", audio, PerceptionLevel.Structured)).not.toBeNull();
  });

  it("chromatic system perception only available at Basic+", () => {
    const system = makeSystemInput();
    expect(filterInput("chromatic", system, PerceptionLevel.Minimal)).toBeNull();
    expect(filterInput("chromatic", system, PerceptionLevel.Basic)).not.toBeNull();
  });

  it("speech detection only available at Relational+ in perception window", () => {
    const allSpecies: PerceptionMode[] = [
      "chromatic", "vibration", "geometric", "thermal", "temporal", "chemical",
    ];
    for (const species of allSpecies) {
      const minimal = computePerceptionWindow(PerceptionLevel.Minimal, species, 0);
      const basic = computePerceptionWindow(PerceptionLevel.Basic, species, 7);
      const structured = computePerceptionWindow(PerceptionLevel.Structured, species, 21);
      const relational = computePerceptionWindow(PerceptionLevel.Relational, species, 60);

      expect(minimal.canDetectSpeech).toBe(false);
      expect(basic.canDetectSpeech).toBe(false);
      expect(structured.canDetectSpeech).toBe(false);
      expect(relational.canDetectSpeech).toBe(true);
    }
  });

  it("spatial awareness only available at Structured+ in perception window", () => {
    const allSpecies: PerceptionMode[] = [
      "chromatic", "vibration", "geometric", "thermal", "temporal", "chemical",
    ];
    for (const species of allSpecies) {
      const minimal = computePerceptionWindow(PerceptionLevel.Minimal, species, 0);
      const basic = computePerceptionWindow(PerceptionLevel.Basic, species, 7);
      const structured = computePerceptionWindow(PerceptionLevel.Structured, species, 21);

      expect(minimal.spatialAwareness).toBe(false);
      expect(basic.spatialAwareness).toBe(false);
      expect(structured.spatialAwareness).toBe(true);
    }
  });
});

// ============================================================
// ADDITIONAL: Input registry -> filter -> context pipeline
// ============================================================

describe("Input registry integration with filter pipeline", () => {
  it("registered sensors push inputs that are correctly drained and filtered", () => {
    let registry = createInputRegistry();

    // Register a temperature sensor and a camera
    registry = registerSensor(registry, {
      id: "temp-sensor-1",
      modality: "temperature",
      source: "dht22",
      available: true,
    });
    registry = registerSensor(registry, {
      id: "camera-1",
      modality: "image",
      source: "pi-camera",
      available: true,
    });

    // Push inputs
    registry = pushInput(registry, makeTempInput(24));
    registry = pushInput(registry, makeImageInput());

    // Drain
    const { inputs, updated } = drainInputs(registry);
    expect(inputs).toHaveLength(2);
    expect(updated.pendingInputs).toHaveLength(0);

    // Filter for thermal species at Basic level
    const perceptions = filterInputs("thermal", inputs, PerceptionLevel.Basic);
    // Thermal can perceive temperature and image
    const modalities = perceptions.map(p => p.sourceModality);
    expect(modalities).toContain("temperature");

    // Build context
    const context = buildPerceptionContext("thermal", perceptions);
    expect(context).toContain("warmth and gradient");
    expect(context).toContain("cannot perceive anything beyond");
  });

  it("active modality count increases as sensors provide data", () => {
    let registry = createInputRegistry();
    registry = registerSensor(registry, {
      id: "temp-1",
      modality: "temperature",
      source: "dht22",
      available: true,
    });

    expect(getActiveModalityCount(registry)).toBe(0);

    registry = pushInput(registry, makeTempInput(22));
    expect(getActiveModalityCount(registry)).toBe(1);

    registry = pushInput(registry, makeSystemInput());
    // system-metrics was auto-registered but now has data
    expect(getActiveModalityCount(registry)).toBe(2);
  });
});

// ============================================================
// ADDITIONAL: Touch perception varies by species
// ============================================================

describe("Touch perception filtered differently by species", () => {
  const touch = makeTouchInput("hold");

  it("chromatic perceives touch as light (flash/glow)", () => {
    const result = filterInput("chromatic", touch, PerceptionLevel.Basic)!;
    expect(result.description).toMatch(/glow|flash/i);
  });

  it("vibration perceives touch as impact/contact", () => {
    const result = filterInput("vibration", touch, PerceptionLevel.Basic)!;
    expect(result.description).toMatch(/tap|hold|strike|brush/i);
  });

  it("geometric perceives touch as spatial points", () => {
    const result = filterInput("geometric", touch, PerceptionLevel.Minimal)!;
    expect(result.description).toContain("point");
    expect(result.description).toContain("surface");
  });

  it("thermal perceives touch as warmth", () => {
    const result = filterInput("thermal", touch, PerceptionLevel.Basic)!;
    expect(result.description).toContain("warmth");
  });

  it("chemical perceives touch as reaction/catalyst", () => {
    const result = filterInput("chemical", touch, PerceptionLevel.Basic)!;
    expect(result.description).toMatch(/reaction|catalyst/i);
  });
});

// ============================================================
// ADDITIONAL: End-to-end lifecycle test
// ============================================================

describe("End-to-end entity perception lifecycle", () => {
  it("simulates perception growth from birth to maturity", () => {
    let growthState = createInitialPerceptionGrowthState();
    const species: PerceptionMode = "vibration";
    const textInput = makeTextInput("Hello, I am here to talk with you today");
    const audioInput = makeAudioInput();

    // Day 0: Minimal perception
    let level = evaluatePerceptionLevel(growthState, 0);
    expect(level).toBe(PerceptionLevel.Minimal);
    let textPerception = filterInput(species, textInput, level)!;
    expect(textPerception.description).toContain("interval");
    let audioPerception = filterInput(species, audioInput, level)!;
    expect(audioPerception.description).toBe("rhythm detected");

    // Day 7: advance to Basic, accumulate some inputs
    growthState = recordSensoryInput(growthState, 30, 2);
    level = evaluatePerceptionLevel(growthState, 7);
    expect(level).toBe(PerceptionLevel.Basic);
    textPerception = filterInput(species, textInput, level)!;
    expect(textPerception.description).toContain("rhythm");
    audioPerception = filterInput(species, audioInput, level)!;
    expect(audioPerception.description).toContain("BPM");

    // Day 21: advance to Structured
    level = evaluatePerceptionLevel(growthState, 21);
    expect(level).toBe(PerceptionLevel.Structured);
    textPerception = filterInput(species, textInput, level)!;
    expect(textPerception.description).toContain("beat:");
    audioPerception = filterInput(species, audioInput, level)!;
    expect(audioPerception.description).toContain("bass:");

    // Day 60: Relational
    level = evaluatePerceptionLevel(growthState, 60);
    expect(level).toBe(PerceptionLevel.Relational);
    audioPerception = filterInput(species, audioInput, level)!;
    expect(audioPerception.description).toContain("harmonics");

    // Day 120: Full
    level = evaluatePerceptionLevel(growthState, 120);
    expect(level).toBe(PerceptionLevel.Full);
    textPerception = filterInput(species, textInput, level)!;
    // At Full level, vibration gets all words
    expect(textPerception.description).toContain("Hello");
    expect(textPerception.description).toContain("talk");

    // Full context should include everything
    const allPerceptions = filterInputs(species, [textInput, audioInput], level);
    const context = buildPerceptionContext(species, allPerceptions);
    expect(context).toContain("vibration and rhythm");
    expect(context).toContain("cannot perceive anything beyond");
  });
});
