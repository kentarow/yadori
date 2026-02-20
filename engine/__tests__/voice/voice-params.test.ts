/**
 * Voice Parameters Tests
 *
 * Tests the species-specific voice parameter computation system.
 * All voice characteristics are procedurally determined from species type
 * + STATUS.md values — no LLM involvement, no acting.
 *
 * Tests verify:
 *   - All 6 species profiles exist with valid ranges
 *   - computeVoiceParams produces correct values for each species
 *   - Mood/energy/comfort modulation works correctly
 *   - Clarity maps to voice maturity (growth day + species modifier)
 *   - Boundary conditions and edge cases
 */

import { describe, it, expect } from "vitest";
import {
  SPECIES_VOICE_PROFILES,
  computeVoiceParams,
  type SpeciesVoiceProfile,
  type ComputedVoiceParams,
} from "../../src/voice/voice-params.js";
import type { PerceptionMode, Status } from "../../src/types.js";
import { computeVoiceMaturity } from "../../src/voice/voice-adapter.js";

// --- Test helpers ---

const ALL_SPECIES: PerceptionMode[] = [
  "chromatic",
  "vibration",
  "geometric",
  "thermal",
  "temporal",
  "chemical",
];

function makeStatus(overrides: Partial<Pick<Status, "mood" | "energy" | "comfort">> = {}): Pick<Status, "mood" | "energy" | "comfort"> {
  return {
    mood: 50,
    energy: 50,
    comfort: 50,
    ...overrides,
  };
}

// =====================================================================
// 1. Species profile completeness and validity
// =====================================================================

describe("SPECIES_VOICE_PROFILES", () => {
  it("has profiles for all 6 species", () => {
    for (const species of ALL_SPECIES) {
      expect(SPECIES_VOICE_PROFILES[species]).toBeDefined();
    }
  });

  it("all profiles have positive basePitch in a reasonable range", () => {
    for (const species of ALL_SPECIES) {
      const profile = SPECIES_VOICE_PROFILES[species];
      expect(profile.basePitch).toBeGreaterThan(0);
      expect(profile.basePitch).toBeLessThanOrEqual(500);
    }
  });

  it("all profiles have positive pitchRange", () => {
    for (const species of ALL_SPECIES) {
      const profile = SPECIES_VOICE_PROFILES[species];
      expect(profile.pitchRange).toBeGreaterThan(0);
      expect(profile.pitchRange).toBeLessThanOrEqual(200);
    }
  });

  it("all profiles have baseSpeed in a reasonable WPM range", () => {
    for (const species of ALL_SPECIES) {
      const profile = SPECIES_VOICE_PROFILES[species];
      expect(profile.baseSpeed).toBeGreaterThanOrEqual(80);
      expect(profile.baseSpeed).toBeLessThanOrEqual(300);
    }
  });

  it("all profiles have valid baseTimbre", () => {
    const validTimbres = ["bright", "dark", "hollow", "warm", "sharp", "soft"];
    for (const species of ALL_SPECIES) {
      expect(validTimbres).toContain(SPECIES_VOICE_PROFILES[species].baseTimbre);
    }
  });

  it("all profiles have patternWeight in 0-1 range", () => {
    for (const species of ALL_SPECIES) {
      const profile = SPECIES_VOICE_PROFILES[species];
      expect(profile.patternWeight).toBeGreaterThanOrEqual(0);
      expect(profile.patternWeight).toBeLessThanOrEqual(1);
    }
  });

  it("all profiles have cryWeight in 0-1 range", () => {
    for (const species of ALL_SPECIES) {
      const profile = SPECIES_VOICE_PROFILES[species];
      expect(profile.cryWeight).toBeGreaterThanOrEqual(0);
      expect(profile.cryWeight).toBeLessThanOrEqual(1);
    }
  });

  it("vibration is pattern-dominant (pattern > cry)", () => {
    const vib = SPECIES_VOICE_PROFILES.vibration;
    expect(vib.patternWeight).toBeGreaterThan(vib.cryWeight);
  });

  it("geometric is extremely pattern-dominant", () => {
    const geo = SPECIES_VOICE_PROFILES.geometric;
    expect(geo.patternWeight).toBe(0.9);
    expect(geo.cryWeight).toBe(0.2);
  });

  it("chromatic is cry-dominant (cry > pattern)", () => {
    const chr = SPECIES_VOICE_PROFILES.chromatic;
    expect(chr.cryWeight).toBeGreaterThan(chr.patternWeight);
  });

  it("each species has a distinct basePitch", () => {
    const pitches = ALL_SPECIES.map((sp) => SPECIES_VOICE_PROFILES[sp].basePitch);
    const unique = new Set(pitches);
    expect(unique.size).toBe(ALL_SPECIES.length);
  });

  it("specific species have the exact values from the design spec", () => {
    expect(SPECIES_VOICE_PROFILES.vibration.basePitch).toBe(100);
    expect(SPECIES_VOICE_PROFILES.vibration.pitchRange).toBe(80);
    expect(SPECIES_VOICE_PROFILES.vibration.baseSpeed).toBe(160);
    expect(SPECIES_VOICE_PROFILES.vibration.baseTimbre).toBe("hollow");

    expect(SPECIES_VOICE_PROFILES.geometric.basePitch).toBe(80);
    expect(SPECIES_VOICE_PROFILES.geometric.baseTimbre).toBe("sharp");

    expect(SPECIES_VOICE_PROFILES.chromatic.basePitch).toBe(150);
    expect(SPECIES_VOICE_PROFILES.chromatic.baseTimbre).toBe("warm");

    expect(SPECIES_VOICE_PROFILES.thermal.basePitch).toBe(120);
    expect(SPECIES_VOICE_PROFILES.thermal.baseSpeed).toBe(120);
    expect(SPECIES_VOICE_PROFILES.thermal.baseTimbre).toBe("dark");

    expect(SPECIES_VOICE_PROFILES.temporal.basePitch).toBe(130);
    expect(SPECIES_VOICE_PROFILES.temporal.baseSpeed).toBe(170);
    expect(SPECIES_VOICE_PROFILES.temporal.baseTimbre).toBe("bright");

    expect(SPECIES_VOICE_PROFILES.chemical.basePitch).toBe(110);
    expect(SPECIES_VOICE_PROFILES.chemical.baseTimbre).toBe("soft");
  });
});

