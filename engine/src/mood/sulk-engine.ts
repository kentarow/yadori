/**
 * Sulk Engine — Detects and manages the entity's sulking state.
 *
 * When the entity is neglected (low comfort + long absence) or
 * emotionally distressed (low mood + low comfort), it enters sulk mode.
 *
 * In sulk mode:
 * - SOUL_EVIL.md overrides SOUL.md behavior
 * - Expression becomes minimal (▼ ■ □ ...)
 * - Silence increases
 * - Recovery happens gradually through patient interaction
 */

import type { Status, Temperament } from "../types.js";

export interface SulkState {
  isSulking: boolean;
  severity: SulkSeverity;
  /** How many interactions since sulk started (tracks recovery) */
  recoveryInteractions: number;
  /** When sulking began */
  sulkingSince: string | null; // ISO 8601
}

export type SulkSeverity =
  | "none"
  | "mild"      // Slightly withdrawn, shorter responses
  | "moderate"  // Clearly upset, minimal symbols
  | "severe";   // Near-silence, only ▼ and ...

/**
 * Thresholds for entering sulk mode.
 */
const SULK_ENTRY = {
  /** Comfort below this triggers potential sulking */
  comfortThreshold: 25,
  /** Mood below this combined with low comfort triggers sulking */
  moodThreshold: 35,
  /** Minutes of absence that can trigger sulking if comfort is also low */
  absenceMinutes: 720, // 12 hours
  /** Comfort threshold for absence-triggered sulking (more lenient) */
  absenceComfortThreshold: 40,
};

/**
 * Interactions needed to recover from each severity level.
 */
const RECOVERY_INTERACTIONS: Record<SulkSeverity, number> = {
  none: 0,
  mild: 3,
  moderate: 6,
  severe: 10,
};

/**
 * Create initial (non-sulking) state.
 */
export function createInitialSulkState(): SulkState {
  return {
    isSulking: false,
    severity: "none",
    recoveryInteractions: 0,
    sulkingSince: null,
  };
}

/**
 * Evaluate whether the entity should enter or exit sulk mode.
 * Called during heartbeat.
 */
export function evaluateSulk(
  current: SulkState,
  status: Status,
  minutesSinceLastInteraction: number,
  temperament: Temperament,
  now: Date,
): SulkState {
  if (current.isSulking) {
    return evaluateRecovery(current, status);
  }

  return evaluateEntry(current, status, minutesSinceLastInteraction, temperament, now);
}

/**
 * Process a user interaction during sulk mode.
 * Each interaction contributes to recovery.
 */
export function processSulkInteraction(current: SulkState, status: Status): SulkState {
  if (!current.isSulking) return current;

  const updated = {
    ...current,
    recoveryInteractions: current.recoveryInteractions + 1,
  };

  return evaluateRecovery(updated, status);
}

/**
 * Get the active soul file to use (SOUL.md or SOUL_EVIL.md).
 */
export function getActiveSoulFile(sulkState: SulkState): "SOUL.md" | "SOUL_EVIL.md" {
  return sulkState.isSulking ? "SOUL_EVIL.md" : "SOUL.md";
}

// --- Internal ---

function evaluateEntry(
  current: SulkState,
  status: Status,
  minutesSinceLastInteraction: number,
  temperament: Temperament,
  now: Date,
): SulkState {
  // Condition 1: Low comfort + low mood
  const emotionalSulk =
    status.comfort < SULK_ENTRY.comfortThreshold &&
    status.mood < SULK_ENTRY.moodThreshold;

  // Condition 2: Prolonged absence + low comfort
  const absenceSulk =
    minutesSinceLastInteraction > SULK_ENTRY.absenceMinutes &&
    status.comfort < SULK_ENTRY.absenceComfortThreshold;

  if (!emotionalSulk && !absenceSulk) {
    return current;
  }

  // Temperament affects sulk severity
  const severity = computeEntrySeverity(status, temperament);

  return {
    isSulking: true,
    severity,
    recoveryInteractions: 0,
    sulkingSince: now.toISOString(),
  };
}

function evaluateRecovery(current: SulkState, status: Status): SulkState {
  const threshold = RECOVERY_INTERACTIONS[current.severity];

  // Recovery: enough interactions AND comfort has risen above threshold
  if (
    current.recoveryInteractions >= threshold &&
    status.comfort >= SULK_ENTRY.absenceComfortThreshold
  ) {
    return createInitialSulkState();
  }

  // Partial recovery: downgrade severity
  if (current.severity === "severe" && current.recoveryInteractions >= 5) {
    return { ...current, severity: "moderate" };
  }
  if (current.severity === "moderate" && current.recoveryInteractions >= 3) {
    return { ...current, severity: "mild" };
  }

  return current;
}

function computeEntrySeverity(status: Status, temperament: Temperament): SulkSeverity {
  // Base severity from comfort level
  let score = 0;
  if (status.comfort < 10) score += 3;
  else if (status.comfort < 20) score += 2;
  else score += 1;

  if (status.mood < 20) score += 2;
  else if (status.mood < 35) score += 1;

  // Temperament modifiers
  switch (temperament) {
    case "curious-cautious":
      score += 1; // More sensitive to neglect
      break;
    case "bold-impulsive":
      score += 1; // Strong emotional reactions
      break;
    case "calm-observant":
      score -= 1; // More tolerant
      break;
    case "restless-exploratory":
      break; // Neutral
  }

  if (score >= 5) return "severe";
  if (score >= 3) return "moderate";
  if (score >= 1) return "mild";
  return "none";
}
