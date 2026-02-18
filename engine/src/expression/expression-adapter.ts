/**
 * Expression Adapter — Determines HOW the entity expresses itself.
 *
 * The output-side counterpart to the Perception Adapter.
 * While Perception filters what the entity can *receive*,
 * Expression shapes what the entity *emits*.
 *
 * Expression parameters are computed from:
 * - Species (perception mode) — fundamental expression character
 * - Growth level — complexity expands with maturity
 * - Current status — mood/energy modulate all output
 * - Sub-traits — fine-grained personality shading
 * - Sulk state — overrides during emotional withdrawal
 *
 * These parameters drive the dashboard visualization, sound generation,
 * and text formatting. The entity's "voice" emerges from numbers, not
 * acting instructions.
 */

import type {
  Seed,
  Status,
  PerceptionMode,
  ExpressionParams,
  TextExpressionParams,
  SoundExpressionParams,
  VisualExpressionParams,
  SubTraits,
} from "../types.js";
import type { SulkState, SulkSeverity } from "../mood/sulk-engine.js";

// --- Public API ---

/**
 * Generate expression parameters for the current state.
 * These parameters tell the dashboard (visual + sound) and text formatter
 * how the entity should express itself right now.
 */
export function generateExpressionParams(
  seed: Seed,
  status: Status,
  languageLevel: number,
  growthDay: number,
  sulkState: SulkState,
): ExpressionParams {
  const species = seed.perception;
  const traits = seed.subTraits;

  // If sulking, expression is heavily suppressed
  if (sulkState.isSulking) {
    return generateSulkExpression(species, traits, status, sulkState.severity);
  }

  return {
    text: generateTextParams(species, traits, status, languageLevel, growthDay),
    sound: generateSoundParams(species, traits, status, growthDay),
    visual: generateVisualParams(species, traits, status, growthDay),
  };
}

// --- Species Expression Profiles ---

/**
 * Base expression profiles for each species.
 * These are the "resting" parameters before status modulation.
 */
interface SpeciesProfile {
  // Text
  baseVerbosity: number;
  baseRepetition: number;
  // Sound
  patternVsCry: number; // >0.5 = pattern-dominant, <0.5 = cry-dominant
  baseWaveform: "sine" | "square" | "triangle" | "sawtooth";
  basePitch: number;
  baseTempo: number;
  baseWobble: number;
  // Visual
  baseBrightness: number;
  baseParticles: number;
  baseColorIntensity: number;
  baseMotionSpeed: number;
}

const SPECIES_PROFILES: Record<PerceptionMode, SpeciesProfile> = {
  chromatic: {
    baseVerbosity: 0.5,
    baseRepetition: 0.3,
    patternVsCry: 0.3,  // Cry-dominant
    baseWaveform: "sine",
    basePitch: 440,
    baseTempo: 80,
    baseWobble: 0.4,
    baseBrightness: 0.7,
    baseParticles: 1.2,
    baseColorIntensity: 0.8,
    baseMotionSpeed: 0.5,
  },
  vibration: {
    baseVerbosity: 0.4,
    baseRepetition: 0.6,  // Rhythmic text patterns
    patternVsCry: 0.7,    // Pattern-dominant
    baseWaveform: "square",
    basePitch: 220,
    baseTempo: 120,
    baseWobble: 0.2,
    baseBrightness: 0.5,
    baseParticles: 0.8,
    baseColorIntensity: 0.5,
    baseMotionSpeed: 0.7,
  },
  geometric: {
    baseVerbosity: 0.3,
    baseRepetition: 0.7,  // Precise, structured patterns
    patternVsCry: 0.85,   // Almost all pattern, minimal cries
    baseWaveform: "triangle",
    basePitch: 330,
    baseTempo: 90,
    baseWobble: 0.05,     // Very stable pitch
    baseBrightness: 0.6,
    baseParticles: 1.0,
    baseColorIntensity: 0.4,
    baseMotionSpeed: 0.3,
  },
  thermal: {
    baseVerbosity: 0.6,
    baseRepetition: 0.2,
    patternVsCry: 0.35,
    baseWaveform: "sine",
    basePitch: 165,       // Low, warm tones
    baseTempo: 50,        // Slow
    baseWobble: 0.15,
    baseBrightness: 0.5,
    baseParticles: 0.6,
    baseColorIntensity: 0.6,
    baseMotionSpeed: 0.2,  // Gradual changes
  },
  temporal: {
    baseVerbosity: 0.4,
    baseRepetition: 0.8,  // Cyclical expression
    patternVsCry: 0.55,
    baseWaveform: "triangle",
    basePitch: 280,
    baseTempo: 100,       // Tick-like rhythm
    baseWobble: 0.1,
    baseBrightness: 0.55,
    baseParticles: 0.9,
    baseColorIntensity: 0.5,
    baseMotionSpeed: 0.6,  // Pulsing
  },
  chemical: {
    baseVerbosity: 0.5,
    baseRepetition: 0.4,
    patternVsCry: 0.45,
    baseWaveform: "sawtooth",
    basePitch: 350,
    baseTempo: 95,
    baseWobble: 0.55,     // Volatile pitch
    baseBrightness: 0.55,
    baseParticles: 1.1,
    baseColorIntensity: 0.7,
    baseMotionSpeed: 0.65, // Reactive
  },
};

