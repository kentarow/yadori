/**
 * Species Coverage Test Suite
 *
 * Cross-cutting test that verifies all 6 species (perception modes)
 * are properly handled across the entire YADORI engine.
 * No species should be accidentally broken or missing from any module.
 */

import { describe, it, expect } from "vitest";
import type {
  PerceptionMode,
  Temperament,
  Status,
  HardwareBody,
} from "../src/types.js";
import { LanguageLevel, PerceptionLevel } from "../src/types.js";
import { createFixedSeed } from "../src/genesis/seed-generator.js";
import { generateExpressionParams } from "../src/expression/expression-adapter.js";
import {
  createInitialLanguageState,
  PERCEPTION_SYMBOLS,
  generateExpression,
} from "../src/language/language-engine.js";
import {
  generateSoulEvilMd,
  getSulkExpression,
} from "../src/mood/sulk-engine.js";
import type { SulkState, SulkSeverity } from "../src/mood/sulk-engine.js";
import {
  getSpeciesPerceptionProfile,
  computePerceptionWindow,
} from "../src/perception/perception-params.js";
import { generateDiaryEntry } from "../src/diary/diary-engine.js";
import {
  generateFirstEncounter,
  isFirstEncounter,
} from "../src/encounter/first-encounter.js";
import {
  computeInteractionEffect,
  computeNaturalDecay,
  applyMoodDelta,
} from "../src/mood/mood-engine.js";

// --- Constants ---

const ALL_SPECIES: PerceptionMode[] = [
  "chromatic",
  "vibration",
  "geometric",
  "thermal",
  "temporal",
  "chemical",
];

const ALL_TEMPERAMENTS: Temperament[] = [
  "curious-cautious",
  "bold-impulsive",
  "calm-observant",
  "restless-exploratory",
];

const HW: HardwareBody = {
  platform: "linux",
  arch: "x64",
  totalMemoryGB: 16,
  cpuModel: "Test CPU",
  storageGB: 256,
};

const NOW = new Date("2026-02-20T12:00:00Z");

// --- Helpers ---

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    mood: 50,
    energy: 50,
    curiosity: 50,
    comfort: 50,
    languageLevel: LanguageLevel.SymbolsOnly,
    perceptionLevel: PerceptionLevel.Minimal,
    growthDay: 1,
    lastInteraction: NOW.toISOString(),
    ...overrides,
  };
}

const NO_SULK: SulkState = {
  isSulking: false,
  severity: "none",
  recoveryInteractions: 0,
  sulkingSince: null,
};

// --- Tests ---

