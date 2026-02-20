import { describe, it, expect } from "vitest";
import {
  computeVoiceMaturity,
  estimateLocalVoiceCapacity,
  type VoiceAdapter,
  type VoiceCapabilities,
  type VoiceRequest,
  type VoiceResponse,
} from "../../src/voice/voice-adapter.js";
import type { HardwareBody, PerceptionMode } from "../../src/types.js";

function makeHardware(ramGB: number, platform = "darwin", arch = "arm64"): HardwareBody {
  return {
    platform,
    arch,
    totalMemoryGB: ramGB,
    cpuModel: "Test CPU",
    storageGB: 256,
  };
}

describe("Voice Adapter", () => {
  describe("computeVoiceMaturity", () => {
    it("returns 0 for day 0-14 (no voice stage)", () => {
      expect(computeVoiceMaturity(0, "chromatic")).toBe(0);
      expect(computeVoiceMaturity(7, "vibration")).toBe(0);
      expect(computeVoiceMaturity(14, "geometric")).toBe(0);
    });

    it("increases monotonically with growth day", () => {
      const species: PerceptionMode = "geometric"; // no modifier
      const days = [0, 10, 15, 20, 30, 45, 60, 90, 120, 150, 200, 300];
      let prev = -1;
      for (const day of days) {
        const maturity = computeVoiceMaturity(day, species);
        expect(maturity).toBeGreaterThanOrEqual(prev);
        prev = maturity;
      }
    });

    it("caps at 100 for very high growth day", () => {
      expect(computeVoiceMaturity(1000, "geometric")).toBe(100);
      expect(computeVoiceMaturity(5000, "vibration")).toBe(100);
      expect(computeVoiceMaturity(9999, "chromatic")).toBeLessThanOrEqual(100);
    });

    it("applies species modifiers correctly", () => {
      const day = 60; // mid-growth, base = 50

      const vibration = computeVoiceMaturity(day, "vibration");   // +10%
      const chemical = computeVoiceMaturity(day, "chemical");     // +5%
      const geometric = computeVoiceMaturity(day, "geometric");   // 0%
      const chromatic = computeVoiceMaturity(day, "chromatic");   // -5%

      // Vibration should be highest
      expect(vibration).toBeGreaterThan(geometric);
      // Chemical should be between vibration and geometric
      expect(chemical).toBeGreaterThan(geometric);
      expect(chemical).toBeLessThan(vibration);
      // Chromatic should be lowest
      expect(chromatic).toBeLessThan(geometric);
    });

    it("returns values in expected ranges for each growth phase", () => {
      const species: PerceptionMode = "geometric"; // no modifier

      // Day 15-30: 0-20 (faint murmurs)
      const day20 = computeVoiceMaturity(20, species);
      expect(day20).toBeGreaterThan(0);
      expect(day20).toBeLessThanOrEqual(20);

      // Day 31-60: 20-50 (recognizable tones)
      const day45 = computeVoiceMaturity(45, species);
      expect(day45).toBeGreaterThan(20);
      expect(day45).toBeLessThanOrEqual(50);

      // Day 61-120: 50-80 (speech-like)
      const day90 = computeVoiceMaturity(90, species);
      expect(day90).toBeGreaterThan(50);
      expect(day90).toBeLessThanOrEqual(80);

      // Day 121+: 80-100 (mature voice)
      const day200 = computeVoiceMaturity(200, species);
      expect(day200).toBeGreaterThan(80);
      expect(day200).toBeLessThanOrEqual(100);
    });
  });

  describe("estimateLocalVoiceCapacity", () => {
    it("recommends espeak for low RAM (2-3 GB)", () => {
      const result = estimateLocalVoiceCapacity(makeHardware(2));
      expect(result.canRunLocal).toBe(true);
      expect(result.recommendedEngine).toBe("espeak");

      const result3 = estimateLocalVoiceCapacity(makeHardware(3));
      expect(result3.canRunLocal).toBe(true);
      expect(result3.recommendedEngine).toBe("espeak");
    });

    it("recommends piper for medium RAM (4-7 GB)", () => {
      const result = estimateLocalVoiceCapacity(makeHardware(4));
      expect(result.canRunLocal).toBe(true);
      expect(result.recommendedEngine).toBe("piper");

      const result7 = estimateLocalVoiceCapacity(makeHardware(7));
      expect(result7.canRunLocal).toBe(true);
      expect(result7.recommendedEngine).toBe("piper");
    });

    it("recommends styletts2 for high RAM (8+ GB)", () => {
      const result = estimateLocalVoiceCapacity(makeHardware(8));
      expect(result.canRunLocal).toBe(true);
      expect(result.recommendedEngine).toBe("styletts2");

      const result16 = estimateLocalVoiceCapacity(makeHardware(16));
      expect(result16.canRunLocal).toBe(true);
      expect(result16.recommendedEngine).toBe("styletts2");
    });

    it("reports no local capability for < 2GB RAM", () => {
      const result = estimateLocalVoiceCapacity(makeHardware(1));
      expect(result.canRunLocal).toBe(false);
      expect(result.recommendedEngine).toBeNull();
    });

    it("includes a reason string", () => {
      const result = estimateLocalVoiceCapacity(makeHardware(4));
      expect(result.reason).toBeTruthy();
      expect(typeof result.reason).toBe("string");
    });
  });

  describe("VoiceCapabilities — canSpeak threshold", () => {
    it("canSpeak is false when maturity is 0 (pre-voice stage)", () => {
      // Simulate: an adapter would use computeVoiceMaturity to decide canSpeak
      const maturity = computeVoiceMaturity(10, "geometric");
      expect(maturity).toBe(0);

      // An adapter would set canSpeak based on maturity
      const capabilities: VoiceCapabilities = {
        canSpeak: maturity > 0,
        maxDuration: 0,
        emotionalRange: 0,
        clarity: 0,
        uniqueness: 0,
      };
      expect(capabilities.canSpeak).toBe(false);
    });

    it("canSpeak is true when maturity is above 0", () => {
      const maturity = computeVoiceMaturity(20, "geometric");
      expect(maturity).toBeGreaterThan(0);

      const capabilities: VoiceCapabilities = {
        canSpeak: maturity > 0,
        maxDuration: maturity / 10,
        emotionalRange: Math.min(maturity, 50),
        clarity: maturity * 0.6,
        uniqueness: maturity * 0.3,
      };
      expect(capabilities.canSpeak).toBe(true);
    });
  });

  describe("interface contract", () => {
    it("can be implemented as a mock adapter", async () => {
      const mockAdapter: VoiceAdapter = {
        provider: "local",

        async initialize(): Promise<void> {
          // No-op for mock
        },

        async checkHealth(): Promise<{ available: boolean; error?: string }> {
          return { available: true };
        },

        getCapabilities(growthDay: number): VoiceCapabilities {
          const maturity = computeVoiceMaturity(growthDay, "vibration");
          return {
            canSpeak: maturity > 0,
            maxDuration: maturity / 10,
            emotionalRange: Math.min(maturity, 80),
            clarity: maturity * 0.7,
            uniqueness: maturity * 0.4,
          };
        },

        async generate(request: VoiceRequest): Promise<VoiceResponse> {
          return {
            audio: Buffer.from("mock-audio-data"),
            format: "wav",
            durationMs: 1500,
            metadata: {
              pitch: request.emotion.mood / 100,
              speed: request.emotion.energy / 100,
              emotionalIntensity: 50,
            },
          };
        },

        async shutdown(): Promise<void> {
          // No-op for mock
        },
      };

      // Verify initialization
      await mockAdapter.initialize();

      // Verify health check
      const health = await mockAdapter.checkHealth();
      expect(health.available).toBe(true);

      // Verify capabilities
      const caps = mockAdapter.getCapabilities(60);
      expect(caps.canSpeak).toBe(true);
      expect(caps.maxDuration).toBeGreaterThan(0);

      // Verify generation
      const response = await mockAdapter.generate({
        text: "Hello",
        emotion: { mood: 70, energy: 50, comfort: 80 },
        species: "vibration",
        growthDay: 60,
        languageLevel: 2,
      });
      expect(response.audio).toBeInstanceOf(Buffer);
      expect(response.format).toBe("wav");
      expect(response.durationMs).toBe(1500);

      // Verify shutdown
      await mockAdapter.shutdown();
    });

    it("supports none provider type for pre-voice entities", () => {
      const noVoiceAdapter: VoiceAdapter = {
        provider: "none",
        initialize: async () => {},
        checkHealth: async () => ({ available: false, error: "Voice not yet awakened" }),
        getCapabilities: () => ({
          canSpeak: false,
          maxDuration: 0,
          emotionalRange: 0,
          clarity: 0,
          uniqueness: 0,
        }),
        generate: async () => {
          throw new Error("Voice not available");
        },
        shutdown: async () => {},
      };

      expect(noVoiceAdapter.provider).toBe("none");
      const caps = noVoiceAdapter.getCapabilities(5);
      expect(caps.canSpeak).toBe(false);
    });
  });
});
