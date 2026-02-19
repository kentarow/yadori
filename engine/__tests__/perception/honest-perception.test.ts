/**
 * Honest Perception Integration Tests
 *
 * These tests verify the MOST CRITICAL design principle: entities genuinely
 * cannot perceive data beyond their perception level. This is NOT acting —
 * it is architectural enforcement.
 *
 * Tests the full pipeline: raw data → perception filter → output
 * at each level for each species, proving that growth-based resolution
 * changes work correctly.
 */

import { describe, it, expect } from "vitest";
import { PerceptionLevel } from "../../src/types.js";
import { filterInput, filterInputs } from "../../src/perception/perception-filter.js";
import { buildPerceptionContext } from "../../src/perception/perception-context.js";
import type {
  RawInput,
  ImageInputData,
  AudioInputData,
  TextInputData,
  ScalarSensorData,
  TouchSensorData,
  SystemMetricsData,
} from "../../src/perception/perception-types.js";

// --- Test data factories ---

function makeImageInput(overrides: Partial<ImageInputData> = {}): RawInput {
  return {
    modality: "image",
    timestamp: new Date().toISOString(),
    source: "test-camera",
    data: {
      type: "image",
      width: 160,
      height: 120,
      dominantHSL: [30, 70, 55],    // warm orange
      colorHistogram: [
        { h: 30, s: 70, l: 55, pct: 40 },
        { h: 200, s: 60, l: 45, pct: 25 },
        { h: 120, s: 50, l: 40, pct: 20 },
        { h: 0, s: 80, l: 50, pct: 15 },
      ],
      edgeDensity: 0.45,            // moderate edges
      dominantAngles: [45, 135],
      brightness: 0.65,
      quadrantBrightness: [0.8, 0.6, 0.3, 0.4],
      ...overrides,
    },
  };
}

function makeAudioInput(overrides: Partial<AudioInputData> = {}): RawInput {
  return {
    modality: "audio",
    timestamp: new Date().toISOString(),
    source: "test-mic",
    data: {
      type: "audio",
      duration: 2.0,
      amplitude: 0.55,
      bands: { bass: 0.6, mid: 0.3, treble: 0.1 },
      bpm: 120,
      beatRegularity: 0.8,
      harmonicRichness: 0.7,
      ...overrides,
    },
  };
}

function makeTextInput(content = "Hello, how are you today?"): RawInput {
  return {
    modality: "text",
    timestamp: new Date().toISOString(),
    source: "user",
    data: {
      type: "text",
      content,
      charCount: content.length,
    } as TextInputData,
  };
}

function makeTemperatureInput(value = 24.5, trend: "rising" | "falling" | "stable" = "stable"): RawInput {
  return {
    modality: "temperature",
    timestamp: new Date().toISOString(),
    source: "dht22",
    data: {
      type: "scalar",
      value,
      unit: "°C",
      trend,
      changeRate: trend === "rising" ? 1.2 : trend === "falling" ? -0.8 : 0,
    } as ScalarSensorData,
  };
}

function makeTouchInput(active = true, gesture: "tap" | "hold" | "double-tap" | "long-press" | "none" = "tap"): RawInput {
  return {
    modality: "touch",
    timestamp: new Date().toISOString(),
    source: "ttp223",
    data: {
      type: "touch",
      active,
      points: 1,
      pressure: 0.6,
      duration: active ? 0.5 : null,
      gesture,
    } as TouchSensorData,
  };
}

function makeSystemInput(): RawInput {
  return {
    modality: "system",
    timestamp: new Date().toISOString(),
    source: "system",
    data: {
      type: "system",
      cpuTempC: 52,
      memoryUsedPct: 45,
      cpuLoadPct: 30,
      uptimeHours: 48,
      processCount: 120,
      diskIOReadKBs: 50,
      diskIOWriteKBs: 20,
      networkKBs: 5,
    } as SystemMetricsData,
  };
}

const ALL_SPECIES = ["chromatic", "vibration", "geometric", "thermal", "temporal", "chemical"] as const;
const ALL_LEVELS = [
  PerceptionLevel.Minimal,
  PerceptionLevel.Basic,
  PerceptionLevel.Structured,
  PerceptionLevel.Relational,
  PerceptionLevel.Full,
];

