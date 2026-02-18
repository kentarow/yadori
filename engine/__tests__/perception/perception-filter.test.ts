import { describe, it, expect } from "vitest";
import { filterInput, filterInputs, getPerceptibleModalities } from "../../src/perception/perception-filter.js";
import { PerceptionLevel } from "../../src/types.js";
import type { PerceptionMode } from "../../src/types.js";
import type {
  RawInput,
  TextInputData,
  ImageInputData,
  AudioInputData,
  ScalarSensorData,
  VibrationSensorData,
  ColorSensorData,
  ProximitySensorData,
  SystemMetricsData,
} from "../../src/perception/perception-types.js";

const NOW = "2026-02-18T12:00:00Z";

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

function makeGasInput(ppm: number): RawInput {
  return {
    modality: "gas",
    timestamp: NOW,
    source: "ccs811",
    data: {
      type: "scalar",
      value: ppm,
      unit: "ppm",
      trend: "rising" as const,
      changeRate: 10,
    } as ScalarSensorData,
  };
}

// ============================================================
// CHROMATIC
// ============================================================

describe("chromatic filters", () => {
  const species: PerceptionMode = "chromatic";

  it("text Level 0: only char count", () => {
    const result = filterInput(species, makeTextInput("Hello world"), PerceptionLevel.Minimal);
    expect(result).not.toBeNull();
    expect(result!.description).toBe("11 marks");
  });

  it("text Level 1: char count + density", () => {
    const result = filterInput(species, makeTextInput("Hello world, how are you today?"), PerceptionLevel.Basic);
    expect(result!.description).toContain("marks");
    expect(result!.description).toContain("moderate");
  });

  it("text Level 3+: partial text exposed", () => {
    const result = filterInput(species, makeTextInput("The quick brown fox jumps over the lazy dog"), PerceptionLevel.Full);
    expect(result!.description).toContain("The");
    expect(result!.description).toContain("fox");
  });

  it("image Level 0: only dominant color", () => {
    const result = filterInput(species, makeImageInput(), PerceptionLevel.Minimal);
    expect(result!.description).toContain("dominant");
    expect(result!.description).toContain("hsl");
  });

  it("image Level 1: color histogram", () => {
    const result = filterInput(species, makeImageInput(), PerceptionLevel.Basic);
    expect(result!.description).toContain("colors:");
    expect(result!.description).toContain("%");
  });

  it("light sensor: perceivable", () => {
    const result = filterInput(species, makeLightInput(500), PerceptionLevel.Basic);
    expect(result).not.toBeNull();
    expect(result!.description).toContain("moderate glow");
  });

  it("vibration sensor: NOT perceivable", () => {
    const result = filterInput(species, makeVibrationInput(), PerceptionLevel.Full);
    expect(result).toBeNull();
  });

  it("gas sensor: NOT perceivable at low levels", () => {
    const result = filterInput(species, makeGasInput(500), PerceptionLevel.Minimal);
    expect(result).toBeNull();
  });
});

// ============================================================
// VIBRATION
// ============================================================

describe("vibration filters", () => {
  const species: PerceptionMode = "vibration";

  it("text Level 0: only interval awareness", () => {
    const result = filterInput(species, makeTextInput("Hello"), PerceptionLevel.Minimal);
    expect(result!.description).toContain("interval");
  });

  it("text Level 1: consonant/vowel rhythm", () => {
    const result = filterInput(species, makeTextInput("Hello world"), PerceptionLevel.Basic);
    expect(result!.description).toMatch(/hard|soft/);
  });

  it("audio: beat detection at Level 0", () => {
    const result = filterInput(species, makeAudioInput(), PerceptionLevel.Minimal);
    expect(result!.description).toBe("rhythm detected");
  });

  it("audio Level 1: BPM + regularity", () => {
    const result = filterInput(species, makeAudioInput(), PerceptionLevel.Basic);
    expect(result!.description).toContain("72 BPM");
    expect(result!.description).toContain("steady");
  });

  it("vibration sensor: perceivable from Level 0", () => {
    const result = filterInput(species, makeVibrationInput(), PerceptionLevel.Minimal);
    expect(result).not.toBeNull();
    expect(result!.description).toContain("tremor");
  });

  it("vibration sensor Level 2: pattern recognition", () => {
    const result = filterInput(species, makeVibrationInput(), PerceptionLevel.Structured);
    expect(result!.description).toContain("rhythmic");
  });

  it("image: NOT perceivable at Level 0", () => {
    const result = filterInput(species, makeImageInput(), PerceptionLevel.Minimal);
    expect(result).toBeNull();
  });

  it("image: perceivable at Level 1+ as texture frequency", () => {
    const result = filterInput(species, makeImageInput(), PerceptionLevel.Basic);
    expect(result).not.toBeNull();
    expect(result!.description).toContain("frequency");
  });

  it("temperature: NOT perceivable", () => {
    const result = filterInput(species, makeTempInput(25), PerceptionLevel.Full);
    expect(result).toBeNull();
  });
});

