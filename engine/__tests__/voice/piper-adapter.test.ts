import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeVoiceMaturity } from "../../src/voice/voice-adapter.js";
import type { PerceptionMode } from "../../src/types.js";

// Mock child_process.execFile before importing the adapter
vi.mock("node:child_process", () => {
  return {
    execFile: vi.fn(),
  };
});

// Mock node:util to make promisify return our mock
vi.mock("node:util", async () => {
  const actual = await vi.importActual<typeof import("node:util")>("node:util");
  return {
    ...actual,
    promisify: (fn: unknown) => fn,
  };
});

// Mock fs/promises for model file access checks
vi.mock("node:fs/promises", () => {
  return {
    access: vi.fn(),
    constants: { R_OK: 4 },
  };
});

import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import {
  createPiperAdapter,
  computePiperParams,
  applyPiperMaturityEffects,
} from "../../src/voice/piper-adapter.js";
import type { VoiceRequest } from "../../src/voice/voice-adapter.js";

const mockedExecFile = vi.mocked(execFile);
const mockedAccess = vi.mocked(access);

/**
 * Create raw PCM buffer (no WAV header — piper outputs raw PCM).
 */
function makePcmBuffer(samples: number[]): Buffer {
  const buf = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, i) => {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  });
  return buf;
}

function makeRequest(overrides: Partial<VoiceRequest> = {}): VoiceRequest {
  return {
    text: "Hello",
    emotion: { mood: 50, energy: 50, comfort: 50 },
    species: "vibration" as PerceptionMode,
    growthDay: 60,
    languageLevel: 2,
    ...overrides,
  };
}

