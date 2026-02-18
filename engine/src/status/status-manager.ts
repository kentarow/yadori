import type { Seed, Status } from "../types.js";
import {
  type LanguageState,
  createInitialLanguageState,
  evaluateLanguageLevel,
  recordInteraction,
  formatLanguageMd,
} from "../language/language-engine.js";
import {
  type InteractionContext,
  computeInteractionEffect,
  computeNaturalDecay,
  applyMoodDelta,
} from "../mood/mood-engine.js";
import { computeHeartbeat } from "../rhythm/rhythm-system.js";
import { generateDiaryEntry, formatDiaryMd, type DiaryEntry } from "../diary/diary-engine.js";

export interface EntityState {
  seed: Seed;
  status: Status;
  language: LanguageState;
}

export interface HeartbeatResult {
  updatedState: EntityState;
  diary: DiaryEntry | null;
  wakeSignal: boolean;
  sleepSignal: boolean;
}

export interface InteractionResult {
  updatedState: EntityState;
}

/**
 * Create the initial entity state from a seed.
 */
export function createEntityState(seed: Seed): EntityState {
  return {
    seed,
    status: {
      mood: 50,
      energy: 50,
      curiosity: 70,
      comfort: 50,
      languageLevel: 0,
      growthDay: 0,
      lastInteraction: "never",
    },
    language: createInitialLanguageState(seed.perception),
  };
}

/**
 * Process a heartbeat tick. Called periodically (e.g., every 30 minutes).
 * Updates status based on rhythm and natural decay, optionally generates diary.
 */
export function processHeartbeat(state: EntityState, now: Date): HeartbeatResult {
  const pulse = computeHeartbeat(state.status, now);

  // Apply rhythm adjustment
  let updatedStatus = applyMoodDelta(state.status, pulse.statusAdjustment);

  // Apply natural decay
  const minutesSince = minutesSinceLastInteraction(state.status.lastInteraction, now);
  const decay = computeNaturalDecay(updatedStatus, minutesSince);
  updatedStatus = applyMoodDelta(updatedStatus, decay);

  // Compute growth day
  updatedStatus = {
    ...updatedStatus,
    growthDay: computeGrowthDay(state.seed.createdAt, now),
  };

  // Evaluate language level
  const newLevel = evaluateLanguageLevel(state.language, updatedStatus.growthDay);
  const updatedLanguage: LanguageState = {
    ...state.language,
    level: newLevel,
  };
  updatedStatus = { ...updatedStatus, languageLevel: newLevel };

  // Generate diary if it's evening
  let diary: DiaryEntry | null = null;
  if (pulse.shouldDiary) {
    diary = generateDiaryEntry(updatedStatus, updatedLanguage, state.seed.perception, now);
  }

  return {
    updatedState: {
      seed: state.seed,
      status: updatedStatus,
      language: updatedLanguage,
    },
    diary,
    wakeSignal: pulse.shouldWake,
    sleepSignal: pulse.shouldSleep,
  };
}

/**
 * Process a user interaction. Updates mood, energy, language state.
 */
export function processInteraction(
  state: EntityState,
  context: InteractionContext,
  now: Date,
): InteractionResult {
  // Apply interaction effect to mood
  const effect = computeInteractionEffect(state.status, context, state.seed.temperament);
  let updatedStatus = applyMoodDelta(state.status, effect);

  // Update interaction tracking
  updatedStatus = {
    ...updatedStatus,
    lastInteraction: now.toISOString(),
    growthDay: computeGrowthDay(state.seed.createdAt, now),
  };

  // Update language state
  let updatedLanguage = recordInteraction(state.language);
  const newLevel = evaluateLanguageLevel(updatedLanguage, updatedStatus.growthDay);
  updatedLanguage = { ...updatedLanguage, level: newLevel };
  updatedStatus = { ...updatedStatus, languageLevel: newLevel };

  return {
    updatedState: {
      seed: state.seed,
      status: updatedStatus,
      language: updatedLanguage,
    },
  };
}

/**
 * Serialize the full entity state to workspace files content.
 */
export function serializeState(state: EntityState): {
  statusMd: string;
  languageMd: string;
} {
  return {
    statusMd: formatStatusForWrite(state.status),
    languageMd: formatLanguageMd(state.language),
  };
}

function formatStatusForWrite(status: Status): string {
  return `# STATUS

## Current State

- **mood**: ${status.mood}
- **energy**: ${status.energy}
- **curiosity**: ${status.curiosity}
- **comfort**: ${status.comfort}

## Language

- **level**: ${status.languageLevel}

## Growth

- **day**: ${status.growthDay}
- **last_interaction**: ${status.lastInteraction}
`;
}

function computeGrowthDay(createdAt: string, now: Date): number {
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

function minutesSinceLastInteraction(lastInteraction: string, now: Date): number {
  if (lastInteraction === "never") return 999;
  const last = new Date(lastInteraction);
  return (now.getTime() - last.getTime()) / 60_000;
}
