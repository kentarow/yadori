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

import { execFile } from "node:child_process";
import {
  createEspeakAdapter,
  computeEspeakParams,
  applyMaturityEffects,
} from "../../src/voice/espeak-adapter.js";
import type { VoiceRequest } from "../../src/voice/voice-adapter.js";

const mockedExecFile = vi.mocked(execFile);

/**
 * Create a minimal valid WAV buffer for testing.
 * 44-byte header + PCM data.
 */
function makeWavBuffer(pcmSamples: number[]): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.write("data", 36);

  const pcm = Buffer.alloc(pcmSamples.length * 2);
  pcmSamples.forEach((sample, i) => {
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  });

  header.writeUInt32LE(pcm.length + 36, 4); // File size - 8
  header.writeUInt32LE(16, 16);              // fmt chunk size
  header.writeUInt16LE(1, 20);               // PCM format
  header.writeUInt16LE(1, 22);               // Mono
  header.writeUInt32LE(22050, 24);           // Sample rate
  header.writeUInt32LE(44100, 28);           // Byte rate
  header.writeUInt16LE(2, 32);               // Block align
  header.writeUInt16LE(16, 34);              // Bits per sample
  header.writeUInt32LE(pcm.length, 40);      // Data size

  return Buffer.concat([header, pcm]);
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

