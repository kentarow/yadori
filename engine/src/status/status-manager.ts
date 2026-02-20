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
import {
  type SulkState,
  createInitialSulkState,
  evaluateSulk,
  processSulkInteraction,
  getActiveSoulFile,
} from "../mood/sulk-engine.js";
import { computeHeartbeat } from "../rhythm/rhythm-system.js";
import { generateDiaryEntry, formatDiaryMd, type DiaryEntry } from "../diary/diary-engine.js";
import {
  type MemoryState,
  type MemoryEntry,
  createInitialMemoryState,
  addHotMemory,
  formatMemoryMd,
} from "../memory/memory-engine.js";
import {
  type GrowthState,
  type Milestone,
  createInitialGrowthState,
  evaluateGrowth,
  formatMilestonesMd,
} from "../growth/growth-engine.js";
import {
  type FormState,
  createInitialFormState,
  evolveForm,
  formatFormMd,
} from "../form/form-engine.js";
import { consolidateToWarm, getISOWeek } from "../memory/memory-engine.js";
import { generateSoulEvilMd } from "../mood/sulk-engine.js";
import {
  type FirstEncounterReaction,
  isFirstEncounter,
  generateFirstEncounter,
  formatFirstEncounterDiary,
} from "../encounter/first-encounter.js";
import {
  type PerceptionGrowthState,
  createInitialPerceptionGrowthState,
  evaluatePerceptionLevel,
} from "../perception/perception-growth.js";
import {
  type AsymmetryState,
  createInitialAsymmetryState,
  evaluateAsymmetry,
  formatAsymmetryMd,
} from "../dynamics/asymmetry-tracker.js";

export interface EntityState {
  seed: Seed;
  status: Status;
  language: LanguageState;
  memory: MemoryState;
  growth: GrowthState;
  sulk: SulkState;
  form: FormState;
  perception: PerceptionGrowthState;
  asymmetry: AsymmetryState;
}

export interface HeartbeatResult {
  updatedState: EntityState;
  diary: DiaryEntry | null;
  wakeSignal: boolean;
  sleepSignal: boolean;
  newMilestones: Milestone[];
  activeSoulFile: "SOUL.md" | "SOUL_EVIL.md";
  soulEvilMd: string | null;
  memoryConsolidated: boolean;
}

export interface InteractionResult {
  updatedState: EntityState;
  newMilestones: Milestone[];
  activeSoulFile: "SOUL.md" | "SOUL_EVIL.md";
  /** Non-null only on the very first interaction ever */
  firstEncounter: FirstEncounterReaction | null;
  /** Formatted diary entry for the first encounter (write to diary/YYYY-MM-DD.md) */
  firstEncounterDiaryMd: string | null;
}

/**
 * Create the initial entity state from a seed.
 */
export function createEntityState(seed: Seed, now = new Date()): EntityState {
  return {
    seed,
    status: {
      mood: 50,
      energy: 50,
      curiosity: 70,
      comfort: 50,
      languageLevel: 0,
      perceptionLevel: 0,
      growthDay: 0,
      lastInteraction: "never",
    },
    language: createInitialLanguageState(seed.perception),
    memory: createInitialMemoryState(),
    growth: createInitialGrowthState(now),
    sulk: createInitialSulkState(),
    form: createInitialFormState(seed.form),
    perception: createInitialPerceptionGrowthState(),
    asymmetry: createInitialAsymmetryState(),
  };
}