// --- Text Expression ---

function generateTextParams(
  species: PerceptionMode,
  traits: SubTraits,
  status: Status,
  languageLevel: number,
  growthDay: number,
): TextExpressionParams {
  const profile = SPECIES_PROFILES[species];

  // Symbol density: starts at 1.0 (all symbols), decreases with language level
  // Language level 0-4 maps to symbol density 1.0-0.0
  let symbolDensity = Math.max(0, 1.0 - languageLevel * 0.25);

  // Growth also gradually opens up expression
  const growthFactor = Math.min(1, growthDay / 180);
  symbolDensity *= 1 - growthFactor * 0.3;

  // Emotional leakage: mood extremes bleed through more
  const moodDeviation = Math.abs(status.mood - 50) / 50; // 0-1
  let emotionalLeakage = moodDeviation * 0.6;
  // Expressiveness trait amplifies leakage
  emotionalLeakage *= 0.5 + (traits.expressiveness / 100) * 0.5;
  // Energy affects how much emotion shows
  emotionalLeakage *= 0.5 + (status.energy / 100) * 0.5;

  // Verbosity: base + energy boost + sociability trait
  let verbosity = profile.baseVerbosity;
  verbosity += (status.energy / 100) * 0.2 - 0.1; // +-0.1 from energy
  verbosity += ((traits.sociability - 50) / 100) * 0.2; // +-0.1 from sociability
  // More verbose at higher language levels
  verbosity += languageLevel * 0.05;

  // Repetition tendency: species base + rhythm affinity
  let repetitionTendency = profile.baseRepetition;
  repetitionTendency += ((traits.rhythmAffinity - 50) / 100) * 0.2;
  // Low energy increases repetition (falling back on patterns)
  repetitionTendency += (1 - status.energy / 100) * 0.1;

  return {
    symbolDensity: clamp01(symbolDensity),
    emotionalLeakage: clamp01(emotionalLeakage),
    verbosity: clamp01(verbosity),
    repetitionTendency: clamp01(repetitionTendency),
  };
}

// --- Sound Expression ---

function generateSoundParams(
  species: PerceptionMode,
  traits: SubTraits,
  status: Status,
  growthDay: number,
): SoundExpressionParams {
  const profile = SPECIES_PROFILES[species];

  // Complexity grows with time
  // Day 1: ~0.1, Day 30: ~0.3, Day 60: ~0.5, Day 120+: ~0.8-1.0
  const complexity = Math.min(1, 0.1 + Math.sqrt(growthDay / 120) * 0.9);

  // Pattern vs cry balance — species base + growth modulation
  // Early days: more cry (emotional, raw). Later: more pattern (intentional)
  const maturityShift = Math.min(0.2, growthDay / 300);
  let patternWeight = clamp01(profile.patternVsCry + maturityShift);
  let cryWeight = clamp01(1 - patternWeight);

  // Expressiveness trait affects cry weight
  cryWeight *= 0.5 + (traits.expressiveness / 100) * 0.5;
  patternWeight = clamp01(1 - cryWeight);

  // Volume: energy-driven with expressiveness modifier
  let volume = (status.energy / 100) * 0.6 + 0.2;
  volume *= 0.7 + (traits.expressiveness / 100) * 0.3;

  // Tempo: species base modulated by energy
  let tempo = profile.baseTempo;
  tempo += (status.energy - 50) * 0.5; // +-25 BPM from energy
  // Rhythm affinity adds to tempo stability (but not speed)
  tempo = Math.max(30, Math.min(200, tempo));

  // Pitch: species base modulated by mood
  let pitch = profile.basePitch;
  pitch += (status.mood - 50) * 1.5; // Higher mood = higher pitch
  pitch = Math.max(80, Math.min(800, pitch));

  // Wobble: species base, modulated by comfort (inverse)
  // Less comfort = more unstable pitch
  let wobble = profile.baseWobble;
  wobble += (1 - status.comfort / 100) * 0.3;
  // Sensitivity trait makes wobble more reactive
  wobble *= 0.7 + (traits.sensitivity / 100) * 0.3;

  return {
    patternWeight: clamp01(patternWeight),
    cryWeight: clamp01(cryWeight),
    complexity: clamp01(complexity),
    volume: clamp01(volume),
    tempo: Math.round(tempo),
    pitch: Math.round(pitch),
    waveform: profile.baseWaveform,
    wobble: clamp01(wobble),
  };
}

