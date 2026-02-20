/**
 * Perception Expansion Engine — Filter Parameter Evolution.
 *
 * Computes the actual filter parameters an entity can perceive at a given
 * perception level. This bridges the gap between the discrete PerceptionLevel
 * enum (0-4) and the continuous reality of perception: within each level,
 * growthDay provides fine-grained interpolation, and the entity's species
 * (PerceptionMode) shifts which channels open first and strongest.
 *
 * Honest Perception: These parameters are not acting instructions. They
 * define what data actually reaches the entity. If imageResolution is 1,
 * only histogram data is passed — the LLM never sees the image.
 */

import { type PerceptionMode, PerceptionLevel } from "../types.js";

// ============================================================
// PUBLIC TYPES
// ============================================================

/**
 * What the entity can actually perceive at a given level.
 * Each field maps to a concrete filter parameter used by the
 * Perception Adapter to strip data before it reaches the LLM.
 */
export interface PerceptionWindow {
  // Image perception
  /** 0 = none, 1 = histogram only, 2 = dominant colors, 3 = spatial, 4 = structure, 5 = full */
  imageResolution: number;
  /** 0-100: how many color channels accessible */
  colorDepth: number;
  /** Can perceive spatial relationships between regions */
  spatialAwareness: boolean;

  // Text perception
  /** 0-100: 0 = char count only, 100 = full text */
  textAccess: number;
  /** 0-100: word frequency -> partial sentences -> full meaning */
  semanticDepth: number;

  // Audio perception
  /** 0-100: narrow bands -> full spectrum */
  frequencyRange: number;
  /** 0-100: slow pulse detection -> precise rhythm */
  temporalResolution: number;
  /** STT results available */
  canDetectSpeech: boolean;

  // Hardware/environment sensing
  /** 0-100: basic temp -> all sensors */
  sensorAccess: number;
}

/**
 * Species-specific perception profile: which channel is primary and
 * how strong each channel is relative to the baseline.
 */
export interface SpeciesPerceptionProfile {
  primaryChannel: "image" | "text" | "audio" | "sensor";
  channelStrengths: {
    image: number;
    text: number;
    audio: number;
    sensor: number;
  };
}

// ============================================================
// SPECIES PROFILES
// ============================================================

/**
 * Each species has a primary channel and strength multipliers.
 * Strengths are percentage modifiers applied to the base value:
 *   1.0 = baseline, 1.2 = +20%, 0.9 = -10%, etc.
 */
const SPECIES_PROFILES: Record<PerceptionMode, SpeciesPerceptionProfile> = {
  chromatic: {
    primaryChannel: "image",
    channelStrengths: { image: 1.2, text: 1.0, audio: 0.9, sensor: 1.0 },
  },
  vibration: {
    primaryChannel: "audio",
    channelStrengths: { image: 0.9, text: 1.0, audio: 1.2, sensor: 1.0 },
  },
  geometric: {
    primaryChannel: "image",
    channelStrengths: { image: 1.1, text: 1.1, audio: 1.0, sensor: 1.0 },
  },
  thermal: {
    primaryChannel: "sensor",
    channelStrengths: { image: 0.9, text: 1.0, audio: 1.0, sensor: 1.2 },
  },
  temporal: {
    primaryChannel: "audio",
    channelStrengths: { image: 1.0, text: 1.0, audio: 1.1, sensor: 1.1 },
  },
  chemical: {
    primaryChannel: "sensor",
    channelStrengths: { image: 1.0, text: 1.05, audio: 1.0, sensor: 1.15 },
  },
};

// ============================================================
// BASE PERCEPTION VALUES PER LEVEL
// ============================================================

/**
 * Base values for each perception level (species-neutral).
 * These represent the "average" entity at each discrete level.
 */
interface BaseValues {
  imageResolution: number;
  colorDepth: number;
  spatialAwareness: boolean;
  textAccess: number;
  semanticDepth: number;
  frequencyRange: number;
  temporalResolution: number;
  canDetectSpeech: boolean;
  sensorAccess: number;
}

const BASE_VALUES: Record<PerceptionLevel, BaseValues> = {
  [PerceptionLevel.Minimal]: {
    imageResolution: 1,
    colorDepth: 10,
    spatialAwareness: false,
    textAccess: 5,
    semanticDepth: 0,
    frequencyRange: 10,
    temporalResolution: 5,
    canDetectSpeech: false,
    sensorAccess: 10,
  },
  [PerceptionLevel.Basic]: {
    imageResolution: 2,
    colorDepth: 30,
    spatialAwareness: false,
    textAccess: 20,
    semanticDepth: 15,
    frequencyRange: 30,
    temporalResolution: 20,
    canDetectSpeech: false,
    sensorAccess: 25,
  },
  [PerceptionLevel.Structured]: {
    imageResolution: 3,
    colorDepth: 55,
    spatialAwareness: true,
    textAccess: 45,
    semanticDepth: 40,
    frequencyRange: 55,
    temporalResolution: 50,
    canDetectSpeech: false,
    sensorAccess: 55,
  },
  [PerceptionLevel.Relational]: {
    imageResolution: 4,
    colorDepth: 80,
    spatialAwareness: true,
    textAccess: 75,
    semanticDepth: 70,
    frequencyRange: 80,
    temporalResolution: 75,
    canDetectSpeech: true,
    sensorAccess: 80,
  },
  [PerceptionLevel.Full]: {
    imageResolution: 5,
    colorDepth: 100,
    spatialAwareness: true,
    textAccess: 100,
    semanticDepth: 100,
    frequencyRange: 100,
    temporalResolution: 100,
    canDetectSpeech: true,
    sensorAccess: 100,
  },
};

