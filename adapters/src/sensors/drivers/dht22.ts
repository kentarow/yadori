/**
 * DHT22 Driver — Temperature and Humidity sensor.
 *
 * Common RPi sensor connected via GPIO.
 * Reads via Python helper using adafruit-circuitpython-dht.
 *
 * Produces TWO modalities: temperature and humidity.
 * This driver is registered twice with different modality settings.
 */

import type { SensorDriver, SensorDriverConfig, SensorDetectionResult } from "../../../../engine/src/perception/sensor-driver.js";
import type { RawInput, ScalarSensorData } from "../../../../engine/src/perception/perception-types.js";
import { pythonModuleExists, runPythonHelper } from "../exec-helper.js";

interface DHT22Reading {
  temperature: number;
  humidity: number;
}

const DEFAULT_TEMP_CONFIG: SensorDriverConfig = {
  id: "dht22-temperature",
  name: "dht22",
  modality: "temperature",
  pollIntervalMs: 15000, // Every 15 seconds
  enabled: true,
};

const DEFAULT_HUMIDITY_CONFIG: SensorDriverConfig = {
  id: "dht22-humidity",
  name: "dht22",
  modality: "humidity",
  pollIntervalMs: 15000,
  enabled: true,
};

/** Shared state for the DHT22 — avoids reading twice */
let lastReading: DHT22Reading | null = null;
let lastReadTime = 0;
let prevTemp = 0;
let prevHumidity = 0;
let prevTempTime = 0;

async function readDHT22(gpioPin: number): Promise<DHT22Reading | null> {
  const now = Date.now();
  // Cache for 2 seconds (DHT22 minimum interval)
  if (lastReading && now - lastReadTime < 2000) {
    return lastReading;
  }

  try {
    const reading = await runPythonHelper<DHT22Reading>("read_dht22.py", [String(gpioPin)]);
    lastReading = reading;
    lastReadTime = now;
    return reading;
  } catch {
    return null;
  }
}

function computeTrend(current: number, previous: number, elapsedHours: number): { trend: "rising" | "falling" | "stable"; changeRate: number } {
  if (elapsedHours <= 0) return { trend: "stable", changeRate: 0 };
  const changeRate = (current - previous) / elapsedHours;
  const trend = Math.abs(changeRate) < 0.5 ? "stable" : changeRate > 0 ? "rising" : "falling";
  return { trend, changeRate };
}

export function createDHT22Driver(
  modality: "temperature" | "humidity" = "temperature",
  gpioPin = 4,
  config?: Partial<SensorDriverConfig>,
): SensorDriver {
  const defaults = modality === "temperature" ? DEFAULT_TEMP_CONFIG : DEFAULT_HUMIDITY_CONFIG;
  const cfg = { ...defaults, ...config };

  return {
    config: cfg,

    async detect(): Promise<SensorDetectionResult> {
      const hasModule = await pythonModuleExists("adafruit_dht");
      if (!hasModule) {
        return { available: false, reason: "Python module adafruit_dht not found (pip install adafruit-circuitpython-dht)" };
      }

      // Try a test read
      const reading = await readDHT22(gpioPin);
      if (!reading) {
        return { available: false, reason: `DHT22 not responding on GPIO ${gpioPin}` };
      }

      return { available: true, details: `DHT22 on GPIO ${gpioPin}` };
    },

    async start(): Promise<void> {
      const reading = await readDHT22(gpioPin);
      if (reading) {
        prevTemp = reading.temperature;
        prevHumidity = reading.humidity;
        prevTempTime = Date.now();
      }
    },

    async read(): Promise<RawInput | null> {
      const reading = await readDHT22(gpioPin);
      if (!reading) return null;

      const now = Date.now();
      const elapsedHours = (now - prevTempTime) / 3600000;

      if (modality === "temperature") {
        const { trend, changeRate } = computeTrend(reading.temperature, prevTemp, elapsedHours);
        prevTemp = reading.temperature;
        prevTempTime = now;

        const data: ScalarSensorData = {
          type: "scalar",
          value: reading.temperature,
          unit: "°C",
          trend,
          changeRate,
        };

        return {
          modality: "temperature",
          timestamp: new Date().toISOString(),
          source: "dht22",
          data,
        };
      } else {
        const { trend, changeRate } = computeTrend(reading.humidity, prevHumidity, elapsedHours);
        prevHumidity = reading.humidity;

        const data: ScalarSensorData = {
          type: "scalar",
          value: reading.humidity,
          unit: "%",
          trend,
          changeRate,
        };

        return {
          modality: "humidity",
          timestamp: new Date().toISOString(),
          source: "dht22",
          data,
        };
      }
    },

    async stop(): Promise<void> {
      lastReading = null;
      lastReadTime = 0;
    },
  };
}
