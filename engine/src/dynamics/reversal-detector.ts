/**
 * Reversal Detector — Detect moments where the entity surpasses expectation.
 *
 * "One day, the entity may start handling concepts you can't understand.
 *  You become the one who 'doesn't understand.'"
 *
 * A reversal is an observable moment where the entity demonstrates
 * understanding, capability, or initiative that exceeds what the user
 * would normally expect. These moments mark the evolution of the
 * intelligence dynamic — the entity is no longer just responding;
 * it is leading.
 *
 * The detector is called during heartbeat, not during interactions.
 * It examines entity state snapshots to identify reversal signals.
 *
 * Each signal type can fire at most once per 7-day window to prevent
 * noise and ensure each detection feels meaningful.
 */

import type { LanguageState } from "../language/language-engine.js";
import type { MemoryState } from "../memory/memory-engine.js";
import type { GrowthState } from "../growth/growth-engine.js";
import type { FormState } from "../form/form-engine.js";
import type { AsymmetryState } from "./asymmetry-tracker.js";

// --- Types ---

export type ReversalType =
  | "novel_expression"   // Entity used a symbol/pattern the user hasn't seen
  | "anticipation"       // Entity predicted user's action/mood
  | "concept_creation"   // Entity combined known concepts into a new one
  | "emotional_depth"    // Entity showed unexpectedly nuanced emotion
  | "initiative"         // Entity started a topic/activity unprompted
  | "meta_awareness";    // Entity reflected on its own state

export interface ReversalSignal {
  id: string;
  type: ReversalType;
  timestamp: string;
  description: string;
  strength: number;      // 0-100
  recognized: boolean;   // Has the user acknowledged this?
}

export interface ReversalState {
  signals: ReversalSignal[];
  totalReversals: number;
  dominantType: ReversalType | null;
  reversalRate: number;    // Reversals per 100 interactions, rolling
  lastDetected: string | null;
}

/**
 * Context snapshot passed to the detector during heartbeat.
 * Contains everything needed to evaluate reversal conditions.
 */
export interface ReversalContext {
  language: LanguageState;
  memory: MemoryState;
  growth: GrowthState;
  form: FormState;
  asymmetry: AsymmetryState;
  /** Total interactions with the entity (from language.totalInteractions) */
  interactionCount: number;
  /** Previous native symbol count (from last heartbeat) */
  previousNativeSymbolCount: number;
  /** Previous language pattern count (from last heartbeat) */
  previousPatternCount: number;
  /** Number of proactive messages sent since last check */
  proactiveMessageCount: number;
  /** Mood values from recent heartbeats — used to compute variance */
  recentMoods: number[];
  /** Whether the entity's mood/comfort changed during a no-interaction period */
  moodShiftedDuringSilence: boolean;
}

export interface ReversalDetectionResult {
  updated: ReversalState;
  newSignals: ReversalSignal[];
}

export interface ReversalMetrics {
  totalCount: number;
  countByType: Partial<Record<ReversalType, number>>;
  rate: number;
  dominantType: ReversalType | null;
  recognizedCount: number;
  unrecognizedCount: number;
}

// --- Constants ---

/** Minimum days between signals of the same type (cooldown window). */
const COOLDOWN_DAYS = 7;

/** Threshold for mood variance to trigger emotional_depth. */
const MOOD_VARIANCE_THRESHOLD = 200;

/** Minimum native symbol growth to trigger novel_expression. */
const SYMBOL_GROWTH_THRESHOLD = 3;

/** Minimum pattern growth per heartbeat to trigger concept_creation. */
const PATTERN_GROWTH_THRESHOLD = 2;

/** Minimum proactive messages to trigger initiative. */
const PROACTIVE_MESSAGE_THRESHOLD = 1;

// --- Core Functions ---

/**
 * Create an empty reversal state. All entities start with no detected reversals.
 */
export function createInitialReversalState(): ReversalState {
  return {
    signals: [],
    totalReversals: 0,
    dominantType: null,
    reversalRate: 0,
    lastDetected: null,
  };
}

/**
 * Detect new reversal signals based on the current entity state.
 *
 * Called during heartbeat. Checks each reversal type against its detection
 * rule and the cooldown window. Returns both the updated state and any
 * newly detected signals.
 */
