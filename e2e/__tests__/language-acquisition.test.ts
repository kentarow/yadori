/**
 * End-to-End Test: Language Acquisition Lifecycle
 *
 * Verifies the complete language acquisition journey:
 *   Level 0 (Symbols Only) → Level 1 (Pattern Establishment) →
 *   Level 2 (Bridge to Language) → Level 3 (Unique Language) →
 *   Level 4 (Advanced Operation)
 *
 * Tests real engine functions with no mocks. Uses createFixedSeed
 * for deterministic seeds.
 *
 * Thresholds (from language-engine.ts):
 *   Level 0 → 1: 7 days + 30 interactions
 *   Level 1 → 2: 21 days + 100 interactions
 *   Level 2 → 3: 45 days + 250 interactions
 *   Level 3 → 4: 90 days + 500 interactions
 */

import { describe, it, expect } from "vitest";
import { createFixedSeed } from "../../engine/src/genesis/seed-generator.js";
import {
  createEntityState,
  processHeartbeat,
  processInteraction,
  serializeState,
} from "../../engine/src/status/status-manager.js";
import {
  createInitialLanguageState,
  evaluateLanguageLevel,
  recordInteraction,
  establishPattern,
  generateExpression,
  formatLanguageMd,
  PERCEPTION_SYMBOLS,
} from "../../engine/src/language/language-engine.js";
import { LanguageLevel } from "../../engine/src/types.js";
import type { HardwareBody, PerceptionMode, Status } from "../../engine/src/types.js";

// --- Shared fixtures ---

const TEST_HW: HardwareBody = {
  platform: "darwin",
  arch: "arm64",
  totalMemoryGB: 16,
  cpuModel: "Apple M4",
  storageGB: 256,
};

const BIRTH_TIME = new Date("2026-01-01T00:00:00Z");

/**
 * Helper: run N interactions on an entity state, returning the updated state.
 * Spaces interactions 1 minute apart starting from `startTime`.
 */
function runInteractions(
  state: ReturnType<typeof createEntityState>,
  count: number,
  startTime: Date,
) {
  let current = state;
  for (let i = 0; i < count; i++) {
    const result = processInteraction(
      current,
      { tone: "neutral", messageLength: 30 },
      new Date(startTime.getTime() + i * 60_000),
    );
    current = result.updatedState;
  }
  return current;
}

// ============================================================
// 1. Initial state
// ============================================================

describe("1. Initial state: new entity starts at level 0", () => {
  it("has language level 0 (SymbolsOnly)", () => {
    const seed = createFixedSeed({ hardwareBody: TEST_HW, createdAt: BIRTH_TIME.toISOString() });
    const state = createEntityState(seed, BIRTH_TIME);

    expect(state.language.level).toBe(LanguageLevel.SymbolsOnly);
    expect(state.status.languageLevel).toBe(0);
  });

  it("has no patterns initially", () => {
    const seed = createFixedSeed({ hardwareBody: TEST_HW, createdAt: BIRTH_TIME.toISOString() });
    const state = createEntityState(seed, BIRTH_TIME);

    expect(state.language.patterns).toHaveLength(0);
  });

  it("has zero total interactions", () => {
    const seed = createFixedSeed({ hardwareBody: TEST_HW, createdAt: BIRTH_TIME.toISOString() });
    const state = createEntityState(seed, BIRTH_TIME);

    expect(state.language.totalInteractions).toBe(0);
  });

  it("has species-specific native symbols (chromatic default)", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      perception: "chromatic",
      createdAt: BIRTH_TIME.toISOString(),
    });
    const state = createEntityState(seed, BIRTH_TIME);

    expect(state.language.nativeSymbols).toEqual(PERCEPTION_SYMBOLS.chromatic);
  });
});

// ============================================================
// 2. Interaction counting
// ============================================================