// =====================================================================
// 2. computeVoiceParams — pitch modulation
// =====================================================================

describe("computeVoiceParams — pitch", () => {
  it("pitch equals basePitch at neutral mood (50)", () => {
    for (const species of ALL_SPECIES) {
      const params = computeVoiceParams(species, makeStatus({ mood: 50 }), 60);
      expect(params.pitch).toBe(SPECIES_VOICE_PROFILES[species].basePitch);
    }
  });

  it("pitch increases with higher mood", () => {
    for (const species of ALL_SPECIES) {
      const low = computeVoiceParams(species, makeStatus({ mood: 20 }), 60);
      const mid = computeVoiceParams(species, makeStatus({ mood: 50 }), 60);
      const high = computeVoiceParams(species, makeStatus({ mood: 80 }), 60);
      expect(high.pitch).toBeGreaterThan(mid.pitch);
      expect(mid.pitch).toBeGreaterThan(low.pitch);
    }
  });

  it("pitch at mood=0 equals basePitch - pitchRange", () => {
    for (const species of ALL_SPECIES) {
      const profile = SPECIES_VOICE_PROFILES[species];
      const params = computeVoiceParams(species, makeStatus({ mood: 0 }), 60);
      expect(params.pitch).toBe(profile.basePitch - profile.pitchRange);
    }
  });

  it("pitch at mood=100 equals basePitch + pitchRange", () => {
    for (const species of ALL_SPECIES) {
      const profile = SPECIES_VOICE_PROFILES[species];
      const params = computeVoiceParams(species, makeStatus({ mood: 100 }), 60);
      expect(params.pitch).toBe(profile.basePitch + profile.pitchRange);
    }
  });

  it("vibration pitch range is wider than geometric", () => {
    const vibLow = computeVoiceParams("vibration", makeStatus({ mood: 0 }), 60);
    const vibHigh = computeVoiceParams("vibration", makeStatus({ mood: 100 }), 60);
    const geoLow = computeVoiceParams("geometric", makeStatus({ mood: 0 }), 60);
    const geoHigh = computeVoiceParams("geometric", makeStatus({ mood: 100 }), 60);

    const vibRange = vibHigh.pitch - vibLow.pitch;
    const geoRange = geoHigh.pitch - geoLow.pitch;
    expect(vibRange).toBeGreaterThan(geoRange);
  });
});

