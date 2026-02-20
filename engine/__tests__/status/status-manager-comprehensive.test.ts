import { describe, it, expect } from "vitest";
import {
  createEntityState,
  processHeartbeat,
  processInteraction,
  serializeState,
  type EntityState,
  type HeartbeatResult,
  type InteractionResult,
} from "../../src/status/status-manager.js";
import { createFixedSeed } from "../../src/genesis/seed-generator.js";
import { LanguageLevel, PerceptionLevel } from "../../src/types.js";
import type { Seed } from "../../src/types.js";
import type { InteractionContext } from "../../src/mood/mood-engine.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_HW = {
  platform: "darwin",
  arch: "arm64",
  totalMemoryGB: 16,
  cpuModel: "Apple M4",
  storageGB: 256,
};

const GENESIS_DATE = "2026-01-01T00:00:00Z";
const NOW = new Date("2026-02-18T12:00:00Z");

function makeSeed(overrides: Partial<Parameters<typeof createFixedSeed>[0]> = {}): Seed {
  return createFixedSeed({ hardwareBody: TEST_HW, createdAt: GENESIS_DATE, ...overrides });
}

function defaultContext(overrides: Partial<InteractionContext> = {}): InteractionContext {
  return {
    minutesSinceLastInteraction: 30,
    userInitiated: true,
    messageLength: 25,
    ...overrides,
  };
}

/**
 * Create a state then run N interactions in sequence.
 * Returns the final state after all interactions.
 */
function runInteractions(
  state: EntityState,
  count: number,
  now: Date,
  context?: Partial<InteractionContext>,
): EntityState {
  let s = state;
  for (let i = 0; i < count; i++) {
    const result = processInteraction(s, defaultContext(context), now);
    s = result.updatedState;
  }
  return s;
}

// =========================================================================
// 1. createEntityState — verify all initial values for each subsystem
// =========================================================================