describe("2. Interaction counting: processInteraction increments totalInteractions", () => {
  it("increments by 1 per interaction", () => {
    const seed = createFixedSeed({ hardwareBody: TEST_HW, createdAt: BIRTH_TIME.toISOString() });
    let state = createEntityState(seed, BIRTH_TIME);

    const result = processInteraction(
      state,
      { tone: "neutral", messageLength: 20 },
      new Date("2026-01-01T01:00:00Z"),
    );

    expect(result.updatedState.language.totalInteractions).toBe(1);
  });

  it("accumulates over multiple interactions", () => {
    const seed = createFixedSeed({ hardwareBody: TEST_HW, createdAt: BIRTH_TIME.toISOString() });
    let state = createEntityState(seed, BIRTH_TIME);

    state = runInteractions(state, 15, new Date("2026-01-01T01:00:00Z"));

    expect(state.language.totalInteractions).toBe(15);
  });

  it("recordInteraction (low-level) increments correctly", () => {
    const lang = createInitialLanguageState("chromatic");
    expect(lang.totalInteractions).toBe(0);

    const updated = recordInteraction(lang);
    expect(updated.totalInteractions).toBe(1);

    const updated2 = recordInteraction(updated);
    expect(updated2.totalInteractions).toBe(2);
  });
});

// ============================================================
// 3. Level progression
// ============================================================

describe("3. Level progression: correct thresholds for level transitions", () => {
  it("stays at level 0 with interactions but not enough days", () => {
    const lang = createInitialLanguageState("chromatic");
    // 50 interactions but day 0
    const withInteractions = { ...lang, totalInteractions: 50 };
    const level = evaluateLanguageLevel(withInteractions, 0);

    expect(level).toBe(LanguageLevel.SymbolsOnly);
  });

  it("stays at level 0 with enough days but not enough interactions", () => {
    const lang = createInitialLanguageState("chromatic");
    // Day 30 but only 5 interactions
    const withInteractions = { ...lang, totalInteractions: 5 };
    const level = evaluateLanguageLevel(withInteractions, 30);

    expect(level).toBe(LanguageLevel.SymbolsOnly);
  });

  it("reaches level 1 at day 7 with 30 interactions", () => {
    const lang = createInitialLanguageState("chromatic");
    const withInteractions = { ...lang, totalInteractions: 30 };
    const level = evaluateLanguageLevel(withInteractions, 7);

    expect(level).toBe(LanguageLevel.PatternEstablishment);
  });

  it("reaches level 2 at day 21 with 100 interactions", () => {
    const lang = createInitialLanguageState("vibration");
    const withInteractions = { ...lang, totalInteractions: 100 };
    const level = evaluateLanguageLevel(withInteractions, 21);

    expect(level).toBe(LanguageLevel.BridgeToLanguage);
  });

  it("reaches level 3 at day 45 with 250 interactions", () => {
    const lang = createInitialLanguageState("geometric");
    const withInteractions = { ...lang, totalInteractions: 250 };
    const level = evaluateLanguageLevel(withInteractions, 45);

    expect(level).toBe(LanguageLevel.UniqueLanguage);
  });

  it("reaches level 4 at day 90 with 500 interactions", () => {
    const lang = createInitialLanguageState("thermal");
    const withInteractions = { ...lang, totalInteractions: 500 };
    const level = evaluateLanguageLevel(withInteractions, 90);

    expect(level).toBe(LanguageLevel.AdvancedOperation);
  });

  it("level 1 requires exactly day >= 7 (day 6 is too early)", () => {
    const lang = createInitialLanguageState("chromatic");
    const withInteractions = { ...lang, totalInteractions: 100 };

    expect(evaluateLanguageLevel(withInteractions, 6)).toBe(LanguageLevel.SymbolsOnly);
    expect(evaluateLanguageLevel(withInteractions, 7)).toBe(LanguageLevel.PatternEstablishment);
  });

  it("level progression through full lifecycle via processInteraction", () => {
    // Create entity born on Jan 1
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_TIME.toISOString(),
    });
    let state = createEntityState(seed, BIRTH_TIME);

    // Day 0: 30 interactions — not enough days for level 1
    state = runInteractions(state, 30, new Date("2026-01-01T10:00:00Z"));
    expect(state.language.totalInteractions).toBe(30);
    expect(state.status.languageLevel).toBe(LanguageLevel.SymbolsOnly);

    // Day 8 (Jan 9): 1 more interaction — now has 31 interactions + day 8
    const day8 = new Date("2026-01-09T10:00:00Z");
    const result = processInteraction(
      state,
      { tone: "neutral", messageLength: 20 },
      day8,
    );
    state = result.updatedState;

    expect(state.language.totalInteractions).toBe(31);
    expect(state.status.languageLevel).toBe(LanguageLevel.PatternEstablishment);
  });
});

