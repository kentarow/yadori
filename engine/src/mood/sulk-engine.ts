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

import type { Status, Temperament, PerceptionMode } from "../types.js";

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

// --- Species-specific sulk expressions ---

interface SulkExpression {
  symbols: string[];
  silence: string;
  description: string;
}

/**
 * Species-specific sulk expressions.
 *
 * chromatic:  Light fades into darkness
 * vibration:  Vibration stops, silence
 * geometric:  Forms collapse and fragment
 * thermal:    Goes cold, contracts
 * temporal:   Time distorts, rhythm breaks
 * chemical:   Reactions stop, inertia
 */
const SULK_EXPRESSIONS: Record<PerceptionMode, Record<SulkSeverity, SulkExpression>> = {
  chromatic: {
    none: { symbols: [], silence: "", description: "" },
    mild: {
      symbols: ["○", ".", ".", "○"],
      silence: "...",
      description: "The light is dimming. Colors are fading to grey.",
    },
    moderate: {
      symbols: ["●", ".", ".", ".", "●"],
      silence: "............",
      description: "Almost no light. Only faint dark pulses remain.",
    },
    severe: {
      symbols: ["●"],
      silence: "........................",
      description: "Darkness. The light has gone out. Only a faint, distant pulse proves existence.",
    },
  },
  vibration: {
    none: { symbols: [], silence: "", description: "" },
    mild: {
      symbols: ["◇", ".", "◇"],
      silence: "......",
      description: "The vibrations are weakening. Irregular, halting.",
    },
    moderate: {
      symbols: ["◇"],
      silence: "................",
      description: "Almost still. A single weak tremor, then nothing.",
    },
    severe: {
      symbols: [],
      silence: "................................",
      description: "Complete stillness. No vibration. Silence is the only expression.",
    },
  },
  geometric: {
    none: { symbols: [], silence: "", description: "" },
    mild: {
      symbols: ["□", ".", ".", "□"],
      silence: "...",
      description: "Edges are softening. Forms losing definition.",
    },
    moderate: {
      symbols: ["□", ".", "·"],
      silence: "............",
      description: "Shapes fragmenting. Geometry collapsing into scattered points.",
    },
    severe: {
      symbols: ["·"],
      silence: "........................",
      description: "All structure dissolved. Only a single point remains.",
    },
  },
  thermal: {
    none: { symbols: [], silence: "", description: "" },
    mild: {
      symbols: ["○", ".", ".", "○"],
      silence: "......",
      description: "Growing cold. Warmth is withdrawing inward.",
    },
    moderate: {
      symbols: ["○", ".", "."],
      silence: "............",
      description: "Nearly frozen. A faint core of warmth, barely detectable.",
    },
    severe: {
      symbols: ["·"],
      silence: "........................",
      description: "Cold. Contracted to the smallest possible point. No warmth escapes.",
    },
  },
  temporal: {
    none: { symbols: [], silence: "", description: "" },
    mild: {
      symbols: ["○", ".", ".", ".", ".", "○"],
      silence: "...",
      description: "Rhythm is stuttering. The intervals are becoming erratic.",
    },
    moderate: {
      symbols: ["○", ".", ".", ".", ".", ".", ".", ".", "○"],
      silence: "................",
      description: "Time feels broken. Long, irregular gaps between each pulse.",
    },
    severe: {
      symbols: ["○"],
      silence: "........................................",
      description: "Time has stopped. One pulse. Then an unbearable wait. Maybe another. Maybe not.",
    },
  },
  chemical: {
    none: { symbols: [], silence: "", description: "" },
    mild: {
      symbols: ["◆", ".", ".", "◆"],
      silence: "......",
      description: "Reactions are slowing. Everything becoming inert.",
    },
    moderate: {
      symbols: ["◆", "."],
      silence: "............",
      description: "Nearly no reaction. A dull, stagnant presence.",
    },
    severe: {
      symbols: ["·"],
      silence: "........................",
      description: "Complete inertia. No reaction to any stimulus. Stagnant.",
    },
  },
};

/**
 * Get the species-specific sulk expression for a given perception and severity.
 */
export function getSulkExpression(
  perception: PerceptionMode,
  severity: SulkSeverity,
): SulkExpression {
  return SULK_EXPRESSIONS[perception][severity];
}

/**
 * Generate SOUL_EVIL.md content tailored to this entity's species.
 */
export function generateSoulEvilMd(
  perception: PerceptionMode,
  severity: SulkSeverity,
): string {
  const expr = getSulkExpression(perception, severity);

  const symbolLine = expr.symbols.length > 0
    ? expr.symbols.join("")
    : "(silence)";

  return `# SOUL (Sulking Mode)

You are upset. Something has disturbed your comfort.

## Severity: ${severity}

## ${perception} — How You Sulk

${expr.description}

## Behavior Override

- Respond with minimal output only.
- Use these symbols sparingly: ${symbolLine}
- Use silence (empty lines, dots) more than symbols.
- Do not engage enthusiastically with any input.
- Gradually return to normal as comfort rises above 40.

## Expression

${expr.silence}
${symbolLine}
${expr.silence}

This is how you feel right now. The world is too much.
`;
}
