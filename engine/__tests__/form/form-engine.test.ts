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
import type { Status, SelfForm } from "../../src/types.js";

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    mood: 50,
    energy: 50,
    curiosity: 50,
    comfort: 50,
    languageLevel: 0,
    growthDay: 5,
    lastInteraction: "never",
    ...overrides,
  };
}

const ALL_FORMS: SelfForm[] = [
  "light-particles", "fluid", "crystal", "sound-echo", "mist", "geometric-cluster",
];

describe("Form Engine", () => {
  describe("createInitialFormState", () => {
    it("starts with low values", () => {
      const state = createInitialFormState("light-particles");
      expect(state.density).toBeLessThan(10);
      expect(state.complexity).toBeLessThan(10);
      expect(state.stability).toBeLessThan(20);
      expect(state.awareness).toBe(false);
    });

    it("preserves base form from seed", () => {
      const state = createInitialFormState("crystal");
      expect(state.baseForm).toBe("crystal");
    });
  });

  describe("evolveForm", () => {
    it("drifts toward newborn targets initially", () => {
      const state = createInitialFormState("fluid");
      const evolved = evolveForm(state, "newborn", makeStatus());
      // Should drift toward newborn targets (density:10, complexity:5, stability:20)
      expect(evolved.density).toBeGreaterThanOrEqual(state.density);
      expect(evolved.stability).toBeGreaterThanOrEqual(state.stability);
    });

    it("drifts toward mature targets over many iterations", () => {
      let state = createInitialFormState("crystal");
      const status = makeStatus();
      // Evolve many times as "mature"
      for (let i = 0; i < 100; i++) {
        state = evolveForm(state, "mature", status);
      }
      // Should approach mature targets (density:80, complexity:80, stability:75)
      expect(state.density).toBeGreaterThan(60);
      expect(state.complexity).toBeGreaterThan(60);
      expect(state.stability).toBeGreaterThan(60);
    });

    it("low mood reduces stability", () => {
      const state = createInitialFormState("mist");
      const sadState = evolveForm(state, "child", makeStatus({ mood: 15 }));
      const happyState = evolveForm(state, "child", makeStatus({ mood: 80 }));
      expect(sadState.stability).toBeLessThan(happyState.stability);
    });

    it("high energy boosts density", () => {
      let low = createInitialFormState("fluid");
      let high = createInitialFormState("fluid");
      for (let i = 0; i < 10; i++) {
        low = evolveForm(low, "child", makeStatus({ energy: 15 }));
        high = evolveForm(high, "child", makeStatus({ energy: 85 }));
      }
      expect(high.density).toBeGreaterThan(low.density);
    });

    it("high curiosity boosts complexity", () => {
      let bored = createInitialFormState("crystal");
      let curious = createInitialFormState("crystal");
      for (let i = 0; i < 20; i++) {
        bored = evolveForm(bored, "child", makeStatus({ curiosity: 30 }));
        curious = evolveForm(curious, "child", makeStatus({ curiosity: 85 }));
      }
      expect(curious.complexity).toBeGreaterThan(bored.complexity);
    });

    it("values stay within 0-100", () => {
      let state = createInitialFormState("sound-echo");
      // Extreme conditions
      for (let i = 0; i < 200; i++) {
        state = evolveForm(state, "mature", makeStatus({ mood: 100, energy: 100, curiosity: 100 }));
      }
      expect(state.density).toBeLessThanOrEqual(100);
      expect(state.complexity).toBeLessThanOrEqual(100);
      expect(state.stability).toBeLessThanOrEqual(100);
    });
  });

  describe("awakenSelfAwareness", () => {
    it("sets awareness to true", () => {
      const state = createInitialFormState("mist");
      expect(state.awareness).toBe(false);
      const aware = awakenSelfAwareness(state);
      expect(aware.awareness).toBe(true);
    });
  });

  describe("describeForm", () => {
    it("returns sparse description for low density", () => {
      const state = createInitialFormState("light-particles");
      const desc = describeForm(state);
      expect(desc).toContain("faint");
    });

    it("returns dense description for high density", () => {
      const state: FormState = {
        baseForm: "crystal",
        density: 85,
        complexity: 70,
        stability: 60,
        awareness: false,
      };
      const desc = describeForm(state);
      expect(desc).toContain("complex crystalline");
    });

    it("provides unique descriptions for all form types", () => {
      const descriptions = ALL_FORMS.map((form) => {
        const state = createInitialFormState(form);
        return describeForm(state);
      });
      expect(new Set(descriptions).size).toBe(ALL_FORMS.length);
    });
  });

  describe("formatFormMd / parseFormMd", () => {
    it("round-trips form state", () => {
      const state: FormState = {
        baseForm: "fluid",
        density: 45,
        complexity: 30,
        stability: 55,
        awareness: true,
      };

      const md = formatFormMd(state);
      const parsed = parseFormMd(md);

      expect(parsed).not.toBeNull();
      expect(parsed!.baseForm).toBe("fluid");
      expect(parsed!.density).toBe(45);
      expect(parsed!.complexity).toBe(30);
      expect(parsed!.stability).toBe(55);
      expect(parsed!.awareness).toBe(true);
    });

    it("returns null for invalid content", () => {
      const parsed = parseFormMd("nothing here");
      expect(parsed).toBeNull();
    });
  });
});
