/**
 * Comprehensive Genesis Engine Tests
 *
 * Covers: statistical distribution of all trait types, sub-trait generation,
 * seed immutability, hash integrity, edge-case hardware values, and
 * species-specific sub-trait defaults.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateSeed, createFixedSeed } from "../../src/genesis/seed-generator.js";
import { detectHardware } from "../../src/genesis/hardware-detector.js";
import type {
  Seed,
  PerceptionMode,
  CognitionStyle,
  Temperament,
  SelfForm,
  HardwareBody,
  SubTraits,
} from "../../src/types.js";

// --- Valid enum values (exhaustive) ---

const ALL_PERCEPTION_MODES: PerceptionMode[] = [
  "chromatic",
  "vibration",
  "geometric",
  "thermal",
  "temporal",
  "chemical",
];

const ALL_COGNITION_STYLES: CognitionStyle[] = [
  "associative",
  "analytical",
  "intuitive",
];

const ALL_TEMPERAMENTS: Temperament[] = [
  "curious-cautious",
  "bold-impulsive",
  "calm-observant",
  "restless-exploratory",
];

const ALL_SELF_FORMS: SelfForm[] = [
  "light-particles",
  "fluid",
  "crystal",
  "sound-echo",
  "mist",
  "geometric-cluster",
];

const SUB_TRAIT_KEYS: (keyof SubTraits)[] = [
  "sensitivity",
  "sociability",
  "rhythmAffinity",
  "memoryDepth",
  "expressiveness",
];

// --- Helpers ---

function makeHardware(overrides: Partial<HardwareBody> = {}): HardwareBody {
  return {
    platform: "linux",
    arch: "x64",
    totalMemoryGB: 16,
    cpuModel: "Test CPU",
    storageGB: 256,
    ...overrides,
  };
}

// =====================================================================
// 1. Statistical Distribution — All Trait Types Appear
// =====================================================================

describe("generateSeed — statistical distribution", () => {
  const SAMPLE_SIZE = 500;
  let seeds: Seed[];

  beforeEach(() => {
    const hw = makeHardware();
    seeds = Array.from({ length: SAMPLE_SIZE }, () => generateSeed(hw));
  });

  it("produces all 6 perception modes with sufficient random runs", () => {
    const observed = new Set(seeds.map((s) => s.perception));
    for (const mode of ALL_PERCEPTION_MODES) {
      expect(observed.has(mode)).toBe(true);
    }
  });

  it("produces all 3 cognition styles with sufficient random runs", () => {
    const observed = new Set(seeds.map((s) => s.cognition));
    for (const style of ALL_COGNITION_STYLES) {
      expect(observed.has(style)).toBe(true);
    }
  });

  it("produces all 4 temperament types with sufficient random runs", () => {
    const observed = new Set(seeds.map((s) => s.temperament));
    for (const temperament of ALL_TEMPERAMENTS) {
      expect(observed.has(temperament)).toBe(true);
    }
  });

  it("produces all 6 form types with sufficient random runs", () => {
    const observed = new Set(seeds.map((s) => s.form));
    for (const form of ALL_SELF_FORMS) {
      expect(observed.has(form)).toBe(true);
    }
  });

  it("perception mode distribution is roughly uniform (no single mode > 35%)", () => {
    const counts = new Map<string, number>();
    for (const s of seeds) {
      counts.set(s.perception, (counts.get(s.perception) ?? 0) + 1);
    }
    for (const [, count] of counts) {
      // With 6 modes, expected ~16.7%; we allow up to 35% to account for randomness
      expect(count / SAMPLE_SIZE).toBeLessThan(0.35);
    }
  });

  it("cognition style distribution is roughly uniform (no single style > 55%)", () => {
    const counts = new Map<string, number>();
    for (const s of seeds) {
      counts.set(s.cognition, (counts.get(s.cognition) ?? 0) + 1);
    }
    for (const [, count] of counts) {
      // With 3 styles, expected ~33.3%; we allow up to 55% to account for randomness
      expect(count / SAMPLE_SIZE).toBeLessThan(0.55);
    }
  });

  it("temperament distribution is roughly uniform (no single type > 45%)", () => {
    const counts = new Map<string, number>();
    for (const s of seeds) {
      counts.set(s.temperament, (counts.get(s.temperament) ?? 0) + 1);
    }
    for (const [, count] of counts) {
      // With 4 types, expected 25%; allow up to 45%
      expect(count / SAMPLE_SIZE).toBeLessThan(0.45);
    }
  });

  it("form distribution is roughly uniform (no single type > 35%)", () => {
    const counts = new Map<string, number>();
    for (const s of seeds) {
      counts.set(s.form, (counts.get(s.form) ?? 0) + 1);
    }
    for (const [, count] of counts) {
      // With 6 forms, expected ~16.7%; allow up to 35%
      expect(count / SAMPLE_SIZE).toBeLessThan(0.35);
    }
  });
});

// =====================================================================
// 2. Sub-Trait Generation
// =====================================================================

describe("generateSeed — sub-traits", () => {
  it("all sub-traits are present in generated seed", () => {
    const seed = generateSeed(makeHardware());
    for (const key of SUB_TRAIT_KEYS) {
      expect(seed.subTraits).toHaveProperty(key);
    }
  });

  it("all sub-trait values are numbers in the range 0-100", () => {
    // Run multiple times to increase confidence
    for (let i = 0; i < 50; i++) {
      const seed = generateSeed(makeHardware());
      for (const key of SUB_TRAIT_KEYS) {
        const val = seed.subTraits[key];
        expect(typeof val).toBe("number");
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(100);
      }
    }
  });

  it("sub-trait values are integers (not fractional)", () => {
    for (let i = 0; i < 30; i++) {
      const seed = generateSeed(makeHardware());
      for (const key of SUB_TRAIT_KEYS) {
        expect(Number.isInteger(seed.subTraits[key])).toBe(true);
      }
    }
  });

  it("sub-traits vary across different seeds", () => {
    const hw = makeHardware();
    const seeds = Array.from({ length: 20 }, () => generateSeed(hw));
    // Check that at least one sub-trait differs between some pair of seeds
    const allIdentical = seeds.every((s) =>
      SUB_TRAIT_KEYS.every((k) => s.subTraits[k] === seeds[0].subTraits[k]),
    );
    expect(allIdentical).toBe(false);
  });

  it("sub-traits span a wide range (not all clustered in one area)", () => {
    const hw = makeHardware();
    const seeds = Array.from({ length: 100 }, () => generateSeed(hw));
    // For at least one sub-trait, we should see values both below 30 and above 70
    let foundSpread = false;
    for (const key of SUB_TRAIT_KEYS) {
      const values = seeds.map((s) => s.subTraits[key]);
      const hasLow = values.some((v) => v < 30);
      const hasHigh = values.some((v) => v > 70);
      if (hasLow && hasHigh) {
        foundSpread = true;
        break;
      }
    }
    expect(foundSpread).toBe(true);
  });
});

// =====================================================================
// 3. createFixedSeed — Sub-Trait Defaults and Overrides
// =====================================================================

describe("createFixedSeed — sub-traits", () => {
  it("uses chromatic default sub-traits when no subTraits override is given", () => {
    const seed = createFixedSeed({
      hardwareBody: makeHardware(),
      createdAt: "2025-06-01T00:00:00.000Z",
    });
    // Chromatic defaults: sensitivity=65, sociability=55, rhythmAffinity=40,
    // memoryDepth=60, expressiveness=70
    expect(seed.subTraits.sensitivity).toBe(65);
    expect(seed.subTraits.sociability).toBe(55);
    expect(seed.subTraits.rhythmAffinity).toBe(40);
    expect(seed.subTraits.memoryDepth).toBe(60);
    expect(seed.subTraits.expressiveness).toBe(70);
  });

  it("accepts custom subTraits override", () => {
    const custom: SubTraits = {
      sensitivity: 10,
      sociability: 20,
      rhythmAffinity: 30,
      memoryDepth: 40,
      expressiveness: 50,
    };
    const seed = createFixedSeed({
      subTraits: custom,
      hardwareBody: makeHardware(),
    });
    expect(seed.subTraits).toEqual(custom);
  });

  it("subTraits override does not affect other seed fields", () => {
    const custom: SubTraits = {
      sensitivity: 99,
      sociability: 99,
      rhythmAffinity: 99,
      memoryDepth: 99,
      expressiveness: 99,
    };
    const seed = createFixedSeed({
      subTraits: custom,
      perception: "vibration",
      hardwareBody: makeHardware(),
    });
    expect(seed.perception).toBe("vibration");
    expect(seed.expression).toBe("symbolic");
    expect(seed.cognition).toBe("associative"); // default
  });
});

// =====================================================================
// 4. Seed Immutability — Data Integrity After Creation
// =====================================================================

describe("seed immutability", () => {
  it("modifying a generated seed's perception does not affect other seeds", () => {
    const hw = makeHardware();
    const seed1 = generateSeed(hw);
    const seed2 = generateSeed(hw);
    const original2Perception = seed2.perception;

    // Mutating seed1 should not alter seed2
    (seed1 as any).perception = "__MUTATED__";
    expect(seed2.perception).toBe(original2Perception);
    expect(seed1.perception).toBe("__MUTATED__");
  });

  it("seed's hardwareBody is a shallow reference to the passed-in object", () => {
    const hw = makeHardware();
    const seed = generateSeed(hw);

    // generateSeed uses spread which produces a shallow copy:
    // the hardwareBody reference is shared with the input object.
    // This documents current behavior — the seed stores the same reference.
    expect(seed.hardwareBody).toBe(hw);
  });

  it("modifying a seed's subTraits after creation does not retroactively change hash", () => {
    const hw = makeHardware();
    const seed = generateSeed(hw);
    const originalHash = seed.hash;

    // Mutating subTraits after creation — hash was computed at creation time
    seed.subTraits.sensitivity = 999;
    expect(seed.hash).toBe(originalHash); // hash is a string, not recomputed
  });

  it("two identical createFixedSeed calls produce separate top-level objects", () => {
    const opts = {
      hardwareBody: makeHardware(),
      createdAt: "2025-06-01T00:00:00.000Z",
    };
    const seed1 = createFixedSeed(opts);
    const seed2 = createFixedSeed(opts);

    // Equal values but distinct top-level object references (spread creates new object)
    expect(seed1).toEqual(seed2);
    expect(seed1).not.toBe(seed2);
  });

  it("two createFixedSeed calls with separate hardware objects get separate references", () => {
    const seed1 = createFixedSeed({
      hardwareBody: makeHardware(),
      createdAt: "2025-06-01T00:00:00.000Z",
    });
    const seed2 = createFixedSeed({
      hardwareBody: makeHardware(),
      createdAt: "2025-06-01T00:00:00.000Z",
    });

    // Each call used a distinct makeHardware(), so references differ
    expect(seed1.hardwareBody).not.toBe(seed2.hardwareBody);
    expect(seed1.hardwareBody).toEqual(seed2.hardwareBody);
  });
});

// =====================================================================
// 5. Hash Integrity — Any Field Change Alters the Hash
// =====================================================================

describe("hash integrity", () => {
  const baseOpts = {
    perception: "chromatic" as PerceptionMode,
    cognition: "associative" as CognitionStyle,
    temperament: "curious-cautious" as Temperament,
    form: "light-particles" as SelfForm,
    hardwareBody: makeHardware(),
    createdAt: "2025-06-01T00:00:00.000Z",
  };

  it("changing perception produces a different hash", () => {
    const seed1 = createFixedSeed({ ...baseOpts, perception: "chromatic" });
    const seed2 = createFixedSeed({ ...baseOpts, perception: "geometric" });
    expect(seed1.hash).not.toBe(seed2.hash);
  });

  it("changing cognition produces a different hash", () => {
    const seed1 = createFixedSeed({ ...baseOpts, cognition: "associative" });
    const seed2 = createFixedSeed({ ...baseOpts, cognition: "analytical" });
    expect(seed1.hash).not.toBe(seed2.hash);
  });

  it("changing temperament produces a different hash", () => {
    const seed1 = createFixedSeed({ ...baseOpts, temperament: "curious-cautious" });
    const seed2 = createFixedSeed({ ...baseOpts, temperament: "bold-impulsive" });
    expect(seed1.hash).not.toBe(seed2.hash);
  });

  it("changing form produces a different hash", () => {
    const seed1 = createFixedSeed({ ...baseOpts, form: "light-particles" });
    const seed2 = createFixedSeed({ ...baseOpts, form: "crystal" });
    expect(seed1.hash).not.toBe(seed2.hash);
  });

  it("changing createdAt produces a different hash", () => {
    const seed1 = createFixedSeed({ ...baseOpts, createdAt: "2025-06-01T00:00:00.000Z" });
    const seed2 = createFixedSeed({ ...baseOpts, createdAt: "2025-06-02T00:00:00.000Z" });
    expect(seed1.hash).not.toBe(seed2.hash);
  });

  it("changing hardware body produces a different hash", () => {
    const seed1 = createFixedSeed({
      ...baseOpts,
      hardwareBody: makeHardware({ totalMemoryGB: 16 }),
    });
    const seed2 = createFixedSeed({
      ...baseOpts,
      hardwareBody: makeHardware({ totalMemoryGB: 32 }),
    });
    expect(seed1.hash).not.toBe(seed2.hash);
  });

  it("changing subTraits produces a different hash", () => {
    const seed1 = createFixedSeed({
      ...baseOpts,
      subTraits: { sensitivity: 50, sociability: 50, rhythmAffinity: 50, memoryDepth: 50, expressiveness: 50 },
    });
    const seed2 = createFixedSeed({
      ...baseOpts,
      subTraits: { sensitivity: 51, sociability: 50, rhythmAffinity: 50, memoryDepth: 50, expressiveness: 50 },
    });
    expect(seed1.hash).not.toBe(seed2.hash);
  });

  it("hash is always a 16-character lowercase hex string", () => {
    for (let i = 0; i < 20; i++) {
      const seed = generateSeed(makeHardware());
      expect(seed.hash).toMatch(/^[0-9a-f]{16}$/);
    }
  });
});

// =====================================================================
// 6. Edge-Case Hardware Values
// =====================================================================

describe("generateSeed — edge-case hardware values", () => {
  it("handles zero RAM hardware", () => {
    const hw = makeHardware({ totalMemoryGB: 0 });
    const seed = generateSeed(hw);
    expect(seed.hardwareBody.totalMemoryGB).toBe(0);
    // Seed should still be valid
    expect(ALL_PERCEPTION_MODES).toContain(seed.perception);
    expect(seed.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("handles unknown platform", () => {
    const hw = makeHardware({ platform: "unknown" });
    const seed = generateSeed(hw);
    expect(seed.hardwareBody.platform).toBe("unknown");
    expect(ALL_PERCEPTION_MODES).toContain(seed.perception);
  });

  it("handles empty-string platform", () => {
    const hw = makeHardware({ platform: "" });
    const seed = generateSeed(hw);
    expect(seed.hardwareBody.platform).toBe("");
    expect(seed.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("handles extremely large memory (1024 GB)", () => {
    const hw = makeHardware({ totalMemoryGB: 1024 });
    const seed = generateSeed(hw);
    expect(seed.hardwareBody.totalMemoryGB).toBe(1024);
    expect(seed.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("handles zero storage", () => {
    const hw = makeHardware({ storageGB: 0 });
    const seed = generateSeed(hw);
    expect(seed.hardwareBody.storageGB).toBe(0);
    expect(seed.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("handles extremely large storage (100 TB)", () => {
    const hw = makeHardware({ storageGB: 100_000 });
    const seed = generateSeed(hw);
    expect(seed.hardwareBody.storageGB).toBe(100_000);
    expect(ALL_PERCEPTION_MODES).toContain(seed.perception);
  });

  it("handles unknown CPU model", () => {
    const hw = makeHardware({ cpuModel: "unknown" });
    const seed = generateSeed(hw);
    expect(seed.hardwareBody.cpuModel).toBe("unknown");
    expect(seed.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("handles empty-string CPU model", () => {
    const hw = makeHardware({ cpuModel: "" });
    const seed = generateSeed(hw);
    expect(seed.hardwareBody.cpuModel).toBe("");
    expect(seed.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("handles unknown arch", () => {
    const hw = makeHardware({ arch: "unknown-arch" });
    const seed = generateSeed(hw);
    expect(seed.hardwareBody.arch).toBe("unknown-arch");
    expect(ALL_PERCEPTION_MODES).toContain(seed.perception);
  });
});

// =====================================================================
// 7. createFixedSeed — Determinism
// =====================================================================

describe("createFixedSeed — determinism", () => {
  it("same inputs always produce identical seed (including hash)", () => {
    const opts = {
      perception: "vibration" as PerceptionMode,
      cognition: "intuitive" as CognitionStyle,
      temperament: "bold-impulsive" as Temperament,
      form: "fluid" as SelfForm,
      hardwareBody: makeHardware(),
      createdAt: "2025-06-01T12:00:00.000Z",
      subTraits: {
        sensitivity: 42,
        sociability: 73,
        rhythmAffinity: 18,
        memoryDepth: 91,
        expressiveness: 55,
      },
    };

    const results = Array.from({ length: 10 }, () => createFixedSeed(opts));
    for (const seed of results) {
      expect(seed).toEqual(results[0]);
    }
  });

  it("deterministic across all 6 perception modes", () => {
    for (const perception of ALL_PERCEPTION_MODES) {
      const opts = {
        perception,
        hardwareBody: makeHardware(),
        createdAt: "2025-01-01T00:00:00.000Z",
      };
      const s1 = createFixedSeed(opts);
      const s2 = createFixedSeed(opts);
      expect(s1.hash).toBe(s2.hash);
      expect(s1).toEqual(s2);
    }
  });
});

// =====================================================================
// 8. createFixedSeed — All Perception Mode Overrides
// =====================================================================

describe("createFixedSeed — every perception mode is accepted", () => {
  for (const mode of ALL_PERCEPTION_MODES) {
    it(`accepts perception: "${mode}"`, () => {
      const seed = createFixedSeed({
        perception: mode,
        hardwareBody: makeHardware(),
      });
      expect(seed.perception).toBe(mode);
      expect(seed.hash).toMatch(/^[0-9a-f]{16}$/);
    });
  }
});

// =====================================================================
// 9. createFixedSeed — All Cognition Style Overrides
// =====================================================================

describe("createFixedSeed — every cognition style is accepted", () => {
  for (const style of ALL_COGNITION_STYLES) {
    it(`accepts cognition: "${style}"`, () => {
      const seed = createFixedSeed({
        cognition: style,
        hardwareBody: makeHardware(),
      });
      expect(seed.cognition).toBe(style);
    });
  }
});

// =====================================================================
// 10. createFixedSeed — All Temperament Overrides
// =====================================================================

describe("createFixedSeed — every temperament is accepted", () => {
  for (const temperament of ALL_TEMPERAMENTS) {
    it(`accepts temperament: "${temperament}"`, () => {
      const seed = createFixedSeed({
        temperament,
        hardwareBody: makeHardware(),
      });
      expect(seed.temperament).toBe(temperament);
    });
  }
});

// =====================================================================
// 11. createFixedSeed — All Form Overrides
// =====================================================================

describe("createFixedSeed — every form is accepted", () => {
  for (const form of ALL_SELF_FORMS) {
    it(`accepts form: "${form}"`, () => {
      const seed = createFixedSeed({
        form,
        hardwareBody: makeHardware(),
      });
      expect(seed.form).toBe(form);
    });
  }
});

// =====================================================================
// 12. Module Re-Exports (index.ts)
// =====================================================================

describe("genesis index — module re-exports", () => {
  it("exports generateSeed from index", async () => {
    const mod = await import("../../src/genesis/index.js");
    expect(typeof mod.generateSeed).toBe("function");
  });

  it("exports createFixedSeed from index", async () => {
    const mod = await import("../../src/genesis/index.js");
    expect(typeof mod.createFixedSeed).toBe("function");
  });

  it("exports detectHardware from index", async () => {
    const mod = await import("../../src/genesis/index.js");
    expect(typeof mod.detectHardware).toBe("function");
  });

  it("generateSeed from index produces valid seeds", async () => {
    const mod = await import("../../src/genesis/index.js");
    const seed = mod.generateSeed(makeHardware());
    expect(ALL_PERCEPTION_MODES).toContain(seed.perception);
    expect(seed.hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

// =====================================================================
// 13. Expression Mode — Always Symbolic
// =====================================================================

describe("expression mode — always symbolic", () => {
  it("generateSeed always sets expression to 'symbolic' across many runs", () => {
    const hw = makeHardware();
    for (let i = 0; i < 100; i++) {
      expect(generateSeed(hw).expression).toBe("symbolic");
    }
  });

  it("createFixedSeed cannot override expression (always symbolic)", () => {
    // The type system prevents this, but we verify the runtime behavior:
    // createFixedSeed does not accept expression in its overrides type,
    // so expression is always "symbolic"
    const seed = createFixedSeed({ hardwareBody: makeHardware() });
    expect(seed.expression).toBe("symbolic");
  });
});

// =====================================================================
// 14. Hardware Body Passthrough
// =====================================================================

describe("generateSeed — hardware body passthrough", () => {
  it("preserves all custom hardware fields exactly", () => {
    const hw: HardwareBody = {
      platform: "freebsd",
      arch: "riscv64",
      totalMemoryGB: 2,
      cpuModel: "SiFive U74",
      storageGB: 8,
    };
    const seed = generateSeed(hw);
    expect(seed.hardwareBody).toEqual(hw);
  });

  it("auto-detects hardware when no argument is provided", () => {
    const seed = generateSeed();
    const hw = detectHardware();
    // Platform and arch should match the running system
    expect(seed.hardwareBody.platform).toBe(hw.platform);
    expect(seed.hardwareBody.arch).toBe(hw.arch);
    expect(seed.hardwareBody.cpuModel).toBe(hw.cpuModel);
  });
});

// =====================================================================
// 15. Timestamp Validation
// =====================================================================

describe("generateSeed — timestamp", () => {
  it("createdAt is a valid ISO 8601 string", () => {
    const seed = generateSeed(makeHardware());
    const parsed = new Date(seed.createdAt);
    expect(parsed.toISOString()).toBe(seed.createdAt);
  });

  it("createdAt is close to current time", () => {
    const before = Date.now();
    const seed = generateSeed(makeHardware());
    const after = Date.now();
    const seedTime = new Date(seed.createdAt).getTime();
    expect(seedTime).toBeGreaterThanOrEqual(before);
    expect(seedTime).toBeLessThanOrEqual(after);
  });

  it("different seeds generated in sequence have non-decreasing timestamps", () => {
    const hw = makeHardware();
    const seed1 = generateSeed(hw);
    const seed2 = generateSeed(hw);
    expect(seed2.createdAt >= seed1.createdAt).toBe(true);
  });
});
