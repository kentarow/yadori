/**
 * Voice Adapter — Interface for entity voice synthesis providers.
 *
 * Phase 4 preparation: interface-only, no actual TTS implementation.
 *
 * Entities evolve from procedural sounds (Web Audio API, already in dashboard)
 * to synthesized voice over time. Voice acquisition is a growth process:
 *   - Day 0-14: No voice (sounds only)
 *   - Day 15-30: Faint murmurs emerge
 *   - Day 31-60: Recognizable tones
 *   - Day 61-120: Speech-like utterances
 *   - Day 121+: Mature voice
 *
 * Following One Body, One Soul: local TTS is preferred over cloud.
 * Following Honest Perception (output side): voice characteristics are
 * driven by STATUS.md values, not by LLM acting instructions.
 *
 * Design constraints:
 *   - Must support cloud TTS (ElevenLabs) for convenience
 *   - Must support local TTS (espeak, piper, styletts2) for true embodiment
 *   - Voice acquisition process differs by species (perception mode)
 *   - No human-like voice from the start — sound-to-voice transition is real growth
 *   - Hardware determines what local TTS engine is feasible
 */

import type { HardwareBody, PerceptionMode } from "../types.js";

/**
 * Provider type — cloud, local, or none.
 *   cloud = voice synthesis runs on external API (ElevenLabs, etc.)
 *   local = voice synthesis runs on the physical body (espeak, piper, styletts2)
 *   none  = no voice synthesis available (sounds only, pre-voice stage)
 */
export type VoiceProviderType = "cloud" | "local" | "none";

/**
 * Voice capabilities that grow with the entity.
 * These evolve over time as the entity matures — not all at once.
 */
export interface VoiceCapabilities {
  /** Whether the entity can produce voice at all (false until voice awakens) */
  canSpeak: boolean;
  /** Maximum utterance duration in seconds (grows with maturity) */
  maxDuration: number;
  /** How much emotion affects vocal characteristics, 0-100 */
  emotionalRange: number;
  /** Speech clarity, 0-100 (grows from mumbles to clear speech) */
  clarity: number;
  /** How distinctive the voice is, 0-100 (develops individuality over time) */
  uniqueness: number;
}

/**
 * Request to generate a voice utterance.
 * Combines what to say with the entity's current emotional and growth state.
 */
export interface VoiceRequest {
  /** What to say (may include symbols from early language stages) */
  text: string;
  /** Current emotional state from STATUS.md */
  emotion: {
    mood: number;
    energy: number;
    comfort: number;
  };
  /** Entity's perception mode (species) — affects voice characteristics */
  species: PerceptionMode;
  /** Days since birth — determines voice maturity */
  growthDay: number;
  /** Current language level — affects what can be vocalized */
  languageLevel: number;
}

/**
 * Response from a voice generation request.
 */
export interface VoiceResponse {
  /** Raw audio data */
  audio: Buffer;
  /** Audio format */
  format: "wav" | "mp3" | "ogg";
  /** Duration of the generated audio in milliseconds */
  durationMs: number;
  /** Metadata about the generated voice characteristics */
  metadata: {
    /** Pitch level used for generation */
    pitch: number;
    /** Speed/rate of speech */
    speed: number;
    /** How intensely emotion was expressed, 0-100 */
    emotionalIntensity: number;
  };
}

/**
 * The Voice Adapter interface — all TTS providers must implement this.
 *
 * Future implementations:
 *   - ElevenLabsAdapter (cloud, high quality)
 *   - EspeakAdapter (local, lightweight, robotic)
 *   - PiperAdapter (local, medium quality, runs on 4GB+ RAM)
 *   - StyleTTS2Adapter (local, high quality, requires 8GB+ RAM)
 */
export interface VoiceAdapter {
  /** Provider type (cloud, local, or none) */
  readonly provider: VoiceProviderType;

  /**
   * Initialize the adapter (load models, establish connections, etc.).
   */
  initialize(): Promise<void>;

  /**
   * Check if the TTS provider is available and responsive.
   */
  checkHealth(): Promise<{ available: boolean; error?: string }>;

  /**
   * Get voice capabilities for a given growth stage.
   * Capabilities expand as the entity matures.
   */
  getCapabilities(growthDay: number): VoiceCapabilities;