describe("createEntityState — exhaustive initial values", () => {
  it("initializes status with exact default values", () => {
    const state = createEntityState(makeSeed(), NOW);
    expect(state.status).toEqual({
      mood: 50,
      energy: 50,
      curiosity: 70,
      comfort: 50,
      languageLevel: 0,
      perceptionLevel: 0,
      growthDay: 0,
      lastInteraction: "never",
    });
  });

  it("initializes language subsystem correctly", () => {
    const state = createEntityState(makeSeed(), NOW);
    expect(state.language.level).toBe(LanguageLevel.SymbolsOnly);
    expect(state.language.totalInteractions).toBe(0);
    expect(state.language.patterns).toEqual([]);
    // chromatic perception symbols
    expect(state.language.nativeSymbols).toEqual(["◎", "○", "●", "☆", "★", "◉"]);
  });

  it("initializes language with perception-specific symbols for each species", () => {
    const vibState = createEntityState(makeSeed({ perception: "vibration" }), NOW);
    expect(vibState.language.nativeSymbols).toEqual(["◈", "◇", "◆", "△", "▲", "▽"]);

    const geoState = createEntityState(makeSeed({ perception: "geometric" }), NOW);
    expect(geoState.language.nativeSymbols).toEqual(["■", "□", "△", "▽", "◇", "◆"]);
  });

  it("initializes memory subsystem as empty", () => {
    const state = createEntityState(makeSeed(), NOW);
    expect(state.memory).toEqual({ hot: [], warm: [], cold: [], notes: [] });
  });

  it("initializes growth with first_breath milestone and newborn stage", () => {
    const state = createEntityState(makeSeed(), NOW);
    expect(state.growth.stage).toBe("newborn");
    expect(state.growth.milestones).toHaveLength(1);
    expect(state.growth.milestones[0].id).toBe("first_breath");
    expect(state.growth.milestones[0].achievedDay).toBe(0);
    expect(state.growth.milestones[0].achievedAt).toBe(NOW.toISOString());
  });

  it("initializes sulk subsystem as not sulking", () => {
    const state = createEntityState(makeSeed(), NOW);
    expect(state.sulk).toEqual({
      isSulking: false,
      severity: "none",
      recoveryInteractions: 0,
      sulkingSince: null,
    });
  });

  it("initializes form with seed-determined base form and low values", () => {
    const state = createEntityState(makeSeed(), NOW);
    expect(state.form.baseForm).toBe("light-particles");
    expect(state.form.density).toBe(5);
    expect(state.form.complexity).toBe(3);
    expect(state.form.stability).toBe(15);
    expect(state.form.awareness).toBe(false);
  });

  it("initializes perception growth at minimal level", () => {
    const state = createEntityState(makeSeed(), NOW);
    expect(state.perception).toEqual({
      level: PerceptionLevel.Minimal,
      totalSensoryInputs: 0,
      modalitiesEncountered: 0,
    });
  });

  it("initializes asymmetry in alpha phase with zero score", () => {
    const state = createEntityState(makeSeed(), NOW);
    expect(state.asymmetry.phase).toBe("alpha");
    expect(state.asymmetry.score).toBe(0);
    expect(state.asymmetry.confidence).toBe(100);
    expect(state.asymmetry.transitions).toEqual([]);
    expect(state.asymmetry.signals.languageMaturity).toBe(0);
    expect(state.asymmetry.signals.initiativeBalance).toBe(10);
    expect(state.asymmetry.signals.memoryDepth).toBe(0);
    expect(state.asymmetry.signals.emotionalComplexity).toBe(0);
    expect(state.asymmetry.signals.identityStrength).toBe(0);
    expect(state.asymmetry.signals.temporalMaturity).toBe(0);
  });

  it("initializes reversal detector with no signals", () => {
    const state = createEntityState(makeSeed(), NOW);
    expect(state.reversal).toEqual({
      signals: [],
      totalReversals: 0,
      dominantType: null,
      reversalRate: 0,
      lastDetected: null,
    });
  });

  it("initializes coexist engine as inactive", () => {
    const state = createEntityState(makeSeed(), NOW);
    expect(state.coexist.active).toBe(false);
    expect(state.coexist.quality).toBe(0);
    expect(state.coexist.moments).toEqual([]);
    expect(state.coexist.daysInEpsilon).toBe(0);
    expect(state.coexist.indicators.silenceComfort).toBe(0);
    expect(state.coexist.indicators.sharedVocabulary).toBe(0);
    expect(state.coexist.indicators.rhythmSync).toBe(0);
    expect(state.coexist.indicators.sharedMemory).toBe(0);
    expect(state.coexist.indicators.autonomyRespect).toBe(0);
  });

  it("preserves the seed reference unchanged", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, NOW);
    expect(state.seed).toBe(seed);
    expect(state.seed.hash).toBe(seed.hash);
  });
});

// =========================================================================
// 2. processHeartbeat — subsystem call ordering and time-of-day behavior
// =========================================================================

