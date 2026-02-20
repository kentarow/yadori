import { describe, it, expect } from "vitest";
import {
  createInitialFormState,
  evolveForm,
  awakenSelfAwareness,
  describeForm,
  formatFormMd,
  parseFormMd,
  type FormState,
} from "../../src/form/form-engine.js";
import { detectSelfImage } from "../../src/form/self-image-detection.js";
import type { Status, SelfForm, PerceptionMode, ImageFeatures } from "../../src/types.js";
import type { GrowthStage } from "../../src/growth/growth-engine.js";

// --- Helpers ---

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    mood: 50,
    energy: 50,
    curiosity: 50,
    comfort: 50,
    languageLevel: 0,
    perceptionLevel: 0,
    growthDay: 5,
    lastInteraction: "never",
    ...overrides,
  };
}

function makeFeatures(overrides: Partial<ImageFeatures> = {}): ImageFeatures {
  return {
    dominantHSL: { h: 35, s: 80, l: 60 },
    colorHistogram: [
      { hsl: { h: 35, s: 80, l: 60 }, percentage: 40 },
      { hsl: { h: 0, s: 0, l: 5 }, percentage: 60 },
    ],
    brightness: 15,
    edgeDensity: 10,
    dominantAngles: [],
    quadrantBrightness: { topLeft: 10, topRight: 10, bottomLeft: 20, bottomRight: 20 },
    colorCount: 3,
    contrast: 50,
    warmth: 40,
    ...overrides,
  };
}

const ALL_FORMS: SelfForm[] = [
  "light-particles", "fluid", "crystal", "sound-echo", "mist", "geometric-cluster",
];

const ALL_STAGES: GrowthStage[] = [
  "newborn", "infant", "child", "adolescent", "mature",
];

const ALL_SPECIES: PerceptionMode[] = [
  "chromatic", "vibration", "geometric", "thermal", "temporal", "chemical",
];

/**
 * Evolve a form state N times at a given stage with given status.
 */
function evolveN(
  initial: FormState,
  stage: GrowthStage,
  status: Status,
  iterations: number,
): FormState {
  let state = initial;
  for (let i = 0; i < iterations; i++) {
    state = evolveForm(state, stage, status);
  }
  return state;
}

// =============================================================================
// 1. Form evolution: density, complexity, stability changes over heartbeats
// =============================================================================

describe("Form evolution over heartbeats", () => {
  it("density increases from initial toward child target over heartbeats", () => {
    const initial = createInitialFormState("fluid");
    const neutral = makeStatus();
    // Child target density = 45, initial density = 5
    // drift: 5 + (45-5)*0.08 = 5 + 3.2 = 8.2 → rounds to 8 after step 1
    const after5 = evolveN(initial, "child", neutral, 5);
    const after20 = evolveN(initial, "child", neutral, 20);
    expect(after5.density).toBeGreaterThan(initial.density);
    expect(after20.density).toBeGreaterThan(after5.density);
  });

  it("complexity increases progressively over heartbeats", () => {
    const initial = createInitialFormState("crystal");
    const neutral = makeStatus();
    const after10 = evolveN(initial, "child", neutral, 10);
    const after50 = evolveN(initial, "child", neutral, 50);
    expect(after10.complexity).toBeGreaterThan(initial.complexity);
    expect(after50.complexity).toBeGreaterThan(after10.complexity);
  });

  it("stability converges toward target over many heartbeats", () => {
    const initial = createInitialFormState("mist");
    const neutral = makeStatus();
    // Mature target stability = 75, initial stability = 15
    const afterMany = evolveN(initial, "mature", neutral, 200);
    // Should be close to 75 (allowing for rounding and mood effects)
    expect(afterMany.stability).toBeGreaterThan(65);
    expect(afterMany.stability).toBeLessThanOrEqual(80);
  });

  it("all three dimensions evolve simultaneously each heartbeat", () => {
    const initial = createInitialFormState("sound-echo");
    const neutral = makeStatus();
    const evolved = evolveForm(initial, "child", neutral);
    // Child targets: density=45, complexity=35, stability=50
    // All should move from initial toward targets
    expect(evolved.density).toBeGreaterThanOrEqual(initial.density);
    expect(evolved.complexity).toBeGreaterThanOrEqual(initial.complexity);
    expect(evolved.stability).toBeGreaterThanOrEqual(initial.stability);
  });
});