describe("Species Coverage", () => {
  describe.each(ALL_SPECIES)("species: %s", (species) => {
    it("generates valid seed", () => {
      const seed = createFixedSeed({ perception: species, hardwareBody: HW });
      expect(seed.perception).toBe(species);
      expect(seed.expression).toBe("symbolic");
      expect(seed.hash).toMatch(/^[0-9a-f]{16}$/);
      expect(seed.hardwareBody).toEqual(HW);
    });

    it("produces valid expression params", () => {
      const seed = createFixedSeed({ perception: species, hardwareBody: HW });
      const params = generateExpressionParams(seed, makeStatus(), 0, 1, NO_SULK);

      // Text channel
      expect(params.text.symbolDensity).toBeGreaterThanOrEqual(0);
      expect(params.text.symbolDensity).toBeLessThanOrEqual(1);
      expect(params.text.verbosity).toBeGreaterThanOrEqual(0);
      expect(params.text.verbosity).toBeLessThanOrEqual(1);

      // Sound channel
      expect(params.sound.patternWeight).toBeGreaterThanOrEqual(0);
      expect(params.sound.patternWeight).toBeLessThanOrEqual(1);
      expect(params.sound.cryWeight).toBeGreaterThanOrEqual(0);
      expect(params.sound.cryWeight).toBeLessThanOrEqual(1);
      expect(["sine", "square", "triangle", "sawtooth"]).toContain(params.sound.waveform);
      expect(params.sound.pitch).toBeGreaterThanOrEqual(80);
      expect(params.sound.pitch).toBeLessThanOrEqual(800);

      // Visual channel
      expect(params.visual.brightness).toBeGreaterThanOrEqual(0);
      expect(params.visual.brightness).toBeLessThanOrEqual(1);
      expect(params.visual.particleCount).toBeGreaterThan(0);
    });

    it("has species-specific native symbols", () => {
      const langState = createInitialLanguageState(species);
      expect(langState.nativeSymbols).toEqual(PERCEPTION_SYMBOLS[species]);
      expect(langState.nativeSymbols.length).toBeGreaterThanOrEqual(4);
      expect(langState.level).toBe(LanguageLevel.SymbolsOnly);
    });

    it("generates symbol expressions without error", () => {
      const langState = createInitialLanguageState(species);
      const status = makeStatus();
      const expression = generateExpression(langState, status);
      expect(typeof expression).toBe("string");
      expect(expression.length).toBeGreaterThan(0);
    });

    it("has species-specific sulk expressions for all severities", () => {
      const severities: SulkSeverity[] = ["mild", "moderate", "severe"];
      for (const severity of severities) {
        const expr = getSulkExpression(species, severity);
        expect(expr.description).toBeTruthy();
        expect(typeof expr.silence).toBe("string");

        const md = generateSoulEvilMd(species, severity);
        expect(md).toContain(species);
        expect(md).toContain(severity);
        expect(md).toContain("SOUL (Sulking Mode)");
      }
    });

    it("has perception profile with valid primary channel", () => {
      const profile = getSpeciesPerceptionProfile(species);
      expect(["image", "text", "audio", "sensor"]).toContain(profile.primaryChannel);
      expect(profile.channelStrengths.image).toBeGreaterThan(0);
      expect(profile.channelStrengths.text).toBeGreaterThan(0);
      expect(profile.channelStrengths.audio).toBeGreaterThan(0);
      expect(profile.channelStrengths.sensor).toBeGreaterThan(0);
    });

    it("computes perception window at all levels", () => {
      const levels = [
        PerceptionLevel.Minimal,
        PerceptionLevel.Basic,
        PerceptionLevel.Structured,
        PerceptionLevel.Relational,
        PerceptionLevel.Full,
      ];
      for (const level of levels) {
        const window = computePerceptionWindow(level, species, 30);
        expect(window.imageResolution).toBeGreaterThanOrEqual(1);
        expect(window.imageResolution).toBeLessThanOrEqual(5);
        expect(window.colorDepth).toBeGreaterThanOrEqual(0);
        expect(window.colorDepth).toBeLessThanOrEqual(100);
        expect(window.textAccess).toBeGreaterThanOrEqual(0);
        expect(window.textAccess).toBeLessThanOrEqual(100);
      }
    });

    it("generates first encounter for all temperaments", () => {
      for (const temperament of ALL_TEMPERAMENTS) {
        const reaction = generateFirstEncounter(species, temperament, NOW);
        expect(reaction.expression).toBeTruthy();
        expect(reaction.expression.length).toBeGreaterThan(0);
        expect(reaction.innerExperience).toBeTruthy();
        expect(reaction.statusEffect).toBeDefined();
        expect(typeof reaction.statusEffect.mood).toBe("number");
        expect(typeof reaction.statusEffect.energy).toBe("number");
        expect(typeof reaction.statusEffect.curiosity).toBe("number");
        expect(typeof reaction.statusEffect.comfort).toBe("number");
        expect(reaction.memoryImprint).toBeDefined();
        expect(reaction.memoryImprint.summary).toContain("FIRST ENCOUNTER");
      }
    });

    it("generates valid diary entry", () => {
      const langState = createInitialLanguageState(species);
      const status = makeStatus({ growthDay: 5 });
      const entry = generateDiaryEntry(status, langState, species, NOW);
      expect(entry.date).toBe("2026-02-20");
      expect(entry.content).toContain("Day 5");
      expect(entry.content.length).toBeGreaterThan(10);
    });

    it("completes full lifecycle without error", () => {
      // Genesis
      const seed = createFixedSeed({
        perception: species,
        temperament: "curious-cautious",
        hardwareBody: HW,
      });
      let status = makeStatus({ growthDay: 0 });

      // First encounter
      expect(isFirstEncounter(0)).toBe(true);
      const encounter = generateFirstEncounter(species, seed.temperament, NOW);
      status = applyMoodDelta(status, encounter.statusEffect);
      expect(status.mood).toBeGreaterThanOrEqual(0);
      expect(status.mood).toBeLessThanOrEqual(100);

      // Interaction
      const interactionEffect = computeInteractionEffect(status, {
        minutesSinceLastInteraction: 30,
        userInitiated: true,
        messageLength: 50,
      }, seed.temperament);
      status = applyMoodDelta(status, interactionEffect);

      // Natural decay (heartbeat)
      const decay = computeNaturalDecay(status, 60);
      status = applyMoodDelta(status, decay);

      // Expression
      const langState = createInitialLanguageState(species);
      const expression = generateExpression(langState, status);
      expect(expression.length).toBeGreaterThan(0);

      // Expression params
      const params = generateExpressionParams(seed, status, 0, 1, NO_SULK);
      expect(params.text).toBeDefined();
      expect(params.sound).toBeDefined();
      expect(params.visual).toBeDefined();

      // Diary
      const diary = generateDiaryEntry(status, langState, species, NOW);
      expect(diary.content.length).toBeGreaterThan(0);

      // All status values remain in valid range
      expect(status.mood).toBeGreaterThanOrEqual(0);
      expect(status.mood).toBeLessThanOrEqual(100);
      expect(status.energy).toBeGreaterThanOrEqual(0);
      expect(status.energy).toBeLessThanOrEqual(100);
      expect(status.curiosity).toBeGreaterThanOrEqual(0);
      expect(status.curiosity).toBeLessThanOrEqual(100);
      expect(status.comfort).toBeGreaterThanOrEqual(0);
      expect(status.comfort).toBeLessThanOrEqual(100);
    });
  });

  // --- Cross-species differentiation tests ---

  it("all species produce different expression profiles", () => {
    const profiles = ALL_SPECIES.map((species) => {
      const seed = createFixedSeed({ perception: species, hardwareBody: HW });
      return generateExpressionParams(seed, makeStatus(), 0, 30, NO_SULK);
    });

    // Waveforms should have at least 3 distinct values
    const waveforms = new Set(profiles.map((p) => p.sound.waveform));
    expect(waveforms.size).toBeGreaterThanOrEqual(3);

    // Base tempos should not all be identical
    const tempos = new Set(profiles.map((p) => p.sound.tempo));
    expect(tempos.size).toBeGreaterThanOrEqual(3);

    // Base pitches should not all be identical
    const pitches = new Set(profiles.map((p) => p.sound.pitch));
    expect(pitches.size).toBeGreaterThanOrEqual(3);
  });

  it("all species have different primary perception channels or strengths", () => {
    const profiles = ALL_SPECIES.map((species) => ({
      species,
      profile: getSpeciesPerceptionProfile(species),
    }));

    // Not all primary channels should be the same
    const channels = new Set(profiles.map((p) => p.profile.primaryChannel));
    expect(channels.size).toBeGreaterThanOrEqual(2);

    // Each species should have at least one channel strength !== 1.0
    for (const { species, profile } of profiles) {
      const strengths = Object.values(profile.channelStrengths);
      const hasSpecialization = strengths.some((s) => s !== 1.0);
      expect(hasSpecialization).toBe(true);
    }
  });

  it("all species have distinct native symbol sets", () => {
    const symbolSets = ALL_SPECIES.map((species) => {
      const langState = createInitialLanguageState(species);
      return langState.nativeSymbols.join(",");
    });
    const uniqueSets = new Set(symbolSets);
    // At minimum, most species have different symbol sets
    expect(uniqueSets.size).toBeGreaterThanOrEqual(4);
  });

  it("all species produce distinct sulk SOUL_EVIL content", () => {
    const contents = ALL_SPECIES.map((species) =>
      generateSoulEvilMd(species, "moderate"),
    );
    const uniqueContents = new Set(contents);
    expect(uniqueContents.size).toBe(ALL_SPECIES.length);
  });

  it("all species produce distinct first encounter expressions", () => {
    const expressions = ALL_SPECIES.map((species) =>
      generateFirstEncounter(species, "curious-cautious", NOW).expression,
    );
    const uniqueExpressions = new Set(expressions);
    expect(uniqueExpressions.size).toBe(ALL_SPECIES.length);
  });
});
