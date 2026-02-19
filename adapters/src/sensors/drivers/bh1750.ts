/**
 * BH1750 Driver — Digital Light (Lux) Sensor.
 *
 * I2C light intensity sensor, very common with RPi.
 * Reads via Python helper using smbus2.
 */

import type { SensorDriver, SensorDriverConfig, SensorDetectionResult } from "../../../../engine/src/perception/sensor-driver.js";
import type { RawInput, ScalarSensorData } from "../../../../engine/src/perception/perception-types.js";
import { pythonModuleExists, runPythonHelper, deviceExists } from "../exec-helper.js";

interface BH1750Reading {
  lux: number;
}

const DEFAULT_CONFIG: SensorDriverConfig = {
  id: "bh1750-light",
  name: "bh1750",
  modality: "light",
  pollIntervalMs: 10000, // Every 10 seconds
  enabled: true,
};

let prevLux = 0;
let prevTime = 0;

export function createBH1750Driver(
  i2cBus = 1,
  i2cAddress = 0x23,
  config?: Partial<SensorDriverConfig>,
): SensorDriver {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return {
    config: cfg,

    async detect(): Promise<SensorDetectionResult> {
      if (!await deviceExists(`/dev/i2c-${i2cBus}`)) {
        return { available: false, reason: `I2C bus /dev/i2c-${i2cBus} not found` };
      }

      if (!await pythonModuleExists("smbus2")) {
        return { available: false, reason: "Python module smbus2 not found (pip install smbus2)" };
      }

      try {
        const reading = await runPythonHelper<BH1750Reading>(
          "read_bh1750.py",
          [String(i2cBus), String(i2cAddress)],
        );
        if (reading && typeof reading.lux === "number") {
          return { available: true, details: `BH1750 on I2C-${i2cBus} addr 0x${i2cAddress.toString(16)}` };
        }
        return { available: false, reason: "BH1750 not responding" };
      } catch {
        return { available: false, reason: "BH1750 read failed" };
      }
    },

    async start(): Promise<void> {
      try {
        const reading = await runPythonHelper<BH1750Reading>(
          "read_bh1750.py",
          [String(i2cBus), String(i2cAddress)],
        );
        if (reading) {
          prevLux = reading.lux;
          prevTime = Date.now();
        }
      } catch { /* ok */ }
    },

    async read(): Promise<RawInput | null> {
      try {
        const reading = await runPythonHelper<BH1750Reading>(
          "read_bh1750.py",
          [String(i2cBus), String(i2cAddress)],
        );
        if (!reading) return null;

        const now = Date.now();
        const elapsedHours = (now - prevTime) / 3600000;
        const changeRate = elapsedHours > 0 ? (reading.lux - prevLux) / elapsedHours : 0;
        const trend: "rising" | "falling" | "stable" =
          Math.abs(changeRate) < 5 ? "stable" : changeRate > 0 ? "rising" : "falling";

        prevLux = reading.lux;
        prevTime = now;

        const data: ScalarSensorData = {
          type: "scalar",
          value: reading.lux,
          unit: "lux",
          trend,
          changeRate,
        };

        return {
          modality: "light",
          timestamp: new Date().toISOString(),
          source: "bh1750",
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