describe("Piper Adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createPiperAdapter (factory)", () => {
    it("creates an adapter with provider 'local'", () => {
      const adapter = createPiperAdapter("/path/to/model.onnx");
      expect(adapter.provider).toBe("local");
    });

    it("returns an object implementing VoiceAdapter interface", () => {
      const adapter = createPiperAdapter();
      expect(typeof adapter.initialize).toBe("function");
      expect(typeof adapter.checkHealth).toBe("function");
      expect(typeof adapter.getCapabilities).toBe("function");
      expect(typeof adapter.generate).toBe("function");
      expect(typeof adapter.shutdown).toBe("function");
    });

    it("accepts optional model path", () => {
      const adapter = createPiperAdapter("/custom/model.onnx");
      expect(adapter.provider).toBe("local");
    });
  });

  describe("initialize", () => {
    it("succeeds when piper and model are available", async () => {
      mockedExecFile.mockResolvedValueOnce({
        stdout: "piper 1.2.0",
        stderr: "",
      } as never);
      mockedAccess.mockResolvedValueOnce(undefined);

      const adapter = createPiperAdapter("/path/to/model.onnx");
      await expect(adapter.initialize()).resolves.toBeUndefined();
    });

    it("throws when piper is not installed", async () => {
      mockedExecFile.mockRejectedValueOnce(new Error("ENOENT"));

      const adapter = createPiperAdapter("/path/to/model.onnx");
      await expect(adapter.initialize()).rejects.toThrow("piper is not installed");
    });

    it("throws when model file is missing", async () => {
      mockedExecFile.mockResolvedValueOnce({
        stdout: "piper 1.2.0",
        stderr: "",
      } as never);
      mockedAccess.mockRejectedValueOnce(new Error("ENOENT"));

      const adapter = createPiperAdapter("/missing/model.onnx");
      await expect(adapter.initialize()).rejects.toThrow("Piper model not found");
    });
  });

  describe("checkHealth", () => {
    it("returns available: true when piper and model are OK", async () => {
      mockedExecFile.mockResolvedValueOnce({
        stdout: "piper 1.2.0",
        stderr: "",
      } as never);
      mockedAccess.mockResolvedValueOnce(undefined);

      const adapter = createPiperAdapter("/path/to/model.onnx");
      const health = await adapter.checkHealth();
      expect(health.available).toBe(true);
      expect(health.error).toBeUndefined();
    });

    it("returns available: false when piper is missing", async () => {
      mockedExecFile.mockRejectedValueOnce(new Error("not found"));

      const adapter = createPiperAdapter("/path/to/model.onnx");
      const health = await adapter.checkHealth();
      expect(health.available).toBe(false);
      expect(health.error).toContain("piper not available");
    });

    it("returns available: false when model file is missing", async () => {
      mockedExecFile.mockResolvedValueOnce({
        stdout: "piper 1.2.0",
        stderr: "",
      } as never);
      mockedAccess.mockRejectedValueOnce(new Error("ENOENT"));

      const adapter = createPiperAdapter("/missing/model.onnx");
      const health = await adapter.checkHealth();
      expect(health.available).toBe(false);
      expect(health.error).toContain("Piper model not found");
    });
  });

  describe("computePiperParams", () => {
    it("maps length scale inversely from energy", () => {
      const lowEnergy = computePiperParams("vibration", 50, 0, 50);
      const midEnergy = computePiperParams("vibration", 50, 50, 50);
      const highEnergy = computePiperParams("vibration", 50, 100, 50);

      // Low energy = slower = 1.3
      expect(lowEnergy.lengthScale).toBe(1.3);
      // Mid energy = 1.05
      expect(midEnergy.lengthScale).toBe(1.05);
      // High energy = faster = 0.8
      expect(highEnergy.lengthScale).toBe(0.8);

      // Inverse relationship: higher energy => lower lengthScale
      expect(highEnergy.lengthScale).toBeLessThan(lowEnergy.lengthScale);
    });

    it("maps noise scale inversely from comfort", () => {
      const lowComfort = computePiperParams("vibration", 50, 50, 0);
      const highComfort = computePiperParams("vibration", 50, 50, 100);

      // Low comfort = more noise = 0.8
      expect(lowComfort.noiseScale).toBe(0.8);
      // High comfort = clean = 0.3
      expect(highComfort.noiseScale).toBe(0.3);

      expect(lowComfort.noiseScale).toBeGreaterThan(highComfort.noiseScale);
    });

    it("maps noise width from mood", () => {
      const lowMood = computePiperParams("vibration", 0, 50, 50);
      const highMood = computePiperParams("vibration", 100, 50, 50);

      // Low mood = narrow = 0.3
      expect(lowMood.noiseW).toBe(0.3);
      // High mood = wider = 0.7
      expect(highMood.noiseW).toBe(0.7);

      expect(highMood.noiseW).toBeGreaterThan(lowMood.noiseW);
    });

    it("returns consistent values for all species (same STATUS)", () => {
      const species: PerceptionMode[] = [
        "vibration", "chromatic", "geometric", "thermal", "temporal", "chemical",
      ];

      for (const s of species) {
        const params = computePiperParams(s, 50, 50, 50);
        // All species with same STATUS should get same piper params
        // (species differences are in model selection, not these params)
        expect(params.lengthScale).toBe(1.05);
        expect(params.noiseScale).toBe(0.55);
        expect(params.noiseW).toBe(0.5);
      }
    });

    it("rounds to 2 decimal places", () => {
      const params = computePiperParams("vibration", 33, 67, 42);

      // Check that values are rounded to 2 decimal places
      expect(params.lengthScale).toBe(Math.round(params.lengthScale * 100) / 100);
      expect(params.noiseScale).toBe(Math.round(params.noiseScale * 100) / 100);
      expect(params.noiseW).toBe(Math.round(params.noiseW * 100) / 100);
    });

    it("clamps extreme input values", () => {
      const params = computePiperParams("vibration", -50, 200, -10);

      // Should behave as if clamped to 0-100
      expect(params.lengthScale).toBeGreaterThanOrEqual(0.8);
      expect(params.lengthScale).toBeLessThanOrEqual(1.3);
      expect(params.noiseScale).toBeGreaterThanOrEqual(0.3);
      expect(params.noiseScale).toBeLessThanOrEqual(0.8);
      expect(params.noiseW).toBeGreaterThanOrEqual(0.3);
      expect(params.noiseW).toBeLessThanOrEqual(0.7);
    });
  });

  describe("getCapabilities", () => {
    it("returns canSpeak=false for day 0-14", () => {
      const adapter = createPiperAdapter();

      expect(adapter.getCapabilities(0).canSpeak).toBe(false);
      expect(adapter.getCapabilities(7).canSpeak).toBe(false);
      expect(adapter.getCapabilities(14).canSpeak).toBe(false);
    });

    it("returns canSpeak=true for day 15+", () => {
      const adapter = createPiperAdapter();

      expect(adapter.getCapabilities(15).canSpeak).toBe(true);
      expect(adapter.getCapabilities(30).canSpeak).toBe(true);
      expect(adapter.getCapabilities(60).canSpeak).toBe(true);
    });

    it("increases capabilities with growth day", () => {
      const adapter = createPiperAdapter();

      const day20 = adapter.getCapabilities(20);
      const day60 = adapter.getCapabilities(60);
      const day120 = adapter.getCapabilities(120);

      expect(day60.maxDuration).toBeGreaterThan(day20.maxDuration);
      expect(day120.maxDuration).toBeGreaterThan(day60.maxDuration);

      expect(day60.emotionalRange).toBeGreaterThan(day20.emotionalRange);
      expect(day120.emotionalRange).toBeGreaterThan(day60.emotionalRange);

      expect(day60.clarity).toBeGreaterThan(day20.clarity);
      expect(day120.clarity).toBeGreaterThan(day60.clarity);
    });

    it("has higher caps than espeak (clarity 90, emotionalRange 80, uniqueness 65)", () => {
      const adapter = createPiperAdapter();
      const mature = adapter.getCapabilities(300);

      expect(mature.emotionalRange).toBeLessThanOrEqual(80);
      expect(mature.clarity).toBeLessThanOrEqual(90);
      expect(mature.uniqueness).toBeLessThanOrEqual(65);

      // Piper caps should be reachable at high maturity
      expect(mature.emotionalRange).toBeGreaterThan(60); // higher than espeak's 60 cap
      expect(mature.clarity).toBeGreaterThan(70);         // higher than espeak's 70 cap
      expect(mature.uniqueness).toBeGreaterThan(40);      // higher than espeak's 40 cap
    });

    it("returns zero capabilities when not speaking", () => {
      const adapter = createPiperAdapter();
      const prevoice = adapter.getCapabilities(10);

      expect(prevoice.canSpeak).toBe(false);
      expect(prevoice.maxDuration).toBe(0);
      expect(prevoice.clarity).toBe(0);
    });
  });

  describe("generate", () => {
    it("generates WAV audio with correct parameters", async () => {
      const pcmData = makePcmBuffer([1000, 2000, -1000, 500, 0, -500, 3000, -3000]);

      mockedExecFile.mockResolvedValueOnce({
        stdout: pcmData,
        stderr: Buffer.alloc(0),
      } as never);

      const adapter = createPiperAdapter("/path/to/model.onnx");
      const request = makeRequest({
        species: "chromatic",
        emotion: { mood: 70, energy: 60, comfort: 80 },
        growthDay: 60,
      });

      const response = await adapter.generate(request);

      expect(response.format).toBe("wav");
      expect(response.audio).toBeInstanceOf(Buffer);
      // Output should be PCM + WAV header (44 bytes)
      expect(response.audio.length).toBeGreaterThan(44);
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("passes computed parameters to piper command", async () => {
      const pcmData = makePcmBuffer([100, 200, 300]);

      mockedExecFile.mockResolvedValueOnce({
        stdout: pcmData,
        stderr: Buffer.alloc(0),
      } as never);

      const adapter = createPiperAdapter("/path/to/model.onnx");
      const request = makeRequest({
        species: "vibration",
        emotion: { mood: 50, energy: 50, comfort: 50 },
      });

      await adapter.generate(request);

      expect(mockedExecFile).toHaveBeenCalledWith(
        "piper",
        expect.arrayContaining([
          "--model", "/path/to/model.onnx",
          "--output-raw",
          "--length-scale", "1.05",
          "--noise-scale", "0.55",
          "--noise-w", "0.5",
        ]),
        expect.any(Object),
      );
    });

    it("throws when voice not yet awakened (growthDay < 15)", async () => {
      const adapter = createPiperAdapter("/path/to/model.onnx");
      const request = makeRequest({ growthDay: 10 });

      await expect(adapter.generate(request)).rejects.toThrow("Voice not yet awakened");
    });

    it("throws when piper command fails", async () => {
      mockedExecFile.mockRejectedValueOnce(new Error("piper crashed"));

      const adapter = createPiperAdapter("/path/to/model.onnx");
      const request = makeRequest();

      await expect(adapter.generate(request)).rejects.toThrow("piper generation failed");
    });

    it("wraps raw PCM output in WAV container", async () => {
      const pcmData = makePcmBuffer([1000, 2000, 3000, 4000]);

      mockedExecFile.mockResolvedValueOnce({
        stdout: pcmData,
        stderr: Buffer.alloc(0),
      } as never);

      const adapter = createPiperAdapter("/path/to/model.onnx");
      const request = makeRequest({ growthDay: 150 }); // high maturity, no degradation

      const response = await adapter.generate(request);

      // Verify WAV header
      expect(response.audio.subarray(0, 4).toString()).toBe("RIFF");
      expect(response.audio.subarray(8, 12).toString()).toBe("WAVE");
      expect(response.audio.subarray(12, 16).toString()).toBe("fmt ");
      expect(response.audio.subarray(36, 40).toString()).toBe("data");

      // Verify audio format
      const audioFormat = response.audio.readUInt16LE(20);
      expect(audioFormat).toBe(1); // PCM

      // Verify sample rate = 16000
      const sampleRate = response.audio.readUInt32LE(24);
      expect(sampleRate).toBe(16000);
    });

    it("computes emotional intensity from STATUS deltas", async () => {
      const pcmData = makePcmBuffer([100, 200]);

      mockedExecFile.mockResolvedValueOnce({
        stdout: pcmData,
        stderr: Buffer.alloc(0),
      } as never);

      const adapter = createPiperAdapter("/path/to/model.onnx");
      const request = makeRequest({
        emotion: { mood: 20, energy: 80, comfort: 50 },
      });

      const response = await adapter.generate(request);

      // mood delta = |20-50| = 30, energy delta = |80-50| = 30
      // emotionalIntensity = min(100, 30+30) = 60
      expect(response.metadata.emotionalIntensity).toBe(60);
    });
  });

  describe("applyPiperMaturityEffects", () => {
    it("returns unmodified buffer at maturity >= 80", () => {
      const original = makePcmBuffer([1000, 2000, 3000]);
      const result = applyPiperMaturityEffects(original, 80);

      expect(result).toEqual(original);
    });

    it("returns unmodified buffer at maturity 100", () => {
      const original = makePcmBuffer([1000, 2000, 3000]);
      const result = applyPiperMaturityEffects(original, 100);

      expect(result).toEqual(original);
    });

    it("reduces volume at low maturity", () => {
      const samples = [10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000];
      const original = makePcmBuffer(samples);
      const degraded = applyPiperMaturityEffects(original, 10);

      // At least some samples should be reduced
      let anyReduced = false;
      for (let i = 0; i < samples.length; i++) {
        const sample = degraded.readInt16LE(i * 2);
        if (Math.abs(sample) < Math.abs(samples[i])) {
          anyReduced = true;
        }
      }

      expect(anyReduced).toBe(true);
    });

    it("handles empty buffer gracefully", () => {
      const empty = Buffer.alloc(0);
      const result = applyPiperMaturityEffects(empty, 10);
      expect(result.length).toBe(0);
    });
  });

  describe("shutdown", () => {
    it("completes without error (stateless)", async () => {
      const adapter = createPiperAdapter();
      await expect(adapter.shutdown()).resolves.toBeUndefined();
    });
  });
});
