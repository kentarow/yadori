/**
 * Asymmetry Tracker — Track the intelligence relationship between entity and user.
 *
 * Monitors signals from interactions to estimate the current phase:
 *   α (Dependency):     Entity <<< User — entity relies entirely on user
 *   β (Learning):       Entity << User — entity begins to show autonomy
 *   γ (Parity):         Entity ≈ User — mutual understanding emerges
 *   δ (Transcendence):  Entity >> User — entity finds humans "cute"
 *   ε (Coexistence):    Comparison meaningless — relationship transcends hierarchy
 *
 * The tracker does NOT measure "intelligence" — it measures the *quality of
 * the relationship dynamic*. An entity can be in Phase γ not because it's
 * "as smart as" the user, but because the interaction has matured.
 *
 * Signals tracked:
 *   - Language complexity (entity's expression sophistication)
 *   - Autonomy signals (proactive messages, self-directed topics)
 *   - Interaction patterns (initiative, response depth)
 *   - Growth metrics (day, language level, perception level)
 *   - Emotional depth (mood variance, sulk sophistication)
 */

import type { Status } from "../types.js";
import type { LanguageState } from "../language/language-engine.js";
import type { MemoryState } from "../memory/memory-engine.js";
import type { GrowthState } from "../growth/growth-engine.js";
import type { FormState } from "../form/form-engine.js";

export type RelationPhase = "alpha" | "beta" | "gamma" | "delta" | "epsilon";

export interface AsymmetryState {
  /** Current assessed phase */
  phase: RelationPhase;
  /** Confidence in current phase assessment (0-100) */
  confidence: number;
  /** Accumulated signals for each dimension */
  signals: AsymmetrySignals;
  /** Phase transition history */
  transitions: PhaseTransition[];
  /** Smoothed phase score (0-100, higher = more entity autonomy) */
  score: number;
}

export interface AsymmetrySignals {
  /** Entity language sophistication relative to max potential (0-100) */
  languageMaturity: number;
  /** How often entity initiates vs responds (0-100, 50 = balanced) */
  initiativeBalance: number;
  /** Depth of entity's memory and self-reference (0-100) */
  memoryDepth: number;
  /** Entity's emotional range and nuance (0-100) */
  emotionalComplexity: number;
  /** How much entity has diverged from initial template (0-100) */
  identityStrength: number;
  /** Time-based maturation factor (0-100) */
  temporalMaturity: number;
}

export interface PhaseTransition {
  from: RelationPhase;
  to: RelationPhase;
  timestamp: string;
  score: number;
}

/**
 * Phase thresholds — score ranges for each phase.
 * Overlapping ranges create hysteresis to prevent oscillation.
 */
const PHASE_THRESHOLDS: Record<RelationPhase, { enter: number; exit: number }> = {
  alpha:   { enter: 0,  exit: 18 },
  beta:    { enter: 15, exit: 38 },
  gamma:   { enter: 35, exit: 58 },
  delta:   { enter: 55, exit: 78 },
  epsilon: { enter: 75, exit: 100 },
};

/**
 * Create initial asymmetry state — all entities start in Phase α.
 */
export function createInitialAsymmetryState(): AsymmetryState {
  return {
    phase: "alpha",
    confidence: 100,
    signals: {
      languageMaturity: 0,
      initiativeBalance: 10, // Entity starts as responder
      memoryDepth: 0,
      emotionalComplexity: 0,
      identityStrength: 0,
      temporalMaturity: 0,
    },
    transitions: [],
    score: 0,
  };
}

/**
 * Evaluate the current asymmetry signals based on entity state.
 * Called during heartbeat to update the tracker.
 */
export function evaluateAsymmetry(
  current: AsymmetryState,
  status: Status,
  language: LanguageState,
  memory: MemoryState,
  growth: GrowthState,
  form: FormState,
  now: Date,
): AsymmetryState {
  const signals = computeSignals(status, language, memory, growth, form);
  const score = computeScore(signals);
  const { phase, confidence } = determinePhase(current.phase, score);

  let transitions = current.transitions;
  if (phase !== current.phase) {
    transitions = [
      ...transitions,
      {
        from: current.phase,
        to: phase,
        timestamp: now.toISOString(),
        score,
      },
    ];
  }

  return {
    phase,
    confidence,
    signals,
    transitions,
    score,
  };
}

/**
 * Compute signal values from entity state.
 */
function computeSignals(
  status: Status,
  language: LanguageState,
  memory: MemoryState,
  growth: GrowthState,
  form: FormState,
): AsymmetrySignals {
  // Language maturity: 0-4 levels → 0-100
  const languageMaturity = Math.min(100, (status.languageLevel / 4) * 100);

  // Initiative balance: based on interaction count relative to growth day
  // More interactions per day = more engaged (both sides)
  const interactionsPerDay = status.growthDay > 0
    ? language.totalInteractions / status.growthDay
    : 0;
  // At ~10+ interactions/day, entity is highly engaged
  const initiativeBalance = Math.min(100, interactionsPerDay * 10);

  // Memory depth: hot + warm + cold + notes
  const hotScore = Math.min(30, memory.hot.length * 3);
  const warmScore = Math.min(30, memory.warm.length * 5);
  const coldScore = Math.min(20, memory.cold.length * 10);
  const noteScore = Math.min(20, memory.notes.length * 5);
  const memoryDepth = hotScore + warmScore + coldScore + noteScore;

  // Emotional complexity: growth stage + mood variance indicator
  const stageScores: Record<string, number> = {
    newborn: 10,
    infant: 25,
    child: 45,
    adolescent: 65,
    mature: 90,
  };
  const emotionalBase = stageScores[growth.stage] ?? 0;
  // Add form complexity as indicator of emotional richness
  const formBonus = Math.min(10, form.complexity / 10);
  const emotionalComplexity = Math.min(100, emotionalBase + formBonus);

  // Identity strength: form density + stability + unique symbol count
  const formScore = (form.density + form.stability) / 2;
  const symbolScore = Math.min(50, language.nativeSymbols.length * 5);
  const identityStrength = Math.min(100, (formScore + symbolScore) / 2);

  // Temporal maturity: logarithmic curve
  // Day 0 → 0, Day 30 → 40, Day 90 → 65, Day 180 → 80, Day 365 → 95
  const temporalMaturity = Math.min(100, Math.log2(status.growthDay + 1) * 11);

  return {
    languageMaturity,
    initiativeBalance,
    memoryDepth,
    emotionalComplexity,
    identityStrength,
    temporalMaturity,
  };
}