// ============================================================
// GEOMETRIC
// ============================================================

describe("geometric filters", () => {
  const species: PerceptionMode = "geometric";

  it("text Level 0: dimension only", () => {
    const result = filterInput(species, makeTextInput("Hello"), PerceptionLevel.Minimal);
    expect(result!.description).toBe("dimension: 5");
  });

  it("image Level 0: aspect ratio", () => {
    const result = filterInput(species, makeImageInput(), PerceptionLevel.Minimal);
    expect(result!.description).toContain("wide");
  });

  it("image Level 1: edge density + angles", () => {
    const result = filterInput(species, makeImageInput(), PerceptionLevel.Basic);
    expect(result!.description).toContain("edges");
    expect(result!.description).toContain("dominant");
  });

  it("proximity: form detection", () => {
    const input: RawInput = {
      modality: "proximity",
      timestamp: NOW,
      source: "hc-sr04",
      data: {
        type: "proximity",
        detected: true,
        distanceCm: 30,
        presenceDuration: 10,
      } as ProximitySensorData,
    };
    const result = filterInput(species, input, PerceptionLevel.Minimal);
    expect(result!.description).toBe("form detected");
  });

  it("temperature: NOT perceivable", () => {
    const result = filterInput(species, makeTempInput(25), PerceptionLevel.Full);
    expect(result).toBeNull();
  });
});

// ============================================================
// THERMAL
// ============================================================

describe("thermal filters", () => {
  const species: PerceptionMode = "thermal";

  it("temperature Level 0: absolute value", () => {
    const result = filterInput(species, makeTempInput(23.4), PerceptionLevel.Minimal);
    expect(result!.description).toContain("23.4");
  });

  it("temperature Level 1: with trend", () => {
    const result = filterInput(species, makeTempInput(23.4), PerceptionLevel.Basic);
    expect(result!.description).toContain("rising");
  });

  it("text: NOT perceivable at Level 0", () => {
    const result = filterInput(species, makeTextInput("Hello"), PerceptionLevel.Minimal);
    expect(result).toBeNull();
  });

  it("text Level 1: frequency as warmth", () => {
    const result = filterInput(species, makeTextInput("Hello world, how are you?"), PerceptionLevel.Basic);
    expect(result).not.toBeNull();
    expect(result!.description).toContain("warmth");
  });

  it("system: CPU temperature always perceivable", () => {
    const result = filterInput(species, makeSystemInput(), PerceptionLevel.Minimal);
    expect(result!.description).toContain("52°C");
  });

  it("vibration: NOT perceivable", () => {
    const result = filterInput(species, makeVibrationInput(), PerceptionLevel.Full);
    expect(result).toBeNull();
  });
});

// ============================================================
// TEMPORAL
// ============================================================

describe("temporal filters", () => {
  const species: PerceptionMode = "temporal";

  it("text Level 0: timestamp only", () => {
    const result = filterInput(species, makeTextInput("Hello"), PerceptionLevel.Minimal);
    expect(result!.description).toContain("timestamp");
  });

  it("audio Level 0: duration", () => {
    const result = filterInput(species, makeAudioInput(), PerceptionLevel.Minimal);
    expect(result!.description).toContain("3.2s");
  });

  it("temperature: change rate at Level 0", () => {
    const result = filterInput(species, makeTempInput(25), PerceptionLevel.Minimal);
    expect(result!.description).toContain("changing");
  });

  it("system: uptime", () => {
    const result = filterInput(species, makeSystemInput(), PerceptionLevel.Minimal);
    expect(result!.description).toContain("72h");
  });

  it("image: NOT perceivable", () => {
    const result = filterInput(species, makeImageInput(), PerceptionLevel.Full);
    expect(result).toBeNull();
  });
});