/**
 * Process a heartbeat tick. Called periodically (e.g., every 30 minutes).
 * Updates status, evaluates sulk, checks milestones, optionally generates diary.
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

  // Evaluate perception level (independent from language)
  const newPerceptionLevel = evaluatePerceptionLevel(state.perception, updatedStatus.growthDay);
  const updatedPerception: PerceptionGrowthState = {
    ...state.perception,
    level: newPerceptionLevel,
  };
  updatedStatus = { ...updatedStatus, perceptionLevel: newPerceptionLevel };

  // Evaluate sulk state
  const updatedSulk = evaluateSulk(
    state.sulk,
    updatedStatus,
    minutesSince,
    state.seed.temperament,
    now,
  );

  // Evaluate growth milestones
  const { updated: updatedGrowth, newMilestones } = evaluateGrowth(
    state.growth,
    updatedStatus,
    updatedLanguage,
    state.memory,
    now,
  );

  // Evolve form
  const updatedForm = evolveForm(state.form, updatedGrowth.stage, updatedStatus);

  // Consolidate memory if triggered (Sunday night)
  let updatedMemory = state.memory;
  let memoryConsolidated = false;
  if (pulse.shouldConsolidateMemory && state.memory.hot.length > 0) {
    updatedMemory = consolidateToWarm(state.memory, getISOWeek(now));
    memoryConsolidated = true;
  }

  // Evaluate asymmetry (intelligence dynamics)
  const updatedAsymmetry = evaluateAsymmetry(
    state.asymmetry,
    updatedStatus,
    updatedLanguage,
    updatedMemory,
    updatedGrowth,
    updatedForm,
    now,
  );

  // Generate diary if it's evening
  let diary: DiaryEntry | null = null;
  if (pulse.shouldDiary) {
    diary = generateDiaryEntry(updatedStatus, updatedLanguage, state.seed.perception, now);
  }

  // Generate species-specific SOUL_EVIL.md if sulking
  const soulEvilMd = updatedSulk.isSulking
    ? generateSoulEvilMd(state.seed.perception, updatedSulk.severity)
    : null;

  return {
    updatedState: {
      seed: state.seed,
      status: updatedStatus,
      language: updatedLanguage,
      memory: updatedMemory,
      growth: updatedGrowth,
      sulk: updatedSulk,
      form: updatedForm,
      perception: updatedPerception,
      asymmetry: updatedAsymmetry,
    },
    diary,
    wakeSignal: pulse.shouldWake,
    sleepSignal: pulse.shouldSleep,
    newMilestones,
    activeSoulFile: getActiveSoulFile(updatedSulk),
    soulEvilMd,
    memoryConsolidated,
  };
}

/**
 * Process a user interaction. Updates mood, energy, language, memory, growth, sulk.
 *
 * If this is the entity's very first interaction (totalInteractions === 0),
 * a FirstEncounterReaction is generated — the entity's unique response to
 * perceiving "another" for the first time.
 */
export function processInteraction(
  state: EntityState,
  context: InteractionContext,
  now: Date,
  memorySummary?: string,
): InteractionResult {
  // Detect first encounter — before totalInteractions is incremented
  let firstEncounter: FirstEncounterReaction | null = null;
  if (isFirstEncounter(state.language.totalInteractions)) {
    firstEncounter = generateFirstEncounter(state.seed.perception, state.seed.temperament, now);
  }

  // Apply interaction effect to mood
  const effect = computeInteractionEffect(state.status, context, state.seed.temperament);
  let updatedStatus = applyMoodDelta(state.status, effect);

  // Apply first encounter status effect (on top of normal interaction)
  if (firstEncounter) {
    updatedStatus = applyMoodDelta(updatedStatus, firstEncounter.statusEffect);
  }

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

  // Update memory — first encounter gets a special imprint
  const memEntry: MemoryEntry = firstEncounter
    ? firstEncounter.memoryImprint
    : {
        timestamp: now.toISOString(),
        summary: memorySummary ?? `interaction (${context.messageLength} chars)`,
        mood: updatedStatus.mood,
      };
  const { updated: updatedMemory } = addHotMemory(state.memory, memEntry);

  // Process sulk recovery
  const updatedSulk = processSulkInteraction(state.sulk, updatedStatus);

  // Evaluate growth milestones
  const { updated: updatedGrowth, newMilestones } = evaluateGrowth(
    state.growth,
    updatedStatus,
    updatedLanguage,
    updatedMemory,
    now,
  );

  // Generate first encounter diary if applicable
  const firstEncounterDiaryMd = firstEncounter
    ? formatFirstEncounterDiary(firstEncounter, state.seed.perception, state.seed.temperament, now)
    : null;

  return {
    updatedState: {
      seed: state.seed,
      status: updatedStatus,
      language: updatedLanguage,
      memory: updatedMemory,
      growth: updatedGrowth,
      sulk: updatedSulk,
      form: state.form,       // Form evolves only during heartbeat
      perception: state.perception, // Perception evolves only during heartbeat
      asymmetry: state.asymmetry,   // Asymmetry evolves only during heartbeat
    },
    newMilestones,
    activeSoulFile: getActiveSoulFile(updatedSulk),
    firstEncounter,
    firstEncounterDiaryMd,
  };
}

/**
 * Serialize the full entity state to workspace files content.
 */
export function serializeState(state: EntityState): {
  statusMd: string;
  languageMd: string;
  memoryMd: string;
  milestonesMd: string;
  formMd: string;
  dynamicsMd: string;
} {
  return {
    statusMd: formatStatusForWrite(state.status),
    languageMd: formatLanguageMd(state.language),
    memoryMd: formatMemoryMd(state.memory),
    milestonesMd: formatMilestonesMd(state.growth),
    formMd: formatFormMd(state.form),
    dynamicsMd: formatAsymmetryMd(state.asymmetry),
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

## Perception

- **perception_level**: ${status.perceptionLevel}

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
