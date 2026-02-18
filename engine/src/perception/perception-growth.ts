/**
 * Perception Growth — Independent from Language Level.
 *
 * Perception level grows based on:
 * 1. Time (growthDay) — the entity needs time to develop perception
 * 2. Sensory exposure — receiving actual sensor data accelerates growth
 *
 * The user never sees a notification about perception level changes.
 * The entity simply begins perceiving more detail. Silently.
 */

import { PerceptionLevel } from "../types.js";

export interface PerceptionGrowthState {
  level: PerceptionLevel;
  /** Total number of raw inputs received across all modalities */
  totalSensoryInputs: number;
  /** Number of distinct modalities ever received */
  modalitiesEncountered: number;
}

/**
 * Base thresholds: day-based (even without sensors, time grants growth).
 * Sensory exposure can accelerate this.
 */
const DAY_THRESHOLDS: { level: PerceptionLevel; minDay: number }[] = [
  { level: PerceptionLevel.Full, minDay: 120 },
  { level: PerceptionLevel.Relational, minDay: 60 },
  { level: PerceptionLevel.Structured, minDay: 21 },
  { level: PerceptionLevel.Basic, minDay: 7 },
  { level: PerceptionLevel.Minimal, minDay: 0 },
];

/**
 * Sensory exposure bonus: each threshold reduces the required day count.
 * More sensor data = faster perception growth.
 */
const EXPOSURE_BONUSES: { inputs: number; dayReduction: number }[] = [
  { inputs: 5000, dayReduction: 20 },
  { inputs: 1000, dayReduction: 10 },
  { inputs: 200, dayReduction: 5 },
  { inputs: 50, dayReduction: 2 },
];

/**
 * Having more modalities also accelerates growth.
 * An entity with camera + temperature + vibration perceives more of the world.
 */
const MODALITY_BONUSES: { count: number; dayReduction: number }[] = [
  { count: 5, dayReduction: 10 },
  { count: 3, dayReduction: 5 },
  { count: 2, dayReduction: 2 },
];

export function createInitialPerceptionGrowthState(): PerceptionGrowthState {
  return {
    level: PerceptionLevel.Minimal,
    totalSensoryInputs: 0,
    modalitiesEncountered: 0,
  };
}

/**
 * Evaluate perception level based on growth day and sensory exposure.
 * Called during heartbeat.
 */
export function evaluatePerceptionLevel(
  state: PerceptionGrowthState,
  growthDay: number,
): PerceptionLevel {
  // Calculate effective day = actual day + bonuses from exposure
  let bonus = 0;

  for (const { inputs, dayReduction } of EXPOSURE_BONUSES) {
    if (state.totalSensoryInputs >= inputs) {
      bonus = dayReduction;
      break;
    }
  }

  for (const { count, dayReduction } of MODALITY_BONUSES) {
    if (state.modalitiesEncountered >= count) {
      bonus += dayReduction;
      break;
    }
  }

  const effectiveDay = growthDay + bonus;

  for (const { level, minDay } of DAY_THRESHOLDS) {
    if (effectiveDay >= minDay) return level;
  }

  return PerceptionLevel.Minimal;
}

/**
 * Record that sensory inputs were received.
 * Called when the heartbeat or interaction processes raw sensor data.
 */
export function recordSensoryInput(
  state: PerceptionGrowthState,
  inputCount: number,
  newModalities: number,
): PerceptionGrowthState {
  return {
    ...state,
    totalSensoryInputs: state.totalSensoryInputs + inputCount,
    modalitiesEncountered: state.modalitiesEncountered + newModalities,
  };
}