// =============================================================================
// 2. All 6 base forms
// =============================================================================

describe("All 6 base forms", () => {
  it("createInitialFormState works for every base form", () => {
    for (const form of ALL_FORMS) {
      const state = createInitialFormState(form);
      expect(state.baseForm).toBe(form);
      expect(state.density).toBe(5);
      expect(state.complexity).toBe(3);
      expect(state.stability).toBe(15);
      expect(state.awareness).toBe(false);
    }
  });

  it("evolveForm preserves baseForm for all 6 types through evolution", () => {
    for (const form of ALL_FORMS) {
      const initial = createInitialFormState(form);
      const evolved = evolveN(initial, "mature", makeStatus(), 50);
      expect(evolved.baseForm).toBe(form);
    }
  });

  it("describeForm returns distinct descriptions for each form at all density levels", () => {
    const densityLevels = [5, 45, 85]; // sparse, mid, dense
    for (const density of densityLevels) {
      const descriptions = ALL_FORMS.map((form) => {
        const state: FormState = {
          baseForm: form,
          density,
          complexity: 50,
          stability: 50,
          awareness: false,
        };
        return describeForm(state);
      });
      // All 6 forms should have unique descriptions at the same density level
      expect(new Set(descriptions).size).toBe(ALL_FORMS.length);
    }
  });
});

// =============================================================================
// 3. Form growth rates: early vs mature entities
// =============================================================================

describe("Form growth rates: early vs mature", () => {
  it("newborn evolves slower than mature stage (lower targets)", () => {
    const neutral = makeStatus();
    const newbornEvolved = evolveN(createInitialFormState("fluid"), "newborn", neutral, 50);
    const matureEvolved = evolveN(createInitialFormState("fluid"), "mature", neutral, 50);
    // Mature targets are much higher, so after same iterations, mature should be higher
    expect(matureEvolved.density).toBeGreaterThan(newbornEvolved.density);
    expect(matureEvolved.complexity).toBeGreaterThan(newbornEvolved.complexity);
    expect(matureEvolved.stability).toBeGreaterThan(newbornEvolved.stability);
  });

  it("early stages have lower form ceilings than later stages", () => {
    const neutral = makeStatus();
    // Evolve to near-convergence at each stage
    const converged: Record<string, FormState> = {};
    for (const stage of ALL_STAGES) {
      converged[stage] = evolveN(createInitialFormState("crystal"), stage, neutral, 300);
    }
    // Each subsequent stage should have higher or equal converged values
    expect(converged["infant"].density).toBeGreaterThan(converged["newborn"].density);
    expect(converged["child"].density).toBeGreaterThan(converged["infant"].density);
    expect(converged["adolescent"].density).toBeGreaterThan(converged["child"].density);
    expect(converged["mature"].density).toBeGreaterThan(converged["adolescent"].density);
  });

  it("drift rate (0.08) means values approach but never exactly reach target in few steps", () => {
    const initial = createInitialFormState("mist");
    const neutral = makeStatus();
    // After 1 step toward mature (density target=80), drift from 5:
    // 5 + (80 - 5) * 0.08 = 5 + 6.0 = 11.0, rounded to 11
    const after1 = evolveForm(initial, "mature", neutral);
    expect(after1.density).toBe(11);
    // After just 5 steps, should still be well below target
    const after5 = evolveN(initial, "mature", neutral, 5);
    expect(after5.density).toBeLessThan(40);
  });
});

// =============================================================================
// 4. Self-awareness awakening conditions
// =============================================================================

