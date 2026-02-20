/**
 * Voice Factory Tests
 *
 * Tests the factory that creates the right voice adapter based on hardware.
 * Verifies:
 *   - Factory returns correct adapter type for different hardware configs
 *   - NoneVoiceAdapter behavior (canSpeak=false, generate throws)
 *   - Factory handles insufficient RAM correctly
 *   - Correct engine selection based on RAM thresholds
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createVoiceAdapter,
  NoneVoiceAdapter,
} from "../../src/voice/voice-factory.js";
import type { HardwareBody } from "../../src/types.js";

// --- Test helpers ---

function makeHardware(
  ramGB: number,
  platform = "darwin",
  arch = "arm64",
): HardwareBody {
  return {
    platform,
    arch,
    totalMemoryGB: ramGB,
    cpuModel: "Test CPU",
    storageGB: 256,
  };
}

// =====================================================================
// 1. NoneVoiceAdapter
// =====================================================================

describe("NoneVoiceAdapter", () => {
  let adapter: NoneVoiceAdapter;

  beforeEach(() => {
    adapter = new NoneVoiceAdapter();
  });

  it("has provider type 'none'", () => {
    expect(adapter.provider).toBe("none");
  });

  it("canSpeak is always false regardless of growth day", () => {
    for (const day of [0, 15, 30, 60, 120, 365]) {
      const caps = adapter.getCapabilities(day);
      expect(caps.canSpeak).toBe(false);
    }
  });

  it("getCapabilities returns all zeros", () => {
    const caps = adapter.getCapabilities(100);
    expect(caps.canSpeak).toBe(false);
    expect(caps.maxDuration).toBe(0);
    expect(caps.emotionalRange).toBe(0);
    expect(caps.clarity).toBe(0);
    expect(caps.uniqueness).toBe(0);
  });

  it("generate throws 'Voice not available'", async () => {
    await expect(
      adapter.generate({
        text: "Hello",
        emotion: { mood: 50, energy: 50, comfort: 50 },
        species: "chromatic",
        growthDay: 60,
        languageLevel: 2,
      }),
    ).rejects.toThrow("Voice not available");
  });

  it("checkHealth returns available=false", async () => {
    const health = await adapter.checkHealth();
    expect(health.available).toBe(false);
    expect(health.error).toBeDefined();
    expect(typeof health.error).toBe("string");
  });

  it("initialize resolves without error", async () => {
    await expect(adapter.initialize()).resolves.toBeUndefined();
  });

  it("shutdown resolves without error", async () => {
    await expect(adapter.shutdown()).resolves.toBeUndefined();
  });

  it("implements the VoiceAdapter interface completely", () => {
    // Verify all interface methods exist
    expect(typeof adapter.initialize).toBe("function");
    expect(typeof adapter.checkHealth).toBe("function");
    expect(typeof adapter.getCapabilities).toBe("function");
    expect(typeof adapter.generate).toBe("function");
    expect(typeof adapter.shutdown).toBe("function");
    expect(adapter.provider).toBeDefined();
  });
});

// =====================================================================
// 2. createVoiceAdapter — insufficient RAM returns NoneVoiceAdapter
// =====================================================================

describe("createVoiceAdapter — insufficient RAM", () => {
  it("returns NoneVoiceAdapter for < 2GB RAM", async () => {
    const adapter = await createVoiceAdapter(makeHardware(1));
    expect(adapter).toBeInstanceOf(NoneVoiceAdapter);
    expect(adapter.provider).toBe("none");
  });

  it("returns NoneVoiceAdapter for 0.5GB RAM", async () => {
    const adapter = await createVoiceAdapter(makeHardware(0.5));
    expect(adapter).toBeInstanceOf(NoneVoiceAdapter);
  });

  it("returns NoneVoiceAdapter for exactly 1GB RAM", async () => {
    const adapter = await createVoiceAdapter(makeHardware(1));
    expect(adapter).toBeInstanceOf(NoneVoiceAdapter);
  });

  it("returns NoneVoiceAdapter for 1.9 GB", async () => {
    const adapter = await createVoiceAdapter(makeHardware(1.9));
    expect(adapter).toBeInstanceOf(NoneVoiceAdapter);
  });

  it("handles various platform/arch combinations with low RAM", async () => {
    const configs = [
      makeHardware(1, "darwin", "arm64"),
      makeHardware(1, "linux", "x64"),
      makeHardware(1, "linux", "arm"),
      makeHardware(0.5, "linux", "arm"),
    ];
    for (const hw of configs) {
      const adapter = await createVoiceAdapter(hw);
      expect(adapter).toBeInstanceOf(NoneVoiceAdapter);
    }
  });
});

// =====================================================================
// 3. createVoiceAdapter — correct adapter selection by RAM threshold
// =====================================================================

describe("createVoiceAdapter — adapter selection", () => {
  it("returns a local adapter for espeak range (2-3GB)", async () => {
    const adapter = await createVoiceAdapter(makeHardware(2));
    expect(adapter.provider).toBe("local");
    // Not NoneVoiceAdapter — espeak adapter exists
    expect(adapter).not.toBeInstanceOf(NoneVoiceAdapter);
  });

  it("returns a local adapter for 3GB RAM", async () => {
    const adapter = await createVoiceAdapter(makeHardware(3));
    expect(adapter.provider).toBe("local");
  });

  it("returns a local adapter for piper range (4-7GB)", async () => {
    const adapter = await createVoiceAdapter(makeHardware(4));
    expect(adapter.provider).toBe("local");
    expect(adapter).not.toBeInstanceOf(NoneVoiceAdapter);
  });

  it("returns a local adapter for 6GB RAM", async () => {
    const adapter = await createVoiceAdapter(makeHardware(6));
    expect(adapter.provider).toBe("local");
  });

  it("returns a local adapter for styletts2 range (8GB+) which falls back to piper", async () => {
    // styletts2 is not implemented yet; factory falls back to piper
    const adapter = await createVoiceAdapter(makeHardware(16));
    expect(adapter.provider).toBe("local");
    expect(adapter).not.toBeInstanceOf(NoneVoiceAdapter);
  });

  it("accepts piperModelPath option", async () => {
    const adapter = await createVoiceAdapter(
      makeHardware(4),
      { piperModelPath: "/models/en_US-lessac-medium.onnx" },
    );
    expect(adapter.provider).toBe("local");
  });
});

// =====================================================================
// 4. createVoiceAdapter — RAM threshold boundaries
// =====================================================================

describe("createVoiceAdapter — RAM threshold boundaries", () => {
  it("1.9 GB -> NoneVoiceAdapter (below minimum)", async () => {
    const adapter = await createVoiceAdapter(makeHardware(1.9));
    expect(adapter).toBeInstanceOf(NoneVoiceAdapter);
    expect(adapter.provider).toBe("none");
  });

  it("2.0 GB -> local adapter (espeak)", async () => {
    const adapter = await createVoiceAdapter(makeHardware(2.0));
    expect(adapter.provider).toBe("local");
    expect(adapter).not.toBeInstanceOf(NoneVoiceAdapter);
  });

  it("3.9 GB -> local adapter (still espeak range)", async () => {
    const adapter = await createVoiceAdapter(makeHardware(3.9));
    expect(adapter.provider).toBe("local");
  });

  it("4.0 GB -> local adapter (piper range)", async () => {
    const adapter = await createVoiceAdapter(makeHardware(4.0));
    expect(adapter.provider).toBe("local");
  });

  it("7.9 GB -> local adapter (still piper range)", async () => {
    const adapter = await createVoiceAdapter(makeHardware(7.9));
    expect(adapter.provider).toBe("local");
  });

  it("8.0 GB -> local adapter (styletts2 falls back to piper)", async () => {
    const adapter = await createVoiceAdapter(makeHardware(8.0));
    expect(adapter.provider).toBe("local");
  });

  it("64 GB -> local adapter (high RAM still works)", async () => {
    const adapter = await createVoiceAdapter(makeHardware(64));
    expect(adapter.provider).toBe("local");
  });
});

// =====================================================================
// 5. createVoiceAdapter — all returned adapters implement VoiceAdapter
// =====================================================================

describe("createVoiceAdapter — interface compliance", () => {
  it("NoneVoiceAdapter from insufficient RAM has all interface methods", async () => {
    const adapter = await createVoiceAdapter(makeHardware(1));
    expect(typeof adapter.initialize).toBe("function");
    expect(typeof adapter.checkHealth).toBe("function");
    expect(typeof adapter.getCapabilities).toBe("function");
    expect(typeof adapter.generate).toBe("function");
    expect(typeof adapter.shutdown).toBe("function");
    expect(adapter.provider).toBeDefined();
  });

  it("local adapter from sufficient RAM has all interface methods", async () => {
    const adapter = await createVoiceAdapter(makeHardware(4));
    expect(typeof adapter.initialize).toBe("function");
    expect(typeof adapter.checkHealth).toBe("function");
    expect(typeof adapter.getCapabilities).toBe("function");
    expect(typeof adapter.generate).toBe("function");
    expect(typeof adapter.shutdown).toBe("function");
    expect(adapter.provider).toBe("local");
  });

  it("health check works on NoneVoiceAdapter without error", async () => {
    const adapter = await createVoiceAdapter(makeHardware(1));
    const health = await adapter.checkHealth();
    expect(health.available).toBe(false);
    expect(health.error).toBeDefined();
  });

  it("health check works on local adapter without throwing", async () => {
    const adapter = await createVoiceAdapter(makeHardware(4));
    // May return available=false if piper is not installed, but should not throw
    const health = await adapter.checkHealth();
    expect(typeof health.available).toBe("boolean");
  });

  it("getCapabilities works on any adapter returned by factory", async () => {
    const noneAdapter = await createVoiceAdapter(makeHardware(1));
    const localAdapter = await createVoiceAdapter(makeHardware(4));

    const noneCaps = noneAdapter.getCapabilities(60);
    expect(noneCaps.canSpeak).toBe(false);

    const localCaps = localAdapter.getCapabilities(60);
    // Local adapter may or may not canSpeak depending on growth day
    expect(typeof localCaps.canSpeak).toBe("boolean");
    expect(typeof localCaps.maxDuration).toBe("number");
    expect(typeof localCaps.emotionalRange).toBe("number");
    expect(typeof localCaps.clarity).toBe("number");
    expect(typeof localCaps.uniqueness).toBe("number");
  });
});
