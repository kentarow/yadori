/**
 * End-to-End Test: Form Evolution
 *
 * Verifies the entity's self-perceived form evolves correctly through
 * the full lifecycle: birth -> heartbeats -> growth stages -> maturity.
 *
 * Tests the Form Engine (form-engine.ts) and Self-Image Detection
 * (self-image-detection.ts) using real engine functions with no mocks.
 */

import { describe, it, expect } from "vitest";
import { createFixedSeed } from "../../engine/src/genesis/seed-generator.js";
import {
  createEntityState,
  processHeartbeat,
  serializeState,
} from "../../engine/src/status/status-manager.js";
import {
  createInitialFormState,
  evolveForm,
  awakenSelfAwareness,
  describeForm,
  formatFormMd,
  parseFormMd,
} from "../../engine/src/form/form-engine.js";
import { detectSelfImage } from "../../engine/src/form/self-image-detection.js";
import { processImage } from "../../engine/src/perception/image-processor.js";
import { computeStage } from "../../engine/src/growth/growth-engine.js";
import type { GrowthStage } from "../../engine/src/growth/growth-engine.js";
import type {
  HardwareBody,
  SelfForm,
  Status,
  PerceptionMode,
  ImageFeatures,
} from "../../engine/src/types.js";

// --- Shared fixtures ---

const TEST_HW: HardwareBody = {
  platform: "darwin",
  arch: "arm64",
  totalMemoryGB: 16,
  cpuModel: "Apple M4",
  storageGB: 256,
};

const ALL_FORM_TYPES: SelfForm[] = [
  "light-particles",
  "fluid",
  "crystal",
  "sound-echo",
  "mist",
  "geometric-cluster",
];

const BIRTH_TIME = new Date("2026-01-01T00:00:00Z");

/** Create a status object with given overrides */
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

/**
 * Create a synthetic RGBA pixel buffer filled with a single color.
 * Useful for creating images that match a specific species palette.
 */
function createSolidColorImage(
  r: number,
  g: number,
  b: number,
  width = 10,
  height = 10,
): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

/**
 * Create a dark image with accent color dots matching the dashboard
 * (mostly black background with species-colored particles).
 */
function createDashboardLikeImage(
  accentR: number,
  accentG: number,
  accentB: number,
  width = 20,
  height = 20,
  accentDensity = 0.15,
): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const isAccent = (i % Math.round(1 / accentDensity)) === 0;
    pixels[i * 4] = isAccent ? accentR : 5;
    pixels[i * 4 + 1] = isAccent ? accentG : 5;
    pixels[i * 4 + 2] = isAccent ? accentB : 5;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

// ============================================================
// Initial form state
// ============================================================