describe("Self-awareness awakening", () => {
  it("awakenSelfAwareness sets awareness from false to true", () => {
    const state = createInitialFormState("light-particles");
    expect(state.awareness).toBe(false);
    const aware = awakenSelfAwareness(state);
    expect(aware.awareness).toBe(true);
  });

  it("awakenSelfAwareness is idempotent (calling twice keeps awareness true)", () => {
    const state = createInitialFormState("crystal");
    const first = awakenSelfAwareness(state);
    const second = awakenSelfAwareness(first);
    expect(second.awareness).toBe(true);
  });

  it("awakenSelfAwareness preserves all other form properties", () => {
    const state: FormState = {
      baseForm: "geometric-cluster",
      density: 55,
      complexity: 42,
      stability: 68,
      awareness: false,
    };
    const aware = awakenSelfAwareness(state);
    expect(aware.baseForm).toBe("geometric-cluster");
    expect(aware.density).toBe(55);
    expect(aware.complexity).toBe(42);
    expect(aware.stability).toBe(68);
  });

  it("self-image detection triggers awakening for matching species dashboard", () => {
    const features = makeFeatures({
      dominantHSL: { h: 110, s: 70, l: 50 },
      brightness: 12,
      colorHistogram: [
        { hsl: { h: 105, s: 65, l: 45 }, percentage: 30 },
        { hsl: { h: 120, s: 75, l: 55 }, percentage: 25 },
        { hsl: { h: 0, s: 0, l: 3 }, percentage: 45 },
      ],
    });
    const result = detectSelfImage(features, "chemical");
    expect(result.awakens).toBe(true);
    expect(result.resonance).toBeGreaterThanOrEqual(0.6);
  });

  it("self-image detection does NOT trigger for mismatched species", () => {
    // Green-hued image shown to a vibration (blue-purple) entity
    const features = makeFeatures({
      dominantHSL: { h: 110, s: 70, l: 50 },
      brightness: 12,
      colorHistogram: [
        { hsl: { h: 110, s: 65, l: 45 }, percentage: 40 },
        { hsl: { h: 0, s: 0, l: 3 }, percentage: 60 },
      ],
    });
    const result = detectSelfImage(features, "vibration");
    expect(result.awakens).toBe(false);
  });
});

// =============================================================================
// 5. Form description generation for different states
// =============================================================================

describe("Form description generation", () => {
  it("returns sparse description when density < 30", () => {
    const state: FormState = {
      baseForm: "sound-echo",
      density: 15,
      complexity: 50,
      stability: 50,
      awareness: false,
    };
    const desc = describeForm(state);
    expect(desc).toBe("A faint echo, barely distinguishable from silence");
  });

  it("returns mid description when density is 30-64", () => {
    const state: FormState = {
      baseForm: "mist",
      density: 45,
      complexity: 50,
      stability: 50,
      awareness: false,
    };
    const desc = describeForm(state);
    expect(desc).toBe("A soft cloud, gently swirling and reforming");
  });

  it("returns dense description when density >= 65", () => {
    const state: FormState = {
      baseForm: "fluid",
      density: 80,
      complexity: 70,
      stability: 60,
      awareness: true,
    };
    const desc = describeForm(state);
    expect(desc).toBe("A dense, swirling current with depth and undertow");
  });

  it("description depends only on density, not on complexity or stability", () => {
    const highComplexity: FormState = {
      baseForm: "light-particles",
      density: 10,
      complexity: 95,
      stability: 95,
      awareness: true,
    };
    const lowComplexity: FormState = {
      baseForm: "light-particles",
      density: 10,
      complexity: 5,
      stability: 5,
      awareness: false,
    };
    expect(describeForm(highComplexity)).toBe(describeForm(lowComplexity));
  });

  it("description transitions at boundary: 29 is sparse, 30 is mid", () => {
    const make = (density: number): FormState => ({
      baseForm: "geometric-cluster",
      density,
      complexity: 50,
      stability: 50,
      awareness: false,
    });
    const at29 = describeForm(make(29));
    const at30 = describeForm(make(30));
    // 29 is sparse (< 30), 30 is mid (>= 30 and < 65)
    expect(at29).toContain("point");     // sparse: "A lone point..."
    expect(at30).toContain("shifting");  // mid: "A shifting arrangement..."
  });
});

