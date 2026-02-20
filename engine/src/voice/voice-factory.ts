/**
 * Voice Factory — Creates the appropriate voice adapter based on hardware.
 *
 * Uses estimateLocalVoiceCapacity to determine which TTS engine the
 * entity's physical body can support, then instantiates the right adapter.
 *
 * Following One Body, One Soul: hardware determines vocal capability.
 * A Raspberry Pi 2GB gets espeak (robotic), a Mac mini 16GB gets piper/styletts2.
 * Insufficient hardware gets NoneVoiceAdapter (pre-voice, sounds only).
 *
 * Future adapters (espeak-adapter.ts, piper-adapter.ts) are imported dynamically
 * to allow the factory to work even when adapter implementations are not yet present.
 */

import type { HardwareBody } from "../types.js";
import {
  estimateLocalVoiceCapacity,
  type VoiceAdapter,
  type VoiceCapabilities,
  type VoiceRequest,
  type VoiceResponse,
  type VoiceProviderType,
} from "./voice-adapter.js";

/**
 * Options for voice adapter creation.
 */
export interface VoiceFactoryOptions {
  /** Path to a Piper TTS model file (required for piper adapter) */
  piperModelPath?: string;
}

/**
 * NoneVoiceAdapter — for entities that cannot produce voice.
 *
 * Used when:
 *   - Hardware has insufficient RAM for any local TTS (< 2GB)
 *   - Entity is in pre-voice stage
 *   - No TTS engine is available
 *
 * This is not a failure state — it is a valid mode of existence.
 * The entity still communicates through procedural sounds (Web Audio API)
 * and text (symbols, broken words, hybrid language).
 */
export class NoneVoiceAdapter implements VoiceAdapter {
  readonly provider: VoiceProviderType = "none";

  async initialize(): Promise<void> {
    // Nothing to initialize — voice is not available
  }

  async checkHealth(): Promise<{ available: boolean; error?: string }> {
    return {
      available: false,
      error: "Voice not available — hardware insufficient or pre-voice stage",
    };
  }

  getCapabilities(_growthDay: number): VoiceCapabilities {
    return {
      canSpeak: false,
      maxDuration: 0,
      emotionalRange: 0,
      clarity: 0,
      uniqueness: 0,
    };
  }

  async generate(_request: VoiceRequest): Promise<VoiceResponse> {
    throw new Error("Voice not available");
  }

  async shutdown(): Promise<void> {
    // Nothing to clean up
  }
}

/**
 * Create the appropriate voice adapter based on hardware capabilities.
 *
 * Decision tree:
 *   1. estimateLocalVoiceCapacity(hardware) determines engine recommendation
 *   2. canRunLocal=false -> NoneVoiceAdapter
 *   3. engine="espeak"   -> createEspeakAdapter()
 *   4. engine="piper"    -> createPiperAdapter(piperModelPath)
 *   5. engine="styletts2" -> createPiperAdapter() as fallback (not yet implemented)
 *
 * @param hardware - The entity's physical body (HardwareBody from SEED.md)
 * @param options - Optional configuration (e.g., piper model path)
 * @returns A VoiceAdapter instance appropriate for this hardware
 */
export async function createVoiceAdapter(
  hardware: HardwareBody,
  options?: VoiceFactoryOptions,
): Promise<VoiceAdapter> {
  const capacity = estimateLocalVoiceCapacity(hardware);

  if (!capacity.canRunLocal || capacity.recommendedEngine === null) {
    return new NoneVoiceAdapter();
  }

  switch (capacity.recommendedEngine) {
    case "espeak": {
      // Dynamic import — espeak-adapter.ts may not exist yet
      try {
        const mod = await import("./espeak-adapter.js");
        return mod.createEspeakAdapter();
      } catch {
        // Adapter not yet implemented — degrade to none
        return new NoneVoiceAdapter();
      }
    }

    case "piper": {
      // Dynamic import — piper-adapter.ts may not exist yet
      try {
        const mod = await import("./piper-adapter.js");
        return mod.createPiperAdapter(options?.piperModelPath);
      } catch {
        // Adapter not yet implemented — degrade to none
        return new NoneVoiceAdapter();
      }
    }

    case "styletts2": {
      // styletts2 not implemented — degrade gracefully to piper
      try {
        const mod = await import("./piper-adapter.js");
        return mod.createPiperAdapter(options?.piperModelPath);
      } catch {
        // Neither styletts2 nor piper available — degrade to none
        return new NoneVoiceAdapter();
      }
    }

    default:
      return new NoneVoiceAdapter();
  }
}