describe("processHeartbeat — subsystem integration and time-of-day", () => {
  it("returns all expected fields in HeartbeatResult", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processHeartbeat(state, NOW);
    expect(result).toHaveProperty("updatedState");
    expect(result).toHaveProperty("diary");
    expect(result).toHaveProperty("wakeSignal");
    expect(result).toHaveProperty("sleepSignal");
    expect(result).toHaveProperty("newMilestones");
    expect(result).toHaveProperty("newReversals");
    expect(result).toHaveProperty("activeSoulFile");
    expect(result).toHaveProperty("soulEvilMd");
    expect(result).toHaveProperty("memoryConsolidated");
  });

  it("morning heartbeat: wakeSignal true, no diary, no sleep", () => {
    const state = createEntityState(makeSeed(), NOW);
    const morning = new Date("2026-02-18T09:00:00Z");
    const result = processHeartbeat(state, morning);
    expect(result.wakeSignal).toBe(true);
    expect(result.sleepSignal).toBe(false);
    expect(result.diary).toBeNull();
  });

  it("afternoon heartbeat: no wake, no sleep, no diary", () => {
    const state = createEntityState(makeSeed(), NOW);
    const afternoon = new Date("2026-02-18T15:00:00Z");
    const result = processHeartbeat(state, afternoon);
    expect(result.wakeSignal).toBe(false);
    expect(result.sleepSignal).toBe(false);
    expect(result.diary).toBeNull();
  });

  it("evening heartbeat: generates diary, no wake/sleep", () => {
    const state = createEntityState(makeSeed(), NOW);
    const evening = new Date("2026-02-18T19:00:00Z");
    const result = processHeartbeat(state, evening);
    expect(result.diary).not.toBeNull();
    expect(result.diary!.date).toBe("2026-02-18");
    expect(result.diary!.content).toContain("Day ");
    expect(result.wakeSignal).toBe(false);
    expect(result.sleepSignal).toBe(false);
  });

  it("night heartbeat: sleep signal, no diary, no wake", () => {
    const state = createEntityState(makeSeed(), NOW);
    const night = new Date("2026-02-18T22:00:00Z");
    const result = processHeartbeat(state, night);
    expect(result.sleepSignal).toBe(true);
    expect(result.wakeSignal).toBe(false);
    expect(result.diary).toBeNull();
  });

  it("midday heartbeat: no special signals", () => {
    const state = createEntityState(makeSeed(), NOW);
    const midday = new Date("2026-02-18T12:00:00Z");
    const result = processHeartbeat(state, midday);
    expect(result.wakeSignal).toBe(false);
    expect(result.sleepSignal).toBe(false);
    expect(result.diary).toBeNull();
  });

  it("computes correct growthDay from seed createdAt", () => {
    const state = createEntityState(makeSeed(), NOW);
    // 2026-01-01 to 2026-02-18 = 48 days
    const result = processHeartbeat(state, NOW);
    expect(result.updatedState.status.growthDay).toBe(48);
  });

  it("updates growth stage from newborn to child at day 14+", () => {
    const seed = makeSeed({ createdAt: "2026-02-01T00:00:00Z" });
    const state = createEntityState(seed, NOW);
    // 2026-02-01 to 2026-02-18 = 17 days => child stage
    const result = processHeartbeat(state, NOW);
    expect(result.updatedState.growth.stage).toBe("child");
  });

  it("perception level advances to Basic after 7+ growth days", () => {
    const state = createEntityState(makeSeed(), NOW);
    // 48 growth days (well past 7 threshold for Basic, past 21 for Structured)
    const result = processHeartbeat(state, NOW);
    expect(result.updatedState.status.perceptionLevel).toBeGreaterThanOrEqual(
      PerceptionLevel.Basic,
    );
  });
});

// =========================================================================
// 3. processHeartbeat — Sunday consolidation
// =========================================================================

describe("processHeartbeat — weekly memory consolidation", () => {
  it("consolidates on Sunday night with hot memories", () => {
    const state = createEntityState(makeSeed(), NOW);
    state.memory.hot = [
      { timestamp: NOW.toISOString(), summary: "memory A", mood: 60 },
      { timestamp: NOW.toISOString(), summary: "memory B", mood: 40 },
    ];
    // 2026-02-22 is a Sunday
    const sundayNight = new Date("2026-02-22T22:00:00Z");
    const result = processHeartbeat(state, sundayNight);
    expect(result.memoryConsolidated).toBe(true);
    expect(result.updatedState.memory.hot).toHaveLength(0);
    expect(result.updatedState.memory.warm).toHaveLength(1);
    expect(result.updatedState.memory.warm[0].entries).toBe(2);
    expect(result.updatedState.memory.warm[0].averageMood).toBe(50);
    expect(result.updatedState.memory.warm[0].summary).toContain("memory A");
    expect(result.updatedState.memory.warm[0].summary).toContain("memory B");
  });

  it("does not consolidate on Sunday night with empty hot memories", () => {
    const state = createEntityState(makeSeed(), NOW);
    // empty hot, but it is Sunday night
    const sundayNight = new Date("2026-02-22T22:00:00Z");
    const result = processHeartbeat(state, sundayNight);
    expect(result.memoryConsolidated).toBe(false);
  });

  it("does not consolidate on non-Sunday nights", () => {
    const state = createEntityState(makeSeed(), NOW);
    state.memory.hot = [
      { timestamp: NOW.toISOString(), summary: "memory", mood: 50 },
    ];
    // Monday night
    const mondayNight = new Date("2026-02-16T22:00:00Z");
    const result = processHeartbeat(state, mondayNight);
    expect(result.memoryConsolidated).toBe(false);
    expect(result.updatedState.memory.hot).toHaveLength(1);
  });

  it("does not consolidate on Sunday morning", () => {
    const state = createEntityState(makeSeed(), NOW);
    state.memory.hot = [
      { timestamp: NOW.toISOString(), summary: "memory", mood: 50 },
    ];
    // Sunday morning — shouldConsolidateMemory only fires at night
    const sundayMorning = new Date("2026-02-22T09:00:00Z");
    const result = processHeartbeat(state, sundayMorning);
    expect(result.memoryConsolidated).toBe(false);
  });
});