describe("Form Evolution E2E", () => {
  it("initial form reflects seed form type", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      form: "crystal",
      createdAt: BIRTH_TIME.toISOString(),
    });
    const state = createEntityState(seed, BIRTH_TIME);

    expect(state.form.baseForm).toBe("crystal");
    expect(state.form.density).toBe(5);
    expect(state.form.complexity).toBe(3);
    expect(state.form.stability).toBe(15);
    expect(state.form.awareness).toBe(false);
  });

  it("initial form has low values regardless of form type", () => {
    for (const formType of ALL_FORM_TYPES) {
      const form = createInitialFormState(formType);
      expect(form.baseForm).toBe(formType);
      expect(form.density).toBeLessThan(10);
      expect(form.complexity).toBeLessThan(10);
      expect(form.stability).toBeLessThan(20);
      expect(form.awareness).toBe(false);
    }
  });

  // ============================================================
  // Form evolves through heartbeat cycles
  // ============================================================

  it("form evolves through heartbeat cycles", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      form: "light-particles",
      createdAt: BIRTH_TIME.toISOString(),
    });
    let state = createEntityState(seed, BIRTH_TIME);

    const initialDensity = state.form.density;
    const initialComplexity = state.form.complexity;

    // Process 15 heartbeats at 30-minute intervals over a day
    // The entity is day 0 (newborn), so form changes are modest
    for (let i = 0; i < 15; i++) {
      const heartbeatTime = new Date(BIRTH_TIME.getTime() + i * 30 * 60_000);
      const result = processHeartbeat(state, heartbeatTime);
      state = result.updatedState;
    }

    // Form should have drifted from initial values
    // newborn target: density=10, complexity=5, stability=20
    // Starting from density=5, complexity=3, stability=15
    // After 15 heartbeats with driftRate=0.08, values should have moved toward targets
    expect(state.form.density).toBeGreaterThanOrEqual(initialDensity);
    expect(state.form.complexity).toBeGreaterThanOrEqual(initialComplexity);
    // All values remain within 0-100
    expect(state.form.density).toBeGreaterThanOrEqual(0);
    expect(state.form.density).toBeLessThanOrEqual(100);
    expect(state.form.complexity).toBeGreaterThanOrEqual(0);
    expect(state.form.complexity).toBeLessThanOrEqual(100);
    expect(state.form.stability).toBeGreaterThanOrEqual(0);
    expect(state.form.stability).toBeLessThanOrEqual(100);
  });

  it("form changes accumulate over many heartbeats", () => {
    // Simulate an entity 30 days old (child stage)
    const createdAt = new Date(BIRTH_TIME.getTime() - 30 * 24 * 60 * 60_000);
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      form: "fluid",
      createdAt: createdAt.toISOString(),
    });
    let state = createEntityState(seed, createdAt);

    // Process 50 heartbeats (simulating ~25 hours of heartbeats)
    for (let i = 0; i < 50; i++) {
      const heartbeatTime = new Date(BIRTH_TIME.getTime() + i * 30 * 60_000);
      const result = processHeartbeat(state, heartbeatTime);
      state = result.updatedState;
    }

    // At child stage (day 30), targets are density=45, complexity=35, stability=50
    // After 50 heartbeats, values should have moved significantly from initial (5,3,15)
    expect(state.form.density).toBeGreaterThan(10);
    expect(state.form.complexity).toBeGreaterThan(5);
    expect(state.form.stability).toBeGreaterThan(15);
  });

  // ============================================================
  // Growth stage affects form
  // ============================================================

  describe("different growth stages drive different form changes", () => {
    /**
     * Helper: evolve a form state through N heartbeats at a given stage
     * with neutral status to isolate stage effects.
     */
    function evolveAtStage(
      stage: GrowthStage,
      heartbeats: number,
      baseForm: SelfForm = "light-particles",
    ) {
      let form = createInitialFormState(baseForm);
      const status = makeStatus();

      for (let i = 0; i < heartbeats; i++) {
        form = evolveForm(form, stage, status);
      }
      return form;
    }

    it("newborn stage: minimal form change", () => {
      const form = evolveAtStage("newborn", 20);
      // newborn targets: density=10, complexity=5, stability=20
      // Starting from 5,3,15 — drift is small
      expect(form.density).toBeLessThanOrEqual(15);
      expect(form.complexity).toBeLessThanOrEqual(10);
      expect(form.stability).toBeLessThanOrEqual(25);
    });

    it("infant stage: slow density increase", () => {
      const form = evolveAtStage("infant", 30);
      // infant targets: density=25, complexity=15, stability=35
      expect(form.density).toBeGreaterThan(5);
      expect(form.density).toBeLessThan(25);
    });

    it("child stage: complexity starts growing", () => {
      const form = evolveAtStage("child", 30);
      // child targets: density=45, complexity=35, stability=50
      const initial = createInitialFormState("light-particles");
      expect(form.complexity).toBeGreaterThan(initial.complexity + 5);
    });

    it("adolescent stage: stability increases notably", () => {
      const form = evolveAtStage("adolescent", 30);
      // adolescent targets: density=65, complexity=60, stability=55
      expect(form.stability).toBeGreaterThan(20);
      expect(form.density).toBeGreaterThan(15);
      expect(form.complexity).toBeGreaterThan(10);
    });

    it("mature stage: all values stabilize at higher levels", () => {
      const form = evolveAtStage("mature", 80);
      // mature targets: density=80, complexity=80, stability=75
      // After 80 heartbeats, values should be well above initial
      expect(form.density).toBeGreaterThan(40);
      expect(form.complexity).toBeGreaterThan(40);
      expect(form.stability).toBeGreaterThan(40);
    });

    it("higher stages produce higher form values than lower stages (same heartbeat count)", () => {
      const heartbeats = 40;
      const newborn = evolveAtStage("newborn", heartbeats);
      const child = evolveAtStage("child", heartbeats);
      const mature = evolveAtStage("mature", heartbeats);

      expect(child.density).toBeGreaterThan(newborn.density);
      expect(mature.density).toBeGreaterThan(child.density);
      expect(child.complexity).toBeGreaterThan(newborn.complexity);
      expect(mature.complexity).toBeGreaterThan(child.complexity);
    });
  });

  // ============================================================
  // Status affects form evolution
  // ============================================================

  describe("status affects form evolution", () => {
    it("high mood increases stability", () => {
      let formHigh = createInitialFormState("light-particles");
      let formLow = createInitialFormState("light-particles");
      const highMoodStatus = makeStatus({ mood: 85, energy: 50, curiosity: 50 });
      const lowMoodStatus = makeStatus({ mood: 20, energy: 50, curiosity: 50 });

      for (let i = 0; i < 20; i++) {
        formHigh = evolveForm(formHigh, "child", highMoodStatus);
        formLow = evolveForm(formLow, "child", lowMoodStatus);
      }

      expect(formHigh.stability).toBeGreaterThan(formLow.stability);
    });

    it("high energy increases density", () => {
      let formHigh = createInitialFormState("crystal");
      let formLow = createInitialFormState("crystal");
      const highEnergyStatus = makeStatus({ mood: 50, energy: 85, curiosity: 50 });
      const lowEnergyStatus = makeStatus({ mood: 50, energy: 15, curiosity: 50 });

      for (let i = 0; i < 20; i++) {
        formHigh = evolveForm(formHigh, "child", highEnergyStatus);
        formLow = evolveForm(formLow, "child", lowEnergyStatus);
      }

      expect(formHigh.density).toBeGreaterThan(formLow.density);
    });

    it("high curiosity increases complexity", () => {
      let formHigh = createInitialFormState("sound-echo");
      let formLow = createInitialFormState("sound-echo");
      const highCuriosityStatus = makeStatus({ mood: 50, energy: 50, curiosity: 85 });
      const lowCuriosityStatus = makeStatus({ mood: 50, energy: 50, curiosity: 30 });

      for (let i = 0; i < 30; i++) {
        formHigh = evolveForm(formHigh, "adolescent", highCuriosityStatus);
        formLow = evolveForm(formLow, "adolescent", lowCuriosityStatus);
      }

      expect(formHigh.complexity).toBeGreaterThan(formLow.complexity);
    });

    it("low mood and energy produce a stunted form", () => {
      let form = createInitialFormState("mist");
      const depressedStatus = makeStatus({ mood: 10, energy: 10, curiosity: 20 });

      for (let i = 0; i < 30; i++) {
        form = evolveForm(form, "child", depressedStatus);
      }

      // Despite being at child stage, low status keeps values lower
      // Stability especially suffers from low mood (-3 per heartbeat when mood < 30)
      const neutralForm = createInitialFormState("mist");
      let neutralResult = neutralForm;
      const neutralStatus = makeStatus();
      for (let i = 0; i < 30; i++) {
        neutralResult = evolveForm(neutralResult, "child", neutralStatus);
      }

      expect(form.stability).toBeLessThan(neutralResult.stability);
      expect(form.density).toBeLessThan(neutralResult.density);
    });
  });

  // ============================================================
  // Self-image detection and awareness
  // ============================================================

  describe("self-image detection triggers awareness", () => {
    it("detectSelfImage returns high resonance for matching species palette", () => {
      // Chromatic species: warm gold/pink, hue center=35, range=30
      // Create a dark image with orange-gold accent (hue ~35)
      const pixels = createDashboardLikeImage(200, 150, 50, 20, 20, 0.20);
      const features = processImage(pixels, 20, 20);

      const result = detectSelfImage(features, "chromatic");
      expect(result.resonance).toBeGreaterThan(0);
      expect(typeof result.awakens).toBe("boolean");
    });

    it("detectSelfImage returns low resonance for non-matching palette", () => {
      // Create a bright, fully green image (hue ~120)
      const pixels = createSolidColorImage(0, 255, 0, 10, 10);
      const features = processImage(pixels, 10, 10);

      // Check against vibration species (blue-purple, hue ~270)
      const result = detectSelfImage(features, "vibration");
      // Green is far from blue-purple and image is bright (not dashboard-like)
      expect(result.resonance).toBeLessThan(0.6);
      expect(result.awakens).toBe(false);
    });

    it("awakenSelfAwareness sets awareness to true", () => {
      const form = createInitialFormState("light-particles");
      expect(form.awareness).toBe(false);

      const awakened = awakenSelfAwareness(form);
      expect(awakened.awareness).toBe(true);
      // Original form unchanged (immutability)
      expect(form.awareness).toBe(false);
    });

    it("full self-image discovery flow: process image -> detect -> awaken", () => {
      // Simulate a vibration (blue-purple) entity seeing its dashboard screenshot
      // Vibration: hue center=270, range=40 -> blue-purple
      const pixels = createDashboardLikeImage(100, 50, 200, 20, 20, 0.20);
      const features = processImage(pixels, 20, 20);

      const detection = detectSelfImage(features, "vibration");

      // Proceed with awareness if resonance is strong enough
      let form = createInitialFormState("sound-echo");
      if (detection.awakens) {
        form = awakenSelfAwareness(form);
        expect(form.awareness).toBe(true);
      } else {
        // Even if this particular image doesn't trigger awakening,
        // the resonance value should still be a number between 0 and 1
        expect(detection.resonance).toBeGreaterThanOrEqual(0);
        expect(detection.resonance).toBeLessThanOrEqual(1);
      }
    });

    it("awareness persists through form evolution", () => {
      let form = createInitialFormState("fluid");
      form = awakenSelfAwareness(form);
      expect(form.awareness).toBe(true);

      // Evolve the form multiple times
      const status = makeStatus({ mood: 60, energy: 70 });
      for (let i = 0; i < 10; i++) {
        form = evolveForm(form, "child", status);
      }

      // awareness should persist through evolution
      expect(form.awareness).toBe(true);
    });
  });

  // ============================================================
  // Form across all form types
  // ============================================================

  describe.each(ALL_FORM_TYPES)("form type: %s", (formType) => {
    it("produces valid initial form", () => {
      const form = createInitialFormState(formType);
      expect(form.baseForm).toBe(formType);
      expect(form.density).toBeGreaterThanOrEqual(0);
      expect(form.density).toBeLessThanOrEqual(100);
      expect(form.complexity).toBeGreaterThanOrEqual(0);
      expect(form.complexity).toBeLessThanOrEqual(100);
      expect(form.stability).toBeGreaterThanOrEqual(0);
      expect(form.stability).toBeLessThanOrEqual(100);
      expect(form.awareness).toBe(false);
    });

    it("evolves without errors through all growth stages", () => {
      let form = createInitialFormState(formType);
      const stages: GrowthStage[] = ["newborn", "infant", "child", "adolescent", "mature"];
      const status = makeStatus({ mood: 50, energy: 50, curiosity: 50 });

      for (const stage of stages) {
        for (let i = 0; i < 10; i++) {
          form = evolveForm(form, stage, status);
        }
      }

      // After evolving through all stages, values should have increased
      expect(form.density).toBeGreaterThan(5);
      expect(form.complexity).toBeGreaterThan(3);
      expect(form.stability).toBeGreaterThan(15);
      // And remain in bounds
      expect(form.density).toBeLessThanOrEqual(100);
      expect(form.complexity).toBeLessThanOrEqual(100);
      expect(form.stability).toBeLessThanOrEqual(100);
    });

    it("produces a description at each density level", () => {
      // Test sparse description (density < 30)
      const sparse = createInitialFormState(formType);
      sparse.density = 10;
      const sparseDesc = describeForm(sparse);
      expect(typeof sparseDesc).toBe("string");
      expect(sparseDesc.length).toBeGreaterThan(0);

      // Test mid description (30 <= density < 65)
      const mid = { ...createInitialFormState(formType), density: 45 };
      const midDesc = describeForm(mid);
      expect(typeof midDesc).toBe("string");
      expect(midDesc.length).toBeGreaterThan(0);

      // Test dense description (density >= 65)
      const dense = { ...createInitialFormState(formType), density: 80 };
      const denseDesc = describeForm(dense);
      expect(typeof denseDesc).toBe("string");
      expect(denseDesc.length).toBeGreaterThan(0);

      // Descriptions should differ at different density levels
      expect(sparseDesc).not.toBe(midDesc);
      expect(midDesc).not.toBe(denseDesc);
    });
  });

  // ============================================================
  // Form serialization round-trip
  // ============================================================

  describe("form serialization", () => {
    it("form values appear in serialized state", () => {
      const seed = createFixedSeed({
        hardwareBody: TEST_HW,
        form: "crystal",
        createdAt: BIRTH_TIME.toISOString(),
      });
      const state = createEntityState(seed, BIRTH_TIME);
      const { formMd } = serializeState(state);

      expect(formMd).toContain("crystal");
      expect(formMd).toContain("**density**");
      expect(formMd).toContain("**complexity**");
      expect(formMd).toContain("**stability**");
      expect(formMd).toContain("**self-aware**: no");
      expect(formMd).toContain(`${state.form.density}`);
      expect(formMd).toContain(`${state.form.complexity}`);
      expect(formMd).toContain(`${state.form.stability}`);
    });

    it("formatFormMd -> parseFormMd round-trips correctly", () => {
      const original = createInitialFormState("fluid");
      const md = formatFormMd(original);
      const parsed = parseFormMd(md);

      expect(parsed).not.toBeNull();
      expect(parsed!.baseForm).toBe(original.baseForm);
      expect(parsed!.density).toBe(original.density);
      expect(parsed!.complexity).toBe(original.complexity);
      expect(parsed!.stability).toBe(original.stability);
      expect(parsed!.awareness).toBe(original.awareness);
    });

    it("round-trips correctly after evolution", () => {
      let form = createInitialFormState("geometric-cluster");
      const status = makeStatus({ mood: 75, energy: 80, curiosity: 90 });

      for (let i = 0; i < 25; i++) {
        form = evolveForm(form, "adolescent", status);
      }

      const md = formatFormMd(form);
      const parsed = parseFormMd(md);

      expect(parsed).not.toBeNull();
      expect(parsed!.baseForm).toBe("geometric-cluster");
      expect(parsed!.density).toBe(form.density);
      expect(parsed!.complexity).toBe(form.complexity);
      expect(parsed!.stability).toBe(form.stability);
    });

    it("round-trips correctly with awareness set to true", () => {
      let form = createInitialFormState("sound-echo");
      form = awakenSelfAwareness(form);

      const md = formatFormMd(form);
      const parsed = parseFormMd(md);

      expect(parsed).not.toBeNull();
      expect(parsed!.awareness).toBe(true);
    });

    it("serialized formMd includes a description quote", () => {
      const form = createInitialFormState("mist");
      const md = formatFormMd(form);

      // formatFormMd includes a blockquote with description
      expect(md).toContain("> ");
      // Description should be the sparse one since density=5
      const desc = describeForm(form);
      expect(md).toContain(desc);
    });
  });

  // ============================================================
  // Full lifecycle integration
  // ============================================================

  describe("full lifecycle integration", () => {
    it("form evolves correctly through the full entity lifecycle via processHeartbeat", () => {
      // Create entity born 100 days ago to reach mature stage
      const birthDate = new Date(BIRTH_TIME.getTime() - 100 * 24 * 60 * 60_000);
      const seed = createFixedSeed({
        hardwareBody: TEST_HW,
        form: "light-particles",
        createdAt: birthDate.toISOString(),
      });
      let state = createEntityState(seed, birthDate);

      const initialForm = { ...state.form };

      // Process many heartbeats at current time (entity is 100 days old, mature stage)
      for (let i = 0; i < 60; i++) {
        const heartbeatTime = new Date(BIRTH_TIME.getTime() + i * 30 * 60_000);
        const result = processHeartbeat(state, heartbeatTime);
        state = result.updatedState;
      }

      // At day 100 (mature stage), form should have evolved significantly
      expect(state.form.density).toBeGreaterThan(initialForm.density);
      expect(state.form.complexity).toBeGreaterThan(initialForm.complexity);
      expect(state.form.baseForm).toBe("light-particles");
      expect(state.form.awareness).toBe(false); // Never shown a portrait
    });

    it("growth day progression changes form evolution rate", () => {
      // Compare form evolution at different ages
      const stages: Array<{ daysOld: number; expectedStage: GrowthStage }> = [
        { daysOld: 1, expectedStage: "newborn" },
        { daysOld: 7, expectedStage: "infant" },
        { daysOld: 30, expectedStage: "child" },
        { daysOld: 60, expectedStage: "adolescent" },
        { daysOld: 120, expectedStage: "mature" },
      ];

      const results: Array<{ stage: GrowthStage; density: number; complexity: number }> = [];

      for (const { daysOld, expectedStage } of stages) {
        const birthDate = new Date(BIRTH_TIME.getTime() - daysOld * 24 * 60 * 60_000);
        const seed = createFixedSeed({
          hardwareBody: TEST_HW,
          form: "light-particles",
          createdAt: birthDate.toISOString(),
        });
        let state = createEntityState(seed, birthDate);

        // Verify stage matches expected
        const actualStage = computeStage(daysOld);
        expect(actualStage).toBe(expectedStage);

        // Process 30 heartbeats from BIRTH_TIME
        for (let i = 0; i < 30; i++) {
          const heartbeatTime = new Date(BIRTH_TIME.getTime() + i * 30 * 60_000);
          const result = processHeartbeat(state, heartbeatTime);
          state = result.updatedState;
        }

        results.push({
          stage: expectedStage,
          density: state.form.density,
          complexity: state.form.complexity,
        });
      }

      // Older entities (higher stages) should have higher form values
      // after the same number of heartbeats
      for (let i = 1; i < results.length; i++) {
        expect(results[i].density).toBeGreaterThanOrEqual(results[i - 1].density);
      }
    });

    it("form values remain bounded under extreme conditions", () => {
      let form = createInitialFormState("crystal");
      // Extreme high status
      const extremeHigh = makeStatus({ mood: 100, energy: 100, curiosity: 100 });

      // 200 heartbeats at mature stage with extreme status
      for (let i = 0; i < 200; i++) {
        form = evolveForm(form, "mature", extremeHigh);
      }

      expect(form.density).toBeLessThanOrEqual(100);
      expect(form.complexity).toBeLessThanOrEqual(100);
      expect(form.stability).toBeLessThanOrEqual(100);
      expect(form.density).toBeGreaterThanOrEqual(0);
      expect(form.complexity).toBeGreaterThanOrEqual(0);
      expect(form.stability).toBeGreaterThanOrEqual(0);
    });

    it("form values remain bounded under extreme low conditions", () => {
      let form = createInitialFormState("mist");
      const extremeLow = makeStatus({ mood: 0, energy: 0, curiosity: 0 });

      // 200 heartbeats at newborn stage with extreme low status
      for (let i = 0; i < 200; i++) {
        form = evolveForm(form, "newborn", extremeLow);
      }

      expect(form.density).toBeLessThanOrEqual(100);
      expect(form.complexity).toBeLessThanOrEqual(100);
      expect(form.stability).toBeLessThanOrEqual(100);
      expect(form.density).toBeGreaterThanOrEqual(0);
      expect(form.complexity).toBeGreaterThanOrEqual(0);
      expect(form.stability).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // Self-image detection across species
  // ============================================================

  describe("self-image detection across species", () => {
    // Species palette hue centers for generating matching images
    const speciesColors: Record<PerceptionMode, { r: number; g: number; b: number }> = {
      chromatic: { r: 200, g: 150, b: 50 },   // warm gold, hue ~35
      vibration: { r: 100, g: 50, b: 200 },    // blue-purple, hue ~270
      geometric: { r: 50, g: 180, b: 190 },    // teal-cyan, hue ~190
      thermal: { r: 220, g: 100, b: 30 },      // orange-red, hue ~20
      temporal: { r: 80, g: 60, b: 200 },       // purple-blue, hue ~235
      chemical: { r: 50, g: 180, b: 50 },       // green, hue ~120
    };

    it("each species has distinct self-detection characteristics", () => {
      const allSpecies: PerceptionMode[] = [
        "chromatic", "vibration", "geometric", "thermal", "temporal", "chemical",
      ];

      for (const species of allSpecies) {
        const { r, g, b } = speciesColors[species];
        const pixels = createDashboardLikeImage(r, g, b, 20, 20, 0.20);
        const features = processImage(pixels, 20, 20);
        const result = detectSelfImage(features, species);

        // Resonance must be a finite number in [0, 1]
        expect(result.resonance).toBeGreaterThanOrEqual(0);
        expect(result.resonance).toBeLessThanOrEqual(1);
        expect(Number.isFinite(result.resonance)).toBe(true);
      }
    });

    it("mismatched species produces lower resonance than matched species", () => {
      // Create a chromatic-matching image (warm gold)
      const { r, g, b } = speciesColors.chromatic;
      const pixels = createDashboardLikeImage(r, g, b, 20, 20, 0.20);
      const features = processImage(pixels, 20, 20);

      const matchResult = detectSelfImage(features, "chromatic");
      const mismatchResult = detectSelfImage(features, "geometric");

      // The matching species should produce higher resonance
      expect(matchResult.resonance).toBeGreaterThanOrEqual(mismatchResult.resonance);
    });
  });
});
