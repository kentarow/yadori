import { describe, it, expect } from "vitest";
import {
  createInputRegistry,
  registerSensor,
  unregisterSensor,
  pushInput,
  drainInputs,
  getAvailableModalities,
  getActiveModalityCount,
} from "../../src/perception/input-registry.js";
import type { RawInput, TextInputData } from "../../src/perception/perception-types.js";

const NOW = "2026-02-18T12:00:00Z";

describe("createInputRegistry", () => {
  it("starts with system-metrics sensor", () => {
    const reg = createInputRegistry();
    expect(reg.sensors).toHaveLength(1);
    expect(reg.sensors[0].modality).toBe("system");
    expect(reg.sensors[0].available).toBe(true);
  });

  it("starts with empty pending inputs", () => {
    const reg = createInputRegistry();
    expect(reg.pendingInputs).toHaveLength(0);
  });
});

describe("registerSensor", () => {
  it("adds a new sensor", () => {
    let reg = createInputRegistry();
    reg = registerSensor(reg, {
      id: "dht22",
      modality: "temperature",
      source: "dht22",
      available: true,
    });
    expect(reg.sensors).toHaveLength(2);
    expect(reg.sensors[1].modality).toBe("temperature");
  });

  it("updates existing sensor by id", () => {
    let reg = createInputRegistry();
    reg = registerSensor(reg, {
      id: "cam",
      modality: "image",
      source: "usb-cam",
      available: true,
    });
    reg = registerSensor(reg, {
      id: "cam",
      modality: "image",
      source: "usb-cam-v2",
      available: true,
    });
    expect(reg.sensors).toHaveLength(2); // system + cam (not duplicated)
    expect(reg.sensors[1].source).toBe("usb-cam-v2");
  });
});

describe("unregisterSensor", () => {
  it("removes a sensor by id", () => {
    let reg = createInputRegistry();
    reg = registerSensor(reg, {
      id: "dht22",
      modality: "temperature",
      source: "dht22",
      available: true,
    });
    reg = unregisterSensor(reg, "dht22");
    expect(reg.sensors).toHaveLength(1);
    expect(reg.sensors[0].id).toBe("system-metrics");
  });
});

describe("pushInput and drainInputs", () => {
  it("accumulates inputs", () => {
    let reg = createInputRegistry();
    const input: RawInput = {
      modality: "text",
      timestamp: NOW,
      source: "telegram",
      data: { type: "text", content: "hello", charCount: 5 } as TextInputData,
    };
    reg = pushInput(reg, input);
    reg = pushInput(reg, input);
    expect(reg.pendingInputs).toHaveLength(2);
  });

  it("drain returns inputs and clears queue", () => {
    let reg = createInputRegistry();
    const input: RawInput = {
      modality: "text",
      timestamp: NOW,
      source: "telegram",
      data: { type: "text", content: "hello", charCount: 5 } as TextInputData,
    };
    reg = pushInput(reg, input);
    const { inputs, updated } = drainInputs(reg);
    expect(inputs).toHaveLength(1);
    expect(updated.pendingInputs).toHaveLength(0);
  });
});

describe("getAvailableModalities", () => {
  it("returns modalities of available sensors", () => {
    let reg = createInputRegistry();
    reg = registerSensor(reg, { id: "dht22", modality: "temperature", source: "dht22", available: true });
    reg = registerSensor(reg, { id: "cam", modality: "image", source: "cam", available: false });

    const available = getAvailableModalities(reg);
    expect(available).toContain("system");
    expect(available).toContain("temperature");
    expect(available).not.toContain("image"); // not available
  });
});

describe("getActiveModalityCount", () => {
  it("counts sensors that have provided data", () => {
    let reg = createInputRegistry();
    reg = registerSensor(reg, { id: "dht22", modality: "temperature", source: "dht22", available: true });

    // No data yet
    expect(getActiveModalityCount(reg)).toBe(0);

    // Push input (updates lastReading)
    const input: RawInput = {
      modality: "temperature",
      timestamp: NOW,
      source: "dht22",
      data: { type: "scalar", value: 25, unit: "°C", trend: "stable", changeRate: 0 },
    };
    reg = pushInput(reg, input);
    expect(getActiveModalityCount(reg)).toBe(1);
  });
});