// =========================================================================
// 4. processInteraction — context flow and state updates
// =========================================================================

describe("processInteraction — interaction context flow", () => {
  it("updates lastInteraction to current timestamp", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processInteraction(state, defaultContext(), NOW);
    expect(result.updatedState.status.lastInteraction).toBe(NOW.toISOString());
  });

  it("increments totalInteractions by 1", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processInteraction(state, defaultContext(), NOW);
    expect(result.updatedState.language.totalInteractions).toBe(1);
  });

  it("applies mood boost from user-initiated interaction", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processInteraction(state, defaultContext({ userInitiated: true }), NOW);
    // User-initiated gives +3 mood and +5 comfort (before temperament scaling)
    expect(result.updatedState.status.mood).toBeGreaterThanOrEqual(state.status.mood);
    expect(result.updatedState.status.comfort).toBeGreaterThanOrEqual(state.status.comfort);
  });

  it("applies curiosity boost from long messages", () => {
    const state = createEntityState(makeSeed(), NOW);
    state.language = { ...state.language, totalInteractions: 1 }; // skip first encounter
    const result = processInteraction(state, defaultContext({ messageLength: 100 }), NOW);
    // messageLength > 50 gives +4 curiosity (before temperament scaling)
    expect(result.updatedState.status.curiosity).toBeGreaterThan(state.status.curiosity);
  });

  it("reduces comfort for interactions after long absence", () => {
    const state = createEntityState(makeSeed(), NOW);
    state.language = { ...state.language, totalInteractions: 1 }; // skip first encounter
    const result = processInteraction(
      state,
      defaultContext({ minutesSinceLastInteraction: 500 }),
      NOW,
    );
    // > 360 min absence: -8 comfort (before temperament)
    expect(result.updatedState.status.comfort).toBeLessThan(state.status.comfort);
  });

  it("stores memory summary when provided", () => {
    const state = createEntityState(makeSeed(), NOW);
    state.language = { ...state.language, totalInteractions: 1 };
    const result = processInteraction(state, defaultContext(), NOW, "User talked about weather");
    expect(result.updatedState.memory.hot).toHaveLength(1);
    expect(result.updatedState.memory.hot[0].summary).toBe("User talked about weather");
  });

  it("stores default memory summary when none provided", () => {
    const state = createEntityState(makeSeed(), NOW);
    state.language = { ...state.language, totalInteractions: 1 };
    const result = processInteraction(state, defaultContext({ messageLength: 42 }), NOW);
    expect(result.updatedState.memory.hot).toHaveLength(1);
    expect(result.updatedState.memory.hot[0].summary).toContain("interaction (42 chars)");
  });

  it("does not evolve form, perception, asymmetry, reversal, coexist during interaction", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processInteraction(state, defaultContext(), NOW);
    // These subsystems are untouched during interaction (only evolve during heartbeat)
    expect(result.updatedState.form).toBe(state.form);
    expect(result.updatedState.perception).toBe(state.perception);
    expect(result.updatedState.asymmetry).toBe(state.asymmetry);
    expect(result.updatedState.reversal).toBe(state.reversal);
    expect(result.updatedState.coexist).toBe(state.coexist);
  });

  it("triggers first encounter on very first interaction only", () => {
    const state = createEntityState(makeSeed(), NOW);
    const first = processInteraction(state, defaultContext(), NOW);
    expect(first.firstEncounter).not.toBeNull();
    expect(first.firstEncounterDiaryMd).not.toBeNull();

    const second = processInteraction(first.updatedState, defaultContext(), NOW);
    expect(second.firstEncounter).toBeNull();
    expect(second.firstEncounterDiaryMd).toBeNull();
  });

  it("first encounter memory imprint contains FIRST ENCOUNTER marker", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processInteraction(state, defaultContext(), NOW);
    expect(result.updatedState.memory.hot).toHaveLength(1);
    expect(result.updatedState.memory.hot[0].summary).toMatch(/\[FIRST ENCOUNTER\]/);
  });
});