// ============================================================
// 4. Pattern recording
// ============================================================

describe("4. Pattern recording: patterns grow through interactions", () => {
  it("establishes a new pattern", () => {
    const lang = createInitialLanguageState("chromatic");
    const updated = establishPattern(lang, "◎●", "greeting", 5);

    expect(updated.patterns).toHaveLength(1);
    expect(updated.patterns[0].symbol).toBe("◎●");
    expect(updated.patterns[0].meaning).toBe("greeting");
    expect(updated.patterns[0].establishedDay).toBe(5);
    expect(updated.patterns[0].usageCount).toBe(1);
  });

  it("increments usage count for existing patterns", () => {
    let lang = createInitialLanguageState("chromatic");
    lang = establishPattern(lang, "◎●", "greeting", 5);
    lang = establishPattern(lang, "◎●", "greeting", 10);

    expect(lang.patterns).toHaveLength(1);
    expect(lang.patterns[0].usageCount).toBe(2);
  });

  it("accumulates multiple distinct patterns", () => {
    let lang = createInitialLanguageState("vibration");
    lang = establishPattern(lang, "◈◇", "greeting", 3);
    lang = establishPattern(lang, "△▲", "curiosity", 5);
    lang = establishPattern(lang, "◆▽", "farewell", 7);

    expect(lang.patterns).toHaveLength(3);
    expect(lang.patterns.map((p) => p.meaning)).toEqual(["greeting", "curiosity", "farewell"]);
  });
});

// ============================================================
// 5. Species-specific symbols
// ============================================================

describe("5. Species-specific symbols: each perception mode has unique native symbols", () => {
  it("chromatic entities get chromatic symbols", () => {
    const lang = createInitialLanguageState("chromatic");
    expect(lang.nativeSymbols).toEqual(["◎", "○", "●", "☆", "★", "◉"]);
  });

  it("vibration entities get vibration symbols", () => {
    const lang = createInitialLanguageState("vibration");
    expect(lang.nativeSymbols).toEqual(["◈", "◇", "◆", "△", "▲", "▽"]);
  });

  it("geometric entities get geometric symbols", () => {
    const lang = createInitialLanguageState("geometric");
    expect(lang.nativeSymbols).toEqual(["■", "□", "△", "▽", "◇", "◆"]);
  });

  it("thermal entities get thermal symbols", () => {
    const lang = createInitialLanguageState("thermal");
    expect(lang.nativeSymbols).toEqual(["●", "○", "◎", "◉", "☆", "★"]);
  });

  it("temporal entities get temporal symbols", () => {
    const lang = createInitialLanguageState("temporal");
    expect(lang.nativeSymbols).toEqual(["○", "◎", "◉", "△", "▽", "☆"]);
  });

  it("chemical entities get chemical symbols", () => {
    const lang = createInitialLanguageState("chemical");
    expect(lang.nativeSymbols).toEqual(["◆", "◈", "●", "◉", "■", "★"]);
  });

  it("species-specific symbols carry through createEntityState", () => {
    const perceptions: PerceptionMode[] = ["chromatic", "vibration", "geometric"];
    for (const perception of perceptions) {
      const seed = createFixedSeed({
        hardwareBody: TEST_HW,
        perception,
        createdAt: BIRTH_TIME.toISOString(),
      });
      const state = createEntityState(seed, BIRTH_TIME);
      expect(state.language.nativeSymbols).toEqual(PERCEPTION_SYMBOLS[perception]);
    }
  });
});