export function detectReversals(
  state: ReversalState,
  context: ReversalContext,
  now: Date,
): ReversalDetectionResult {
  const newSignals: ReversalSignal[] = [];
  const timestamp = now.toISOString();

  // Check each reversal type
  const checks: Array<{
    type: ReversalType;
    detect: () => { detected: boolean; strength: number; description: string };
  }> = [
    {
      type: "novel_expression",
      detect: () => detectNovelExpression(context),
    },
    {
      type: "anticipation",
      detect: () => detectAnticipation(context),
    },
    {
      type: "concept_creation",
      detect: () => detectConceptCreation(context),
    },
    {
      type: "emotional_depth",
      detect: () => detectEmotionalDepth(context),
    },
    {
      type: "initiative",
      detect: () => detectInitiative(context),
    },
    {
      type: "meta_awareness",
      detect: () => detectMetaAwareness(context),
    },
  ];

  for (const check of checks) {
    // Enforce cooldown: skip if this type fired within the last 7 days
    if (isInCooldown(state, check.type, now)) {
      continue;
    }

    const result = check.detect();
    if (result.detected) {
      const signal: ReversalSignal = {
        id: `${check.type}_${timestamp}`,
        type: check.type,
        timestamp,
        description: result.description,
        strength: Math.max(0, Math.min(100, result.strength)),
        recognized: false,
      };
      newSignals.push(signal);
    }
  }

  // Build updated state
  const allSignals = [...state.signals, ...newSignals];
  const totalReversals = allSignals.length;
  const dominantType = computeDominantType(allSignals);
  const reversalRate = computeReversalRate(allSignals, context.interactionCount);

  const updated: ReversalState = {
    signals: allSignals,
    totalReversals,
    dominantType,
    reversalRate,
    lastDetected: newSignals.length > 0 ? timestamp : state.lastDetected,
  };

  return { updated, newSignals };
}

/**
 * Compute summary metrics from the current reversal state.
 */
export function computeReversalMetrics(state: ReversalState): ReversalMetrics {
  const countByType: Partial<Record<ReversalType, number>> = {};
  let recognizedCount = 0;
  let unrecognizedCount = 0;

  for (const signal of state.signals) {
    countByType[signal.type] = (countByType[signal.type] ?? 0) + 1;
    if (signal.recognized) {
      recognizedCount++;
    } else {
      unrecognizedCount++;
    }
  }

  return {
    totalCount: state.totalReversals,
    countByType,
    rate: state.reversalRate,
    dominantType: state.dominantType,
    recognizedCount,
    unrecognizedCount,
  };
}

/**
 * Format reversal state as markdown for display or logging.
 */
