/**
 * BME280 Driver — Temperature, Humidity, and Pressure sensor.
 *
 * I2C environmental sensor. Produces THREE modalities.
 * Reads via Python helper using smbus2.
 */

import type { SensorDriver, SensorDriverConfig, SensorDetectionResult } from "../../../../engine/src/perception/sensor-driver.js";
import type { RawInput, ScalarSensorData } from "../../../../engine/src/perception/perception-types.js";
import { pythonModuleExists, runPythonHelper, deviceExists } from "../exec-helper.js";

interface BME280Reading {
  temperature: number;
  humidity: number;
  pressure: number;
}

/** Shared reading cache — avoids reading the sensor 3 times per poll cycle */
let lastReading: BME280Reading | null = null;
let lastReadTime = 0;

let prevValues = { temperature: 0, humidity: 0, pressure: 0 };
let prevTime = 0;

async function readBME280(i2cBus: number, i2cAddress: number): Promise<BME280Reading | null> {
  const now = Date.now();
  if (lastReading && now - lastReadTime < 1000) return lastReading;

  try {
    const reading = await runPythonHelper<BME280Reading>(
      "read_bme280.py",
      [String(i2cBus), String(i2cAddress)],
    );
    lastReading = reading;
    lastReadTime = now;
    return reading;
  } catch {
    return null;
  }
}

function computeTrend(
  current: number,
  previous: number,
  elapsedHours: number,
  threshold: number,
): { trend: "rising" | "falling" | "stable"; changeRate: number } {
  if (elapsedHours <= 0) return { trend: "stable", changeRate: 0 };
  const changeRate = (current - previous) / elapsedHours;
  const trend = Math.abs(changeRate) < threshold ? "stable" : changeRate > 0 ? "rising" : "falling";
  return { trend, changeRate };
}

export function createBME280Driver(
  modality: "temperature" | "humidity" | "pressure" = "temperature",
  i2cBus = 1,
  i2cAddress = 0x76,
  config?: Partial<SensorDriverConfig>,
): SensorDriver {
  const defaults: SensorDriverConfig = {
    id: `bme280-${modality}`,
    name: "bme280",
    modality,
    pollIntervalMs: 15000,
    enabled: true,
  };
  const cfg = { ...defaults, ...config };

  const units: Record<string, string> = {
    temperature: "°C",
    humidity: "%",
    pressure: "hPa",
  };

  const thresholds: Record<string, number> = {
    temperature: 0.5,
    humidity: 2,
    pressure: 0.5,
  };

  return {
    config: cfg,

    async detect(): Promise<SensorDetectionResult> {
      if (!await deviceExists(`/dev/i2c-${i2cBus}`)) {
        return { available: false, reason: `I2C bus /dev/i2c-${i2cBus} not found` };
      }

      if (!await pythonModuleExists("smbus2")) {
        return { available: false, reason: "Python module smbus2 not found" };
      }

      const reading = await readBME280(i2cBus, i2cAddress);
      if (!reading) {
        return { available: false, reason: "BME280 not responding" };
      }

      return { available: true, details: `BME280 on I2C-${i2cBus} addr 0x${i2cAddress.toString(16)}` };
    },

    async start(): Promise<void> {
      const reading = await readBME280(i2cBus, i2cAddress);
      if (reading) {
        prevValues = { ...reading };
        prevTime = Date.now();
      }
    },

    async read(): Promise<RawInput | null> {
      const reading = await readBME280(i2cBus, i2cAddress);
      if (!reading) return null;

      const now = Date.now();
      const elapsedHours = (now - prevTime) / 3600000;
      prevTime = now;

      const value = reading[modality];
      const prev = prevValues[modality];
      prevValues[modality] = value;

      const { trend, changeRate } = computeTrend(value, prev, elapsedHours, thresholds[modality]);

      const data: ScalarSensorData = {
        type: "scalar",
        value,
        unit: units[modality],
        trend,
        changeRate,
      };

      return {
        modality,
        timestamp: new Date().toISOString(),
        source: "bme280",
        data,
      };
    },

    async stop(): Promise<void> {
      lastReading = null;
      lastReadTime = 0;
    },
  };
}