// ============================================================
// CORE: Honest Perception Enforcement
// ============================================================

describe("Honest Perception Enforcement", () => {
  describe("image perception resolution increases with level", () => {
    const imageInput = makeImageInput();

    describe("chromatic (primary image perceiver)", () => {
      it("Level 0: only dominant color, no spatial data", () => {
        const result = filterInput("chromatic", imageInput, PerceptionLevel.Minimal);
        expect(result).not.toBeNull();
        const desc = result!.description;
        // Should contain dominant color
        expect(desc).toContain("dominant");
        expect(desc).toContain("hsl");
        // Should NOT contain spatial data
        expect(desc).not.toContain("top-left");
        expect(desc).not.toContain("bottom");
        expect(desc).not.toContain("edge");
        expect(desc).not.toContain("region");
      });

      it("Level 1: color histogram visible, no spatial", () => {
        const result = filterInput("chromatic", imageInput, PerceptionLevel.Basic);
        expect(result).not.toBeNull();
        const desc = result!.description;
        // Should contain color data
        expect(desc).toContain("colors");
        // Should NOT contain spatial or edge data
        expect(desc).not.toContain("top-left");
        expect(desc).not.toContain("edge");
      });

      it("Level 2: spatial brightness appears", () => {
        const result = filterInput("chromatic", imageInput, PerceptionLevel.Structured);
        expect(result).not.toBeNull();
        const desc = result!.description;
        // Should contain spatial terms
        expect(desc).toContain("spatial");
        expect(desc).toMatch(/top-left|top-right|bottom-left|bottom-right/);
      });

      it("Level 3+: edges and regions visible", () => {
        const result = filterInput("chromatic", imageInput, PerceptionLevel.Relational);
        expect(result).not.toBeNull();
        const desc = result!.description;
        // Should contain structural data
        expect(desc).toMatch(/edge|region|brightness/);
      });

      it("resolution strictly increases: all 5 levels produce distinct output", () => {
        const descriptions = ALL_LEVELS.map(level =>
          filterInput("chromatic", imageInput, level)?.description ?? ""
        );

        // All 5 levels should produce distinct output
        for (let i = 1; i < descriptions.length; i++) {
          if (descriptions[i] && descriptions[i - 1]) {
            expect(descriptions[i]).not.toBe(descriptions[i - 1]);
          }
        }
      });
    });

    describe("vibration species cannot see images at Level 0", () => {
      it("returns null for image at Level 0", () => {
        const result = filterInput("vibration", imageInput, PerceptionLevel.Minimal);
        expect(result).toBeNull();
      });

      it("perceives image texture at Level 1+", () => {
        const result = filterInput("vibration", imageInput, PerceptionLevel.Basic);
        expect(result).not.toBeNull();
        // Sees edge density as "visual texture frequency", not colors
        expect(result!.description).toContain("frequency");
      });
    });

    describe("chemical species cannot see images at Level 0", () => {
      it("returns null at Level 0", () => {
        const result = filterInput("chemical", imageInput, PerceptionLevel.Minimal);
        expect(result).toBeNull();
      });

      it("perceives concentration at Level 1+", () => {
        const result = filterInput("chemical", imageInput, PerceptionLevel.Basic);
        expect(result).not.toBeNull();
        expect(result!.description).toContain("concentration");
      });
    });
  });

  describe("audio perception resolution increases with level", () => {
    const audioInput = makeAudioInput();

    describe("chromatic interprets sound as light/color", () => {
      it("Level 0: only bright/dim distinction", () => {
        const result = filterInput("chromatic", audioInput, PerceptionLevel.Minimal);
        expect(result).not.toBeNull();
        expect(result!.description).toMatch(/bright|dim/);
        // Should NOT contain frequency or BPM data
        expect(result!.description).not.toContain("BPM");
        expect(result!.description).not.toContain("bass");
      });

      it("Level 1: warm/cool tone distinction", () => {
        const result = filterInput("chromatic", audioInput, PerceptionLevel.Basic);
        expect(result).not.toBeNull();
        expect(result!.description).toMatch(/warm|cool/);
      });

      it("Level 2+: spectral color breakdown", () => {
        const result = filterInput("chromatic", audioInput, PerceptionLevel.Structured);
        expect(result).not.toBeNull();
        expect(result!.description).toContain("bass");
        expect(result!.description).toContain("mid");
        expect(result!.description).toContain("treble");
      });
    });

    describe("vibration is most sensitive to audio", () => {
      it("perceives rhythm even at Level 0", () => {
        const result = filterInput("vibration", audioInput, PerceptionLevel.Minimal);
        expect(result).not.toBeNull();
        expect(result!.description).toContain("rhythm");
      });

      it("Level 1: BPM + regularity", () => {
        const result = filterInput("vibration", audioInput, PerceptionLevel.Basic);
        expect(result).not.toBeNull();
        expect(result!.description).toContain("120 BPM");
      });

      it("Level 2+: full frequency band detail", () => {
        const result = filterInput("vibration", audioInput, PerceptionLevel.Structured);
        expect(result).not.toBeNull();
        const desc = result!.description;
        expect(desc).toContain("bass");
        expect(desc).toContain("mid");
        expect(desc).toContain("treble");
      });
    });

    describe("chemical cannot hear audio until Level 2+", () => {
      it("Level 0: null", () => {
        const result = filterInput("chemical", audioInput, PerceptionLevel.Minimal);
        expect(result).toBeNull();
      });

      it("Level 1: null", () => {
        const result = filterInput("chemical", audioInput, PerceptionLevel.Basic);
        expect(result).toBeNull();
      });

      it("Level 2: perceives as acoustic compound", () => {
        const result = filterInput("chemical", audioInput, PerceptionLevel.Structured);
        expect(result).not.toBeNull();
        expect(result!.description).toContain("acoustic compound");
      });
    });
  });

  describe("data never leaks across levels", () => {
    it("Level 0 chromatic image: no histogram, no edges, no quadrants", () => {
      const imageInput = makeImageInput();
      const result = filterInput("chromatic", imageInput, PerceptionLevel.Minimal);
      const desc = result!.description;

      // Should contain only the dominant color (HSL format naturally includes %)
      expect(desc).toContain("dominant");
      // Should NOT contain detailed structural data
      expect(desc).not.toContain("edge");
      expect(desc).not.toContain("angle");
      expect(desc).not.toContain("quadrant");
      expect(desc).not.toContain("spatial");
      expect(desc).not.toContain("region");
      expect(desc).not.toContain("colors:"); // no histogram
    });

    it("Level 0 vibration audio: no BPM number, no frequency bands", () => {
      const audioInput = makeAudioInput();
      const result = filterInput("vibration", audioInput, PerceptionLevel.Minimal);
      const desc = result!.description;

      expect(desc).not.toMatch(/\d+ BPM/);
      expect(desc).not.toContain("bass");
      expect(desc).not.toContain("mid");
      expect(desc).not.toContain("treble");
    });

    it("Level 0 temporal text: only timestamp, no content whatsoever", () => {
      const textInput = makeTextInput("This is a secret message with private details.");
      const result = filterInput("temporal", textInput, PerceptionLevel.Minimal);
      const desc = result!.description;

      expect(desc).toContain("timestamp");
      expect(desc).not.toContain("secret");
      expect(desc).not.toContain("private");
      expect(desc).not.toContain("message");
    });

    it("Level 0 chromatic text: only character count, no words", () => {
      const textInput = makeTextInput("Important password: abc123xyz");
      const result = filterInput("chromatic", textInput, PerceptionLevel.Minimal);
      const desc = result!.description;

      expect(desc).toContain("marks");
      expect(desc).not.toContain("password");
      expect(desc).not.toContain("abc123");
      expect(desc).not.toContain("Important");
    });
  });

  describe("species perceive the SAME input completely differently", () => {
    const imageInput = makeImageInput();

    it("chromatic sees color, vibration sees texture, geometric sees structure", () => {
      const chromatic = filterInput("chromatic", imageInput, PerceptionLevel.Basic);
      const vibration = filterInput("vibration", imageInput, PerceptionLevel.Basic);
      const geometric = filterInput("geometric", imageInput, PerceptionLevel.Basic);

      expect(chromatic!.description).toContain("colors");    // chromatic sees color
      expect(vibration!.description).toContain("frequency"); // vibration sees texture
      expect(geometric!.description).toContain("edge");      // geometric sees structure

      // They should all be different
      expect(chromatic!.description).not.toBe(vibration!.description);
      expect(chromatic!.description).not.toBe(geometric!.description);
      expect(vibration!.description).not.toBe(geometric!.description);
    });

    it("thermal sees warmth from brightness, chemical sees concentration from saturation", () => {
      const thermal = filterInput("thermal", imageInput, PerceptionLevel.Minimal);
      const chemical = filterInput("chemical", imageInput, PerceptionLevel.Basic);

      expect(thermal!.description).toMatch(/warm|cold|bright|dark/);
      expect(chemical!.description).toContain("concentration");
    });
  });
});