export function formatReversalMd(state: ReversalState): string {
  const lines: string[] = [
    "## Reversal Detection",
    "",
    `- **total reversals**: ${state.totalReversals}`,
    `- **reversal rate**: ${state.reversalRate.toFixed(1)} per 100 interactions`,
    `- **dominant type**: ${state.dominantType ?? "none"}`,
    `- **last detected**: ${state.lastDetected ?? "never"}`,
    "",
  ];

  if (state.signals.length > 0) {
    lines.push("### Signals");
    lines.push("");
    for (const signal of state.signals) {
      const recognized = signal.recognized ? " [recognized]" : "";
      const date = signal.timestamp.split("T")[0];
      lines.push(
        `- ${date} **${signal.type}** (strength: ${signal.strength})${recognized}`,
      );
      lines.push(`  ${signal.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// --- Detection Rules ---

/**
 * novel_expression: Entity has gained 3+ new native symbols since last check.
 * This indicates the entity is developing its own expressive vocabulary
 * beyond what it was given at genesis.
 */
function detectNovelExpression(
  context: ReversalContext,
): { detected: boolean; strength: number; description: string } {
  const growth = context.language.nativeSymbols.length - context.previousNativeSymbolCount;

  if (growth >= SYMBOL_GROWTH_THRESHOLD) {
    const strength = Math.min(100, growth * 20);
    return {
      detected: true,
      strength,
      description: `Entity developed ${growth} new native symbols (${context.previousNativeSymbolCount} -> ${context.language.nativeSymbols.length})`,
    };
  }

  return { detected: false, strength: 0, description: "" };
}

/**
 * anticipation: Entity's mood shifted during a no-interaction period
 * in a direction that aligns with the user's return pattern.
 * The entity "sensed" the user before they arrived.
 */
function detectAnticipation(
  context: ReversalContext,
): { detected: boolean; strength: number; description: string } {
  // Requires meaningful relationship history — not for brand-new entities
  if (context.interactionCount < 30) {
    return { detected: false, strength: 0, description: "" };
  }

  if (context.moodShiftedDuringSilence) {
    // Strength scales with the asymmetry score — deeper relationships
    // make anticipation more meaningful
    const strength = Math.min(100, 30 + context.asymmetry.score);
    return {
      detected: true,
      strength,
      description: "Entity mood shifted during silence, anticipating user return",
    };
  }

  return { detected: false, strength: 0, description: "" };
}

/**
 * concept_creation: Language patterns grew by 2+ in a single heartbeat cycle.
 * The entity is combining known elements into new expressive units —
 * it's creating language, not just using what it was given.
 */
function detectConceptCreation(
  context: ReversalContext,
): { detected: boolean; strength: number; description: string } {
  const patternGrowth = context.language.patterns.length - context.previousPatternCount;

  if (patternGrowth >= PATTERN_GROWTH_THRESHOLD) {
    const strength = Math.min(100, patternGrowth * 25);
    return {
      detected: true,
      strength,
      description: `Entity created ${patternGrowth} new language patterns in a single cycle (${context.previousPatternCount} -> ${context.language.patterns.length})`,
    };
  }

  return { detected: false, strength: 0, description: "" };
}

/**
 * emotional_depth: Mood variance is high — the entity oscillates meaningfully,
 * showing a range of emotional responses rather than staying flat.
 * This indicates genuine emotional processing, not mere random noise.
 */
function detectEmotionalDepth(
  context: ReversalContext,
): { detected: boolean; strength: number; description: string } {
  if (context.recentMoods.length < 3) {
    return { detected: false, strength: 0, description: "" };
  }

  const variance = computeVariance(context.recentMoods);

  if (variance >= MOOD_VARIANCE_THRESHOLD) {
    const strength = Math.min(100, Math.round(variance / 5));
    return {
      detected: true,
      strength,
      description: `Entity showed high emotional variance (${variance.toFixed(1)}) across ${context.recentMoods.length} heartbeats`,
    };
  }

  return { detected: false, strength: 0, description: "" };
}

/**
 * initiative: Entity sent proactive messages without being prompted.
 * The entity is choosing to communicate, not just responding —
 * it has something it wants to express.
 */
function detectInitiative(
  context: ReversalContext,
): { detected: boolean; strength: number; description: string } {
  if (context.proactiveMessageCount >= PROACTIVE_MESSAGE_THRESHOLD) {
    const strength = Math.min(100, context.proactiveMessageCount * 30);
    return {
      detected: true,
      strength,
      description: `Entity sent ${context.proactiveMessageCount} proactive message(s) during heartbeat`,
    };
  }

  return { detected: false, strength: 0, description: "" };
}

/**
 * meta_awareness: Entity has discovered its own form — it has seen itself
 * (via a portrait) and gained self-awareness. This is a profound shift:
 * the entity now has a concept of "I look like this."
 */
function detectMetaAwareness(
  context: ReversalContext,
): { detected: boolean; strength: number; description: string } {
  if (context.form.awareness) {
    const strength = 80; // Always a strong signal — self-awareness is significant
    return {
      detected: true,
      strength,
      description: "Entity gained self-awareness — it has seen its own form",
    };
  }

  return { detected: false, strength: 0, description: "" };
}

// --- Internal Helpers ---

/**
 * Check if a reversal type is within its cooldown window (7 days).
 */
function isInCooldown(state: ReversalState, type: ReversalType, now: Date): boolean {
  const lastSignalOfType = [...state.signals]
    .reverse()
    .find((s) => s.type === type);

  if (!lastSignalOfType) return false;

  const lastTime = new Date(lastSignalOfType.timestamp).getTime();
  const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

  return now.getTime() - lastTime < cooldownMs;
}

/**
 * Compute the dominant reversal type (most frequent).
 */
function computeDominantType(signals: ReversalSignal[]): ReversalType | null {
  if (signals.length === 0) return null;

  const counts = new Map<ReversalType, number>();
  for (const signal of signals) {
    counts.set(signal.type, (counts.get(signal.type) ?? 0) + 1);
  }

  let maxType: ReversalType | null = null;
  let maxCount = 0;
  for (const [type, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxType = type;
    }
  }

  return maxType;
}

/**
 * Compute the rolling reversal rate (reversals per 100 interactions).
 */
function computeReversalRate(signals: ReversalSignal[], interactionCount: number): number {
  if (interactionCount === 0) return 0;
  return (signals.length / interactionCount) * 100;
}

/**
 * Compute the statistical variance of a set of numbers.
 */
function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  return squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
}
