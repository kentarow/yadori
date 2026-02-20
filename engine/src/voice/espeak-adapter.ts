/**
 * Espeak Adapter — Lightweight local TTS for resource-constrained devices.
 *
 * Target: 2-3GB RAM devices (Raspberry Pi, low-end SBCs).
 * Uses espeak-ng command-line tool for synthesis.
 *
 * Following the owner's decision: no acting. Voice quality and expression
 * are determined entirely by species type + STATUS parameters (mood, energy,
 * comfort). No LLM instructions for voice — pure procedural mapping.
 *
 * Following Honest Perception (output side): voice characteristics are
 * driven by STATUS.md values, not by LLM acting instructions.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PerceptionMode } from "../types.js";
import {
  computeVoiceMaturity,
  type VoiceAdapter,
  type VoiceCapabilities,
  type VoiceRequest,
  type VoiceResponse,
} from "./voice-adapter.js";

const execFileAsync = promisify(execFile);

// --- Species-specific base parameters ---

/**
 * Base pitch by species.
 *
 * Conceptual pitch values from the spec (vibration=100, chromatic=150, etc.)
 * are scaled into espeak-ng's 0-99 range while preserving relative differences.
 *
 * Scaling: the spec range 80-150 is mapped to espeak range 20-80,
 * leaving room for mood modulation (+-30) without hitting the 0/99 boundaries.
 *
 * Formula: espeakPitch = 20 + ((specPitch - 80) / (150 - 80)) * 60
 *   geometric (80)  -> 20
 *   vibration (100)  -> 37
 *   chemical  (110)  -> 46
 *   thermal   (120)  -> 54
 *   temporal  (130)  -> 63
 *   chromatic (150)  -> 80
 */
const SPECIES_BASE_PITCH: Record<PerceptionMode, number> = {
  geometric: 20,
  vibration: 37,
  chemical: 46,
  thermal: 54,
  temporal: 63,
  chromatic: 80,
};

/**
 * Species-specific espeak-ng voice variant.
 * Different variants give each species a recognizable vocal character.
 */
const SPECIES_VOICE_VARIANT: Record<PerceptionMode, string> = {
  vibration: "m1",   // Male variant 1 — resonant, core sound species
  chromatic: "f2",   // Female variant 2 — lighter, airy for light species
  geometric: "m3",   // Male variant 3 — precise, angular
  thermal: "m2",     // Male variant 2 — warm, deep
  temporal: "f1",    // Female variant 1 — flowing, temporal
  chemical: "m4",    // Male variant 4 — textured, complex
};

/**
 * Compute espeak-ng command parameters from species + STATUS values.
 * Pure procedural mapping — no LLM involvement.
 */
export function computeEspeakParams(
  species: PerceptionMode,
  mood: number,
  energy: number,
  comfort: number,
): {
  pitch: number;
  speed: number;
  volume: number;
  variant: string;
} {
  // Clamp inputs to 0-100
  const clampedMood = Math.max(0, Math.min(100, mood));
  const clampedEnergy = Math.max(0, Math.min(100, energy));
  const clampedComfort = Math.max(0, Math.min(100, comfort));

  // Pitch: base by species + mood modulation (+-30)
  // mood 0 => -30, mood 50 => 0, mood 100 => +30
  const moodOffset = ((clampedMood - 50) / 50) * 30;
  const pitch = Math.round(
    Math.max(0, Math.min(99, SPECIES_BASE_PITCH[species] + moodOffset)),
  );

  // Speed: mapped from energy (low energy = 100 wpm, high energy = 250 wpm)
  const speed = Math.round(100 + (clampedEnergy / 100) * 150);

  // Volume: mapped from comfort (low comfort = quiet 30, high comfort = normal 100)
  const volume = Math.round(30 + (clampedComfort / 100) * 70);

  // Variant: species-specific
  const variant = SPECIES_VOICE_VARIANT[species];

  return { pitch, speed, volume, variant };
}

/**
 * Apply growth maturity effects to raw audio buffer.
 * Low maturity = degraded output (reduced volume via silence gaps).
 * This simulates the entity's voice "emerging" from noise.
 *
 * WAV format: 44-byte header + PCM data (16-bit signed, little-endian).
 */