describe("Espeak Adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createEspeakAdapter (factory)", () => {
    it("creates an adapter with provider 'local'", () => {
      const adapter = createEspeakAdapter();
      expect(adapter.provider).toBe("local");
    });

    it("returns an object implementing VoiceAdapter interface", () => {
      const adapter = createEspeakAdapter();
      expect(typeof adapter.initialize).toBe("function");
      expect(typeof adapter.checkHealth).toBe("function");
      expect(typeof adapter.getCapabilities).toBe("function");
      expect(typeof adapter.generate).toBe("function");
      expect(typeof adapter.shutdown).toBe("function");
    });
  });

  describe("initialize", () => {
    it("succeeds when espeak-ng is available", async () => {
      mockedExecFile.mockResolvedValueOnce({
        stdout: "eSpeak NG text-to-speech: 1.51",
        stderr: "",
      } as never);

      const adapter = createEspeakAdapter();
      await expect(adapter.initialize()).resolves.toBeUndefined();
    });

    it("throws when espeak-ng is not installed", async () => {
      mockedExecFile.mockRejectedValueOnce(new Error("ENOENT"));

      const adapter = createEspeakAdapter();
      await expect(adapter.initialize()).rejects.toThrow("espeak-ng is not installed");
    });
  });

  describe("checkHealth", () => {
    it("returns available: true when espeak-ng works", async () => {
      mockedExecFile.mockResolvedValueOnce({
        stdout: "eSpeak NG 1.51",
        stderr: "",
      } as never);

      const adapter = createEspeakAdapter();
      const health = await adapter.checkHealth();
      expect(health.available).toBe(true);
      expect(health.error).toBeUndefined();
    });

    it("returns available: false with error when espeak-ng fails", async () => {
      mockedExecFile.mockRejectedValueOnce(new Error("not found"));

      const adapter = createEspeakAdapter();
      const health = await adapter.checkHealth();
      expect(health.available).toBe(false);
      expect(health.error).toContain("espeak-ng not available");
    });
  });

  describe("computeEspeakParams", () => {
    it("returns correct base pitch for each species (scaled to espeak 0-99 range)", () => {
      // Spec pitch values (80-150) are scaled into espeak range (20-80),
      // leaving room for mood modulation (+-30).
      // At mood=50, offset is 0, so pitch = base.
      const expectedPitches: Record<PerceptionMode, number> = {
        geometric: 20,   // spec 80  -> 20
        vibration: 37,   // spec 100 -> 37
        chemical: 46,    // spec 110 -> 46
        thermal: 54,     // spec 120 -> 54
        temporal: 63,    // spec 130 -> 63
        chromatic: 80,   // spec 150 -> 80
      };

      for (const [species, expectedPitch] of Object.entries(expectedPitches)) {
        const params = computeEspeakParams(species as PerceptionMode, 50, 50, 50);
        expect(params.pitch).toBe(expectedPitch);
      }
    });

    it("modulates pitch by mood (+-30 from base)", () => {
      // Use thermal (base=54) — middle of range, room for +-30
      const lowMood = computeEspeakParams("thermal", 0, 50, 50);
      const midMood = computeEspeakParams("thermal", 50, 50, 50);
      const highMood = computeEspeakParams("thermal", 100, 50, 50);

      // Low mood: 54 - 30 = 24
      expect(lowMood.pitch).toBe(24);
      // Mid mood: 54 + 0 = 54
      expect(midMood.pitch).toBe(54);
      // High mood: 54 + 30 = 84
      expect(highMood.pitch).toBe(84);

      // Monotonic relationship
      expect(highMood.pitch).toBeGreaterThan(midMood.pitch);
      expect(midMood.pitch).toBeGreaterThan(lowMood.pitch);
    });

    it("maps speed from energy (100-250 wpm)", () => {
      const lowEnergy = computeEspeakParams("vibration", 50, 0, 50);
      const highEnergy = computeEspeakParams("vibration", 50, 100, 50);

      expect(lowEnergy.speed).toBe(100);
      expect(highEnergy.speed).toBe(250);
    });

    it("maps volume from comfort (30-100)", () => {
      const lowComfort = computeEspeakParams("vibration", 50, 50, 0);
      const highComfort = computeEspeakParams("vibration", 50, 50, 100);

      expect(lowComfort.volume).toBe(30);
      expect(highComfort.volume).toBe(100);
    });

    it("returns species-specific variant", () => {
      const vibration = computeEspeakParams("vibration", 50, 50, 50);
      const chromatic = computeEspeakParams("chromatic", 50, 50, 50);
      const geometric = computeEspeakParams("geometric", 50, 50, 50);

      expect(vibration.variant).toBe("m1");
      expect(chromatic.variant).toBe("f2");
      expect(geometric.variant).toBe("m3");
    });

    it("clamps extreme input values", () => {
      // Values outside 0-100 should be clamped
      const params = computeEspeakParams("geometric", -50, 200, -10);

      expect(params.pitch).toBeGreaterThanOrEqual(0);
      expect(params.pitch).toBeLessThanOrEqual(99);
      expect(params.speed).toBeGreaterThanOrEqual(100);
      expect(params.speed).toBeLessThanOrEqual(250);
      expect(params.volume).toBeGreaterThanOrEqual(30);
      expect(params.volume).toBeLessThanOrEqual(100);
    });
  });

  describe("getCapabilities", () => {
    it("returns canSpeak=false for day 0-14", () => {
      const adapter = createEspeakAdapter();

      expect(adapter.getCapabilities(0).canSpeak).toBe(false);
      expect(adapter.getCapabilities(7).canSpeak).toBe(false);
      expect(adapter.getCapabilities(14).canSpeak).toBe(false);
    });

    it("returns canSpeak=true for day 15+", () => {
      const adapter = createEspeakAdapter();

      expect(adapter.getCapabilities(15).canSpeak).toBe(true);
      expect(adapter.getCapabilities(30).canSpeak).toBe(true);
      expect(adapter.getCapabilities(60).canSpeak).toBe(true);
    });

    it("increases capabilities with growth day", () => {
      const adapter = createEspeakAdapter();

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

    it("caps espeak-specific limits (clarity 70, emotionalRange 60, uniqueness 40)", () => {
      const adapter = createEspeakAdapter();
      const mature = adapter.getCapabilities(300);

      expect(mature.emotionalRange).toBeLessThanOrEqual(60);
      expect(mature.clarity).toBeLessThanOrEqual(70);
      expect(mature.uniqueness).toBeLessThanOrEqual(40);
    });

    it("returns zero capabilities when not speaking", () => {
      const adapter = createEspeakAdapter();
      const prevoice = adapter.getCapabilities(10);

      expect(prevoice.canSpeak).toBe(false);
      expect(prevoice.maxDuration).toBe(0);
      expect(prevoice.clarity).toBe(0);
    });
  });

  describe("generate", () => {
    it("generates WAV audio with correct parameters", async () => {
      const wavData = makeWavBuffer([1000, 2000, -1000, 500, 0, -500, 3000, -3000]);

      mockedExecFile.mockResolvedValueOnce({
        stdout: wavData,
        stderr: Buffer.alloc(0),
      } as never);

      const adapter = createEspeakAdapter();
      const request = makeRequest({
        species: "vibration",
        emotion: { mood: 70, energy: 60, comfort: 80 },
        growthDay: 60,
      });

      const response = await adapter.generate(request);

      expect(response.format).toBe("wav");
      expect(response.audio).toBeInstanceOf(Buffer);
      expect(response.audio.length).toBeGreaterThan(0);
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
      expect(response.metadata.pitch).toBeGreaterThan(0);
      expect(response.metadata.speed).toBeGreaterThan(0);
    });

    it("passes species-derived parameters to espeak-ng", async () => {
      const wavData = makeWavBuffer([100, 200, 300]);

      mockedExecFile.mockResolvedValueOnce({
        stdout: wavData,
        stderr: Buffer.alloc(0),
      } as never);

      const adapter = createEspeakAdapter();
      const request = makeRequest({
        species: "geometric",
        emotion: { mood: 50, energy: 50, comfort: 50 },
      });

      await adapter.generate(request);

      // Verify espeak-ng was called with correct args
      expect(mockedExecFile).toHaveBeenCalledWith(
        "espeak-ng",
        expect.arrayContaining([
          "-p", "20",     // geometric base pitch (scaled from spec 80)
          "-s", "175",    // energy 50 -> speed 175
          "-a", "65",     // comfort 50 -> volume 65
          "-v", "en+m3",  // geometric variant
          "--stdout",
          "Hello",
        ]),
        expect.any(Object),
      );
    });

    it("throws when voice not yet awakened (growthDay < 15)", async () => {
      const adapter = createEspeakAdapter();
      const request = makeRequest({ growthDay: 10 });

      await expect(adapter.generate(request)).rejects.toThrow("Voice not yet awakened");
    });

    it("throws when espeak-ng command fails", async () => {
      mockedExecFile.mockRejectedValueOnce(new Error("espeak-ng segfault"));

      const adapter = createEspeakAdapter();
      const request = makeRequest();

      await expect(adapter.generate(request)).rejects.toThrow("espeak-ng generation failed");
    });

    it("computes emotional intensity from STATUS deltas", async () => {
      const wavData = makeWavBuffer([100, 200]);

      mockedExecFile.mockResolvedValueOnce({
        stdout: wavData,
        stderr: Buffer.alloc(0),
      } as never);

      const adapter = createEspeakAdapter();
      const request = makeRequest({
        emotion: { mood: 90, energy: 10, comfort: 50 },
      });

      const response = await adapter.generate(request);

      // mood delta = |90-50| = 40, energy delta = |10-50| = 40
      // emotionalIntensity = min(100, 40+40) = 80
      expect(response.metadata.emotionalIntensity).toBe(80);
    });
  });

  describe("applyMaturityEffects", () => {
    it("returns unmodified buffer at maturity >= 80", () => {
      const original = makeWavBuffer([1000, 2000, 3000]);
      const result = applyMaturityEffects(original, 80);

      expect(result).toEqual(original);
    });

    it("returns unmodified buffer at maturity 100", () => {
      const original = makeWavBuffer([1000, 2000, 3000]);
      const result = applyMaturityEffects(original, 100);

      expect(result).toEqual(original);
    });

    it("reduces volume at low maturity", () => {
      const samples = [10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000];
      const original = makeWavBuffer(samples);
      const degraded = applyMaturityEffects(original, 10);

      // Read PCM data from position 44 onward
      const pcmStart = 44;
      let anyReduced = false;
      for (let i = 0; i < samples.length; i++) {
        const sample = degraded.readInt16LE(pcmStart + i * 2);
        if (Math.abs(sample) < Math.abs(samples[i])) {
          anyReduced = true;
        }
      }

      expect(anyReduced).toBe(true);
    });

    it("handles empty/small buffers gracefully", () => {
      // Buffer smaller than WAV header
      const small = Buffer.alloc(20);
      const result = applyMaturityEffects(small, 10);
      expect(result).toEqual(small);
    });
  });

  describe("shutdown", () => {
    it("completes without error (stateless)", async () => {
      const adapter = createEspeakAdapter();
      await expect(adapter.shutdown()).resolves.toBeUndefined();
    });
  });
});