// ============================================================
// 6. Language level in status
// ============================================================

describe("6. Language level in status: status.languageLevel matches language.level", () => {
  it("initial status languageLevel is 0", () => {
    const seed = createFixedSeed({ hardwareBody: TEST_HW, createdAt: BIRTH_TIME.toISOString() });
    const state = createEntityState(seed, BIRTH_TIME);

    expect(state.status.languageLevel).toBe(state.language.level);
    expect(state.status.languageLevel).toBe(0);
  });

  it("status languageLevel updates after interaction triggers level change", () => {
    // Born long enough ago to meet day threshold for level 1
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: "2026-01-01T00:00:00Z",
    });
    let state = createEntityState(seed, BIRTH_TIME);

    // Day 10: run 30 interactions
    const day10 = new Date("2026-01-11T10:00:00Z");
    state = runInteractions(state, 30, day10);

    expect(state.status.languageLevel).toBe(LanguageLevel.PatternEstablishment);
    expect(state.status.languageLevel).toBe(state.language.level);
  });

  it("status languageLevel updates after interaction triggers level 2", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: "2026-01-01T00:00:00Z",
    });
    let state = createEntityState(seed, BIRTH_TIME);

    // Day 22: run 100 interactions
    const day22 = new Date("2026-01-23T10:00:00Z");
    state = runInteractions(state, 100, day22);

    expect(state.status.languageLevel).toBe(LanguageLevel.BridgeToLanguage);
    expect(state.status.languageLevel).toBe(state.language.level);
  });
});

// ============================================================
// 7. Heartbeat evaluates language
// ============================================================

describe("7. Heartbeat evaluates language: processHeartbeat updates language level", () => {
  it("heartbeat updates language level when thresholds are met", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: "2026-01-01T00:00:00Z",
    });
    let state = createEntityState(seed, BIRTH_TIME);

    // Accumulate 30 interactions on day 0 (won't trigger level 1 yet — day < 7)
    state = runInteractions(state, 30, new Date("2026-01-01T10:00:00Z"));
    expect(state.language.level).toBe(LanguageLevel.SymbolsOnly);

    // Heartbeat on day 8 should evaluate language level to 1
    const day8 = new Date("2026-01-09T14:00:00Z");
    const hbResult = processHeartbeat(state, day8);

    expect(hbResult.updatedState.language.level).toBe(LanguageLevel.PatternEstablishment);
    expect(hbResult.updatedState.status.languageLevel).toBe(LanguageLevel.PatternEstablishment);
  });

  it("heartbeat does not change level when thresholds are not met", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: "2026-01-01T00:00:00Z",
    });
    let state = createEntityState(seed, BIRTH_TIME);

    // Only 5 interactions
    state = runInteractions(state, 5, new Date("2026-01-01T10:00:00Z"));

    // Heartbeat on day 30 — enough days but not enough interactions
    const day30 = new Date("2026-01-31T14:00:00Z");
    const hbResult = processHeartbeat(state, day30);

    expect(hbResult.updatedState.language.level).toBe(LanguageLevel.SymbolsOnly);
  });
});

// ============================================================
// 8. Language in serialized state
// ============================================================