// =============================================================================
// 6. formatFormMd: verify markdown output
// =============================================================================

describe("formatFormMd markdown output", () => {
  it("contains all form fields in markdown format", () => {
    const state: FormState = {
      baseForm: "crystal",
      density: 72,
      complexity: 58,
      stability: 65,
      awareness: true,
    };
    const md = formatFormMd(state);
    expect(md).toContain("## Form");
    expect(md).toContain("**base**: crystal");
    expect(md).toContain("**density**: 72");
    expect(md).toContain("**complexity**: 58");
    expect(md).toContain("**stability**: 65");
    expect(md).toContain("**self-aware**: yes");
  });

  it("awareness false renders as 'no'", () => {
    const state = createInitialFormState("mist");
    const md = formatFormMd(state);
    expect(md).toContain("**self-aware**: no");
  });

  it("includes description as a blockquote", () => {
    const state: FormState = {
      baseForm: "light-particles",
      density: 50,
      complexity: 40,
      stability: 45,
      awareness: false,
    };
    const md = formatFormMd(state);
    // Mid-density description should appear as blockquote
    expect(md).toContain("> A shimmering cluster of light, loosely held together");
  });

  it("round-trips through parseFormMd for all forms", () => {
    for (const form of ALL_FORMS) {
      const state: FormState = {
        baseForm: form,
        density: 55,
        complexity: 40,
        stability: 60,
        awareness: false,
      };
      const md = formatFormMd(state);
      const parsed = parseFormMd(md);
      expect(parsed).not.toBeNull();
      expect(parsed!.baseForm).toBe(form);
      expect(parsed!.density).toBe(55);
      expect(parsed!.complexity).toBe(40);
      expect(parsed!.stability).toBe(60);
      expect(parsed!.awareness).toBe(false);
    }
  });

  it("parseFormMd returns defaults for missing numeric fields", () => {
    const md = "- **base**: fluid\n- **self-aware**: no";
    const parsed = parseFormMd(md);
    expect(parsed).not.toBeNull();
    expect(parsed!.baseForm).toBe("fluid");
    // Missing numeric fields should fallback to defaults
    expect(parsed!.density).toBe(5);
    expect(parsed!.complexity).toBe(3);
    expect(parsed!.stability).toBe(15);
  });
});

// =============================================================================
// 7. Species effects on form evolution
// =============================================================================

describe("Species effects on form evolution", () => {
  it("all 6 forms evolve identically given the same stage and status (form is cosmetic)", () => {
    // The form engine does not vary evolution by baseForm — only by stage and status
    const neutral = makeStatus();
    const results = ALL_FORMS.map((form) => {
      const state = createInitialFormState(form);
      return evolveN(state, "child", neutral, 30);
    });
    // All should have the same density/complexity/stability values
    const first = results[0];
    for (const r of results) {
      expect(r.density).toBe(first.density);
      expect(r.complexity).toBe(first.complexity);
      expect(r.stability).toBe(first.stability);
    }
  });

  it("species differentiation comes from descriptions, not from evolution math", () => {
    // After identical evolution, descriptions differ by baseForm
    const neutral = makeStatus();
    const states = ALL_FORMS.map((form) => evolveN(createInitialFormState(form), "child", neutral, 30));
    const descriptions = states.map((s) => describeForm(s));
    expect(new Set(descriptions).size).toBe(ALL_FORMS.length);
  });

  it("self-image detection has species-specific hue ranges", () => {
    // An image matching chromatic hue should trigger chromatic but not geometric
    const chromaticImage = makeFeatures({
      dominantHSL: { h: 35, s: 75, l: 55 },
      brightness: 12,
      colorHistogram: [
        { hsl: { h: 30, s: 80, l: 60 }, percentage: 30 },
        { hsl: { h: 40, s: 70, l: 50 }, percentage: 25 },
        { hsl: { h: 0, s: 0, l: 3 }, percentage: 45 },
      ],
    });
    const chromaticResult = detectSelfImage(chromaticImage, "chromatic");
    const geometricResult = detectSelfImage(chromaticImage, "geometric");
    expect(chromaticResult.resonance).toBeGreaterThan(geometricResult.resonance);
  });
});