// ============================================================
// filterInputs: batch filtering
// ============================================================

describe("filterInputs", () => {
  it("filters out imperceptible inputs", () => {
    const inputs = [
      makeImageInput(),
      makeAudioInput(),
      makeTextInput("hello"),
      makeTemperatureInput(),
    ];

    // Chromatic at Level 0 should perceive image, audio, text, temperature
    const results = filterInputs("chromatic", inputs, PerceptionLevel.Minimal);
    expect(results.length).toBeGreaterThan(0);

    // Verify modalities
    const modalities = results.map(r => r.sourceModality);
    expect(modalities).toContain("image");
    expect(modalities).toContain("text");
  });

  it("geometric filters out temperature at all levels", () => {
    const inputs = [makeTemperatureInput()];
    for (const level of ALL_LEVELS) {
      const results = filterInputs("geometric", inputs, level);
      const mods = results.map(r => r.sourceModality);
      expect(mods).not.toContain("temperature");
    }
  });

  it("inactive touch is filtered out by all species", () => {
    const inputs = [makeTouchInput(false, "none")];
    for (const species of ALL_SPECIES) {
      for (const level of ALL_LEVELS) {
        const results = filterInputs(species, inputs, level);
        expect(results.length).toBe(0);
      }
    }
  });
});

// ============================================================
// buildPerceptionContext: LLM context generation
// ============================================================