// --- Visual Expression ---

function generateVisualParams(
  species: PerceptionMode,
  traits: SubTraits,
  status: Status,
  growthDay: number,
): VisualExpressionParams {
  const profile = SPECIES_PROFILES[species];

  // Brightness: mood + energy, species base
  let brightness = profile.baseBrightness;
  brightness += (status.mood - 50) / 100 * 0.3;
  brightness += (status.energy - 50) / 100 * 0.1;

  // Particle count: species base + growth
  // More particles as entity matures (richer visual vocabulary)
  let particleCount = profile.baseParticles;
  particleCount += Math.min(0.5, growthDay / 240); // Up to +0.5 over 240 days
  // Energy boosts particle activity
  particleCount *= 0.7 + (status.energy / 100) * 0.3;

  // Color intensity: species base + mood
  let colorIntensity = profile.baseColorIntensity;
  // Extreme moods (both high and low) increase intensity
  const moodDeviation = Math.abs(status.mood - 50) / 50;
  colorIntensity += moodDeviation * 0.2;
  // Expressiveness trait
  colorIntensity *= 0.7 + (traits.expressiveness / 100) * 0.3;

  // Motion speed: species base + energy + curiosity
  let motionSpeed = profile.baseMotionSpeed;
  motionSpeed += (status.energy - 50) / 100 * 0.2;
  motionSpeed += (status.curiosity - 50) / 100 * 0.1;

  return {
    brightness: clamp01(brightness),
    particleCount: Math.max(0.1, particleCount),
    colorIntensity: clamp01(colorIntensity),
    motionSpeed: clamp01(motionSpeed),
  };
}

// --- Sulk Expression ---

/**
 * Generate suppressed expression parameters for sulking state.
 * All channels are dramatically reduced; severity controls how much.
 */
function generateSulkExpression(
  species: PerceptionMode,
  traits: SubTraits,
  status: Status,
  severity: SulkSeverity,
): ExpressionParams {
  const suppressionFactor = SULK_SUPPRESSION[severity];

  // Even while sulking, sensitivity affects how much "leaks through"
  const leakage = (traits.sensitivity / 100) * 0.1 * (1 - suppressionFactor);

  return {
    text: {
      symbolDensity: 0.9 + suppressionFactor * 0.1, // Near-total symbols
      emotionalLeakage: leakage,
      verbosity: Math.max(0, 0.2 * (1 - suppressionFactor)),
      repetitionTendency: 0.1 + leakage, // Minimal repetition (sulking = withdrawal)
    },
    sound: {
      patternWeight: 0.1 * (1 - suppressionFactor),
      cryWeight: 0.05 * (1 - suppressionFactor),
      complexity: 0.05,
      volume: Math.max(0, 0.15 * (1 - suppressionFactor)),
      tempo: 40,
      pitch: 150, // Low, subdued
      waveform: SPECIES_PROFILES[species].baseWaveform,
      wobble: 0.05 + leakage,
    },
    visual: {
      brightness: Math.max(0.05, 0.2 * (1 - suppressionFactor)),
      particleCount: Math.max(0.1, 0.3 * (1 - suppressionFactor)),
      colorIntensity: Math.max(0.05, 0.15 * (1 - suppressionFactor)),
      motionSpeed: Math.max(0.02, 0.1 * (1 - suppressionFactor)),
    },
  };
}

/** How much to suppress expression at each sulk severity. 0 = none, 1 = full */
const SULK_SUPPRESSION: Record<SulkSeverity, number> = {
  none: 0,
  mild: 0.4,
  moderate: 0.7,
  severe: 0.95,
};

// --- Utility ---

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