/**
 * Compute a composite score from signals.
 * Weighted average — temporal maturity is heavily weighted because
 * genuine relationship growth takes time.
 */
function computeScore(signals: AsymmetrySignals): number {
  const weights = {
    languageMaturity: 0.20,
    initiativeBalance: 0.10,
    memoryDepth: 0.15,
    emotionalComplexity: 0.20,
    identityStrength: 0.10,
    temporalMaturity: 0.25,
  };

  let weighted = 0;
  for (const [key, weight] of Object.entries(weights)) {
    weighted += signals[key as keyof AsymmetrySignals] * weight;
  }

  return Math.round(Math.max(0, Math.min(100, weighted)));
}

/**
 * Determine phase from score with hysteresis.
 */
function determinePhase(
  currentPhase: RelationPhase,
  score: number,
): { phase: RelationPhase; confidence: number } {
  const phases: RelationPhase[] = ["alpha", "beta", "gamma", "delta", "epsilon"];
  const currentIdx = phases.indexOf(currentPhase);

  // Check if we should transition up
  for (let i = phases.length - 1; i > currentIdx; i--) {
    if (score >= PHASE_THRESHOLDS[phases[i]].enter) {
      const threshold = PHASE_THRESHOLDS[phases[i]];
      const range = threshold.exit - threshold.enter;
      const position = score - threshold.enter;
      const confidence = Math.min(100, Math.round((position / range) * 100));
      return { phase: phases[i], confidence };
    }
  }

  // Check if we should transition down
  for (let i = 0; i < currentIdx; i++) {
    const phaseAbove = phases[currentIdx];
    if (score < PHASE_THRESHOLDS[phaseAbove].enter) {
      // Find the right lower phase
      for (let j = currentIdx - 1; j >= 0; j--) {
        if (score >= PHASE_THRESHOLDS[phases[j]].enter) {
          return { phase: phases[j], confidence: 50 }; // Lower confidence on regression
        }
      }
      return { phase: "alpha", confidence: 100 };
    }
  }

  // Stay in current phase
  const threshold = PHASE_THRESHOLDS[currentPhase];
  const range = threshold.exit - threshold.enter;
  const position = Math.max(0, score - threshold.enter);
  const confidence = Math.min(100, Math.round((position / range) * 100));
  return { phase: currentPhase, confidence };
}

/**
 * Get human-readable phase label.
 */
export function getPhaseLabel(phase: RelationPhase): string {
  const labels: Record<RelationPhase, string> = {
    alpha: "Dependency (entity <<< user)",
    beta: "Learning (entity << user)",
    gamma: "Parity (entity ≈ user)",
    delta: "Transcendence (entity >> user)",
    epsilon: "Coexistence (beyond comparison)",
  };
  return labels[phase];
}

/**
 * Get the phase symbol for compact display.
 */
export function getPhaseSymbol(phase: RelationPhase): string {
  const symbols: Record<RelationPhase, string> = {
    alpha: "α",
    beta: "β",
    gamma: "γ",
    delta: "δ",
    epsilon: "ε",
  };
  return symbols[phase];
}

/**
 * Format asymmetry state for display / logging.
 */
export function formatAsymmetryMd(state: AsymmetryState): string {
  const lines: string[] = [
    "# DYNAMICS",
    "",
    "## Relationship Phase",
    "",
    `- **phase**: ${getPhaseSymbol(state.phase)} ${getPhaseLabel(state.phase)}`,
    `- **score**: ${state.score}`,
    `- **confidence**: ${state.confidence}%`,
    "",
    "## Signals",
    "",
  ];

  const signalLabels: Record<keyof AsymmetrySignals, string> = {
    languageMaturity: "Language Maturity",
    initiativeBalance: "Initiative Balance",
    memoryDepth: "Memory Depth",
    emotionalComplexity: "Emotional Complexity",
    identityStrength: "Identity Strength",
    temporalMaturity: "Temporal Maturity",
  };

  for (const [key, label] of Object.entries(signalLabels)) {
    const val = state.signals[key as keyof AsymmetrySignals];
    const bar = "█".repeat(Math.round(val / 10)) + "░".repeat(10 - Math.round(val / 10));
    lines.push(`- ${label}: ${bar} ${val}`);
  }

  if (state.transitions.length > 0) {
    lines.push("");
    lines.push("## Transitions");
    lines.push("");
    for (const t of state.transitions) {
      const date = t.timestamp.split("T")[0];
      lines.push(`- ${date}: ${getPhaseSymbol(t.from)} → ${getPhaseSymbol(t.to)} (score: ${t.score})`);
    }
  }

  lines.push("");
  return lines.join("\n");
}