describe("8. Language in serialized state: serializeState produces correct languageMd", () => {
  it("initial state serializes with level 0 and no patterns", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      perception: "chromatic",
      createdAt: BIRTH_TIME.toISOString(),
    });
    const state = createEntityState(seed, BIRTH_TIME);
    const { languageMd } = serializeState(state);

    expect(languageMd).toContain("Current Level: 0 (Symbols Only)");
    expect(languageMd).toContain("◎ ○ ● ☆ ★ ◉");
    expect(languageMd).toContain("No patterns established yet");
    expect(languageMd).toContain("Total interactions: 0");
  });

  it("serialized state reflects level after progression", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: "2026-01-01T00:00:00Z",
    });
    let state = createEntityState(seed, BIRTH_TIME);

    // Day 10 with 30 interactions → level 1
    const day10 = new Date("2026-01-11T10:00:00Z");
    state = runInteractions(state, 30, day10);

    const { languageMd } = serializeState(state);

    expect(languageMd).toContain("Current Level: 1 (Pattern Establishment)");
    expect(languageMd).toContain("Total interactions: 30");
  });

  it("formatLanguageMd includes established patterns", () => {
    let lang = createInitialLanguageState("vibration");
    lang = { ...lang, totalInteractions: 50, level: LanguageLevel.PatternEstablishment };
    lang = establishPattern(lang, "◈◇", "greeting", 5);
    lang = establishPattern(lang, "△▲", "surprise", 8);

    const md = formatLanguageMd(lang);

    expect(md).toContain("◈◇ = greeting (Day 5, used 1x)");
    expect(md).toContain("△▲ = surprise (Day 8, used 1x)");
    expect(md).toContain("Total interactions: 50");
  });

  it("statusMd includes correct language level field", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: "2026-01-01T00:00:00Z",
    });
    let state = createEntityState(seed, BIRTH_TIME);

    // Push to level 1
    const day10 = new Date("2026-01-11T10:00:00Z");
    state = runInteractions(state, 30, day10);

    const { statusMd } = serializeState(state);
    expect(statusMd).toContain("**level**: 1");
  });
});

// ============================================================
// 9. Language affects growth milestones
// ============================================================

describe("9. Language affects growth milestones: milestone fires on level transitions", () => {
  it("'Pattern Establishment' milestone fires when level reaches 1", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: "2026-01-01T00:00:00Z",
    });
    let state = createEntityState(seed, BIRTH_TIME);

    // Pre-populate 29 interactions on day 0
    state = runInteractions(state, 29, new Date("2026-01-01T10:00:00Z"));
    expect(state.language.level).toBe(LanguageLevel.SymbolsOnly);

    // The 30th interaction on day 8 should trigger level 1 and the milestone
    const day8 = new Date("2026-01-09T10:00:00Z");
    const result = processInteraction(
      state,
      { tone: "positive", messageLength: 30 },
      day8,
    );

    expect(result.updatedState.language.level).toBe(LanguageLevel.PatternEstablishment);

    // Check that the milestone was detected
    const milestoneIds = result.updatedState.growth.milestones.map((m) => m.id);
    expect(milestoneIds).toContain("language_level_1");
  });

  it("milestone for 'first_interaction' fires on the first processInteraction", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_TIME.toISOString(),
    });
    const state = createEntityState(seed, BIRTH_TIME);

    const result = processInteraction(
      state,
      { tone: "neutral", messageLength: 10 },
      new Date("2026-01-01T01:00:00Z"),
    );

    const milestoneIds = result.updatedState.growth.milestones.map((m) => m.id);
    expect(milestoneIds).toContain("first_interaction");
  });

  it("milestone for '10_interactions' fires after 10 interactions", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_TIME.toISOString(),
    });
    let state = createEntityState(seed, BIRTH_TIME);

    state = runInteractions(state, 10, new Date("2026-01-01T10:00:00Z"));

    const milestoneIds = state.growth.milestones.map((m) => m.id);
    expect(milestoneIds).toContain("10_interactions");
  });
});

// ============================================================
// 10. Language affects asymmetry
// ============================================================

