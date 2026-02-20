import { describe, it, expect } from "vitest";
import {
  createInitialLanguageState,
  evaluateLanguageLevel,
  generateExpression,
  recordInteraction,
  establishPattern,
  formatLanguageMd,
  PERCEPTION_SYMBOLS,
  type LanguageState,
} from "../../src/language/language-engine.js";
import { LanguageLevel, type Status, type PerceptionMode } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    mood: 50,
    energy: 50,
    curiosity: 50,
    comfort: 50,
    languageLevel: LanguageLevel.SymbolsOnly,
    perceptionLevel: 0,
    growthDay: 0,
    lastInteraction: "never",
    ...overrides,
  };
}

function stateWithInteractions(
  perception: PerceptionMode,
  interactions: number,
  level?: LanguageLevel,
): LanguageState {
  const base = createInitialLanguageState(perception);
  return {
    ...base,
    totalInteractions: interactions,
    level: level ?? base.level,
  };
}

const ALL_SPECIES: PerceptionMode[] = [
  "chromatic",
  "vibration",
  "geometric",
  "thermal",
  "temporal",
  "chemical",
];

// ---------------------------------------------------------------------------
// 1. createInitialLanguageState — per-species symbol sets
// ---------------------------------------------------------------------------

describe("createInitialLanguageState — species-specific symbols", () => {
  it("every species gets exactly 6 native symbols matching PERCEPTION_SYMBOLS", () => {
    for (const species of ALL_SPECIES) {
      const state = createInitialLanguageState(species);
      expect(state.nativeSymbols).toHaveLength(6);
      expect(state.nativeSymbols).toEqual(PERCEPTION_SYMBOLS[species]);
    }
  });

  it("assigns correct symbol sets for each of the 6 species", () => {
    expect(createInitialLanguageState("chromatic").nativeSymbols)
      .toEqual(["◎", "○", "●", "☆", "★", "◉"]);
    expect(createInitialLanguageState("vibration").nativeSymbols)
      .toEqual(["◈", "◇", "◆", "△", "▲", "▽"]);
    expect(createInitialLanguageState("geometric").nativeSymbols)
      .toEqual(["■", "□", "△", "▽", "◇", "◆"]);
    expect(createInitialLanguageState("thermal").nativeSymbols)
      .toEqual(["●", "○", "◎", "◉", "☆", "★"]);
    expect(createInitialLanguageState("temporal").nativeSymbols)
      .toEqual(["○", "◎", "◉", "△", "▽", "☆"]);
    expect(createInitialLanguageState("chemical").nativeSymbols)
      .toEqual(["◆", "◈", "●", "◉", "■", "★"]);
  });

  it("all species start at SymbolsOnly with zero interactions and no patterns", () => {
    for (const sp of ALL_SPECIES) {
      const state = createInitialLanguageState(sp);
      expect(state.level).toBe(LanguageLevel.SymbolsOnly);
      expect(state.totalInteractions).toBe(0);
      expect(state.patterns).toEqual([]);
    }
  });

  it("each species has a distinct symbol set (no two identical)", () => {
    const sets = ALL_SPECIES.map(
      (sp) => createInitialLanguageState(sp).nativeSymbols.join(","),
    );
    const unique = new Set(sets);
    expect(unique.size).toBe(ALL_SPECIES.length);
  });
});

// ---------------------------------------------------------------------------
// 2. evaluateLanguageLevel — exact thresholds for all 5 levels
// ---------------------------------------------------------------------------

