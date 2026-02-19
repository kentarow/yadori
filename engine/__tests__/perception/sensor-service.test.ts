import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createSensorService,
  addDriver,
  startService,
  stopService,
  collectPerceptions,
  pushDirectInput,
  getModalityCount,
  getRegisteredModalities,
} from "../../src/perception/sensor-service.js";
import type { SensorDriver, SensorDriverConfig } from "../../src/perception/sensor-driver.js";
import type { RawInput, TextInputData, ScalarSensorData } from "../../src/perception/perception-types.js";
import { PerceptionLevel } from "../../src/types.js";

function makeMockDriver(overrides: {
  id?: string;
  modality?: string;
  available?: boolean;
  reading?: RawInput | null;
} = {}): SensorDriver {
  const {
    id = "mock-sensor",
    modality = "temperature",
    available = true,
    reading = null,
  } = overrides;

  return {
    config: {
      id,
      name: `mock-${modality}`,
      modality: modality as any,
      pollIntervalMs: 100,
      enabled: true,
    },
    detect: vi.fn().mockResolvedValue({ available, details: "mock" }),
    start: vi.fn().mockResolvedValue(undefined),
    read: vi.fn().mockResolvedValue(reading),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

function makeTempReading(value: number): RawInput {
  return {
    modality: "temperature",
    timestamp: new Date().toISOString(),
    source: "mock-temp",
    data: {
      type: "scalar",
      value,
      unit: "°C",
      trend: "stable" as const,
      changeRate: 0,
    } as ScalarSensorData,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSensorService", () => {
  it("creates a service with empty state", () => {
    const state = createSensorService();
    expect(state.drivers.size).toBe(0);
    expect(state.timers.size).toBe(0);
    expect(state.running).toBe(false);
    // System metrics registered by default
    expect(state.registry.sensors).toHaveLength(1);
  });
});

describe("addDriver", () => {
  it("registers a driver", () => {
    const state = createSensorService();
    const driver = makeMockDriver({ id: "temp-1" });
    addDriver(state, driver);
    expect(state.drivers.size).toBe(1);
    expect(state.drivers.has("temp-1")).toBe(true);
  });

  it("can register multiple drivers", () => {
    const state = createSensorService();
    addDriver(state, makeMockDriver({ id: "d1", modality: "temperature" }));
    addDriver(state, makeMockDriver({ id: "d2", modality: "light" }));
    addDriver(state, makeMockDriver({ id: "d3", modality: "touch" }));
    expect(state.drivers.size).toBe(3);
  });
});

describe("startService", () => {
  it("detects and starts available drivers", async () => {
    const state = createSensorService();
    const driver = makeMockDriver({ id: "temp-1", available: true });
    addDriver(state, driver);

    const started = await startService(state);
    expect(started).toContain("temp-1");
    expect(driver.detect).toHaveBeenCalled();
    expect(driver.start).toHaveBeenCalled();
    expect(state.running).toBe(true);

    await stopService(state);
  });

  it("skips unavailable drivers", async () => {
    const state = createSensorService();
    const driver = makeMockDriver({ id: "missing", available: false });
    addDriver(state, driver);

    const started = await startService(state);
    expect(started).not.toContain("missing");
    expect(driver.start).not.toHaveBeenCalled();

    await stopService(state);
  });

  it("skips disabled drivers", async () => {
    const state = createSensorService();
    const driver = makeMockDriver({ id: "disabled" });
    (driver.config as any).enabled = false;
    addDriver(state, driver);

    const started = await startService(state);
    expect(started).toHaveLength(0);
    expect(driver.detect).not.toHaveBeenCalled();

    await stopService(state);
  });

  it("registers started drivers in the sensor registry", async () => {
    const state = createSensorService();
    addDriver(state, makeMockDriver({ id: "temp-1", modality: "temperature", available: true }));
    addDriver(state, makeMockDriver({ id: "light-1", modality: "light", available: true }));

    await startService(state);

    const modalities = getRegisteredModalities(state);
    expect(modalities).toContain("temperature");
    expect(modalities).toContain("light");
    expect(modalities).toContain("system"); // always registered

    await stopService(state);
  });
});

describe("stopService", () => {
  it("stops all drivers and clears timers", async () => {
    const state = createSensorService();
    const driver = makeMockDriver({ id: "temp-1", available: true });
    addDriver(state, driver);

    await startService(state);
    expect(state.timers.size).toBe(1);

    await stopService(state);
    expect(state.timers.size).toBe(0);
    expect(state.running).toBe(false);
    expect(driver.stop).toHaveBeenCalled();
  });
});

describe("pushDirectInput", () => {
  it("adds a text input directly to the registry", () => {
    const state = createSensorService();
    const input: RawInput = {
      modality: "text",
      timestamp: new Date().toISOString(),
      source: "telegram",
      data: { type: "text", content: "Hello", charCount: 5 } as TextInputData,
    };

    pushDirectInput(state, input);
    expect(state.registry.pendingInputs).toHaveLength(1);
    expect(state.registry.pendingInputs[0].modality).toBe("text");
  });
});

describe("collectPerceptions", () => {
  it("drains inputs, filters through perception, and builds context", () => {
    const state = createSensorService();

    // Push a temperature reading
    const tempInput: RawInput = {
      modality: "temperature",
      timestamp: new Date().toISOString(),
      source: "dht22",
      data: {
        type: "scalar",
        value: 25.5,
        unit: "°C",
        trend: "rising" as const,
        changeRate: 0.5,
      } as ScalarSensorData,
    };
    pushDirectInput(state, tempInput);

    // Collect as thermal species (can perceive temperature)
    const result = collectPerceptions(state, "thermal", PerceptionLevel.Minimal);
    expect(result.inputCount).toBe(1);
    expect(result.perceptions).toHaveLength(1);
    expect(result.perceptions[0].sourceModality).toBe("temperature");
    expect(result.context).toContain("25.5");
  });

  it("returns empty context when no inputs", () => {
    const state = createSensorService();
    const result = collectPerceptions(state, "chromatic", PerceptionLevel.Minimal);
    expect(result.inputCount).toBe(0);
    expect(result.perceptions).toHaveLength(0);
    expect(result.context).toContain("Darkness");
  });

  it("filters out imperceptible modalities", () => {
    const state = createSensorService();

    // Push temperature reading
    pushDirectInput(state, {
      modality: "temperature",
      timestamp: new Date().toISOString(),
      source: "dht22",
      data: {
        type: "scalar",
        value: 25,
        unit: "°C",
        trend: "stable" as const,
        changeRate: 0,
      } as ScalarSensorData,
    });

    // Vibration type cannot perceive temperature
    const result = collectPerceptions(state, "vibration", PerceptionLevel.Full);
    expect(result.inputCount).toBe(1);
    expect(result.perceptions).toHaveLength(0); // Filtered out
  });

  it("drains the queue (inputs are consumed)", () => {
    const state = createSensorService();
    pushDirectInput(state, {
      modality: "text",
      timestamp: new Date().toISOString(),
      source: "telegram",
      data: { type: "text", content: "Hello", charCount: 5 } as TextInputData,
    });

    const first = collectPerceptions(state, "chromatic", PerceptionLevel.Minimal);
    expect(first.inputCount).toBe(1);

    const second = collectPerceptions(state, "chromatic", PerceptionLevel.Minimal);
    expect(second.inputCount).toBe(0);
  });
});

describe("getModalityCount", () => {
  it("counts modalities that have sent data", () => {
    const state = createSensorService();
    expect(getModalityCount(state)).toBe(0);

    pushDirectInput(state, {
      modality: "text",
      timestamp: new Date().toISOString(),
      source: "telegram",
      data: { type: "text", content: "Hello", charCount: 5 } as TextInputData,
    });

    // text isn't a registered sensor, so count doesn't increase from pushInput alone
    // but the system-metrics sensor should count once it provides data
    expect(getModalityCount(state)).toBe(0);
  });
});
