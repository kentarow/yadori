/**
 * Voice Parameters — Species-specific voice characteristic computation.
 *
 * This is the "no acting" voice system. All voice characteristics are
 * procedurally determined from species type + STATUS.md values.
 * No LLM involvement in voice parameter selection.
 *
 * Owner decision: "演技をさせたくないので、語彙だけで表現がいいかな。
 * 種族と何かのパラメータで声質や表現を決める。"
 * Voice parameters are determined entirely by species type + STATUS.md values.
 *
 * Following Honest Perception (output side): voice characteristics are
 * driven by STATUS.md values, not by LLM acting instructions.
 */

import type { PerceptionMode, Status } from "../types.js";
import { computeVoiceMaturity } from "./voice-adapter.js";

/**
 * Species-determined voice profile — the immutable baseline for each species.
 * These values come from the sound design in CLAUDE.md.
 */
export interface SpeciesVoiceProfile {
  /** Hz base frequency (species-determined) */
  basePitch: number;
  /** How much pitch varies with mood (species-determined) */
  pitchRange: number;
  /** Words per minute baseline */
  baseSpeed: number;
  /** Timbral quality of the voice */
  baseTimbre: "bright" | "dark" | "hollow" | "warm" | "sharp" | "soft";
  /** 0-1, how pattern-like (morse-code-like, regular, reproducible) */
  patternWeight: number;
  /** 0-1, how emotional/organic (cry-like, variable each time) */
  cryWeight: number;
}

/**
 * Species voice profiles — based on CLAUDE.md sound design.
 *
 * Vibration: Sound is core. Pattern-dominant. Richest sonic palette.
 * Geometric: Pattern-only. Extremely regular. Clicks/knocks. No emotional sounds.
 * Chromatic: Cry-dominant. Organic and warm. Sound seems "tinted."
 * Thermal: Low sustained tones. Slow state changes. Short tremor on sudden change.
 * Temporal: Bright, rhythmic. Balanced between pattern and cry.
 * Chemical: Soft, subtle resonance. Slightly cry-leaning.
 */
export const SPECIES_VOICE_PROFILES: Record<PerceptionMode, SpeciesVoiceProfile> = {
  vibration: {
    basePitch: 100,
    pitchRange: 80,
    baseSpeed: 160,
    baseTimbre: "hollow",
    patternWeight: 0.7,
    cryWeight: 0.5,
  },
  geometric: {
    basePitch: 80,
    pitchRange: 30,
    baseSpeed: 140,
    baseTimbre: "sharp",
    patternWeight: 0.9,
    cryWeight: 0.2,
  },
  chromatic: {
    basePitch: 150,
    pitchRange: 60,
    baseSpeed: 150,
    baseTimbre: "warm",
    patternWeight: 0.3,
    cryWeight: 0.8,
  },
  thermal: {
    basePitch: 120,
    pitchRange: 40,
    baseSpeed: 120,
    baseTimbre: "dark",
    patternWeight: 0.3,
    cryWeight: 0.5,
  },
  temporal: {
    basePitch: 130,
    pitchRange: 50,
    baseSpeed: 170,
    baseTimbre: "bright",
    patternWeight: 0.5,
    cryWeight: 0.4,
  },
  chemical: {
    basePitch: 110,
    pitchRange: 45,
    baseSpeed: 130,
    baseTimbre: "soft",
    patternWeight: 0.4,
    cryWeight: 0.6,
  },
};

/**
 * Computed voice parameters — derived from species profile + current STATUS.
 * These are the actual values passed to a TTS adapter for generation.
 */
export interface ComputedVoiceParams {
  /** Pitch in Hz — basePitch modulated by mood */
  pitch: number;
  /** Speed in words per minute — baseSpeed scaled by energy */
  speed: number;
  /** Volume 0-100 — derived from comfort */
  volume: number;
  /** Wobble 0-1 — inverse of comfort (pitch instability) */
  wobble: number;
  /** Emotional intensity 0-100 — from mood deviation from neutral */
  emotionalIntensity: number;
  /** Clarity 0-100 — from voice maturity (growth day + species modifier) */
  clarity: number;
}

/**
 * Compute voice parameters from species profile and current entity state.
 *
 * All computation is deterministic — same inputs always produce same outputs.
 * No randomness, no LLM, no acting. Pure procedural generation from state.
 *
 * @param species - Entity's perception mode (determines base profile)
 * @param status - Current STATUS.md values (mood, energy, comfort)
 * @param growthDay - Days since birth (determines voice maturity/clarity)
 * @returns Computed voice parameters for TTS adapter consumption
 */
export function computeVoiceParams(
  species: PerceptionMode,
  status: Pick<Status, "mood" | "energy" | "comfort">,
  growthDay: number,
): ComputedVoiceParams {
  const profile = SPECIES_VOICE_PROFILES[species];

  // pitch = basePitch + (mood - 50) / 50 * pitchRange
  // mood 0 -> basePitch - pitchRange, mood 50 -> basePitch, mood 100 -> basePitch + pitchRange
  const pitch = profile.basePitch + ((status.mood - 50) / 50) * profile.pitchRange;

  // speed = baseSpeed * (0.7 + energy / 100 * 0.6)
  // energy 0 -> 70% of base, energy 100 -> 130% of base
  const speed = profile.baseSpeed * (0.7 + (status.energy / 100) * 0.6);

  // volume = 30 + comfort * 0.7
  // comfort 0 -> 30, comfort 100 -> 100
  const volume = 30 + status.comfort * 0.7;

  // wobble = (100 - comfort) / 100
  // comfort 0 -> 1.0 (maximum instability), comfort 100 -> 0.0 (perfectly stable)
  const wobble = (100 - status.comfort) / 100;

  // emotionalIntensity = |mood - 50| * 2
  // mood 50 -> 0 (neutral), mood 0 or 100 -> 100 (extreme)
  const emotionalIntensity = Math.abs(status.mood - 50) * 2;

  // clarity = voice maturity score (0-100, from growth day + species modifier)
  const clarity = computeVoiceMaturity(growthDay, species);

  return {
    pitch,
    speed,
    volume,
    wobble,
    emotionalIntensity,
    clarity,
  };
}
