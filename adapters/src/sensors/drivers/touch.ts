/**
 * Touch Driver — Capacitive Touch Sensor.
 *
 * Supports:
 * - TTP223: Single-point binary touch (GPIO)
 * - MPR121: 12-channel capacitive touch (I2C)
 *
 * Reads via Python helper.
 * Gesture detection (tap, double-tap, long-press) is done in this driver.
 */

import type { SensorDriver, SensorDriverConfig, SensorDetectionResult } from "../../../../engine/src/perception/sensor-driver.js";
import type { RawInput, TouchSensorData } from "../../../../engine/src/perception/perception-types.js";
import { pythonModuleExists, runPythonHelper, deviceExists } from "../exec-helper.js";

interface TouchReading {
  /** Active touch channels (for MPR121: array of channel indices; for TTP223: [0] or []) */
  channels: number[];
  /** Raw touch values per channel (null for binary sensors) */
  values: number[] | null;
}

const DEFAULT_CONFIG: SensorDriverConfig = {
  id: "touch",
  name: "touch-sensor",
  modality: "touch",
  pollIntervalMs: 100, // Fast polling for gesture detection
  enabled: true,
};

/** Gesture detection state */
let touchStart: number | null = null;
let lastTapTime = 0;
let tapCount = 0;
let wasActive = false;

const TAP_MAX_DURATION_MS = 300;
const DOUBLE_TAP_WINDOW_MS = 500;
const LONG_PRESS_THRESHOLD_MS = 800;

function detectGesture(active: boolean, now: number): TouchSensorData["gesture"] {
  if (active && !wasActive) {
    // Touch began
    touchStart = now;
  }

  if (!active && wasActive && touchStart != null) {
    // Touch ended
    const duration = now - touchStart;
    touchStart = null;

    if (duration < TAP_MAX_DURATION_MS) {
      if (now - lastTapTime < DOUBLE_TAP_WINDOW_MS) {
        tapCount++;
        lastTapTime = now;
        wasActive = active;
        return "double-tap";
      }
      tapCount = 1;
      lastTapTime = now;
      wasActive = active;
      return "tap";
    }
  }

  wasActive = active;

  if (active && touchStart != null) {
    const duration = now - touchStart;
    if (duration > LONG_PRESS_THRESHOLD_MS) {
      return duration > 2000 ? "hold" : "long-press";
    }
  }

  return active ? "tap" : "none";
}

export type TouchSensorType = "ttp223" | "mpr121";

export function createTouchDriver(
  sensorType: TouchSensorType = "ttp223",
  options: { gpioPin?: number; i2cBus?: number; i2cAddress?: number } = {},
  config?: Partial<SensorDriverConfig>,
): SensorDriver {
  const { gpioPin = 17, i2cBus = 1, i2cAddress = 0x5a } = options;
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return {
    config: cfg,

    async detect(): Promise<SensorDetectionResult> {
      if (sensorType === "ttp223") {
        const hasGPIO = await pythonModuleExists("RPi.GPIO") || await pythonModuleExists("gpiozero");
        if (!hasGPIO) {
          return { available: false, reason: "No GPIO library found" };
        }
        return { available: true, details: `TTP223 on GPIO${gpioPin}` };
      }

      // MPR121
      if (!await deviceExists(`/dev/i2c-${i2cBus}`)) {
        return { available: false, reason: `I2C bus /dev/i2c-${i2cBus} not found` };
      }

      const hasLib = await pythonModuleExists("adafruit_mpr121");
      if (!hasLib) {
        return { available: false, reason: "adafruit_mpr121 not found (pip install adafruit-circuitpython-mpr121)" };
      }

      try {
        const reading = await runPythonHelper<TouchReading>(
          "read_touch.py",
          [sensorType, String(i2cBus), String(i2cAddress), String(gpioPin)],
        );
        if (reading) {
          return { available: true, details: `MPR121 on I2C-${i2cBus} addr 0x${i2cAddress.toString(16)}` };
        }
        return { available: false, reason: "MPR121 not responding" };
      } catch {
        return { available: false, reason: "Touch sensor detection failed" };
      }
    },

    async start(): Promise<void> {
      touchStart = null;
      lastTapTime = 0;
      tapCount = 0;
      wasActive = false;
    },

    async read(): Promise<RawInput | null> {
      try {
        const reading = await runPythonHelper<TouchReading>(
          "read_touch.py",
          [sensorType, String(i2cBus), String(i2cAddress), String(gpioPin)],
        );
        if (!reading) return null;

        const active = reading.channels.length > 0;
        const points = reading.channels.length;
        const now = Date.now();
        const gesture = detectGesture(active, now);

        // Compute average pressure from raw values (MPR121 has analog values)
        let pressure: number | null = null;
        if (reading.values && reading.values.length > 0) {
          const avg = reading.values.reduce((a, b) => a + b, 0) / reading.values.length;
          // MPR121 baseline is ~200, touched ~0-100. Normalize to 0-1.
          pressure = Math.min(1, Math.max(0, 1 - avg / 200));
        }

        const duration = active && touchStart != null ? (now - touchStart) / 1000 : null;

        const data: TouchSensorData = {
          type: "touch",
          active,
          points: Math.max(points, active ? 1 : 0),
          pressure,
          duration,
          gesture,
        };

        return {
          modality: "touch",
          timestamp: new Date().toISOString(),
          source: cfg.name,
          data,
        };
      } catch {
        return null;
      }
    },

    async stop(): Promise<void> {
      touchStart = null;
      wasActive = false;
    },
  };
}