describe("evaluateLanguageLevel — threshold boundaries", () => {
  // Level 0 → 1: day >= 7, interactions >= 30
  it("does not advance to PatternEstablishment when days or interactions are below threshold", () => {
    // days below threshold
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 30), 6))
      .toBe(LanguageLevel.SymbolsOnly);
    // interactions below threshold
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 29), 7))
      .toBe(LanguageLevel.SymbolsOnly);
  });

  it("advances to PatternEstablishment at exactly day 7 and 30 interactions", () => {
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 30), 7))
      .toBe(LanguageLevel.PatternEstablishment);
  });

  // Level 1 → 2: day >= 21, interactions >= 100
  it("does not advance to BridgeToLanguage when days or interactions are below threshold", () => {
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 100), 20))
      .toBe(LanguageLevel.PatternEstablishment);
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 99), 21))
      .toBe(LanguageLevel.PatternEstablishment);
  });

  it("advances to BridgeToLanguage at exactly day 21 and 100 interactions", () => {
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 100), 21))
      .toBe(LanguageLevel.BridgeToLanguage);
  });

  // Level 2 → 3: day >= 45, interactions >= 250
  it("does not advance to UniqueLanguage when days or interactions are below threshold", () => {
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 250), 44))
      .toBe(LanguageLevel.BridgeToLanguage);
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 249), 45))
      .toBe(LanguageLevel.BridgeToLanguage);
  });

  it("advances to UniqueLanguage at exactly day 45 and 250 interactions", () => {
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 250), 45))
      .toBe(LanguageLevel.UniqueLanguage);
  });

  // Level 3 → 4: day >= 90, interactions >= 500
  it("does not advance to AdvancedOperation when days or interactions are below threshold", () => {
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 500), 89))
      .toBe(LanguageLevel.UniqueLanguage);
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 499), 90))
      .toBe(LanguageLevel.UniqueLanguage);
  });

  it("advances to AdvancedOperation at exactly day 90 and 500 interactions", () => {
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 500), 90))
      .toBe(LanguageLevel.AdvancedOperation);
  });

  it("remains AdvancedOperation well past thresholds (day 365, 10000 interactions)", () => {
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 10000), 365))
      .toBe(LanguageLevel.AdvancedOperation);
  });

  it("returns the highest qualifying level when multiple thresholds are met", () => {
    // Day 30 + 150 interactions meets both Level 1 and Level 2 thresholds
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 150), 30))
      .toBe(LanguageLevel.BridgeToLanguage);
  });
});

// ---------------------------------------------------------------------------
// 3. Edge cases: impossible / degenerate scenarios
// ---------------------------------------------------------------------------

describe("evaluateLanguageLevel — edge cases", () => {
  it("stays SymbolsOnly at day 0 regardless of interactions (level 4 impossible)", () => {
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 999), 0))
      .toBe(LanguageLevel.SymbolsOnly);
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 50000), 0))
      .toBe(LanguageLevel.SymbolsOnly);
  });

  it("stays SymbolsOnly with lopsided conditions (many interactions few days, or many days zero interactions)", () => {
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 10000), 3))
      .toBe(LanguageLevel.SymbolsOnly);
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 0), 365))
      .toBe(LanguageLevel.SymbolsOnly);
  });

  it("exact boundary uses >= semantics for all 4 advancement thresholds", () => {
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 30), 7))
      .toBe(LanguageLevel.PatternEstablishment);
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 100), 21))
      .toBe(LanguageLevel.BridgeToLanguage);
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 250), 45))
      .toBe(LanguageLevel.UniqueLanguage);
    expect(evaluateLanguageLevel(stateWithInteractions("chromatic", 500), 90))
      .toBe(LanguageLevel.AdvancedOperation);
  });
});

// ---------------------------------------------------------------------------
// 4. recordInteraction — totalInteractions tracking
// ---------------------------------------------------------------------------

describe("recordInteraction — tracking accuracy", () => {
  it("increments from 0 to 1 and tracks accurately over 100 sequential calls", () => {
    let state = createInitialLanguageState("vibration");
    state = recordInteraction(state);
    expect(state.totalInteractions).toBe(1);
    for (let i = 0; i < 99; i++) {
      state = recordInteraction(state);
    }
    expect(state.totalInteractions).toBe(100);
  });

  it("does not mutate the original state (immutability)", () => {
    const original = createInitialLanguageState("geometric");
    const updated = recordInteraction(original);
    expect(original.totalInteractions).toBe(0);
    expect(updated.totalInteractions).toBe(1);
  });

  it("preserves patterns, nativeSymbols, and level through interactions", () => {
    let state = createInitialLanguageState("thermal");
    state = establishPattern(state, "●○", "warmth", 2);
    state = recordInteraction(state);
    expect(state.patterns).toHaveLength(1);
    expect(state.patterns[0].symbol).toBe("●○");
    expect(state.nativeSymbols).toEqual(PERCEPTION_SYMBOLS["thermal"]);
    expect(state.level).toBe(LanguageLevel.SymbolsOnly);
  });
});

