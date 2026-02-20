/**
 * Dashboard Parsers — Extract entity state from workspace markdown files.
 *
 * These parsers convert the markdown-based workspace files into structured
 * JSON that the dashboard API serves. They are the bridge between the
 * file-based state and the browser visualization.
 */

/**
 * Parse STATUS.md content into numeric status values.
 * Expects format like: **mood**: 75
 * Returns 50 (neutral) for any missing key.
 */
export function parseStatusMd(content: string): Record<string, number> {
  const get = (key: string): number => {
    const match = content.match(new RegExp(`\\*\\*${key}\\*\\*:\\s*(\\d+)`));
    return match ? parseInt(match[1], 10) : 50;
  };
  return {
    mood: get("mood"),
    energy: get("energy"),
    curiosity: get("curiosity"),
    comfort: get("comfort"),
    languageLevel: get("level"),
    growthDay: get("day"),
    perceptionLevel: get("perception_level"),
  };
}

/**
 * Parse SEED.md content into seed trait strings.
 * Expects format like: **Perception**: chromatic
 */
export function parseSeedMd(content: string): Record<string, string> {
  const get = (key: string): string => {
    const match = content.match(new RegExp(`\\*\\*${key}\\*\\*:\\s*(.+)`));
    return match?.[1]?.trim() ?? "";
  };
  return {
    perception: get("Perception"),
    form: get("Form"),
    temperament: get("Temperament"),
    cognition: get("Cognition"),
  };
}

/**
 * Parse PERCEPTION.md content into structured perception data.
 * Extracts bullet-point lines starting with "- ".
 */
export function parsePerceptionMd(content: string): {
  perceptions: string[];
  hasPerception: boolean;
} {
  const lines = content.split("\n").filter(l => l.startsWith("- ")).map(l => l.slice(2));
  return {
    perceptions: lines,
    hasPerception: lines.length > 0,
  };
}

/**
 * Parse DYNAMICS.md content into intelligence dynamics data.
 * Expects format like:
 *   **phase**: alpha
 *   **score**: 15
 *   **signals**: curious about user habits, asked a question
 */
export function parseDynamicsMd(content: string): {
  phase: string;
  score: number;
  signals: string[];
} {
  const phaseMatch = content.match(/\*\*phase\*\*:\s*(.+)/);
  const phase = phaseMatch?.[1]?.trim() ?? "alpha";

  const scoreMatch = content.match(/\*\*score\*\*:\s*(\d+)/);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

  const signalsMatch = content.match(/\*\*signals\*\*:\s*(.+)/);
  const signalsRaw = signalsMatch?.[1]?.trim() ?? "";
  const signals = signalsRaw
    ? signalsRaw.split(",").map(s => s.trim()).filter(s => s.length > 0)
    : [];

  return { phase, score, signals };
}

/**
 * Parse milestones.md content into milestone data.
 * Expects format like:
 *   Current Stage: **newborn**
 *   - **Day 0**: First Breath — Entity was born
 *   - **Day 3**: First Contact — Someone spoke to the entity
 *
 * Returns { stage, milestones } where each milestone has id, label, achievedDay, achievedAt.
 */
export function parseMilestonesMd(content: string): {
  stage: string;
  milestones: { id: string; label: string; achievedDay: number; achievedAt: string }[];
} {
  const stageMatch = content.match(/Current Stage: \*\*(.+?)\*\*/);
  const stage = stageMatch?.[1]?.trim() ?? "newborn";

  const milestones: { id: string; label: string; achievedDay: number; achievedAt: string }[] = [];

  const lineRegex = /^- \*\*Day (\d+)\*\*: (.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(content)) !== null) {
    const label = match[2];
    const idPart = label.split(" — ")[0].toLowerCase().replace(/\s+/g, "_");
    milestones.push({
      id: idPart,
      label,
      achievedDay: parseInt(match[1], 10),
      achievedAt: "", // Not stored in md format
    });
  }

  return { stage, milestones };
}

/**
 * Parse LANGUAGE.md content into structured language data.
 * Expects format like:
 *   ## Current Level: 0 (Symbols Only)
 *   Available symbols: ○ ● △ ...
 *   ## Acquired Patterns
 *   - ◎ = greeting (Day 3, used 5x)
 *   ## Stats
 *   - Total interactions: 42
 */
export function parseLanguageMd(content: string): {
  level: number;
  levelName: string;
  totalInteractions: number;
  nativeSymbols: string[];
  patterns: { symbol: string; meaning: string; confidence: number }[];
} {
  const LEVEL_NAMES = [
    "Symbols Only",
    "Pattern Establishment",
    "Bridge to Language",
    "Unique Language",
    "Advanced Operation",
  ];

  // Extract level number from "## Current Level: 0 (Symbols Only)"
  const levelMatch = content.match(/## Current Level:\s*(\d+)/);
  const level = levelMatch ? parseInt(levelMatch[1], 10) : 0;
  const levelName = LEVEL_NAMES[level] ?? "Unknown";

  // Extract native symbols from "Available symbols: ○ ● △ ..."
  const symbolsMatch = content.match(/Available symbols:\s*(.+)/);
  const nativeSymbols = symbolsMatch
    ? symbolsMatch[1].trim().split(/\s+/).filter(s => s.length > 0)
    : [];

  // Extract total interactions from "- Total interactions: 42"
  const interactionsMatch = content.match(/Total interactions:\s*(\d+)/);
  const totalInteractions = interactionsMatch ? parseInt(interactionsMatch[1], 10) : 0;

  // Extract patterns from "- ◎ = greeting (Day 3, used 5x)"
  const patterns: { symbol: string; meaning: string; confidence: number }[] = [];
  const patternRegex = /^- (.+?) = (.+?) \(Day \d+, used (\d+)x\)/gm;
  let match: RegExpExecArray | null;
  while ((match = patternRegex.exec(content)) !== null) {
    const usageCount = parseInt(match[3], 10);
    // Confidence: map usage count to 0-1 (10+ uses = full confidence)
    const confidence = Math.min(1, usageCount / 10);
    patterns.push({
      symbol: match[1],
      meaning: match[2],
      confidence,
    });
  }

  return { level, levelName, totalInteractions, nativeSymbols, patterns };
}

/**
 * Compute coexistence metrics from entity state.
 */
export function computeCoexistenceMetrics(params: {
  bornDate: string;
  lastInteraction: string;
  totalInteractions: number;
  now?: number; // injectable for testing
}): {
  daysTogether: number;
  silenceHours: number | null;
} {
  const now = params.now ?? Date.now();

  let daysTogether = 0;
  if (params.bornDate) {
    daysTogether = Math.max(0, Math.floor((now - new Date(params.bornDate).getTime()) / 86_400_000));
  }

  let silenceHours: number | null = null;
  if (params.lastInteraction && params.lastInteraction !== "never") {
    silenceHours = Math.round((now - new Date(params.lastInteraction).getTime()) / 3_600_000 * 10) / 10;
  }

  return { daysTogether, silenceHours };
}