// =========================================================================
// 5. Multiple processInteraction calls — state accumulates correctly
// =========================================================================

describe("processInteraction — accumulation over multiple calls", () => {
  it("interaction count accumulates through sequential calls", () => {
    const state = createEntityState(makeSeed(), NOW);
    const final = runInteractions(state, 10, NOW);
    expect(final.language.totalInteractions).toBe(10);
  });

  it("memory entries accumulate (up to hot capacity)", () => {
    const state = createEntityState(makeSeed(), NOW);
    const final = runInteractions(state, 8, NOW);
    // First encounter takes slot 1, then 7 normal interactions
    expect(final.memory.hot.length).toBe(8);
  });

  it("hot memory overflows after 10 entries (HOT_CAPACITY)", () => {
    const state = createEntityState(makeSeed(), NOW);
    const final = runInteractions(state, 12, NOW);
    // HOT_CAPACITY is 10, so oldest entries overflow
    expect(final.memory.hot.length).toBe(10);
  });

  it("mood values stay clamped between 0 and 100", () => {
    const state = createEntityState(makeSeed(), NOW);
    const final = runInteractions(state, 20, NOW);
    expect(final.status.mood).toBeGreaterThanOrEqual(0);
    expect(final.status.mood).toBeLessThanOrEqual(100);
    expect(final.status.energy).toBeGreaterThanOrEqual(0);
    expect(final.status.energy).toBeLessThanOrEqual(100);
    expect(final.status.curiosity).toBeGreaterThanOrEqual(0);
    expect(final.status.curiosity).toBeLessThanOrEqual(100);
    expect(final.status.comfort).toBeGreaterThanOrEqual(0);
    expect(final.status.comfort).toBeLessThanOrEqual(100);
  });

  it("first_interaction milestone is achieved exactly once", () => {
    const state = createEntityState(makeSeed(), NOW);
    let milestones: string[] = [];
    let s = state;
    for (let i = 0; i < 5; i++) {
      const result = processInteraction(s, defaultContext(), NOW);
      milestones = milestones.concat(result.newMilestones.map((m) => m.id));
      s = result.updatedState;
    }
    const firstInteractionCount = milestones.filter((id) => id === "first_interaction").length;
    expect(firstInteractionCount).toBe(1);
  });
});

// =========================================================================
// 6. serializeState — verify ALL output fields
// =========================================================================