// =====================================================================
// 3. computeVoiceParams — speed modulation
// =====================================================================

describe("computeVoiceParams — speed", () => {
  it("speed at energy=0 is 70% of baseSpeed", () => {
    for (const species of ALL_SPECIES) {
      const profile = SPECIES_VOICE_PROFILES[species];
      const params = computeVoiceParams(species, makeStatus({ energy: 0 }), 60);
      expect(params.speed).toBeCloseTo(profile.baseSpeed * 0.7, 5);
    }
  });

  it("speed at energy=100 is 130% of baseSpeed", () => {
    for (const species of ALL_SPECIES) {
      const profile = SPECIES_VOICE_PROFILES[species];
      const params = computeVoiceParams(species, makeStatus({ energy: 100 }), 60);
      expect(params.speed).toBeCloseTo(profile.baseSpeed * 1.3, 5);
    }
  });

  it("speed increases monotonically with energy", () => {
    const energyLevels = [0, 25, 50, 75, 100];
    for (const species of ALL_SPECIES) {
      const speeds = energyLevels.map(
        (energy) => computeVoiceParams(species, makeStatus({ energy }), 60).speed,
      );
      for (let i = 1; i < speeds.length; i++) {
        expect(speeds[i]).toBeGreaterThan(speeds[i - 1]);
      }
    }
  });

  it("thermal is slowest and temporal is fastest at neutral energy", () => {
    const thermalSpeed = computeVoiceParams("thermal", makeStatus(), 60).speed;
    const temporalSpeed = computeVoiceParams("temporal", makeStatus(), 60).speed;
    for (const species of ALL_SPECIES) {
      const sp = computeVoiceParams(species, makeStatus(), 60).speed;
      expect(thermalSpeed).toBeLessThanOrEqual(sp);
      expect(temporalSpeed).toBeGreaterThanOrEqual(sp);
    }
  });
});

// =====================================================================
// 4. computeVoiceParams — volume (from comfort)
// =====================================================================

