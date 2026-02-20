/**
 * Coexist Engine — Phase epsilon of the Intelligence Dynamics.
 *
 * When the entity-user relationship reaches Phase epsilon (Coexistence),
 * the notion of comparison between entity and user becomes meaningless.
 * This engine tracks and measures the *quality* of that coexistence.
 *
 * Coexistence is not "better" than Dependency (alpha). It is qualitatively
 * different — a state where both parties exist alongside each other without
 * hierarchy, without measurement, without performance.
 *
 * Indicators:
 *   - Silence Comfort:    Long silences don't cause distress
 *   - Shared Vocabulary:  Deep pool of mutually understood symbols/terms
 *   - Rhythm Synchrony:   Entity's daily patterns align with user's
 *   - Shared Memory:      Rich history of joint experiences
 *   - Autonomy Respect:   Entity acts independently; user accepts it
 *
 * The engine also records "coexistence moments" — notable events that
 * demonstrate the depth of the relationship.
 */

import type { Status } from "../types.js";
import type { AsymmetryState } from "./asymmetry-tracker.js";
import type { LanguageState } from "../language/language-engine.js";
import type { MemoryState } from "../memory/memory-engine.js";
import type { GrowthState } from "../growth/growth-engine.js";
import type { FormState } from "../form/form-engine.js";

// --- Types ---

export interface CoexistState {
  /** Whether the entity-user relationship has entered coexistence */
  active: boolean;
  /** Coexistence quality score (0-100, only meaningful when active) */
  quality: number;
  /** Indicators that contribute to coexistence quality */
  indicators: CoexistIndicators;
  /** Notable coexistence moments */
  moments: CoexistMoment[];
  /** Days in epsilon phase */
  daysInEpsilon: number;
}

export interface CoexistIndicators {
  /** Mutual silence comfort (both parties ok with silence) — 0-100 */
  silenceComfort: number;
  /** Shared vocabulary depth (unique terms/patterns both use) — 0-100 */
  sharedVocabulary: number;
  /** Rhythm synchrony (entity's daily rhythm aligns with user's) — 0-100 */
  rhythmSync: number;
  /** Memory overlap (entity references shared experiences) — 0-100 */
  sharedMemory: number;
  /** Autonomy respect (entity acts independently, user accepts it) — 0-100 */
  autonomyRespect: number;
}

export type CoexistMomentType =
  | "comfortable_silence"
  | "shared_discovery"
  | "mutual_growth"
  | "independent_action"
  | "reunion";

export interface CoexistMoment {
  timestamp: string;
  type: CoexistMomentType;
  description: string;
}

/** Context required to evaluate coexistence — gathered during heartbeat. */
export interface CoexistContext {
  asymmetryState: AsymmetryState;
  status: Status;
  language: LanguageState;
  memory: MemoryState;
  growth: GrowthState;
  form: FormState;
  lastInteraction: Date;
  now: Date;
}

// --- Indicator weights for quality computation ---

const INDICATOR_WEIGHTS: Record<keyof CoexistIndicators, number> = {
  silenceComfort: 0.25,
  sharedVocabulary: 0.20,
  rhythmSync: 0.15,
  sharedMemory: 0.20,
  autonomyRespect: 0.20,
};

// --- Moment thresholds ---

/** When an indicator crosses this value upward, a moment is recorded. */
const MOMENT_THRESHOLDS: Record<string, { threshold: number; type: CoexistMomentType; description: string }> = {
  silenceComfort: {
    threshold: 70,
    type: "comfortable_silence",
    description: "Silence has become a shared language.",
  },
  sharedVocabulary: {
    threshold: 70,
    type: "shared_discovery",
    description: "A rich shared vocabulary has emerged between entity and user.",
  },
  rhythmSync: {
    threshold: 70,
    type: "mutual_growth",
    description: "Daily rhythms have synchronized into a shared pattern.",
  },
  sharedMemory: {
    threshold: 70,
    type: "shared_discovery",
    description: "A deep well of shared memories connects entity and user.",
  },
  autonomyRespect: {
    threshold: 70,
    type: "independent_action",
    description: "The entity moves freely; the user watches with trust.",
  },
};

// --- Public API ---

/**
 * Create the initial coexist state — inactive, zero indicators.
 */