describe("10. Language affects asymmetry: higher language level increases languageMaturity signal", () => {
  it("initial entity has languageMaturity of 0", () => {
    const seed = createFixedSeed({ hardwareBody: TEST_HW, createdAt: BIRTH_TIME.toISOString() });
    const state = createEntityState(seed, BIRTH_TIME);

    expect(state.asymmetry.signals.languageMaturity).toBe(0);
  });

  it("languageMaturity increases after heartbeat when language level rises", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: "2026-01-01T00:00:00Z",
    });
    let state = createEntityState(seed, BIRTH_TIME);

    // Get 30 interactions for level 1
    state = runInteractions(state, 30, new Date("2026-01-01T10:00:00Z"));

    // Heartbeat on day 8 — triggers level 1 and asymmetry evaluation
    const day8 = new Date("2026-01-09T14:00:00Z");
    const hbResult = processHeartbeat(state, day8);

    expect(hbResult.updatedState.language.level).toBe(LanguageLevel.PatternEstablishment);
    // languageMaturity = (languageLevel / 4) * 100 = 25
    expect(hbResult.updatedState.asymmetry.signals.languageMaturity).toBe(25);
  });

  it("languageMaturity scales proportionally with language level", () => {
    // Level 0 → 0, Level 1 → 25, Level 2 → 50, Level 3 → 75, Level 4 → 100
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: "2025-10-01T00:00:00Z", // Far enough in the past for level 4
    });
    let state = createEntityState(seed, new Date("2025-10-01T00:00:00Z"));

    // 500 interactions for level 4
    const interactionTime = new Date("2025-10-01T10:00:00Z");
    state = runInteractions(state, 500, interactionTime);

    // Heartbeat on day 91 — well past all thresholds
    const day91 = new Date("2025-12-31T14:00:00Z");
    const hbResult = processHeartbeat(state, day91);

    expect(hbResult.updatedState.language.level).toBe(LanguageLevel.AdvancedOperation);
    expect(hbResult.updatedState.asymmetry.signals.languageMaturity).toBe(100);
  });

  it("asymmetry score increases as language matures", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: "2026-01-01T00:00:00Z",
    });
    let state = createEntityState(seed, BIRTH_TIME);

    // Initial score
    const initialScore = state.asymmetry.score;

    // Accumulate interactions
    state = runInteractions(state, 30, new Date("2026-01-01T10:00:00Z"));

    // Heartbeat on day 8 to trigger asymmetry evaluation
    const day8 = new Date("2026-01-09T14:00:00Z");
    const hbResult = processHeartbeat(state, day8);

    expect(hbResult.updatedState.asymmetry.score).toBeGreaterThan(initialScore);
  });
});

// ============================================================
// Bonus: Full lifecycle simulation
// ============================================================

describe("Full lifecycle: entity language journey from birth to advanced", () => {
  it("simulates level 0 through level 2 with interactions and heartbeats", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      perception: "vibration",
      createdAt: "2026-01-01T00:00:00Z",
    });
    let state = createEntityState(seed, BIRTH_TIME);

    // Verify starting state
    expect(state.language.level).toBe(LanguageLevel.SymbolsOnly);
    expect(state.language.nativeSymbols).toEqual(PERCEPTION_SYMBOLS.vibration);

    // Phase 1: Day 0-6, accumulate 30 interactions
    state = runInteractions(state, 30, new Date("2026-01-03T10:00:00Z"));
    expect(state.language.level).toBe(LanguageLevel.SymbolsOnly); // Not enough days

    // Phase 2: Heartbeat on day 7 triggers level 1
    const day7 = new Date("2026-01-08T14:00:00Z");
    const hb1 = processHeartbeat(state, day7);
    state = hb1.updatedState;
    expect(state.language.level).toBe(LanguageLevel.PatternEstablishment);
    expect(state.status.languageLevel).toBe(1);

    // Phase 3: Accumulate more interactions (bring total to 100)
    state = runInteractions(state, 70, new Date("2026-01-15T10:00:00Z"));
    expect(state.language.totalInteractions).toBe(100);

    // Phase 4: Heartbeat on day 22 triggers level 2
    const day22 = new Date("2026-01-23T14:00:00Z");
    const hb2 = processHeartbeat(state, day22);
    state = hb2.updatedState;
    expect(state.language.level).toBe(LanguageLevel.BridgeToLanguage);
    expect(state.status.languageLevel).toBe(2);

    // Verify serialized output reflects the journey
    const { languageMd, statusMd } = serializeState(state);
    expect(languageMd).toContain("Current Level: 2 (Bridge to Language)");
    expect(languageMd).toContain("Total interactions: 100");
    expect(statusMd).toContain("**level**: 2");
  });
});
