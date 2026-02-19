/**
 * Sensor Service — Orchestrates all sensor drivers.
 *
 * Responsibilities:
 * 1. Accept registered drivers
 * 2. Auto-detect available hardware via each driver's detect()
 * 3. Poll active drivers at their configured intervals
 * 4. Push readings into the InputRegistry
 * 5. Provide a snapshot of current perceptions on demand
 *
 * The service runs silently. The entity never knows about hardware details.
 * It just begins perceiving more of the world when sensors are available.
 */

import type { InputModality, RawInput, FilteredPerception } from "./perception-types.js";
import type { SensorDriver } from "./sensor-driver.js";
import {
  type InputRegistry,
  createInputRegistry,
  registerSensor,
  pushInput,
  drainInputs,
  getActiveModalityCount,
} from "./input-registry.js";
import { filterInputs } from "./perception-filter.js";
import { buildPerceptionContext } from "./perception-context.js";
import { type PerceptionMode, PerceptionLevel } from "../types.js";

export interface SensorServiceState {
  registry: InputRegistry;
  drivers: Map<string, SensorDriver>;
  timers: Map<string, ReturnType<typeof setInterval>>;
  running: boolean;
}

/**
 * Create a new sensor service.
 */
export function createSensorService(): SensorServiceState {
  return {
    registry: createInputRegistry(),
    drivers: new Map(),
    timers: new Map(),
    running: false,
  };
}

/**
 * Register a driver with the service. Does not start polling yet.
 */
export function addDriver(state: SensorServiceState, driver: SensorDriver): SensorServiceState {
  state.drivers.set(driver.config.id, driver);
  return state;
}

/**
 * Detect all registered drivers and start polling those that are available.
 * Returns the list of successfully started driver IDs.
 */
export async function startService(state: SensorServiceState): Promise<string[]> {
  const started: string[] = [];

  for (const [id, driver] of state.drivers) {
    if (!driver.config.enabled) continue;

    const detection = await driver.detect();
    if (!detection.available) continue;

    try {
      await driver.start();

      state.registry = registerSensor(state.registry, {
        id,
        modality: driver.config.modality,
        source: driver.config.name,
        available: true,
      });

      // Start polling
      const timer = setInterval(async () => {
        try {
          const reading = await driver.read();
          if (reading) {
            state.registry = pushInput(state.registry, reading);
          }
        } catch {
          // Silent failure — the entity just doesn't perceive this tick
        }
      }, driver.config.pollIntervalMs);

      state.timers.set(id, timer);
      started.push(id);
    } catch {
      // Driver failed to start — skip it silently
    }
  }

  state.running = true;
  return started;
}

/**
 * Stop all polling and release all driver resources.
 */
export async function stopService(state: SensorServiceState): Promise<void> {
  for (const timer of state.timers.values()) {
    clearInterval(timer);
  }
  state.timers.clear();

  for (const driver of state.drivers.values()) {
    try {
      await driver.stop();
    } catch {
      // Best-effort cleanup
    }
  }

  state.running = false;
}

/**
 * Drain all pending inputs, filter through perception, and build LLM context.
 * Called during heartbeat or interaction processing.
 */
export function collectPerceptions(
  state: SensorServiceState,
  species: PerceptionMode,
  level: PerceptionLevel,
): { context: string; perceptions: FilteredPerception[]; inputCount: number } {
  const { inputs, updated } = drainInputs(state.registry);
  state.registry = updated;

  const perceptions = filterInputs(species, inputs, level);
  const context = buildPerceptionContext(species, perceptions);

  return {
    context,
    perceptions,
    inputCount: inputs.length,
  };
}

/**
 * Push a single input directly (e.g., text from a message).
 */
export function pushDirectInput(state: SensorServiceState, input: RawInput): void {
  state.registry = pushInput(state.registry, input);
}

/**
 * Get the number of active modalities (for perception growth calculation).
 */
export function getModalityCount(state: SensorServiceState): number {
  return getActiveModalityCount(state.registry);
}

/**
 * Get which modalities are currently registered and available.
 */
export function getRegisteredModalities(state: SensorServiceState): InputModality[] {
  return state.registry.sensors
    .filter(s => s.available)
    .map(s => s.modality);
}