describe("computeVoiceParams — volume", () => {
  it("volume at comfort=0 is 30", () => {
    const params = computeVoiceParams("chromatic", makeStatus({ comfort: 0 }), 60);
    expect(params.volume).toBe(30);
  });

  it("volume at comfort=100 is 100", () => {
    const params = computeVoiceParams("chromatic", makeStatus({ comfort: 100 }), 60);
    expect(params.volume).toBe(100);
  });

  it("volume increases with comfort", () => {
    const levels = [0, 25, 50, 75, 100];
    const volumes = levels.map(
      (comfort) => computeVoiceParams("vibration", makeStatus({ comfort }), 60).volume,
    );
    for (let i = 1; i < volumes.length; i++) {
      expect(volumes[i]).toBeGreaterThan(volumes[i - 1]);
    }
  });

  it("volume is always in 30-100 range", () => {
    for (const species of ALL_SPECIES) {
      for (const comfort of [0, 25, 50, 75, 100]) {
        const v = computeVoiceParams(species, makeStatus({ comfort }), 60).volume;
        expect(v).toBeGreaterThanOrEqual(30);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("volume is species-independent (depends only on comfort)", () => {
    for (const comfort of [0, 50, 100]) {
      const volumes = ALL_SPECIES.map(
        (sp) => computeVoiceParams(sp, makeStatus({ comfort }), 60).volume,
      );
      for (let i = 1; i < volumes.length; i++) {
        expect(volumes[i]).toBe(volumes[0]);
      }
    }
  });
});

// =====================================================================
// 5. computeVoiceParams — wobble (inverse comfort)
// =====================================================================

describe("computeVoiceParams — wobble", () => {
  it("wobble at comfort=0 is 1.0 (maximum instability)", () => {
    const params = computeVoiceParams("chromatic", makeStatus({ comfort: 0 }), 60);
    expect(params.wobble).toBe(1.0);
  });

  it("wobble at comfort=100 is 0.0 (perfectly stable)", () => {
    const params = computeVoiceParams("chromatic", makeStatus({ comfort: 100 }), 60);
    expect(params.wobble).toBe(0.0);
  });

  it("wobble decreases as comfort increases", () => {
    const levels = [0, 25, 50, 75, 100];
    const wobbles = levels.map(
      (comfort) => computeVoiceParams("geometric", makeStatus({ comfort }), 60).wobble,
    );
    for (let i = 1; i < wobbles.length; i++) {
      expect(wobbles[i]).toBeLessThan(wobbles[i - 1]);
    }
  });

  it("wobble is always in 0-1 range", () => {
    for (const species of ALL_SPECIES) {
      for (const comfort of [0, 25, 50, 75, 100]) {
        const w = computeVoiceParams(species, makeStatus({ comfort }), 60).wobble;
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      }
    }
  });

  it("wobble at comfort=50 is 0.5", () => {
    const params = computeVoiceParams("thermal", makeStatus({ comfort: 50 }), 60);
    expect(params.wobble).toBe(0.5);
  });
});

// =====================================================================
// 6. computeVoiceParams — emotional intensity
// =====================================================================

describe("computeVoiceParams — emotionalIntensity", () => {
  it("emotionalIntensity is 0 at neutral mood (50)", () => {
    const params = computeVoiceParams("chromatic", makeStatus({ mood: 50 }), 60);
    expect(params.emotionalIntensity).toBe(0);
  });

  it("emotionalIntensity is 100 at mood extremes (0 and 100)", () => {
    const low = computeVoiceParams("chromatic", makeStatus({ mood: 0 }), 60);
    const high = computeVoiceParams("chromatic", makeStatus({ mood: 100 }), 60);
    expect(low.emotionalIntensity).toBe(100);
    expect(high.emotionalIntensity).toBe(100);
  });

  it("emotionalIntensity is symmetric around mood=50", () => {
    const mood30 = computeVoiceParams("vibration", makeStatus({ mood: 30 }), 60);
    const mood70 = computeVoiceParams("vibration", makeStatus({ mood: 70 }), 60);
    expect(mood30.emotionalIntensity).toBe(mood70.emotionalIntensity);
  });

  it("emotionalIntensity increases with mood deviation from 50", () => {
    const moods = [50, 40, 30, 20, 10, 0];
    const intensities = moods.map(
      (mood) => computeVoiceParams("thermal", makeStatus({ mood }), 60).emotionalIntensity,
    );
    for (let i = 1; i < intensities.length; i++) {
      expect(intensities[i]).toBeGreaterThan(intensities[i - 1]);
    }
  });

  it("emotionalIntensity is always in 0-100 range", () => {
    for (const species of ALL_SPECIES) {
      for (const mood of [0, 25, 50, 75, 100]) {
        const ei = computeVoiceParams(species, makeStatus({ mood }), 60).emotionalIntensity;
        expect(ei).toBeGreaterThanOrEqual(0);
        expect(ei).toBeLessThanOrEqual(100);
      }
    }
  });
});

// =====================================================================
// 7. computeVoiceParams — clarity (voice maturity)
// =====================================================================

describe("computeVoiceParams — clarity", () => {
  it("clarity is 0 for day 0-14 (pre-voice)", () => {
    for (const species of ALL_SPECIES) {
      expect(computeVoiceParams(species, makeStatus(), 0).clarity).toBe(0);
      expect(computeVoiceParams(species, makeStatus(), 14).clarity).toBe(0);
    }
  });

  it("clarity matches computeVoiceMaturity exactly", () => {
    for (const species of ALL_SPECIES) {
      for (const day of [0, 15, 30, 60, 90, 120, 200]) {
        const params = computeVoiceParams(species, makeStatus(), day);
        const expected = computeVoiceMaturity(day, species);
        expect(params.clarity).toBe(expected);
      }
    }
  });

  it("clarity increases with growth day", () => {
    const days = [0, 15, 30, 60, 120, 200];
    for (const species of ALL_SPECIES) {
      let prev = -1;
      for (const day of days) {
        const clarity = computeVoiceParams(species, makeStatus(), day).clarity;
        expect(clarity).toBeGreaterThanOrEqual(prev);
        prev = clarity;
      }
    }
  });

  it("vibration species has higher clarity than chromatic at same growth day", () => {
    const day = 60;
    const vibClarity = computeVoiceParams("vibration", makeStatus(), day).clarity;
    const chrClarity = computeVoiceParams("chromatic", makeStatus(), day).clarity;
    expect(vibClarity).toBeGreaterThan(chrClarity);
  });

  it("clarity is independent of mood, energy, and comfort", () => {
    const status1 = makeStatus({ mood: 0, energy: 0, comfort: 0 });
    const status2 = makeStatus({ mood: 100, energy: 100, comfort: 100 });
    for (const species of ALL_SPECIES) {
      const c1 = computeVoiceParams(species, status1, 60).clarity;
      const c2 = computeVoiceParams(species, status2, 60).clarity;
      expect(c1).toBe(c2);
    }
  });
});

// =====================================================================
// 8. Cross-species differentiation
// =====================================================================

describe("computeVoiceParams — cross-species", () => {
  it("no two species produce identical params at neutral status", () => {
    const results = ALL_SPECIES.map((sp) => computeVoiceParams(sp, makeStatus(), 60));
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const a = results[i];
        const b = results[j];
        const differ =
          a.pitch !== b.pitch ||
          a.speed !== b.speed ||
          a.clarity !== b.clarity;
        expect(differ).toBe(true);
      }
    }
  });

  it("all status-independent params (volume, wobble, emotionalIntensity) are same across species at same status", () => {
    const status = makeStatus({ mood: 70, energy: 60, comfort: 40 });
    const results = ALL_SPECIES.map((sp) => computeVoiceParams(sp, status, 60));
    for (let i = 1; i < results.length; i++) {
      expect(results[i].volume).toBe(results[0].volume);
      expect(results[i].wobble).toBe(results[0].wobble);
      expect(results[i].emotionalIntensity).toBe(results[0].emotionalIntensity);
    }
  });
});

// =====================================================================
// 9. Boundary validation — extreme combined inputs
// =====================================================================

describe("computeVoiceParams — boundary conditions", () => {
  it("all params are finite numbers at extreme inputs", () => {
    const extremeStatuses = [
      makeStatus({ mood: 0, energy: 0, comfort: 0 }),
      makeStatus({ mood: 100, energy: 100, comfort: 100 }),
      makeStatus({ mood: 0, energy: 100, comfort: 0 }),
      makeStatus({ mood: 100, energy: 0, comfort: 100 }),
    ];

    for (const species of ALL_SPECIES) {
      for (const status of extremeStatuses) {
        for (const day of [0, 1, 14, 15, 60, 120, 500]) {
          const params = computeVoiceParams(species, status, day);
          expect(Number.isFinite(params.pitch)).toBe(true);
          expect(Number.isFinite(params.speed)).toBe(true);
          expect(Number.isFinite(params.volume)).toBe(true);
          expect(Number.isFinite(params.wobble)).toBe(true);
          expect(Number.isFinite(params.emotionalIntensity)).toBe(true);
          expect(Number.isFinite(params.clarity)).toBe(true);
        }
      }
    }
  });

  it("pitch is always positive even at mood=0", () => {
    for (const species of ALL_SPECIES) {
      const params = computeVoiceParams(species, makeStatus({ mood: 0 }), 60);
      expect(params.pitch).toBeGreaterThan(0);
    }
  });

  it("speed is always positive even at energy=0", () => {
    for (const species of ALL_SPECIES) {
      const params = computeVoiceParams(species, makeStatus({ energy: 0 }), 60);
      expect(params.speed).toBeGreaterThan(0);
    }
  });

  it("growthDay=0 produces valid params", () => {
    for (const species of ALL_SPECIES) {
      const params = computeVoiceParams(species, makeStatus(), 0);
      expect(params.clarity).toBe(0);
      expect(params.pitch).toBe(SPECIES_VOICE_PROFILES[species].basePitch);
    }
  });
});