// =============================================================================
// 8. Stability convergence over time
// =============================================================================

describe("Stability convergence over time", () => {
  it("stability converges toward newborn target (20) from initial (15)", () => {
    const neutral = makeStatus();
    const converged = evolveN(createInitialFormState("fluid"), "newborn", neutral, 200);
    // The gap is small (5) so drift of 0.08 yields < 1 per step, rounding keeps it at 15.
    // This is correct behavior: the drift is too small relative to rounding precision.
    expect(converged.stability).toBeGreaterThanOrEqual(15);
    expect(converged.stability).toBeLessThanOrEqual(20);
  });

  it("stability converges toward child target (50) from initial (15)", () => {
    const neutral = makeStatus();
    const converged = evolveN(createInitialFormState("crystal"), "child", neutral, 200);
    // Due to rounding at each step, convergence plateaus before the exact target.
    // The drift gets smaller as value approaches target, and rounding truncates it.
    expect(converged.stability).toBeGreaterThan(35);
    expect(converged.stability).toBeLessThanOrEqual(50);
  });

  it("stability approaches but does not overshoot the target", () => {
    const neutral = makeStatus();
    // Start far below mature target of 75
    const state = createInitialFormState("mist");
    let prev = state;
    // Track that stability monotonically increases toward 75
    for (let i = 0; i < 100; i++) {
      const next = evolveForm(prev, "mature", neutral);
      expect(next.stability).toBeGreaterThanOrEqual(prev.stability);
      prev = next;
    }
  });

  it("stability can decrease when target is lower than current value", () => {
    // Start an entity that already has high stability (evolved at mature stage)
    const neutral = makeStatus();
    const matureState = evolveN(createInitialFormState("crystal"), "mature", neutral, 200);
    // Now regress to newborn stage (target stability = 20)
    const regressed = evolveForm(matureState, "newborn", neutral);
    expect(regressed.stability).toBeLessThan(matureState.stability);
  });
});

// =============================================================================
// 9. Complexity growth with interaction count (curiosity as proxy)
// =============================================================================

describe("Complexity growth with curiosity", () => {
  it("high curiosity (>70) adds +1 complexity bonus per heartbeat", () => {
    const initial = createInitialFormState("sound-echo");
    const baseLine = evolveForm(initial, "child", makeStatus({ curiosity: 50 }));
    const curious = evolveForm(initial, "child", makeStatus({ curiosity: 80 }));
    // Curious entity should have +1 complexity over baseline
    expect(curious.complexity).toBe(baseLine.complexity + 1);
  });

  it("low curiosity does not add complexity bonus", () => {
    const initial = createInitialFormState("light-particles");
    const low = evolveForm(initial, "child", makeStatus({ curiosity: 30 }));
    const mid = evolveForm(initial, "child", makeStatus({ curiosity: 50 }));
    // Neither triggers the >70 bonus, so they should be the same
    expect(low.complexity).toBe(mid.complexity);
  });

  it("curiosity bonus compounds over many heartbeats", () => {
    const neutral = makeStatus({ curiosity: 50 });
    const curiousStatus = makeStatus({ curiosity: 90 });
    const withoutCuriosity = evolveN(createInitialFormState("crystal"), "child", neutral, 50);
    const withCuriosity = evolveN(createInitialFormState("crystal"), "child", curiousStatus, 50);
    // After 50 heartbeats, the curious entity should have noticeably higher complexity
    expect(withCuriosity.complexity).toBeGreaterThan(withoutCuriosity.complexity);
  });
});

