/**
 * Sensor Driver Interface — The contract between hardware and perception.
 *
 * A SensorDriver knows how to:
 * 1. Detect whether its hardware is available
 * 2. Read data from the hardware
 * 3. Convert raw hardware data into RawInput format
 *
 * Implementations live in adapters/src/sensors/.
 * The engine only knows this interface — never the hardware details.
 */

import type { InputModality, RawInput } from "./perception-types.js";

/**
 * Configuration for a sensor driver.
 */
export interface SensorDriverConfig {
  /** Unique identifier for this driver instance */
  id: string;
  /** Human-readable name */
  name: string;
  /** Which modality this driver provides */
  modality: InputModality;
  /** Poll interval in milliseconds (how often to read) */
  pollIntervalMs: number;
  /** Whether this driver is enabled */
  enabled: boolean;
}

/**
 * Result of a sensor detection check.
 */
export interface SensorDetectionResult {
  /** Is the hardware available? */
  available: boolean;
  /** Why it's not available (for logging) */
  reason?: string;
  /** Detected hardware details */
  details?: string;
}

/**
 * A sensor driver reads from one piece of hardware.
 *
 * Lifecycle:
 * 1. detect() — check if hardware exists
 * 2. start() — begin polling or open connections
 * 3. read() — get current data (called by service on poll interval)
 * 4. stop() — release resources
 */
export interface SensorDriver {
  readonly config: SensorDriverConfig;

  /** Check if the hardware is available on this system. */
  detect(): Promise<SensorDetectionResult>;

  /** Initialize the driver (open file handles, start processes, etc.) */
  start(): Promise<void>;

  /** Read current sensor data. Returns null if reading failed. */
  read(): Promise<RawInput | null>;

  /** Release all resources. */
  stop(): Promise<void>;
}