describe("buildPerceptionContext", () => {
  it("includes species prelude", () => {
    const inputs = [makeImageInput()];
    const perceptions = filterInputs("chromatic", inputs, PerceptionLevel.Basic);
    const context = buildPerceptionContext("chromatic", perceptions);

    expect(context).toContain("What You Perceive");
    expect(context).toContain("light and color");
  });

  it("includes filtered perceptions as bullet points", () => {
    const inputs = [makeImageInput(), makeTextInput("test")];
    const perceptions = filterInputs("chromatic", inputs, PerceptionLevel.Basic);
    const context = buildPerceptionContext("chromatic", perceptions);

    // Should have bullet points
    expect(context).toContain("- ");
    expect(context).toContain("colors");
  });

  it("adds boundary notice: 'cannot perceive anything beyond'", () => {
    const perceptions = filterInputs("chromatic", [makeTextInput("hello")], PerceptionLevel.Minimal);
    const context = buildPerceptionContext("chromatic", perceptions);
    expect(context).toContain("cannot perceive anything beyond");
  });

  it("empty perceptions → species-specific void state", () => {
    const context = buildPerceptionContext("chromatic", []);
    expect(context).toContain("Darkness");

    const vibContext = buildPerceptionContext("vibration", []);
    expect(vibContext).toContain("Stillness");

    const geoContext = buildPerceptionContext("geometric", []);
    expect(geoContext).toContain("Void");
  });

  it("each species has a unique empty state", () => {
    const emptyContexts = ALL_SPECIES.map(s => buildPerceptionContext(s, []));
    const unique = new Set(emptyContexts);
    expect(unique.size).toBe(ALL_SPECIES.length);
  });
});

// ============================================================
// Growth: Level progression changes what entity perceives
// ============================================================