describe("serializeState — all output fields present", () => {
  it("returns all 8 serialized fields", () => {
    const state = createEntityState(makeSeed(), NOW);
    const serialized = serializeState(state);
    expect(serialized).toHaveProperty("statusMd");
    expect(serialized).toHaveProperty("languageMd");
    expect(serialized).toHaveProperty("memoryMd");
    expect(serialized).toHaveProperty("milestonesMd");
    expect(serialized).toHaveProperty("formMd");
    expect(serialized).toHaveProperty("dynamicsMd");
    expect(serialized).toHaveProperty("reversalMd");
    expect(serialized).toHaveProperty("coexistMd");
  });

  it("statusMd contains all numeric fields and sections", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { statusMd } = serializeState(state);
    expect(statusMd).toContain("# STATUS");
    expect(statusMd).toContain("## Current State");
    expect(statusMd).toContain("**mood**: 50");
    expect(statusMd).toContain("**energy**: 50");
    expect(statusMd).toContain("**curiosity**: 70");
    expect(statusMd).toContain("**comfort**: 50");
    expect(statusMd).toContain("## Language");
    expect(statusMd).toContain("**level**: 0");
    expect(statusMd).toContain("## Perception");
    expect(statusMd).toContain("**perception_level**: 0");
    expect(statusMd).toContain("## Growth");
    expect(statusMd).toContain("**day**: 0");
    expect(statusMd).toContain("**last_interaction**: never");
  });

  it("languageMd contains level name and native symbols", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { languageMd } = serializeState(state);
    expect(languageMd).toContain("# LANGUAGE");
    expect(languageMd).toContain("Symbols Only");
    expect(languageMd).toContain("Available symbols:");
    // chromatic symbols
    expect(languageMd).toContain("◎");
    expect(languageMd).toContain("Total interactions: 0");
  });

  it("memoryMd contains section headers for hot, warm, notes", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { memoryMd } = serializeState(state);
    expect(memoryMd).toContain("# MEMORY");
    expect(memoryMd).toContain("## Hot Memory (Recent)");
    expect(memoryMd).toContain("## Warm Memory (This Week)");
    expect(memoryMd).toContain("## Notes");
    expect(memoryMd).toContain("No recent memories.");
  });

  it("milestonesMd contains first_breath and growth stage", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { milestonesMd } = serializeState(state);
    expect(milestonesMd).toContain("# Growth Milestones");
    expect(milestonesMd).toContain("Current Stage: **newborn**");
    expect(milestonesMd).toContain("First Breath");
    expect(milestonesMd).toContain("**Day 0**");
  });

  it("formMd contains base form, metrics, and description", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { formMd } = serializeState(state);
    expect(formMd).toContain("## Form");
    expect(formMd).toContain("**base**: light-particles");
    expect(formMd).toContain("**density**: 5");
    expect(formMd).toContain("**complexity**: 3");
    expect(formMd).toContain("**stability**: 15");
    expect(formMd).toContain("**self-aware**: no");
    // density < 30 => sparse description
    expect(formMd).toContain("A few faint photons drifting in darkness");
  });

  it("dynamicsMd contains relationship phase and all signals", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { dynamicsMd } = serializeState(state);
    expect(dynamicsMd).toContain("# DYNAMICS");
    expect(dynamicsMd).toContain("## Relationship Phase");
    expect(dynamicsMd).toContain("Dependency");
    expect(dynamicsMd).toContain("**score**: 0");
    expect(dynamicsMd).toContain("## Signals");
    expect(dynamicsMd).toContain("Language Maturity");
    expect(dynamicsMd).toContain("Initiative Balance");
    expect(dynamicsMd).toContain("Memory Depth");
    expect(dynamicsMd).toContain("Emotional Complexity");
    expect(dynamicsMd).toContain("Identity Strength");
    expect(dynamicsMd).toContain("Temporal Maturity");
  });

  it("reversalMd contains reversal state summary", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { reversalMd } = serializeState(state);
    expect(reversalMd).toContain("## Reversal Detection");
    expect(reversalMd).toContain("**total reversals**: 0");
    expect(reversalMd).toContain("**dominant type**: none");
    expect(reversalMd).toContain("**last detected**: never");
  });

  it("coexistMd indicates inactive state when not in epsilon", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { coexistMd } = serializeState(state);
    expect(coexistMd).toContain("# COEXISTENCE");
    expect(coexistMd).toContain("Not yet in Phase epsilon");
  });
});

// =========================================================================
// 7. serializeState — markdown format validation
// =========================================================================

