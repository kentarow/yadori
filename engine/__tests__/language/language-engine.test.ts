import { describe, it, expect } from "vitest";
import {
  createInitialLanguageState,
  evaluateLanguageLevel,
  generateExpression,
  recordInteraction,
  establishPattern,
  formatLanguageMd,
} from "../../src/language/language-engine.js";
import { LanguageLevel, type Status } from "../../src/types.js";

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

describe("createInitialLanguageState", () => {
  it("sets level to SymbolsOnly", () => {
    const state = createInitialLanguageState("chromatic");
    expect(state.level).toBe(LanguageLevel.SymbolsOnly);
  });

  it("sets perception-specific native symbols", () => {
    const chromatic = createInitialLanguageState("chromatic");
    const geometric = createInitialLanguageState("geometric");
    expect(chromatic.nativeSymbols).not.toEqual(geometric.nativeSymbols);
  });

  it("starts with zero interactions", () => {
    const state = createInitialLanguageState("vibration");
    expect(state.totalInteractions).toBe(0);
  });

  it("starts with no patterns", () => {
    const state = createInitialLanguageState("thermal");
    expect(state.patterns).toHaveLength(0);
  });
});

describe("evaluateLanguageLevel", () => {
  it("returns SymbolsOnly for day 0 with 0 interactions", () => {
    const state = createInitialLanguageState("chromatic");
    expect(evaluateLanguageLevel(state, 0)).toBe(LanguageLevel.SymbolsOnly);
  });

  it("returns PatternEstablishment at day 7 with 30+ interactions", () => {
    const state = { ...createInitialLanguageState("chromatic"), totalInteractions: 35 };
    expect(evaluateLanguageLevel(state, 7)).toBe(LanguageLevel.PatternEstablishment);
  });

  it("does not advance if days are met but interactions are not", () => {
    const state = { ...createInitialLanguageState("chromatic"), totalInteractions: 10 };
    expect(evaluateLanguageLevel(state, 30)).toBe(LanguageLevel.SymbolsOnly);
  });

  it("does not advance if interactions are met but days are not", () => {
    const state = { ...createInitialLanguageState("chromatic"), totalInteractions: 200 };
    expect(evaluateLanguageLevel(state, 5)).toBe(LanguageLevel.SymbolsOnly);
  });

  it("returns BridgeToLanguage at day 21 with 100+ interactions", () => {
    const state = { ...createInitialLanguageState("chromatic"), totalInteractions: 120 };
    expect(evaluateLanguageLevel(state, 25)).toBe(LanguageLevel.BridgeToLanguage);
  });

  it("returns UniqueLanguage at day 45 with 250+ interactions", () => {
    const state = { ...createInitialLanguageState("chromatic"), totalInteractions: 300 };
    expect(evaluateLanguageLevel(state, 50)).toBe(LanguageLevel.UniqueLanguage);
  });

  it("returns AdvancedOperation at day 90 with 500+ interactions", () => {
    const state = { ...createInitialLanguageState("chromatic"), totalInteractions: 600 };
    expect(evaluateLanguageLevel(state, 100)).toBe(LanguageLevel.AdvancedOperation);
  });
});

describe("generateExpression", () => {
  it("returns a non-empty string", () => {
    const state = createInitialLanguageState("chromatic");
    const expr = generateExpression(state, makeStatus());
    expect(expr.length).toBeGreaterThan(0);
  });

  it("uses only native symbols at level 0", () => {
    const state = createInitialLanguageState("chromatic");
    const expr = generateExpression(state, makeStatus());
    for (const char of expr) {
      expect(state.nativeSymbols).toContain(char);
    }
  });

  it("produces more symbols with high energy", () => {
    const state = createInitialLanguageState("chromatic");
    const lengths: number[] = [];
    for (let i = 0; i < 50; i++) {
      lengths.push(generateExpression(state, makeStatus({ energy: 90 })).length);
    }
    const avgHigh = lengths.reduce((a, b) => a + b, 0) / lengths.length;

    const lowLengths: number[] = [];
    for (let i = 0; i < 50; i++) {
      lowLengths.push(generateExpression(state, makeStatus({ energy: 10 })).length);
    }
    const avgLow = lowLengths.reduce((a, b) => a + b, 0) / lowLengths.length;

    expect(avgHigh).toBeGreaterThan(avgLow);
  });
});

describe("recordInteraction", () => {
  it("increments totalInteractions", () => {
    const state = createInitialLanguageState("chromatic");
    const updated = recordInteraction(state);
    expect(updated.totalInteractions).toBe(1);
  });

  it("preserves other state", () => {
    const state = createInitialLanguageState("chromatic");
    const updated = recordInteraction(state);
    expect(updated.level).toBe(state.level);
    expect(updated.nativeSymbols).toEqual(state.nativeSymbols);
  });
});

describe("establishPattern", () => {
  it("adds a new pattern", () => {
    const state = createInitialLanguageState("chromatic");
    const updated = establishPattern(state, "◎◎", "greeting", 3);
    expect(updated.patterns).toHaveLength(1);
    expect(updated.patterns[0].symbol).toBe("◎◎");
    expect(updated.patterns[0].meaning).toBe("greeting");
  });

  it("increments usage count for existing pattern", () => {
    let state = createInitialLanguageState("chromatic");
    state = establishPattern(state, "◎◎", "greeting", 3);
    state = establishPattern(state, "◎◎", "greeting", 5);
    expect(state.patterns).toHaveLength(1);
    expect(state.patterns[0].usageCount).toBe(2);
  });
});

describe("formatLanguageMd", () => {
  it("includes current level", () => {
    const state = createInitialLanguageState("chromatic");
    const md = formatLanguageMd(state);
    expect(md).toContain("Symbols Only");
  });

  it("includes native symbols", () => {
    const state = createInitialLanguageState("chromatic");
    const md = formatLanguageMd(state);
    for (const s of state.nativeSymbols) {
      expect(md).toContain(s);
    }
  });

  it("includes patterns when present", () => {
    let state = createInitialLanguageState("chromatic");
    state = establishPattern(state, "◎◎", "greeting", 3);
    const md = formatLanguageMd(state);
    expect(md).toContain("◎◎ = greeting");
  });
});