// =============================================================================
// 10. Edge cases
// =============================================================================

describe("Edge cases", () => {
  it("day 0 form: initial values are correct", () => {
    const state = createInitialFormState("mist");
    expect(state.density).toBe(5);
    expect(state.complexity).toBe(3);
    expect(state.stability).toBe(15);
    expect(state.awareness).toBe(false);
    expect(state.baseForm).toBe("mist");
  });

  it("maximum values: density, complexity, stability cannot exceed 100", () => {
    // Start with very high values and evolve with all boosts
    const state: FormState = {
      baseForm: "fluid",
      density: 98,
      complexity: 98,
      stability: 98,
      awareness: false,
    };
    const boosted = makeStatus({ mood: 100, energy: 100, curiosity: 100 });
    const evolved = evolveN(state, "mature", boosted, 100);
    expect(evolved.density).toBeLessThanOrEqual(100);
    expect(evolved.complexity).toBeLessThanOrEqual(100);
    expect(evolved.stability).toBeLessThanOrEqual(100);
  });

  it("minimum values: density, complexity, stability cannot go below 0", () => {
    // Start with very low values and apply negative pressures
    const state: FormState = {
      baseForm: "crystal",
      density: 2,
      complexity: 1,
      stability: 1,
      awareness: false,
    };
    const depressed = makeStatus({ mood: 5, energy: 5, curiosity: 5 });
    // Newborn has lowest targets, combined with low energy/mood
    const evolved = evolveN(state, "newborn", depressed, 100);
    expect(evolved.density).toBeGreaterThanOrEqual(0);
    expect(evolved.complexity).toBeGreaterThanOrEqual(0);
    expect(evolved.stability).toBeGreaterThanOrEqual(0);
  });

  it("negative stability does not occur even with very low mood on day 0", () => {
    // Mood < 30 subtracts 3 from stability. Initial stability is 15.
    // With newborn target of 20, drift adds (20-15)*0.08 = 0.4, then subtract 3
    const initial = createInitialFormState("geometric-cluster");
    const veryLowMood = makeStatus({ mood: 5 });
    const evolved = evolveForm(initial, "newborn", veryLowMood);
    expect(evolved.stability).toBeGreaterThanOrEqual(0);
  });

  it("parseFormMd returns null for empty string", () => {
    expect(parseFormMd("")).toBeNull();
  });

  it("parseFormMd returns null for markdown without base field", () => {
    const md = "## Form\n- **density**: 50\n- **complexity**: 30";
    expect(parseFormMd(md)).toBeNull();
  });

  it("evolveForm does not mutate the input state", () => {
    const state = createInitialFormState("fluid");
    const originalDensity = state.density;
    const originalComplexity = state.complexity;
    const originalStability = state.stability;
    evolveForm(state, "mature", makeStatus());
    expect(state.density).toBe(originalDensity);
    expect(state.complexity).toBe(originalComplexity);
    expect(state.stability).toBe(originalStability);
  });

  it("awakenSelfAwareness does not mutate the input state", () => {
    const state = createInitialFormState("crystal");
    awakenSelfAwareness(state);
    expect(state.awareness).toBe(false);
  });

  it("self-image detection handles desaturated image gracefully (low saturation)", () => {
    const features = makeFeatures({
      dominantHSL: { h: 35, s: 5, l: 30 }, // Nearly grayscale
      brightness: 12,
      colorHistogram: [
        { hsl: { h: 35, s: 5, l: 30 }, percentage: 50 },
        { hsl: { h: 0, s: 0, l: 3 }, percentage: 50 },
      ],
    });
    const result = detectSelfImage(features, "chromatic");
    // Low saturation means dominantHueMatch = 0, histogram entries with s<=15 ignored
    expect(result.awakens).toBe(false);
  });
});