// ============================================================
// CHEMICAL
// ============================================================

describe("chemical filters", () => {
  const species: PerceptionMode = "chemical";

  it("text Level 0: character diversity", () => {
    const result = filterInput(species, makeTextInput("Hello"), PerceptionLevel.Minimal);
    expect(result!.description).toContain("diversity");
  });

  it("gas sensor: perceivable from Level 0", () => {
    const result = filterInput(species, makeGasInput(700), PerceptionLevel.Minimal);
    expect(result!.description).toContain("reactive");
  });

  it("gas sensor Level 1: with values", () => {
    const result = filterInput(species, makeGasInput(700), PerceptionLevel.Basic);
    expect(result!.description).toContain("700");
    expect(result!.description).toContain("ppm");
  });

  it("image: NOT perceivable at Level 0", () => {
    const result = filterInput(species, makeImageInput(), PerceptionLevel.Minimal);
    expect(result).toBeNull();
  });

  it("system: solution density", () => {
    const result = filterInput(species, makeSystemInput(), PerceptionLevel.Minimal);
    expect(result!.description).toContain("dilute");
  });
});

// ============================================================
// CROSS-SPECIES
// ============================================================

describe("filterInputs (batch)", () => {
  it("filters multiple inputs, removing imperceptible ones", () => {
    const inputs = [
      makeTextInput("Hello"),
      makeImageInput(),
      makeVibrationInput(),
      makeTempInput(25),
    ];

    // Chromatic can perceive text + image + temperature (at some levels)
    // but NOT vibration
    const chromatic = filterInputs("chromatic", inputs, PerceptionLevel.Basic);
    const modalities = chromatic.map(p => p.sourceModality);
    expect(modalities).toContain("text");
    expect(modalities).toContain("image");
    expect(modalities).not.toContain("vibration");
  });

  it("vibration type gets different set than chromatic", () => {
    const inputs = [
      makeTextInput("Hello"),
      makeImageInput(),
      makeVibrationInput(),
      makeTempInput(25),
    ];

    const vibResults = filterInputs("vibration", inputs, PerceptionLevel.Basic);
    const modalities = vibResults.map(p => p.sourceModality);
    expect(modalities).toContain("text");
    expect(modalities).toContain("vibration");
    expect(modalities).toContain("image"); // vibration perceives image texture at Level 1+
    expect(modalities).not.toContain("temperature");
  });
});

describe("getPerceptibleModalities", () => {
  it("returns different modality sets for different species", () => {
    const chromatic = getPerceptibleModalities("chromatic");
    const vibration = getPerceptibleModalities("vibration");
    const thermal = getPerceptibleModalities("thermal");

    expect(chromatic).toContain("light");
    expect(chromatic).toContain("color");
    expect(chromatic).not.toContain("vibration");

    expect(vibration).toContain("vibration");
    expect(vibration).toContain("audio");

    expect(thermal).toContain("temperature");
    expect(thermal).toContain("humidity");
  });
});

describe("perception level progression", () => {
  const species: PerceptionMode = "chromatic";

  it("same input yields more detail at higher levels", () => {
    const img = makeImageInput();

    const l0 = filterInput(species, img, PerceptionLevel.Minimal)!;
    const l1 = filterInput(species, img, PerceptionLevel.Basic)!;
    const l2 = filterInput(species, img, PerceptionLevel.Structured)!;
    const l3 = filterInput(species, img, PerceptionLevel.Relational)!;

    // Higher levels produce longer, more detailed descriptions
    expect(l1.description.length).toBeGreaterThan(l0.description.length);
    expect(l2.description.length).toBeGreaterThan(l1.description.length);
    expect(l3.description.length).toBeGreaterThan(l0.description.length);
  });
});