describe("serializeState — markdown format correctness", () => {
  it("statusMd uses proper markdown bold syntax", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { statusMd } = serializeState(state);
    const boldMatches = statusMd.match(/\*\*\w+\*\*/g);
    expect(boldMatches).not.toBeNull();
    expect(boldMatches!.length).toBeGreaterThanOrEqual(7); // mood, energy, curiosity, comfort, level, perception_level, day, last_interaction
  });

  it("statusMd contains proper heading hierarchy", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { statusMd } = serializeState(state);
    expect(statusMd).toMatch(/^# STATUS/m);
    expect(statusMd).toMatch(/^## Current State/m);
    expect(statusMd).toMatch(/^## Language/m);
    expect(statusMd).toMatch(/^## Perception/m);
    expect(statusMd).toMatch(/^## Growth/m);
  });

  it("milestonesMd uses list items with bold day prefix", () => {
    const state = createEntityState(makeSeed(), NOW);
    const { milestonesMd } = serializeState(state);
    expect(milestonesMd).toMatch(/^- \*\*Day \d+\*\*: .+$/m);
  });

  it("serialized fields contain no undefined values as text", () => {
    const state = createEntityState(makeSeed(), NOW);
    const serialized = serializeState(state);
    for (const [key, value] of Object.entries(serialized)) {
      expect(value).not.toContain("undefined");
      expect(value).not.toContain("[object Object]");
    }
  });

  it("serialized state reflects changes after interaction", () => {
    let state = createEntityState(makeSeed(), NOW);
    state = processInteraction(state, defaultContext(), NOW).updatedState;
    const serialized = serializeState(state);
    expect(serialized.statusMd).toContain(`**last_interaction**: ${NOW.toISOString()}`);
    expect(serialized.languageMd).toContain("Total interactions: 1");
    expect(serialized.memoryMd).toContain("[FIRST ENCOUNTER]");
  });
});

// =========================================================================
// 8. State shape consistency — no undefined, correct types
// =========================================================================

describe("state shape consistency", () => {
  it("all EntityState top-level keys are defined and non-null", () => {
    const state = createEntityState(makeSeed(), NOW);
    const keys: (keyof EntityState)[] = [
      "seed", "status", "language", "memory", "growth",
      "sulk", "form", "perception", "asymmetry", "reversal", "coexist",
    ];
    for (const key of keys) {
      expect(state[key]).toBeDefined();
      expect(state[key]).not.toBeNull();
    }
  });

  it("heartbeat result preserves all state subsystem keys", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processHeartbeat(state, NOW);
    const updated = result.updatedState;
    const keys: (keyof EntityState)[] = [
      "seed", "status", "language", "memory", "growth",
      "sulk", "form", "perception", "asymmetry", "reversal", "coexist",
    ];
    for (const key of keys) {
      expect(updated[key]).toBeDefined();
      expect(updated[key]).not.toBeNull();
    }
  });

  it("interaction result preserves all state subsystem keys", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processInteraction(state, defaultContext(), NOW);
    const updated = result.updatedState;
    const keys: (keyof EntityState)[] = [
      "seed", "status", "language", "memory", "growth",
      "sulk", "form", "perception", "asymmetry", "reversal", "coexist",
    ];
    for (const key of keys) {
      expect(updated[key]).toBeDefined();
      expect(updated[key]).not.toBeNull();
    }
  });

  it("status values remain numeric after heartbeat", () => {
    const state = createEntityState(makeSeed(), NOW);
    const result = processHeartbeat(state, NOW);
    const s = result.updatedState.status;
    expect(typeof s.mood).toBe("number");
    expect(typeof s.energy).toBe("number");
    expect(typeof s.curiosity).toBe("number");
    expect(typeof s.comfort).toBe("number");
    expect(typeof s.growthDay).toBe("number");
    expect(typeof s.languageLevel).toBe("number");
    expect(typeof s.perceptionLevel).toBe("number");
    expect(Number.isFinite(s.mood)).toBe(true);
    expect(Number.isFinite(s.energy)).toBe(true);
  });

  it("seed is never mutated by heartbeat or interaction", () => {
    const seed = makeSeed();
    const originalHash = seed.hash;
    const originalCreatedAt = seed.createdAt;
    let state = createEntityState(seed, NOW);

    state = processHeartbeat(state, NOW).updatedState;
    expect(state.seed.hash).toBe(originalHash);
    expect(state.seed.createdAt).toBe(originalCreatedAt);

    state = processInteraction(state, defaultContext(), NOW).updatedState;
    expect(state.seed.hash).toBe(originalHash);
    expect(state.seed.createdAt).toBe(originalCreatedAt);
  });
});

// =========================================================================
// 9. Edge cases — interaction after heartbeat, heartbeat after interaction,
//    rapid succession, boundary conditions
// =========================================================================

describe("edge cases — interleaved heartbeats and interactions", () => {
  it("interaction after heartbeat: state flows correctly", () => {
    const state = createEntityState(makeSeed(), NOW);
    const hbResult = processHeartbeat(state, NOW);
    const intResult = processInteraction(
      hbResult.updatedState,
      defaultContext(),
      NOW,
    );
    // Heartbeat updated growthDay; interaction should preserve it
    expect(intResult.updatedState.status.growthDay).toBe(
      hbResult.updatedState.status.growthDay,
    );
    // Interaction should increment totalInteractions
    expect(intResult.updatedState.language.totalInteractions).toBe(1);
  });

  it("heartbeat after interaction: status reflects interaction effects", () => {
    const state = createEntityState(makeSeed(), NOW);
    const intResult = processInteraction(state, defaultContext(), NOW);
    const hbResult = processHeartbeat(
      intResult.updatedState,
      new Date("2026-02-18T12:30:00Z"),
    );
    // Heartbeat sees the interaction's lastInteraction timestamp
    expect(hbResult.updatedState.status.lastInteraction).toBe(NOW.toISOString());
    // totalInteractions should still be 1 after heartbeat
    expect(hbResult.updatedState.language.totalInteractions).toBe(1);
  });

  it("rapid succession: 3 interactions then heartbeat preserves state", () => {
    let state = createEntityState(makeSeed(), NOW);
    for (let i = 0; i < 3; i++) {
      const result = processInteraction(
        state,
        defaultContext({ minutesSinceLastInteraction: 1 }),
        new Date(NOW.getTime() + i * 60000),
      );
      state = result.updatedState;
    }
    expect(state.language.totalInteractions).toBe(3);
    expect(state.memory.hot.length).toBe(3);

    const hbResult = processHeartbeat(state, new Date(NOW.getTime() + 300000));
    expect(hbResult.updatedState.language.totalInteractions).toBe(3);
    expect(hbResult.updatedState.memory.hot.length).toBe(3);
  });

  it("heartbeat with lastInteraction=never: uses 999 minutes since last", () => {
    const state = createEntityState(makeSeed(), NOW);
    // lastInteraction is "never" by default
    expect(state.status.lastInteraction).toBe("never");
    // This should not throw and should apply natural decay with 999 minutes
    const result = processHeartbeat(state, NOW);
    expect(result.updatedState).toBeDefined();
    // Comfort should decrease due to long absence
    expect(result.updatedState.status.comfort).toBeLessThanOrEqual(state.status.comfort);
  });

  it("sulk recovery through interactions after heartbeat triggers sulk", () => {
    const state = createEntityState(makeSeed(), NOW);
    // Force sulking conditions
    state.status = { ...state.status, comfort: 10, mood: 15 };
    const hbResult = processHeartbeat(state, NOW);
    expect(hbResult.updatedState.sulk.isSulking).toBe(true);
    expect(hbResult.activeSoulFile).toBe("SOUL_EVIL.md");

    // Now interact multiple times — recovery requires interactions + comfort above threshold
    let s = hbResult.updatedState;
    // Force comfort back up to pass recovery check
    s.status = { ...s.status, comfort: 50 };
    for (let i = 0; i < 10; i++) {
      const r = processInteraction(s, defaultContext({ userInitiated: true }), NOW);
      s = r.updatedState;
    }
    // After enough interactions with high comfort, sulk should recover
    expect(s.sulk.isSulking).toBe(false);
    expect(s.sulk.severity).toBe("none");
  });

  it("different temperaments produce different first encounter effects", () => {
    const temperaments = [
      "curious-cautious",
      "bold-impulsive",
      "calm-observant",
      "restless-exploratory",
    ] as const;
    const curiosityValues: number[] = [];

    for (const temp of temperaments) {
      const state = createEntityState(makeSeed({ temperament: temp }), NOW);
      const result = processInteraction(state, defaultContext(), NOW);
      curiosityValues.push(result.updatedState.status.curiosity);
    }

    // Different temperaments should produce different curiosity outcomes
    const unique = new Set(curiosityValues);
    expect(unique.size).toBeGreaterThan(1);
  });
});
