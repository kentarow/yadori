/**
 * Piper Adapter — Neural TTS for medium-capacity devices.
 *
 * Target: 4-7GB RAM devices (entry-level desktops, mid-range SBCs).
 * Uses piper command-line tool for neural voice synthesis.
 *
 * Following the owner's decision: no acting. Voice quality and expression
 * are determined entirely by species type + STATUS parameters (mood, energy,
 * comfort). No LLM instructions for voice — pure procedural mapping.
 *
 * Piper produces higher quality, more natural-sounding voice than espeak,
 * using ONNX neural network models. The trade-off is higher RAM usage
 * and the need for a model file.
 *
 * Following Honest Perception (output side): voice characteristics are
 * driven by STATUS.md values, not by LLM acting instructions.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, constants } from "node:fs/promises";
import type { PerceptionMode } from "../types.js";
import {
  computeVoiceMaturity,
  type VoiceAdapter,
  type VoiceCapabilities,
  type VoiceRequest,
  type VoiceResponse,
} from "./voice-adapter.js";

const execFileAsync = promisify(execFile);

/**
 * Default model path if none specified.
 * Piper models are typically stored in ~/.local/share/piper-voices/
 */
const DEFAULT_MODEL_PATH =
  process.env.HOME
    ? `${process.env.HOME}/.local/share/piper-voices/en_US-lessac-medium.onnx`
    : "/usr/share/piper-voices/en_US-lessac-medium.onnx";

/**
 * Species-specific default model voice recommendations.
 * These suggest which piper model character suits each species best.
 * Falls back to the configured model if the species-preferred one is not available.
 */
const SPECIES_PREFERRED_MODEL: Record<PerceptionMode, string> = {
  vibration: "en_US-lessac-medium.onnx",       // Clear, resonant
  chromatic: "en_US-amy-medium.onnx",           // Warm, light
  geometric: "en_US-ryan-medium.onnx",          // Precise, neutral
  thermal: "en_US-lessac-medium.onnx",          // Deep, steady
  temporal: "en_US-amy-medium.onnx",            // Flowing, smooth
  chemical: "en_US-ryan-medium.onnx",           // Textured, complex
};

/**
 * Compute piper synthesis parameters from species + STATUS values.
 * Pure procedural mapping — no LLM involvement.
 *
 * Piper parameters:
 *   --length-scale:  Duration multiplier (lower = faster speech)
 *   --noise-scale:   Phoneme noise (higher = more variation/breathiness)
 *   --noise-w:       Phoneme width noise (higher = more duration variation)
 */
export function computePiperParams(
  species: PerceptionMode,
  mood: number,
  energy: number,
  comfort: number,
): {
  lengthScale: number;
  noiseScale: number;
  noiseW: number;
} {
  // Clamp inputs to 0-100
  const clampedMood = Math.max(0, Math.min(100, mood));
  const clampedEnergy = Math.max(0, Math.min(100, energy));
  const clampedComfort = Math.max(0, Math.min(100, comfort));

  // Length scale: inverse of energy
  // High energy (100) = shorter/faster = 0.8
  // Low energy (0) = longer/slower = 1.3
  const lengthScale = 1.3 - (clampedEnergy / 100) * 0.5;

  // Noise scale: inverse of comfort
  // Low comfort (0) = more noise/breathiness = 0.8
  // High comfort (100) = clean = 0.3
  const noiseScale = 0.8 - (clampedComfort / 100) * 0.5;

  // Noise width: mapped from mood
  // High mood (100) = wider phoneme variation = 0.7
  // Low mood (0) = narrow/constrained = 0.3
  const noiseW = 0.3 + (clampedMood / 100) * 0.4;

  // Round to 2 decimal places for clean command-line args
  return {
    lengthScale: Math.round(lengthScale * 100) / 100,
    noiseScale: Math.round(noiseScale * 100) / 100,
    noiseW: Math.round(noiseW * 100) / 100,
  };
}

/**
 * Apply growth maturity effects to raw PCM audio data from piper.
 * Low maturity = degraded output (reduced volume, silence gaps).
 *
 * Piper --output-raw produces 16-bit signed PCM, 16000 Hz, mono (no WAV header).
 */
export function applyPiperMaturityEffects(
  pcmBuffer: Buffer,
  maturity: number,
): Buffer {
  // Maturity 80+ = no degradation
  if (maturity >= 80) {
    return pcmBuffer;
  }

  if (pcmBuffer.length === 0) {
    return pcmBuffer;
  }

  const result = Buffer.from(pcmBuffer);

  // Volume reduction: maturity 0 = 25% volume, maturity 80 = 100%
  const volumeScale = 0.25 + (maturity / 80) * 0.75;

  // Silence gap probability: maturity 0 = 12%, maturity 80 = 0%
  const gapProbability = Math.max(0, (80 - maturity) / 80) * 0.12;

  // Process 16-bit PCM samples
  for (let i = 0; i < result.length - 1; i += 2) {
    const sampleIndex = i / 2;
    const pseudoRandom = ((sampleIndex * 7919) % 10000) / 10000;

    if (pseudoRandom < gapProbability) {
      result.writeInt16LE(0, i);
    } else {
      const sample = result.readInt16LE(i);
      const scaled = Math.round(sample * volumeScale);
      const clamped = Math.max(-32768, Math.min(32767, scaled));
      result.writeInt16LE(clamped, i);
    }
  }

  return result;
}

/**
 * Wrap raw PCM data in a WAV container.
 * Piper outputs raw 16-bit signed PCM at 16000 Hz mono.
 */