// ---------------------------------------------------------------------------
// 5. establishPattern — registration and deduplication
// ---------------------------------------------------------------------------

describe("establishPattern — pattern registration and deduplication", () => {
  it("adds a new pattern with usageCount 1 and correct fields", () => {
    const state = createInitialLanguageState("chromatic");
    const updated = establishPattern(state, "◎○", "hello", 5);
    expect(updated.patterns).toHaveLength(1);
    expect(updated.patterns[0]).toEqual({
      symbol: "◎○",
      meaning: "hello",
      establishedDay: 5,
      usageCount: 1,
    });
  });

  it("deduplicates by symbol — increments usageCount, preserves original establishedDay", () => {
    let state = createInitialLanguageState("chromatic");
    state = establishPattern(state, "◎○", "hello", 5);
    state = establishPattern(state, "◎○", "hello", 10);
    state = establishPattern(state, "◎○", "hello", 15);
    expect(state.patterns).toHaveLength(1);
    expect(state.patterns[0].usageCount).toBe(3);
    expect(state.patterns[0].establishedDay).toBe(5);
  });

  it("allows multiple distinct patterns and does not mutate original state", () => {
    const original = createInitialLanguageState("vibration");
    let state = establishPattern(original, "◈◇", "greeting", 1);
    state = establishPattern(state, "△▲", "excitement", 3);
    state = establishPattern(state, "◆▽", "calm", 7);
    expect(state.patterns).toHaveLength(3);
    expect(state.patterns.map((p) => p.symbol)).toEqual(["◈◇", "△▲", "◆▽"]);
    // Original untouched
    expect(original.patterns).toHaveLength(0);
  });

  it("correctly increments one pattern among many without affecting others", () => {
    let state = createInitialLanguageState("temporal");
    state = establishPattern(state, "○◎", "cycle", 1);
    state = establishPattern(state, "◉△", "shift", 2);
    state = establishPattern(state, "○◎", "cycle", 5);
    expect(state.patterns).toHaveLength(2);
    expect(state.patterns.find((p) => p.symbol === "○◎")!.usageCount).toBe(2);
    expect(state.patterns.find((p) => p.symbol === "◉△")!.usageCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6. generateExpression — output validation per level
// ---------------------------------------------------------------------------

describe("generateExpression — level-based output", () => {
  it("level 0 output uses only native symbols (verified across 20 runs)", () => {
    const state = createInitialLanguageState("chromatic");
    for (let i = 0; i < 20; i++) {
      const expr = generateExpression(state, makeStatus());
      for (const char of expr) {
        expect(state.nativeSymbols).toContain(char);
      }
    }
  });

  it("level 1 (PatternEstablishment) sometimes prepends an established pattern", () => {
    let state: LanguageState = {
      ...createInitialLanguageState("chromatic"),
      level: LanguageLevel.PatternEstablishment,
      totalInteractions: 35,
    };
    state = establishPattern(state, "◎◎", "greeting", 7);

    let patternAppeared = false;
    for (let i = 0; i < 100; i++) {
      const expr = generateExpression(state, makeStatus());
      if (expr.startsWith("◎◎")) {
        patternAppeared = true;
        break;
      }
    }
    expect(patternAppeared).toBe(true);
  });

  it("level 2 (BridgeToLanguage) sometimes includes word fragments", () => {
    const state: LanguageState = {
      ...createInitialLanguageState("vibration"),
      level: LanguageLevel.BridgeToLanguage,
      totalInteractions: 120,
    };

    const fragments = ["...", "nn", "ah", "mm", "uu"];
    let fragmentFound = false;
    for (let i = 0; i < 100; i++) {
      const expr = generateExpression(state, makeStatus());
      if (fragments.some((f) => expr.includes(f))) {
        fragmentFound = true;
        break;
      }
    }
    expect(fragmentFound).toBe(true);
  });

  it("level 3 (UniqueLanguage) and level 4 (AdvancedOperation) return non-empty expressions", () => {
    const level3State: LanguageState = {
      ...createInitialLanguageState("geometric"),
      level: LanguageLevel.UniqueLanguage,
      totalInteractions: 300,
    };
    expect(generateExpression(level3State, makeStatus()).length).toBeGreaterThan(0);

    const level4State: LanguageState = {
      ...createInitialLanguageState("thermal"),
      level: LanguageLevel.AdvancedOperation,
      totalInteractions: 600,
    };
    expect(generateExpression(level4State, makeStatus()).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 7. generateExpression — mood and energy influence
// ---------------------------------------------------------------------------

describe("generateExpression — mood and energy influence", () => {
  it("high mood (>65) restricts output to first half of native symbols", () => {
    const state = createInitialLanguageState("chromatic");
    const firstHalf = state.nativeSymbols.slice(0, Math.ceil(state.nativeSymbols.length / 2));

    for (let i = 0; i < 30; i++) {
      const expr = generateExpression(state, makeStatus({ mood: 80, energy: 60 }));
      for (const char of expr) {
        expect(firstHalf).toContain(char);
      }
    }
  });

  it("low mood (<35) restricts output to second half of native symbols", () => {
    const state = createInitialLanguageState("chromatic");
    const secondHalf = state.nativeSymbols.slice(Math.ceil(state.nativeSymbols.length / 2));

    for (let i = 0; i < 30; i++) {
      const expr = generateExpression(state, makeStatus({ mood: 20, energy: 60 }));
      for (const char of expr) {
        expect(secondHalf).toContain(char);
      }
    }
  });

  it("neutral mood (35-65) can produce symbols from both halves", () => {
    const state = createInitialLanguageState("chromatic");
    const allChars = new Set<string>();

    for (let i = 0; i < 200; i++) {
      const expr = generateExpression(state, makeStatus({ mood: 50, energy: 60 }));
      for (const char of expr) {
        allChars.add(char);
      }
    }
    expect(allChars.size).toBeGreaterThan(3);
  });

  it("high energy produces more symbols on average than low energy", () => {
    const state = createInitialLanguageState("vibration");

    const highLengths: number[] = [];
    const lowLengths: number[] = [];
    for (let i = 0; i < 100; i++) {
      highLengths.push(generateExpression(state, makeStatus({ energy: 90 })).replace(/ /g, "").length);
      lowLengths.push(generateExpression(state, makeStatus({ energy: 10 })).replace(/ /g, "").length);
    }

    const avgHigh = highLengths.reduce((a, b) => a + b, 0) / highLengths.length;
    const avgLow = lowLengths.reduce((a, b) => a + b, 0) / lowLengths.length;
    expect(avgHigh).toBeGreaterThan(avgLow);
  });

  it("high energy (>50) produces 2-7 symbols per expression", () => {
    const state = createInitialLanguageState("geometric");
    for (let i = 0; i < 50; i++) {
      const expr = generateExpression(state, makeStatus({ energy: 80 }));
      expect(expr.length).toBeGreaterThanOrEqual(2);
      expect(expr.length).toBeLessThanOrEqual(7);
    }
  });

  it("low energy (<=50) produces 1-3 symbols per expression", () => {
    const state = createInitialLanguageState("geometric");
    for (let i = 0; i < 50; i++) {
      const expr = generateExpression(state, makeStatus({ energy: 10 }));
      expect(expr.length).toBeGreaterThanOrEqual(1);
      expect(expr.length).toBeLessThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. formatLanguageMd — markdown output for each level
// ---------------------------------------------------------------------------

describe("formatLanguageMd — markdown output per level", () => {
  it("displays correct level name for each of the 5 levels", () => {
    const levelNames: [LanguageLevel, string][] = [
      [LanguageLevel.SymbolsOnly, "0 (Symbols Only)"],
      [LanguageLevel.PatternEstablishment, "1 (Pattern Establishment)"],
      [LanguageLevel.BridgeToLanguage, "2 (Bridge to Language)"],
      [LanguageLevel.UniqueLanguage, "3 (Unique Language)"],
      [LanguageLevel.AdvancedOperation, "4 (Advanced Operation)"],
    ];

    for (const [level, name] of levelNames) {
      const state: LanguageState = {
        ...createInitialLanguageState("chromatic"),
        level,
      };
      const md = formatLanguageMd(state);
      expect(md).toContain(`## Current Level: ${name}`);
    }
  });

  it("shows placeholder text when no patterns exist, lists them when they do", () => {
    // Empty patterns
    const emptyState = createInitialLanguageState("vibration");
    expect(formatLanguageMd(emptyState)).toContain("No patterns established yet");

    // With patterns
    let withPatterns = createInitialLanguageState("chromatic");
    withPatterns = establishPattern(withPatterns, "◎○", "hello", 3);
    withPatterns = establishPattern(withPatterns, "●☆", "goodbye", 10);
    const md = formatLanguageMd(withPatterns);
    expect(md).toContain("- ◎○ = hello (Day 3, used 1x)");
    expect(md).toContain("- ●☆ = goodbye (Day 10, used 1x)");
    expect(md).not.toContain("No patterns established yet");
  });

  it("shows updated usageCount after deduplication", () => {
    let state = createInitialLanguageState("chromatic");
    state = establishPattern(state, "◎◎", "joy", 2);
    state = establishPattern(state, "◎◎", "joy", 5);
    state = establishPattern(state, "◎◎", "joy", 8);
    expect(formatLanguageMd(state)).toContain("- ◎◎ = joy (Day 2, used 3x)");
  });

  it("includes totalInteractions, native symbols, and structural sections", () => {
    const state: LanguageState = {
      ...createInitialLanguageState("thermal"),
      totalInteractions: 42,
    };
    const md = formatLanguageMd(state);
    expect(md).toContain("# LANGUAGE");
    expect(md).toContain("## Acquired Patterns");
    expect(md).toContain("## Stats");
    expect(md).toContain("- Total interactions: 42");
    expect(md).toContain(`Available symbols: ${state.nativeSymbols.join(" ")}`);
  });

  it("includes correct native symbols line for every species", () => {
    for (const species of ALL_SPECIES) {
      const state = createInitialLanguageState(species);
      const md = formatLanguageMd(state);
      expect(md).toContain(`Available symbols: ${state.nativeSymbols.join(" ")}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Full lifecycle — birth to advanced operation
// ---------------------------------------------------------------------------

describe("full lifecycle — language progression from birth to advanced", () => {
  it("progresses through all 5 levels with sufficient days and interactions", () => {
    let state = createInitialLanguageState("chromatic");

    // Day 0, 0 interactions -> Level 0
    expect(evaluateLanguageLevel(state, 0)).toBe(LanguageLevel.SymbolsOnly);

    // Simulate 30 interactions -> Day 7 -> Level 1
    for (let i = 0; i < 30; i++) {
      state = recordInteraction(state);
    }
    expect(evaluateLanguageLevel(state, 7)).toBe(LanguageLevel.PatternEstablishment);

    // Simulate to 100 interactions -> Day 21 -> Level 2
    for (let i = 0; i < 70; i++) {
      state = recordInteraction(state);
    }
    expect(evaluateLanguageLevel(state, 21)).toBe(LanguageLevel.BridgeToLanguage);

    // Simulate to 250 interactions -> Day 45 -> Level 3
    for (let i = 0; i < 150; i++) {
      state = recordInteraction(state);
    }
    expect(evaluateLanguageLevel(state, 45)).toBe(LanguageLevel.UniqueLanguage);

    // Simulate to 500 interactions -> Day 90 -> Level 4
    for (let i = 0; i < 250; i++) {
      state = recordInteraction(state);
    }
    expect(evaluateLanguageLevel(state, 90)).toBe(LanguageLevel.AdvancedOperation);
    expect(state.totalInteractions).toBe(500);
  });
});
