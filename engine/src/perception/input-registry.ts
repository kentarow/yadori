/**
 * Input Registry — Auto-detection of available sensors.
 *
 * Silently discovers what hardware inputs are available.
 * No configuration file needed. No announcement to the user.
 * The entity simply begins perceiving what its body can sense.
 *
 * Detection is platform-aware:
 * - All platforms: system metrics, text messages
 * - Raspberry Pi: GPIO sensors (I2C, SPI), Pi Camera
 * - Mac: USB cameras, microphones, Bluetooth sensors
 *
 * Sensor drivers register themselves here. The registry tracks
 * which modalities are available and when they last provided data.
 */

import type { InputModality, SensorRegistration, RawInput } from "./perception-types.js";

export interface InputRegistry {
  sensors: SensorRegistration[];
  /** Accumulated raw inputs since last processing */
  pendingInputs: RawInput[];
}

/**
 * Create an empty registry.
 * System metrics are always registered as available.
 */
export function createInputRegistry(): InputRegistry {
  return {
    sensors: [
      {
        id: "system-metrics",
        modality: "system",
        source: "os",
        available: true,
        lastReading: null,
      },
    ],
    pendingInputs: [],
  };
}

/**
 * Register a new sensor. Called by sensor drivers when they detect hardware.
 * Idempotent — registering the same id twice updates the existing entry.
 */
export function registerSensor(
  registry: InputRegistry,
  sensor: Omit<SensorRegistration, "lastReading">,
): InputRegistry {
  const existing = registry.sensors.findIndex(s => s.id === sensor.id);
  const entry: SensorRegistration = { ...sensor, lastReading: null };

  if (existing >= 0) {
    const updated = [...registry.sensors];
    updated[existing] = entry;
    return { ...registry, sensors: updated };
  }

  return {
    ...registry,
    sensors: [...registry.sensors, entry],
  };
}

/**
 * Unregister a sensor (e.g., hardware disconnected).
 */
export function unregisterSensor(registry: InputRegistry, sensorId: string): InputRegistry {
  return {
    ...registry,
    sensors: registry.sensors.filter(s => s.id !== sensorId),
  };
}

/**
 * Push a raw input into the pending queue.
 * Called by sensor drivers when new data is available.
 */
export function pushInput(registry: InputRegistry, input: RawInput): InputRegistry {
  // Update the sensor's lastReading timestamp
  const sensors = registry.sensors.map(s =>
    s.source === input.source ? { ...s, lastReading: input.timestamp } : s,
  );

  return {
    sensors,
    pendingInputs: [...registry.pendingInputs, input],
  };
}

/**
 * Drain all pending inputs. Returns the inputs and clears the queue.
 */
export function drainInputs(registry: InputRegistry): { inputs: RawInput[]; updated: InputRegistry } {
  return {
    inputs: registry.pendingInputs,
    updated: { ...registry, pendingInputs: [] },
  };
}

/**
 * Get the list of available modalities.
 */
export function getAvailableModalities(registry: InputRegistry): InputModality[] {
  return registry.sensors
    .filter(s => s.available)
    .map(s => s.modality);
}

/**
 * Get the count of distinct modalities that have ever provided data.
 */
export function getActiveModalityCount(registry: InputRegistry): number {
  return registry.sensors.filter(s => s.lastReading !== null).length;
}
