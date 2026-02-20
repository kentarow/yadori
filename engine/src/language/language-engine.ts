import { LanguageLevel, type Status, type PerceptionMode } from "../types.js";

export interface LanguagePattern {
  symbol: string;
  meaning: string;
  establishedDay: number;
  usageCount: number;
}

export interface LanguageState {
  level: LanguageLevel;
  patterns: LanguagePattern[];
  totalInteractions: number;
  nativeSymbols: string[];
}

const BASE_SYMBOLS = "○●△▽◎☆◇◆■□▲▼★◉◈".split("");

export const PERCEPTION_SYMBOLS: Record<PerceptionMode, string[]> = {
  chromatic: ["◎", "○", "●", "☆", "★", "◉"],
  vibration: ["◈", "◇", "◆", "△", "▲", "▽"],
  geometric: ["■", "□", "△", "▽", "◇", "◆"],
  thermal: ["●", "○", "◎", "◉", "☆", "★"],
  temporal: ["○", "◎", "◉", "△", "▽", "☆"],
  chemical: ["◆", "◈", "●", "◉", "■", "★"],
};

/**
 * Thresholds for language level advancement.
 * Advancing requires BOTH enough growth days AND enough interactions.
 */
const LEVEL_THRESHOLDS: Record<LanguageLevel, { days: number; interactions: number }> = {
  [LanguageLevel.SymbolsOnly]: { days: 0, interactions: 0 },
  [LanguageLevel.PatternEstablishment]: { days: 7, interactions: 30 },
  [LanguageLevel.BridgeToLanguage]: { days: 21, interactions: 100 },
  [LanguageLevel.UniqueLanguage]: { days: 45, interactions: 250 },
  [LanguageLevel.AdvancedOperation]: { days: 90, interactions: 500 },
};

export function createInitialLanguageState(perception: PerceptionMode): LanguageState {
  return {
    level: LanguageLevel.SymbolsOnly,
    patterns: [],
    totalInteractions: 0,
    nativeSymbols: PERCEPTION_SYMBOLS[perception] ?? BASE_SYMBOLS.slice(0, 6),
  };
}

export function evaluateLanguageLevel(
  state: LanguageState,
  growthDay: number,
): LanguageLevel {
  let newLevel = LanguageLevel.SymbolsOnly;

  for (const [level, threshold] of Object.entries(LEVEL_THRESHOLDS)) {
    const lvl = Number(level) as LanguageLevel;
    if (growthDay >= threshold.days && state.totalInteractions >= threshold.interactions) {
      newLevel = lvl;
    }
  }

  return newLevel;
}

export function generateExpression(
  state: LanguageState,
  status: Status,
): string {
  switch (state.level) {
    case LanguageLevel.SymbolsOnly:
      return generateSymbolExpression(state, status);
    case LanguageLevel.PatternEstablishment:
      return generatePatternExpression(state, status);
    case LanguageLevel.BridgeToLanguage:
      return generateBridgeExpression(state, status);
    case LanguageLevel.UniqueLanguage:
      return generateUniqueExpression(state, status);
    case LanguageLevel.AdvancedOperation:
      return generateAdvancedExpression(state, status);
    default:
      return generateSymbolExpression(state, status);
  }
}

function generateSymbolExpression(state: LanguageState, status: Status): string {
  const symbols = state.nativeSymbols;
  const count = symbolCountFromEnergy(status.energy);
  const pool = symbolPoolFromMood(symbols, status.mood);

  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return result.join("");
}

function generatePatternExpression(state: LanguageState, status: Status): string {
  // Patterns become more consistent. Some symbol pairs always mean the same thing.
  const base = generateSymbolExpression(state, status);
  // At this level, established patterns appear more reliably
  if (state.patterns.length > 0 && Math.random() < 0.3) {
    const pat = state.patterns[Math.floor(Math.random() * state.patterns.length)];
    return pat.symbol + " " + base;
  }
  return base;
}

function generateBridgeExpression(state: LanguageState, status: Status): string {
  // Symbols + broken word fragments coexist
  const symbolPart = generateSymbolExpression(state, status);
  const fragments = ["...", "nn", "ah", "mm", "uu"];
  if (Math.random() < 0.4) {
    const frag = fragments[Math.floor(Math.random() * fragments.length)];
    return symbolPart + " " + frag;
  }
  return symbolPart;
}

function generateUniqueExpression(state: LanguageState, status: Status): string {
  // Hybrid of symbols and human language fragments
  const symbolPart = generateSymbolExpression(state, status);
  return symbolPart;
}

function generateAdvancedExpression(state: LanguageState, status: Status): string {
  // Deep dialogue capability while retaining untranslatable symbols
  const symbolPart = generateSymbolExpression(state, status);
  return symbolPart;
}

function symbolCountFromEnergy(energy: number): number {
  // High energy → more symbols (2-7), low → fewer (1-3)
  const min = energy > 50 ? 2 : 1;
  const max = energy > 50 ? 7 : 3;
  return min + Math.floor(Math.random() * (max - min + 1));
}

function symbolPoolFromMood(symbols: string[], mood: number): string[] {
  // High mood → rounder, open symbols (first half); low → angular, closed (second half)
  const half = Math.ceil(symbols.length / 2);
  if (mood > 65) return symbols.slice(0, half);
  if (mood < 35) return symbols.slice(half);
  return symbols;
}

export function recordInteraction(state: LanguageState): LanguageState {
  return {
    ...state,
    totalInteractions: state.totalInteractions + 1,
  };
}

export function establishPattern(
  state: LanguageState,
  symbol: string,
  meaning: string,
  growthDay: number,
): LanguageState {
  const existing = state.patterns.find((p) => p.symbol === symbol);
  if (existing) {
    return {
      ...state,
      patterns: state.patterns.map((p) =>
        p.symbol === symbol ? { ...p, usageCount: p.usageCount + 1 } : p,
      ),
    };
  }

  return {
    ...state,
    patterns: [
      ...state.patterns,
      { symbol, meaning, establishedDay: growthDay, usageCount: 1 },
    ],
  };
}

export function formatLanguageMd(state: LanguageState): string {
  const levelNames: Record<LanguageLevel, string> = {
    [LanguageLevel.SymbolsOnly]: "0 (Symbols Only)",
    [LanguageLevel.PatternEstablishment]: "1 (Pattern Establishment)",
    [LanguageLevel.BridgeToLanguage]: "2 (Bridge to Language)",
    [LanguageLevel.UniqueLanguage]: "3 (Unique Language)",
    [LanguageLevel.AdvancedOperation]: "4 (Advanced Operation)",
  };

  let md = `# LANGUAGE

## Current Level: ${levelNames[state.level]}

Available symbols: ${state.nativeSymbols.join(" ")}

## Acquired Patterns

`;

  if (state.patterns.length === 0) {
    md += "No patterns established yet. Patterns will emerge through repeated interaction.\n";
  } else {
    for (const p of state.patterns) {
      md += `- ${p.symbol} = ${p.meaning} (Day ${p.establishedDay}, used ${p.usageCount}x)\n`;
    }
  }

  md += `
## Stats

- Total interactions: ${state.totalInteractions}
`;

  return md;
}