  /**
   * Generate a voice utterance from text and emotional context.
   */
  generate(request: VoiceRequest): Promise<VoiceResponse>;

  /**
   * Clean up resources (unload models, close connections).
   */
  shutdown(): Promise<void>;
}

// --- Species voice modifiers ---

/**
 * Species-specific modifiers for voice maturity progression.
 * Some species develop voice faster or slower based on their nature.
 *
 * Vibration type: Sound is core to their being, voice develops fastest (+10%)
 * Chemical type: Subtle resonance affinity, slightly faster voice (+5%)
 * Chromatic type: Light-oriented, voice is secondary, slightly slower (-5%)
 * Others (geometric, thermal, temporal): No modifier (0%)
 */
const SPECIES_VOICE_MODIFIER: Record<PerceptionMode, number> = {
  vibration: 0.10,
  chemical: 0.05,
  chromatic: -0.05,
  geometric: 0,
  thermal: 0,
  temporal: 0,
};

/**
 * Compute voice maturity score (0-100) based on growth day and species.
 *
 * Voice develops gradually:
 *   Day 0-14:   0       (no voice — sounds only)
 *   Day 15-30:  0-20    (faint murmurs)
 *   Day 31-60:  20-50   (recognizable tones)
 *   Day 61-120: 50-80   (speech-like)
 *   Day 121+:   80-100  (mature voice)
 *
 * Species modifier adjusts the score (e.g., vibration +10%, chromatic -5%).
 */
export function computeVoiceMaturity(
  growthDay: number,
  species: PerceptionMode,
): number {
  let base: number;

  if (growthDay <= 14) {
    base = 0;
  } else if (growthDay <= 30) {
    // Day 15-30: linear 0-20
    base = ((growthDay - 14) / (30 - 14)) * 20;
  } else if (growthDay <= 60) {
    // Day 31-60: linear 20-50
    base = 20 + ((growthDay - 30) / (60 - 30)) * 30;
  } else if (growthDay <= 120) {
    // Day 61-120: linear 50-80
    base = 50 + ((growthDay - 60) / (120 - 60)) * 30;
  } else {
    // Day 121+: linear 80-100 (caps at day 220)
    base = 80 + Math.min(((growthDay - 120) / 100) * 20, 20);
  }

  // Apply species modifier
  const modifier = SPECIES_VOICE_MODIFIER[species];
  const adjusted = base * (1 + modifier);

  // Clamp to 0-100
  return Math.max(0, Math.min(100, adjusted));
}

/**
 * TTS engine recommendation based on hardware capacity.
 */
export interface LocalVoiceCapacity {
  /** Whether local TTS is feasible at all */
  canRunLocal: boolean;
  /** Recommended TTS engine for this hardware */
  recommendedEngine: "espeak" | "piper" | "styletts2" | null;
  /** Human-readable explanation */
  reason: string;
}

/**
 * Estimate what local TTS engine a hardware body can support.
 *
 * RAM thresholds:
 *   < 2GB:  Cannot run local TTS
 *   2-3GB:  espeak (lightweight, robotic but functional)
 *   4-7GB:  piper (neural TTS, decent quality)
 *   8GB+:   styletts2 (high quality, expressive)
 *
 * This helps the entity know its vocal limits —
 * a Raspberry Pi 2GB can only manage espeak,
 * while a Mac mini 16GB can run styletts2.
 */
export function estimateLocalVoiceCapacity(hardware: HardwareBody): LocalVoiceCapacity {
  const ramGB = hardware.totalMemoryGB;

  if (ramGB < 2) {
    return {
      canRunLocal: false,
      recommendedEngine: null,
      reason: "Insufficient RAM for local TTS (< 2GB)",
    };
  }

  if (ramGB < 4) {
    return {
      canRunLocal: true,
      recommendedEngine: "espeak",
      reason: "Low RAM — espeak (lightweight, robotic voice)",
    };
  }

  if (ramGB < 8) {
    return {
      canRunLocal: true,
      recommendedEngine: "piper",
      reason: "Moderate RAM — piper (neural TTS, decent quality)",
    };
  }

  return {
    canRunLocal: true,
    recommendedEngine: "styletts2",
    reason: "Sufficient RAM — styletts2 (high quality, expressive)",
  };
}