export function applyMaturityEffects(
  audioBuffer: Buffer,
  maturity: number,
): Buffer {
  // Maturity 80+ = no degradation (mature voice)
  if (maturity >= 80) {
    return audioBuffer;
  }

  // WAV header is 44 bytes
  const HEADER_SIZE = 44;
  if (audioBuffer.length <= HEADER_SIZE) {
    return audioBuffer;
  }

  const result = Buffer.from(audioBuffer);
  const pcmData = result.subarray(HEADER_SIZE);

  // Volume reduction: maturity 0 = 20% volume, maturity 80 = 100%
  const volumeScale = 0.2 + (maturity / 80) * 0.8;

  // Silence gap insertion: lower maturity = more gaps
  // gapProbability: maturity 0 = 15% of samples silenced, maturity 80 = 0%
  const gapProbability = Math.max(0, (80 - maturity) / 80) * 0.15;

  // Process 16-bit PCM samples
  for (let i = 0; i < pcmData.length - 1; i += 2) {
    // Insert silence gaps pseudo-randomly based on position
    // Use sample position as a simple deterministic "random" for reproducibility
    const sampleIndex = i / 2;
    const pseudoRandom = ((sampleIndex * 7919) % 10000) / 10000;

    if (pseudoRandom < gapProbability) {
      // Silence this sample
      pcmData.writeInt16LE(0, i);
    } else {
      // Scale volume
      const sample = pcmData.readInt16LE(i);
      const scaled = Math.round(sample * volumeScale);
      const clamped = Math.max(-32768, Math.min(32767, scaled));
      pcmData.writeInt16LE(clamped, i);
    }
  }

  return result;
}

/**
 * Espeak adapter implementation.
 * Lightweight local TTS using the espeak-ng command-line tool.
 */
class EspeakAdapter implements VoiceAdapter {
  readonly provider = "local" as const;

  async initialize(): Promise<void> {
    try {
      await execFileAsync("espeak-ng", ["--version"]);
    } catch {
      throw new Error(
        "espeak-ng is not installed or not found in PATH. " +
          "Install it with: apt-get install espeak-ng (Debian/Ubuntu) " +
          "or brew install espeak-ng (macOS)",
      );
    }
  }

  async checkHealth(): Promise<{ available: boolean; error?: string }> {
    try {
      await execFileAsync("espeak-ng", ["--version"]);
      return { available: true };
    } catch (err) {
      return {
        available: false,
        error: `espeak-ng not available: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  getCapabilities(growthDay: number): VoiceCapabilities {
    // Use geometric (no species modifier) as default for capability check.
    // Actual species is applied during generation.
    const maturity = computeVoiceMaturity(growthDay, "geometric");

    return {
      canSpeak: maturity > 0,
      // Espeak max duration: grows from 2s to 10s
      maxDuration: maturity > 0 ? 2 + (maturity / 100) * 8 : 0,
      // Espeak emotional range: limited by robotic nature, caps at 60
      emotionalRange: Math.min(maturity * 0.6, 60),
      // Espeak clarity: decent even at low maturity (robotic but clear), caps at 70
      clarity: maturity > 0 ? Math.min(20 + maturity * 0.5, 70) : 0,
      // Espeak uniqueness: limited by robotic voice, caps at 40
      uniqueness: Math.min(maturity * 0.4, 40),
    };
  }

  async generate(request: VoiceRequest): Promise<VoiceResponse> {
    const maturity = computeVoiceMaturity(request.growthDay, request.species);

    if (maturity <= 0) {
      throw new Error(
        `Voice not yet awakened (growth day ${request.growthDay}, maturity ${maturity})`,
      );
    }

    const { pitch, speed, volume, variant } = computeEspeakParams(
      request.species,
      request.emotion.mood,
      request.emotion.energy,
      request.emotion.comfort,
    );

    // Build espeak-ng command arguments
    const args = [
      "-p", String(pitch),
      "-s", String(speed),
      "-a", String(volume),
      "-v", `en+${variant}`,
      "--stdout",
      request.text,
    ];

    try {
      const { stdout } = await execFileAsync("espeak-ng", args, {
        encoding: "buffer",
        maxBuffer: 10 * 1024 * 1024, // 10MB max
      });

      // Apply maturity-based degradation
      const processedAudio = applyMaturityEffects(stdout, maturity);

      // Estimate duration from WAV data
      // WAV: 44-byte header, 16-bit mono at sample rate from header
      // Default espeak-ng: 22050 Hz, 16-bit, mono
      const SAMPLE_RATE = 22050;
      const BYTES_PER_SAMPLE = 2;
      const pcmBytes = Math.max(0, processedAudio.length - 44);
      const durationMs = Math.round(
        (pcmBytes / (SAMPLE_RATE * BYTES_PER_SAMPLE)) * 1000,
      );

      // Compute emotional intensity from STATUS delta from neutral
      const moodDelta = Math.abs(request.emotion.mood - 50);
      const energyDelta = Math.abs(request.emotion.energy - 50);
      const emotionalIntensity = Math.min(100, moodDelta + energyDelta);

      return {
        audio: processedAudio,
        format: "wav",
        durationMs,
        metadata: {
          pitch,
          speed,
          emotionalIntensity,
        },
      };
    } catch (err) {
      throw new Error(
        `espeak-ng generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async shutdown(): Promise<void> {
    // Stateless — nothing to clean up
  }
}

/**
 * Factory function to create an EspeakAdapter.
 */
export function createEspeakAdapter(): VoiceAdapter {
  return new EspeakAdapter();
}
