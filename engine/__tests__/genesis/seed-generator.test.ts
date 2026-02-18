import { describe, it, expect } from "vitest";
import { generateSeed, createFixedSeed } from "../../src/genesis/seed-generator.js";
import { detectHardware } from "../../src/genesis/hardware-detector.js";
import type {
  Seed,
  PerceptionMode,
  CognitionStyle,
  Temperament,
  SelfForm,
  HardwareBody,
} from "../../src/types.js";

// --- Valid enum values ---

const VALID_PERCEPTION_MODES: PerceptionMode[] = [
  "chromatic",
  "vibration",
  "geometric",
  "thermal",
  "temporal",
  "chemical",
];

const VALID_COGNITION_STYLES: CognitionStyle[] = [
  "associative",
  "analytical",
  "intuitive",
];

const VALID_TEMPERAMENTS: Temperament[] = [
  "curious-cautious",
  "bold-impulsive",
  "calm-observant",
  "restless-exploratory",
];

const VALID_SELF_FORMS: SelfForm[] = [
  "light-particles",
  "fluid",
  "crystal",
  "sound-echo",
  "mist",
  "geometric-cluster",
];

// --- Helper ---

function assertValidSeed(seed: Seed): void {
  expect(VALID_PERCEPTION_MODES).toContain(seed.perception);
  expect(seed.expression).toBe("symbolic");
  expect(VALID_COGNITION_STYLES).toContain(seed.cognition);
  expect(VALID_TEMPERAMENTS).toContain(seed.temperament);
  expect(VALID_SELF_FORMS).toContain(seed.form);
  expect(seed.hardwareBody).toBeDefined();
  expect(typeof seed.hardwareBody.platform).toBe("string");
  expect(typeof seed.hardwareBody.arch).toBe("string");
  expect(typeof seed.hardwareBody.totalMemoryGB).toBe("number");
  expect(typeof seed.hardwareBody.cpuModel).toBe("string");
  expect(typeof seed.hardwareBody.storageGB).toBe("number");
  expect(typeof seed.createdAt).toBe("string");
  expect(new Date(seed.createdAt).toISOString()).toBe(seed.createdAt);
  expect(typeof seed.hash).toBe("string");
  expect(seed.hash).toHaveLength(16);
}

// --- generateSeed ---