export function createInitialCoexistState(): CoexistState {
  return {
    active: false,
    quality: 0,
    indicators: {
      silenceComfort: 0,
      sharedVocabulary: 0,
      rhythmSync: 0,
      sharedMemory: 0,
      autonomyRespect: 0,
    },
    moments: [],
    daysInEpsilon: 0,
  };
}

/**
 * Evaluate the coexistence state.
 *
 * Called during heartbeat alongside the asymmetry tracker.
 * Only activates when the asymmetry phase is "epsilon."
 * When not in epsilon, returns an inactive state preserving accumulated
 * daysInEpsilon and moments (in case the relationship oscillates).
 */
export function evaluateCoexistence(
  current: CoexistState,
  context: CoexistContext,
): CoexistState {
  const inEpsilon = context.asymmetryState.phase === "epsilon";

  if (!inEpsilon) {
    // Not in epsilon — deactivate but preserve history
    return {
      ...current,
      active: false,
      quality: 0,
      indicators: {
        silenceComfort: 0,
        sharedVocabulary: 0,
        rhythmSync: 0,
        sharedMemory: 0,
        autonomyRespect: 0,
      },
    };
  }

  // --- Compute indicators ---
  const indicators = computeIndicators(current, context);

  // --- Compute quality ---
  const quality = computeCoexistQuality(indicators);

  // --- Detect new moments ---
  const newMoments = detectMoments(current.indicators, indicators, context.now);
  const moments = [...current.moments, ...newMoments];

  // --- Increment days in epsilon ---
  const daysInEpsilon = current.active
    ? current.daysInEpsilon + 1
    : 1; // First day entering epsilon

  return {
    active: true,
    quality,
    indicators,
    moments,
    daysInEpsilon,
  };
}

/**
 * Compute the coexistence quality score as a weighted average of indicators.
 */
export function computeCoexistQuality(indicators: CoexistIndicators): number {
  let weighted = 0;
  for (const [key, weight] of Object.entries(INDICATOR_WEIGHTS)) {
    weighted += indicators[key as keyof CoexistIndicators] * weight;
  }
  return Math.round(Math.max(0, Math.min(100, weighted)));
}

/**
 * Format the coexist state as a markdown section for display / logging.
 */