/**
 * Day thresholds for each level transition, used for interpolation.
 * Must match the thresholds in perception-growth.ts.
 */
const LEVEL_DAY_THRESHOLDS: Record<PerceptionLevel, number> = {
  [PerceptionLevel.Minimal]: 0,
  [PerceptionLevel.Basic]: 7,
  [PerceptionLevel.Structured]: 21,
  [PerceptionLevel.Relational]: 60,
  [PerceptionLevel.Full]: 120,
};

// ============================================================
// PUBLIC FUNCTIONS
// ============================================================

/**
 * Compute the perception window for a given level, species, and growth day.
 *
 * The growthDay provides fine-grained interpolation within a level:
 * an entity at Level 1 on day 7 has slightly lower values than at day 20,
 * even though both are "Basic" level. This avoids jarring jumps at level
 * boundaries.
 *
 * Species modifiers shift channel strengths: a chromatic entity opens
 * image channels faster, while a vibration entity favors audio.
 */
export function computePerceptionWindow(
  level: PerceptionLevel,
  species: PerceptionMode,
  growthDay: number,
): PerceptionWindow {
  const base = BASE_VALUES[level];
  const profile = SPECIES_PROFILES[species];

  // Compute interpolation factor within the current level (0.0 to 1.0).
  // At the start of a level the entity has just crossed the threshold;
  // by the time it nears the next threshold, values approach the next level.
  const interpolation = computeInterpolation(level, growthDay);

  // Get the next level's base values for interpolation target
  const nextLevel = getNextLevel(level);
  const nextBase = nextLevel !== null ? BASE_VALUES[nextLevel] : base;

  // Interpolate numeric values between current and next level
  const imageResolution = interpolateAndModify(
    base.imageResolution,
    nextBase.imageResolution,
    interpolation,
    profile.channelStrengths.image,
    1,
    5,
  );
  const colorDepth = interpolateAndModify(
    base.colorDepth,
    nextBase.colorDepth,
    interpolation,
    profile.channelStrengths.image,
    0,
    100,
  );
  const textAccess = interpolateAndModify(
    base.textAccess,
    nextBase.textAccess,
    interpolation,
    profile.channelStrengths.text,
    0,
    100,
  );
  const semanticDepth = interpolateAndModify(
    base.semanticDepth,
    nextBase.semanticDepth,
    interpolation,
    profile.channelStrengths.text,
    0,
    100,
  );
  const frequencyRange = interpolateAndModify(
    base.frequencyRange,
    nextBase.frequencyRange,
    interpolation,
    profile.channelStrengths.audio,
    0,
    100,
  );
  const temporalResolution = interpolateAndModify(
    base.temporalResolution,
    nextBase.temporalResolution,
    interpolation,
    profile.channelStrengths.audio,
    0,
    100,
  );
  const sensorAccess = interpolateAndModify(
    base.sensorAccess,
    nextBase.sensorAccess,
    interpolation,
    profile.channelStrengths.sensor,
    0,
    100,
  );

  // Boolean fields: use the base value (no interpolation for booleans)
  const spatialAwareness = base.spatialAwareness;
  const canDetectSpeech = base.canDetectSpeech;

  return {
    imageResolution,
    colorDepth,
    spatialAwareness,
    textAccess,
    semanticDepth,
    frequencyRange,
    temporalResolution,
    canDetectSpeech,
    sensorAccess,
  };
}

/**
 * Get the species-specific perception profile.
 * Returns the primary channel and relative strengths for each channel.
 */
export function getSpeciesPerceptionProfile(
  species: PerceptionMode,
): SpeciesPerceptionProfile {
  const source = SPECIES_PROFILES[species];
  return {
    primaryChannel: source.primaryChannel,
    channelStrengths: { ...source.channelStrengths },
  };
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

/**
 * Compute how far through the current level the entity is, based on
 * growthDay. Returns 0.0 at the level's start day and approaches 1.0
 * near the next level's threshold.
 *
 * For PerceptionLevel.Full (the maximum), always returns 0 since there
 * is no "next" level to interpolate toward.
 */
function computeInterpolation(level: PerceptionLevel, growthDay: number): number {
  const nextLevel = getNextLevel(level);
  if (nextLevel === null) return 0;

  const currentThreshold = LEVEL_DAY_THRESHOLDS[level];
  const nextThreshold = LEVEL_DAY_THRESHOLDS[nextLevel];
  const span = nextThreshold - currentThreshold;

  if (span <= 0) return 0;

  const progress = (growthDay - currentThreshold) / span;
  return clamp(progress, 0, 1);
}

/**
 * Get the next perception level, or null if already at Full.
 */
function getNextLevel(level: PerceptionLevel): PerceptionLevel | null {
  switch (level) {
    case PerceptionLevel.Minimal:
      return PerceptionLevel.Basic;
    case PerceptionLevel.Basic:
      return PerceptionLevel.Structured;
    case PerceptionLevel.Structured:
      return PerceptionLevel.Relational;
    case PerceptionLevel.Relational:
      return PerceptionLevel.Full;
    case PerceptionLevel.Full:
      return null;
  }
}

/**
 * Interpolate between base and target values, apply a species modifier,
 * and clamp to the valid range.
 */
function interpolateAndModify(
  base: number,
  target: number,
  interpolation: number,
  modifier: number,
  min: number,
  max: number,
): number {
  const interpolated = base + (target - base) * interpolation;
  const modified = interpolated * modifier;
  return clamp(Math.round(modified * 100) / 100, min, max);
}

/**
 * Clamp a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