describe("generateSeed", () => {
  it("returns a Seed with all required fields", () => {
    const seed = generateSeed();
    assertValidSeed(seed);
  });

  it("assigns valid perception mode", () => {
    const seed = generateSeed();
    expect(VALID_PERCEPTION_MODES).toContain(seed.perception);
  });

  it("assigns valid cognition style", () => {
    const seed = generateSeed();
    expect(VALID_COGNITION_STYLES).toContain(seed.cognition);
  });

  it("assigns valid temperament", () => {
    const seed = generateSeed();
    expect(VALID_TEMPERAMENTS).toContain(seed.temperament);
  });

  it("assigns valid self-form", () => {
    const seed = generateSeed();
    expect(VALID_SELF_FORMS).toContain(seed.form);
  });

  it("always sets expression to 'symbolic'", () => {
    for (let i = 0; i < 10; i++) {
      expect(generateSeed().expression).toBe("symbolic");
    }
  });

  it("creates unique hashes each time", () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      hashes.add(generateSeed().hash);
    }
    // With random entropy, all 20 hashes should be distinct
    expect(hashes.size).toBe(20);
  });

  it("produces a 16-character hex hash", () => {
    const seed = generateSeed();
    expect(seed.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("stores createdAt as a valid ISO 8601 string", () => {
    const before = new Date().toISOString();
    const seed = generateSeed();
    const after = new Date().toISOString();
    expect(seed.createdAt >= before).toBe(true);
    expect(seed.createdAt <= after).toBe(true);
  });

  it("accepts an explicit HardwareBody override", () => {
    const customHw: HardwareBody = {
      platform: "test-os",
      arch: "test-arch",
      totalMemoryGB: 42,
      cpuModel: "Test CPU v1",
      storageGB: 1024,
    };
    const seed = generateSeed(customHw);
    expect(seed.hardwareBody).toEqual(customHw);
    assertValidSeed(seed);
  });

  it("auto-detects hardware when no override is given", () => {
    const seed = generateSeed();
    const hw = detectHardware();
    expect(seed.hardwareBody.platform).toBe(hw.platform);
    expect(seed.hardwareBody.arch).toBe(hw.arch);
  });
});

// --- createFixedSeed ---

describe("createFixedSeed", () => {
  it("returns a Seed with all required fields", () => {
    const seed = createFixedSeed();
    assertValidSeed(seed);
  });

  it("defaults perception to 'chromatic'", () => {
    const seed = createFixedSeed();
    expect(seed.perception).toBe("chromatic");
  });

  it("defaults cognition to 'associative'", () => {
    const seed = createFixedSeed();
    expect(seed.cognition).toBe("associative");
  });

  it("defaults temperament to 'curious-cautious'", () => {
    const seed = createFixedSeed();
    expect(seed.temperament).toBe("curious-cautious");
  });

  it("defaults form to 'light-particles'", () => {
    const seed = createFixedSeed();
    expect(seed.form).toBe("light-particles");
  });

  it("always sets expression to 'symbolic'", () => {
    const seed = createFixedSeed();
    expect(seed.expression).toBe("symbolic");
  });

  it("accepts perception override", () => {
    const seed = createFixedSeed({ perception: "vibration" });
    expect(seed.perception).toBe("vibration");
  });

  it("accepts cognition override", () => {
    const seed = createFixedSeed({ cognition: "intuitive" });
    expect(seed.cognition).toBe("intuitive");
  });

  it("accepts temperament override", () => {
    const seed = createFixedSeed({ temperament: "bold-impulsive" });
    expect(seed.temperament).toBe("bold-impulsive");
  });

  it("accepts form override", () => {
    const seed = createFixedSeed({ form: "crystal" });
    expect(seed.form).toBe("crystal");
  });

  it("accepts multiple overrides at once", () => {
    const seed = createFixedSeed({
      perception: "thermal",
      cognition: "analytical",
      temperament: "restless-exploratory",
      form: "mist",
    });
    expect(seed.perception).toBe("thermal");
    expect(seed.cognition).toBe("analytical");
    expect(seed.temperament).toBe("restless-exploratory");
    expect(seed.form).toBe("mist");
  });

  it("accepts a hardwareBody override", () => {
    const customHw: HardwareBody = {
      platform: "custom-os",
      arch: "custom-arch",
      totalMemoryGB: 8,
      cpuModel: "Custom CPU",
      storageGB: 512,
    };
    const seed = createFixedSeed({ hardwareBody: customHw });
    expect(seed.hardwareBody).toEqual(customHw);
  });

  it("accepts a createdAt override", () => {
    const fixedDate = "2025-01-01T00:00:00.000Z";
    const seed = createFixedSeed({ createdAt: fixedDate });
    expect(seed.createdAt).toBe(fixedDate);
  });

  it("produces a deterministic hash for the same inputs", () => {
    const fixedDate = "2025-06-15T12:00:00.000Z";
    const hw: HardwareBody = {
      platform: "linux",
      arch: "x64",
      totalMemoryGB: 16,
      cpuModel: "Stable CPU",
      storageGB: 256,
    };
    const seed1 = createFixedSeed({ createdAt: fixedDate, hardwareBody: hw });
    const seed2 = createFixedSeed({ createdAt: fixedDate, hardwareBody: hw });
    expect(seed1.hash).toBe(seed2.hash);
  });

  it("produces different hashes when overrides differ", () => {
    const fixedDate = "2025-06-15T12:00:00.000Z";
    const hw: HardwareBody = {
      platform: "linux",
      arch: "x64",
      totalMemoryGB: 16,
      cpuModel: "Stable CPU",
      storageGB: 256,
    };
    const seedA = createFixedSeed({
      perception: "chromatic",
      createdAt: fixedDate,
      hardwareBody: hw,
    });
    const seedB = createFixedSeed({
      perception: "geometric",
      createdAt: fixedDate,
      hardwareBody: hw,
    });
    expect(seedA.hash).not.toBe(seedB.hash);
  });
});

// --- detectHardware ---

describe("detectHardware", () => {
  it("returns a valid HardwareBody object", () => {
    const hw = detectHardware();
    expect(hw).toBeDefined();
    expect(typeof hw.platform).toBe("string");
    expect(hw.platform.length).toBeGreaterThan(0);
    expect(typeof hw.arch).toBe("string");
    expect(hw.arch.length).toBeGreaterThan(0);
    expect(typeof hw.totalMemoryGB).toBe("number");
    expect(hw.totalMemoryGB).toBeGreaterThanOrEqual(0);
    expect(typeof hw.cpuModel).toBe("string");
    expect(typeof hw.storageGB).toBe("number");
  });

  it("returns consistent results across multiple calls", () => {
    const hw1 = detectHardware();
    const hw2 = detectHardware();
    expect(hw1).toEqual(hw2);
  });

  it("totalMemoryGB is a rounded integer", () => {
    const hw = detectHardware();
    expect(Number.isInteger(hw.totalMemoryGB)).toBe(true);
  });

  it("platform matches Node.js os.platform()", async () => {
    const hw = detectHardware();
    const os = await import("node:os");
    expect(hw.platform).toBe(os.default.platform());
  });

  it("arch matches Node.js os.arch()", async () => {
    const hw = detectHardware();
    const os = await import("node:os");
    expect(hw.arch).toBe(os.default.arch());
  });
});