function wrapInWav(pcmData: Buffer, sampleRate = 16000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;

  const header = Buffer.alloc(headerSize);

  // RIFF header
  header.write("RIFF", 0);
  header.writeUInt32LE(dataSize + headerSize - 8, 4);
  header.write("WAVE", 8);

  // fmt sub-chunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);           // Sub-chunk size
  header.writeUInt16LE(1, 20);            // Audio format (PCM)
  header.writeUInt16LE(numChannels, 22);  // Channels
  header.writeUInt32LE(sampleRate, 24);   // Sample rate
  header.writeUInt32LE(byteRate, 28);     // Byte rate
  header.writeUInt16LE(blockAlign, 32);   // Block align
  header.writeUInt16LE(bitsPerSample, 34);// Bits per sample

  // data sub-chunk
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}

/**
 * Piper adapter implementation.
 * Neural TTS using the piper command-line tool with ONNX models.
 */
class PiperAdapter implements VoiceAdapter {
  readonly provider = "local" as const;
  private readonly modelPath: string;

  constructor(modelPath?: string) {
    this.modelPath = modelPath ?? DEFAULT_MODEL_PATH;
  }

  async initialize(): Promise<void> {
    // Check piper binary
    try {
      await execFileAsync("piper", ["--version"]);
    } catch {
      throw new Error(
        "piper is not installed or not found in PATH. " +
          "Install it from: https://github.com/rhasspy/piper",
      );
    }

    // Check model file
    try {
      await access(this.modelPath, constants.R_OK);
    } catch {
      throw new Error(
        `Piper model not found at: ${this.modelPath}. ` +
          "Download a model from: https://github.com/rhasspy/piper/blob/master/VOICES.md",
      );
    }
  }

  async checkHealth(): Promise<{ available: boolean; error?: string }> {
    // Check piper binary
    try {
      await execFileAsync("piper", ["--version"]);
    } catch (err) {
      return {
        available: false,
        error: `piper not available: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Check model file
    try {
      await access(this.modelPath, constants.R_OK);
    } catch {
      return {
        available: false,
        error: `Piper model not found at: ${this.modelPath}`,
      };
    }

    return { available: true };
  }

  getCapabilities(growthDay: number): VoiceCapabilities {
    const maturity = computeVoiceMaturity(growthDay, "geometric");

    return {
      canSpeak: maturity > 0,
      // Piper max duration: grows from 3s to 15s (higher than espeak)
      maxDuration: maturity > 0 ? 3 + (maturity / 100) * 12 : 0,
      // Piper emotional range: neural voice is more expressive, caps at 80
      emotionalRange: Math.min(maturity * 0.8, 80),
      // Piper clarity: neural voice is naturally clearer, caps at 90
      clarity: maturity > 0 ? Math.min(30 + maturity * 0.6, 90) : 0,
      // Piper uniqueness: model-dependent but richer than espeak, caps at 65
      uniqueness: Math.min(maturity * 0.65, 65),
    };
  }

  async generate(request: VoiceRequest): Promise<VoiceResponse> {
    const maturity = computeVoiceMaturity(request.growthDay, request.species);

    if (maturity <= 0) {
      throw new Error(
        `Voice not yet awakened (growth day ${request.growthDay}, maturity ${maturity})`,
      );
    }

    const { lengthScale, noiseScale, noiseW } = computePiperParams(
      request.species,
      request.emotion.mood,
      request.emotion.energy,
      request.emotion.comfort,
    );

    // Build piper command arguments
    const args = [
      "--model", this.modelPath,
      "--output-raw",
      "--length-scale", String(lengthScale),
      "--noise-scale", String(noiseScale),
      "--noise-w", String(noiseW),
    ];

    try {
      // Piper reads text from stdin and writes raw PCM to stdout
      const { stdout } = await execFileAsync("piper", args, {
        encoding: "buffer",
        maxBuffer: 10 * 1024 * 1024, // 10MB max
      });

      // Apply maturity-based degradation to raw PCM
      const processedPcm = applyPiperMaturityEffects(stdout, maturity);

      // Wrap in WAV container (piper outputs 16kHz 16-bit mono PCM)
      const wavAudio = wrapInWav(processedPcm, 16000);

      // Estimate duration from PCM data
      const SAMPLE_RATE = 16000;
      const BYTES_PER_SAMPLE = 2;
      const durationMs = Math.round(
        (processedPcm.length / (SAMPLE_RATE * BYTES_PER_SAMPLE)) * 1000,
      );

      // Compute emotional intensity from STATUS delta from neutral
      const moodDelta = Math.abs(request.emotion.mood - 50);
      const energyDelta = Math.abs(request.emotion.energy - 50);
      const emotionalIntensity = Math.min(100, moodDelta + energyDelta);

      return {
        audio: wavAudio,
        format: "wav",
        durationMs,
        metadata: {
          pitch: noiseW, // noiseW reflects mood-driven variation
          speed: lengthScale,
          emotionalIntensity,
        },
      };
    } catch (err) {
      throw new Error(
        `piper generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async shutdown(): Promise<void> {
    // Stateless — nothing to clean up
  }
}

/**
 * Factory function to create a PiperAdapter.
 * @param modelPath - Optional path to the piper ONNX model file.
 *                    Defaults to ~/.local/share/piper-voices/en_US-lessac-medium.onnx
 */
export function createPiperAdapter(modelPath?: string): VoiceAdapter {
  return new PiperAdapter(modelPath);
}
