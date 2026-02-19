/**
 * HC-SR04 Driver — Ultrasonic Distance Sensor.
 *
 * Measures distance via ultrasonic pulse echo timing.
 * Connected to RPi GPIO (trigger + echo pins).
 * Reads via Python helper using RPi.GPIO.
 *
 * Maps to the "proximity" modality.
 * The entity perceives nearby presence, not "distance measurement."
 */

import type { SensorDriver, SensorDriverConfig, SensorDetectionResult } from "../../../../engine/src/perception/sensor-driver.js";
import type { RawInput, ProximitySensorData } from "../../../../engine/src/perception/perception-types.js";
import { pythonModuleExists, runPythonHelper } from "../exec-helper.js";

interface HCSR04Reading {
  distanceCm: number;
}

const DEFAULT_CONFIG: SensorDriverConfig = {
  id: "hcsr04-proximity",
  name: "hcsr04",
  modality: "proximity",
  pollIntervalMs: 2000, // Every 2 seconds (fast for proximity detection)
  enabled: true,
};

/** Detection threshold — closer than this counts as "detected" */
const DETECTION_THRESHOLD_CM = 100;

let presenceStart: number | null = null;

export function createHCSR04Driver(
  triggerPin = 23,
  echoPin = 24,
  config?: Partial<SensorDriverConfig>,
): SensorDriver {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return {
    config: cfg,

    async detect(): Promise<SensorDetectionResult> {
      const hasGPIO = await pythonModuleExists("RPi.GPIO");
      if (!hasGPIO) {
        // Also try gpiozero
        const hasGpiozero = await pythonModuleExists("gpiozero");
        if (!hasGpiozero) {
          return { available: false, reason: "Neither RPi.GPIO nor gpiozero found" };
        }
      }

      // Try a test reading
      try {
        const reading = await runPythonHelper<HCSR04Reading>(
          "read_hcsr04.py",
          [String(triggerPin), String(echoPin)],
          5000,
        );
        if (reading && typeof reading.distanceCm === "number") {
          return { available: true, details: `HC-SR04 trig:GPIO${triggerPin} echo:GPIO${echoPin}` };
        }
        return { available: false, reason: "HC-SR04 no echo received" };
      } catch {
        return { available: false, reason: "HC-SR04 test read failed" };
      }
    },

    async start(): Promise<void> {
      presenceStart = null;
    },

    async read(): Promise<RawInput | null> {
      try {
        const reading = await runPythonHelper<HCSR04Reading>(
          "read_hcsr04.py",
          [String(triggerPin), String(echoPin)],
          5000,
        );
        if (!reading) return null;

        const detected = reading.distanceCm < DETECTION_THRESHOLD_CM;
        const now = Date.now();

        if (detected && presenceStart === null) {
          presenceStart = now;
        } else if (!detected) {
          presenceStart = null;
        }

        const presenceDuration = detected && presenceStart != null
          ? (now - presenceStart) / 1000
          : null;

        const data: ProximitySensorData = {
          type: "proximity",
          detected,
          distanceCm: reading.distanceCm,
          presenceDuration,
        };

        return {
          modality: "proximity",
          timestamp: new Date().toISOString(),
          source: "hcsr04",
          data,
        };
      } catch {
        return null;
      }
    },

    async stop(): Promise<void> {
      presenceStart = null;
    },
  };
}
