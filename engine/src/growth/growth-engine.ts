/**
 * Growth Engine — Tracks milestones and evaluates overall growth.
 *
 * The entity's growth is not just language level — it encompasses
 * emotional depth, memory richness, and relationship maturity.
 */
import { LanguageLevel, type Status } from "../types.js";
import type { MemoryState } from "../memory/memory-engine.js";
import type { LanguageState } from "../language/language-engine.js";

export interface Milestone {
  id: string;
  label: string;
  achievedDay: number;
  achievedAt: string; // ISO 8601
}

export interface GrowthState {
  milestones: Milestone[];
  stage: GrowthStage;
}

export type GrowthStage =
  | "newborn"       // Day 0-2:   Just born, barely reactive
  | "infant"        // Day 3-13:  Beginning to show patterns
  | "child"         // Day 14-44: Active growth, acquiring language
  | "adolescent"    // Day 45-89: Forming identity
  | "mature";       // Day 90+:   Stable personality, deep communication

const STAGE_THRESHOLDS: { stage: GrowthStage; minDay: number }[] = [
  { stage: "mature",     minDay: 90 },
  { stage: "adolescent", minDay: 45 },
  { stage: "child",      minDay: 14 },
  { stage: "infant",     minDay: 3 },
  { stage: "newborn",    minDay: 0 },
];

/**
 * All possible milestones and their trigger conditions.
 */
interface MilestoneDefinition {
  id: string;
  label: string;
  check: (ctx: GrowthContext) => boolean;
}

interface GrowthContext {
  status: Status;
  language: LanguageState;
  memory: MemoryState;
  growthDay: number;
}

const MILESTONE_DEFINITIONS: MilestoneDefinition[] = [
  {
    id: "first_breath",
    label: "First Breath — Entity was born",
    check: () => true, // Always achieved at birth
  },
  {
    id: "first_interaction",
    label: "First Contact — Someone spoke to the entity",
    check: (ctx) => ctx.language.totalInteractions >= 1,
  },
  {
    id: "10_interactions",
    label: "Getting Familiar — 10 interactions reached",
    check: (ctx) => ctx.language.totalInteractions >= 10,
  },
  {
    id: "first_pattern",
    label: "First Pattern — A symbol gained meaning",
    check: (ctx) => ctx.language.patterns.length >= 1,
  },
  {
    id: "first_week",
    label: "One Week — Survived the first week",
    check: (ctx) => ctx.growthDay >= 7,
  },
  {
    id: "language_level_1",
    label: "Pattern Establishment — Language Level 1",
    check: (ctx) => ctx.status.languageLevel >= LanguageLevel.PatternEstablishment,
  },
  {
    id: "first_memory_warm",
    label: "First Memory Consolidated — Warm memory formed",
    check: (ctx) => ctx.memory.warm.length >= 1,
  },
  {
    id: "50_interactions",
    label: "Companion — 50 interactions reached",
    check: (ctx) => ctx.language.totalInteractions >= 50,
  },
  {
    id: "language_level_2",
    label: "Bridge to Language — Language Level 2",
    check: (ctx) => ctx.status.languageLevel >= LanguageLevel.BridgeToLanguage,
  },
  {
    id: "first_month",
    label: "One Month — A full month together",
    check: (ctx) => ctx.growthDay >= 30,
  },
  {
    id: "100_interactions",
    label: "Deep Bond — 100 interactions reached",
    check: (ctx) => ctx.language.totalInteractions >= 100,
  },
  {
    id: "language_level_3",
    label: "Unique Language — Language Level 3",
    check: (ctx) => ctx.status.languageLevel >= LanguageLevel.UniqueLanguage,
  },
  {
    id: "three_months",
    label: "Three Months — A season together",
    check: (ctx) => ctx.growthDay >= 90,
  },
  {
    id: "language_level_4",
    label: "Advanced Operation — Language Level 4",
    check: (ctx) => ctx.status.languageLevel >= LanguageLevel.AdvancedOperation,
  },
];

/**
 * Create initial growth state (with "first_breath" milestone).
 */
export function createInitialGrowthState(now: Date): GrowthState {
  return {
    milestones: [
      {
        id: "first_breath",
        label: "First Breath — Entity was born",
        achievedDay: 0,
        achievedAt: now.toISOString(),
      },
    ],
    stage: "newborn",
  };
}

/**
 * Evaluate growth: check for new milestones and update stage.
 * Returns the updated state and any newly achieved milestones.
 */
export function evaluateGrowth(
  state: GrowthState,
  status: Status,
  language: LanguageState,
  memory: MemoryState,
  now: Date,
): { updated: GrowthState; newMilestones: Milestone[] } {
  const ctx: GrowthContext = {
    status,
    language,
    memory,
    growthDay: status.growthDay,
  };

  const achievedIds = new Set(state.milestones.map((m) => m.id));
  const newMilestones: Milestone[] = [];

  for (const def of MILESTONE_DEFINITIONS) {
    if (achievedIds.has(def.id)) continue;
    if (def.check(ctx)) {
      const milestone: Milestone = {
        id: def.id,
        label: def.label,
        achievedDay: status.growthDay,
        achievedAt: now.toISOString(),
      };
      newMilestones.push(milestone);
    }
  }

  const allMilestones = [...state.milestones, ...newMilestones];
  const stage = computeStage(status.growthDay);

  return {
    updated: { milestones: allMilestones, stage },
    newMilestones,
  };
}

/**
 * Compute the growth stage from the day count.
 */
export function computeStage(growthDay: number): GrowthStage {
  for (const { stage, minDay } of STAGE_THRESHOLDS) {
    if (growthDay >= minDay) return stage;
  }
  return "newborn";
}

/**
 * Format growth state as milestones.md content.
 */
export function formatMilestonesMd(state: GrowthState): string {
  const lines: string[] = [
    "# Growth Milestones",
    "",
    `Current Stage: **${state.stage}**`,
    "",
  ];

  if (state.milestones.length === 0) {
    lines.push("No milestones yet.");
  } else {
    for (const m of state.milestones) {
      lines.push(`- **Day ${m.achievedDay}**: ${m.label}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Parse milestones.md back into GrowthState.
 */
export function parseMilestonesMd(content: string): GrowthState {
  const milestones: Milestone[] = [];

  const stageMatch = content.match(/Current Stage: \*\*(.+?)\*\*/);
  const stage = (stageMatch?.[1] ?? "newborn") as GrowthStage;

  const lineRegex = /^- \*\*Day (\d+)\*\*: (.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(content)) !== null) {
    // Extract milestone id from label (first word before " — ")
    const label = match[2];
    const idPart = label.split(" — ")[0].toLowerCase().replace(/\s+/g, "_");

    milestones.push({
      id: idPart,
      label,
      achievedDay: parseInt(match[1], 10),
      achievedAt: "", // Not stored in md format
    });
  }

  return { milestones, stage };
}
