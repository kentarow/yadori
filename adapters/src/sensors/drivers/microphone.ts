/**
 * Microphone Driver — USB or built-in microphone.
 *
 * Captures a short audio clip and passes it through the audio processor.
 * Uses arecord (ALSA) on Linux.
 *
 * The entity never hears the audio. Only extracted features
 * (frequency bands, BPM, amplitude) are passed to perception.
 */

import type { SensorDriver, SensorDriverConfig, SensorDetectionResult } from "../../../../engine/src/perception/sensor-driver.js";
import type { RawInput, AudioInputData } from "../../../../engine/src/perception/perception-types.js";
import { processAudio } from "../../../../engine/src/perception/audio-processor.js";
import { commandExists, execBuffer } from "../exec-helper.js";

const DEFAULT_CONFIG: SensorDriverConfig = {
  id: "microphone",
  name: "usb-mic",
  modality: "audio",
  pollIntervalMs: 30000, // Every 30 seconds
  enabled: true,
};

const SAMPLE_RATE = 16000;
const DURATION_SECONDS = 2;
const BITS_PER_SAMPLE = 16;

export function createMicrophoneDriver(config?: Partial<SensorDriverConfig>): SensorDriver {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return {
    config: cfg,

    async detect(): Promise<SensorDetectionResult> {
      if (!await commandExists("arecord")) {
        return { available: false, reason: "arecord not found (install alsa-utils)" };
      }

      // Check if any capture device exists
      try {
        const { exec: execStr } = await import("../exec-helper.js");
        const devices = await execStr("arecord", ["-l"], 3000);
        if (devices.includes("card")) {
          return { available: true, details: "ALSA capture device found" };
        }
        return { available: false, reason: "No ALSA capture devices" };
      } catch {
        return { available: false, reason: "Failed to list ALSA devices" };
      }
    },

    async start(): Promise<void> {
      // Nothing to initialize
    },

    async read(): Promise<RawInput | null> {
      try {
        // Record raw PCM audio
        const rawPCM = await execBuffer("arecord", [
          "-f", "S16_LE",             // Signed 16-bit little-endian
          "-r", String(SAMPLE_RATE),   // Sample rate
          "-c", "1",                   // Mono
          "-d", String(DURATION_SECONDS),
          "-t", "raw",                 // Raw PCM (no WAV header)
          "-q",                        // Quiet
        ], (DURATION_SECONDS + 2) * 1000);

        // Convert Buffer to Float32Array for audio processor
        const sampleCount = rawPCM.length / 2; // 16-bit = 2 bytes per sample
        const samples = new Float32Array(sampleCount);

        for (let i = 0; i < sampleCount; i++) {
          const int16 = rawPCM.readInt16LE(i * 2);
          samples[i] = int16 / 32768; // Normalize to -1..1
        }

        // Process through audio processor (Honest Perception)
        const features = processAudio(samples, SAMPLE_RATE);

        const data: AudioInputData = {
          type: "audio",
          duration: features.duration,
          amplitude: features.amplitude / 100,
          bands: {
            bass: features.bands.bass / 100,
            mid: features.bands.mid / 100,
            treble: features.bands.treble / 100,
          },
          bpm: features.bpm > 0 ? features.bpm : null,
          beatRegularity: features.beatRegularity / 100,
          harmonicRichness: features.harmonicRichness / 100,
        };

        return {
          modality: "audio",
          timestamp: new Date().toISOString(),
          source: cfg.name,
          data,
        };
      } catch {
        return null;
      }
    },

    async stop(): Promise<void> {
      // Nothing to release
    },
  };
}