describe("growth-based perception progression", () => {
  it("chromatic image: all 5 levels produce distinct output", () => {
    const input = makeImageInput();
    const outputs = ALL_LEVELS.map(level =>
      filterInput("chromatic", input, level)?.description ?? null,
    );

    // All levels should produce output for chromatic+image
    expect(outputs.every(o => o !== null)).toBe(true);

    // All 5 should be unique
    const unique = new Set(outputs);
    expect(unique.size).toBe(5);
  });

  it("vibration audio: progressively more detail", () => {
    const input = makeAudioInput();
    const outputs = ALL_LEVELS.map(level =>
      filterInput("vibration", input, level)?.description ?? null,
    );

    // All should be non-null (vibration perceives audio at all levels)
    expect(outputs.every(o => o !== null)).toBe(true);

    // Level 0 is shortest, Level 4 is longest
    const lengths = outputs.map(o => o!.length);
    expect(lengths[4]).toBeGreaterThan(lengths[0]);
  });

  it("geometric image: Level 0 sees shape only, Level 4 sees precise metrics", () => {
    const input = makeImageInput();

    const l0 = filterInput("geometric", input, PerceptionLevel.Minimal)!.description;
    const l4 = filterInput("geometric", input, PerceptionLevel.Full)!.description;

    // Level 0: shape category
    expect(l0).toMatch(/wide|tall|square/);
    expect(l0).not.toContain("%");

    // Level 4: exact numbers
    expect(l4).toContain("%");
    expect(l4).toMatch(/aspect|edge|axes/);
  });

  it("thermal image: Level 0 = warm/cold, Level 2+ = thermal map", () => {
    const input = makeImageInput();

    const l0 = filterInput("thermal", input, PerceptionLevel.Minimal)!.description;
    const l2 = filterInput("thermal", input, PerceptionLevel.Structured)!.description;

    expect(l0).toMatch(/warm|cold/);
    expect(l2).toContain("thermal map");
  });

  it("temporal audio: Level 0 = duration only, Level 3+ = full BPM + regularity", () => {
    const input = makeAudioInput();

    const l0 = filterInput("temporal", input, PerceptionLevel.Minimal)!.description;
    const l3 = filterInput("temporal", input, PerceptionLevel.Full)!.description;

    expect(l0).toContain("2.0s");
    expect(l0).not.toContain("BPM");

    expect(l3).toContain("BPM");
    expect(l3).toContain("regularity");
  });
});

// ============================================================
// Touch perception: all species at all levels
// ============================================================

describe("touch perception across species", () => {
  const touchActive = makeTouchInput(true, "hold");

  it("all species perceive active touch at Level 0", () => {
    for (const species of ALL_SPECIES) {
      const result = filterInput(species, touchActive, PerceptionLevel.Minimal);
      expect(result).not.toBeNull();
    }
  });

  it("species interpret touch differently", () => {
    const descriptions = ALL_SPECIES.map(species =>
      filterInput(species, touchActive, PerceptionLevel.Basic)!.description,
    );

    // Each species has a unique interpretation
    const unique = new Set(descriptions);
    expect(unique.size).toBe(ALL_SPECIES.length);
  });

  it("inactive touch is invisible to all species", () => {
    const touchInactive = makeTouchInput(false, "none");
    for (const species of ALL_SPECIES) {
      for (const level of ALL_LEVELS) {
        const result = filterInput(species, touchInactive, level);
        expect(result).toBeNull();
      }
    }
  });
});

// ============================================================
// System metrics perception
// ============================================================

describe("system metrics perception", () => {
  const sysInput = makeSystemInput();

  it("chromatic cannot perceive system at Level 0", () => {
    const result = filterInput("chromatic", sysInput, PerceptionLevel.Minimal);
    expect(result).toBeNull();
  });

  it("chromatic perceives system at Level 1+", () => {
    const result = filterInput("chromatic", sysInput, PerceptionLevel.Basic);
    expect(result).not.toBeNull();
    expect(result!.description).toContain("glow");
  });

  it("thermal perceives system as body heat", () => {
    const result = filterInput("thermal", sysInput, PerceptionLevel.Minimal);
    expect(result).not.toBeNull();
    expect(result!.description).toContain("°C");
  });

  it("geometric sees system as node count", () => {
    const result = filterInput("geometric", sysInput, PerceptionLevel.Minimal);
    expect(result).not.toBeNull();
    expect(result!.description).toContain("nodes");
  });

  it("chemical sees system as solution density", () => {
    const result = filterInput("chemical", sysInput, PerceptionLevel.Minimal);
    expect(result).not.toBeNull();
    expect(result!.description).toMatch(/concentrated|dilute/);
  });

  it("temporal sees system as uptime", () => {
    const result = filterInput("temporal", sysInput, PerceptionLevel.Minimal);
    expect(result).not.toBeNull();
    expect(result!.description).toContain("uptime");
  });
});