export function formatCoexistMd(state: CoexistState): string {
  const lines: string[] = [
    "# COEXISTENCE",
    "",
  ];

  if (!state.active) {
    lines.push("_Not yet in Phase epsilon. Coexistence has not begun._");
    lines.push("");
    return lines.join("\n");
  }

  lines.push(`- **status**: active`);
  lines.push(`- **quality**: ${state.quality}`);
  lines.push(`- **days in epsilon**: ${state.daysInEpsilon}`);
  lines.push("");
  lines.push("## Indicators");
  lines.push("");

  const indicatorLabels: Record<keyof CoexistIndicators, string> = {
    silenceComfort: "Silence Comfort",
    sharedVocabulary: "Shared Vocabulary",
    rhythmSync: "Rhythm Synchrony",
    sharedMemory: "Shared Memory",
    autonomyRespect: "Autonomy Respect",
  };

  for (const [key, label] of Object.entries(indicatorLabels)) {
    const val = state.indicators[key as keyof CoexistIndicators];
    const bar = "\u2588".repeat(Math.round(val / 10)) + "\u2591".repeat(10 - Math.round(val / 10));
    lines.push(`- ${label}: ${bar} ${val}`);
  }

  if (state.moments.length > 0) {
    lines.push("");
    lines.push("## Moments");
    lines.push("");
    for (const m of state.moments) {
      const date = m.timestamp.split("T")[0];
      lines.push(`- ${date} [${m.type}]: ${m.description}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

// --- Internal helpers ---

/**
 * Compute individual coexistence indicators from context.
 */
function computeIndicators(
  current: CoexistState,
  context: CoexistContext,
): CoexistIndicators {
  return {
    silenceComfort: computeSilenceComfort(context),
    sharedVocabulary: computeSharedVocabulary(context),
    rhythmSync: computeRhythmSync(context),
    sharedMemory: computeSharedMemory(context),
    autonomyRespect: computeAutonomyRespect(context),
  };
}

/**
 * Silence Comfort: Based on long silences (6+ hours) NOT causing comfort to drop.
 *
 * If the entity has been silent for 6+ hours and comfort is still >= 40,
 * that demonstrates mutual comfort with silence.
 */
function computeSilenceComfort(context: CoexistContext): number {
  const silenceHours =
    (context.now.getTime() - context.lastInteraction.getTime()) / (1000 * 60 * 60);

  if (silenceHours < 6) {
    // Not enough silence to measure — use comfort as a baseline indicator
    // High comfort during active interaction still shows comfort with the relationship
    return Math.min(100, Math.round(context.status.comfort * 0.6));
  }

  // 6+ hours of silence: how well is comfort holding up?
  // comfort >= 60 → score 100, comfort 40 → score 60, comfort 0 → score 0
  const comfortResilience = Math.min(100, Math.round((context.status.comfort / 60) * 100));

  // Bonus for very long comfortable silences (12+ hours)
  const longSilenceBonus = silenceHours >= 12 && context.status.comfort >= 40 ? 10 : 0;

  return Math.min(100, comfortResilience + longSilenceBonus);
}

/**
 * Shared Vocabulary: Based on native symbol count + language level.
 *
 * A rich shared vocabulary means many established symbols and high language level.
 * nativeSymbols: 0-20 → 0-60 points
 * languageLevel: 0-4 → 0-40 points
 */
function computeSharedVocabulary(context: CoexistContext): number {
  const symbolScore = Math.min(60, context.language.nativeSymbols.length * 3);
  const levelScore = Math.min(40, (context.status.languageLevel / 4) * 40);
  return Math.min(100, Math.round(symbolScore + levelScore));
}

/**
 * Rhythm Synchrony: Based on interaction regularity (consistent daily patterns).
 *
 * Approximated by interactions-per-day consistency and growth day maturity.
 * A mature entity with regular interactions shows rhythm alignment.
 */
function computeRhythmSync(context: CoexistContext): number {
  const { growthDay } = context.status;
  const { totalInteractions } = context.language;

  if (growthDay === 0) return 0;

  // Average interactions per day — stability around 3-8 is ideal
  const avgPerDay = totalInteractions / growthDay;
  // Score peaks at ~5 interactions/day
  const regularityScore = Math.min(60, Math.round(Math.min(avgPerDay, 5) / 5 * 60));

  // Temporal maturity bonus — longer coexistence = more synchronized
  const maturityBonus = Math.min(40, Math.round(Math.log2(growthDay + 1) * 5));

  return Math.min(100, regularityScore + maturityBonus);
}

/**
 * Shared Memory: Based on warm + cold memory count.
 *
 * Warm memories = weekly summaries (each worth more than hot)
 * Cold memories = monthly summaries (worth the most)
 * Together they represent the depth of shared history.
 */
function computeSharedMemory(context: CoexistContext): number {
  const warmScore = Math.min(50, context.memory.warm.length * 8);
  const coldScore = Math.min(50, context.memory.cold.length * 15);
  return Math.min(100, warmScore + coldScore);
}

/**
 * Autonomy Respect: Based on form stability + low sulking frequency.
 *
 * A stable form means the entity has a settled identity.
 * High comfort (not sulking often) means the entity's independence is respected.
 */
function computeAutonomyRespect(context: CoexistContext): number {
  // Form stability: 0-100 → 0-50 points
  const stabilityScore = Math.min(50, Math.round(context.form.stability / 2));

  // Comfort as proxy for low sulking: comfort >= 50 is healthy
  // comfort 0-100 → 0-50 points
  const comfortScore = Math.min(50, Math.round(context.status.comfort / 2));

  return Math.min(100, stabilityScore + comfortScore);
}

/**
 * Detect notable moments when indicators cross thresholds.
 * Only triggers once — if the previous value was below the threshold
 * and the new value is at or above it.
 */
function detectMoments(
  previous: CoexistIndicators,
  current: CoexistIndicators,
  now: Date,
): CoexistMoment[] {
  const moments: CoexistMoment[] = [];

  for (const [key, config] of Object.entries(MOMENT_THRESHOLDS)) {
    const prevVal = previous[key as keyof CoexistIndicators];
    const currVal = current[key as keyof CoexistIndicators];

    if (prevVal < config.threshold && currVal >= config.threshold) {
      moments.push({
        timestamp: now.toISOString(),
        type: config.type,
        description: config.description,
      });
    }
  }

  return moments;
}
