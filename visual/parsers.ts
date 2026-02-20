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
 * Parse MEMORY.md content into structured memory data for the dashboard.
 * Extracts hot (recent), warm (weekly), cold (monthly), and notes.
 *
 * Hot format:   - [timestamp] summary (mood:N)
 * Warm format:  ### YYYY-Www (N interactions, avg mood: M)\n\nsummary
 * Notes format: - note text (under ## Notes section)
 * Cold memories are stored in separate monthly files, not in MEMORY.md.
 */
export function parseMemoryMd(content: string): {
  hot: { timestamp: string; summary: string; mood: number }[];
  warm: { week: string; entries: number; summary: string; averageMood: number }[];
  cold: { month: string; weeks: number; summary: string; averageMood: number }[];
  notes: string[];
} {
  const hot: { timestamp: string; summary: string; mood: number }[] = [];
  const warm: { week: string; entries: number; summary: string; averageMood: number }[] = [];
  const cold: { month: string; weeks: number; summary: string; averageMood: number }[] = [];
  const notes: string[] = [];

  // Parse hot memories: "- [timestamp] summary (mood:N)"
  const hotRegex = /^- \[(.+?)\] (.+?) \(mood:(\d+)\)$/gm;
  let match: RegExpExecArray | null;
  while ((match = hotRegex.exec(content)) !== null) {
    hot.push({
      timestamp: match[1],
      summary: match[2],
      mood: parseInt(match[3], 10),
    });
  }

  // Parse warm memories: "### YYYY-Www (N interactions, avg mood: M)"
  const warmRegex = /^### (\d{4}-W\d{2}) \((\d+) interactions, avg mood: (\d+)\)\n\n(.+?)$/gm;
  while ((match = warmRegex.exec(content)) !== null) {
    warm.push({
      week: match[1],
      entries: parseInt(match[2], 10),
      averageMood: parseInt(match[3], 10),
      summary: match[4],
    });
  }

  // Parse notes: lines after "## Notes" matching "- note"
  const notesSection = content.split("## Notes")[1];
  if (notesSection) {
    const noteRegex = /^- (.+)$/gm;
    while ((match = noteRegex.exec(notesSection)) !== null) {
      // Skip hot memory pattern lines
      if (!match[1].startsWith("[")) {
        notes.push(match[1]);
      }
    }
  }

  return { hot, warm, cold, notes };
}

/**
 * Parse FORM.md content into structured form data.
 * Expects format like:
 *   ## Form
 *   - **base**: light-particles
 *   - **density**: 15
 *   - **complexity**: 8
 *   - **stability**: 20
 *   - **self-aware**: no
 *   > description text
 */
export function parseFormMd(content: string): {
  baseForm: string;
  density: number;
  complexity: number;
  stability: number;
  awareness: boolean;
} {
  const get = (key: string): string => {
    const match = content.match(new RegExp(`\\*\\*${key}\\*\\*:\\s*(.+)`));
    return match?.[1]?.trim() ?? "";
  };

  return {
    baseForm: get("base") || "light-particles",
    density: parseInt(get("density"), 10) || 5,
    complexity: parseInt(get("complexity"), 10) || 3,
    stability: parseInt(get("stability"), 10) || 15,
    awareness: get("self-aware") === "yes",
  };
}

/**
 * Parse REVERSALS.md content into structured reversal data.
 * Expects format produced by formatReversalMd():
 *   ## Reversal Detection
 *   - **total reversals**: N
 *   - **reversal rate**: M per 100 interactions
 *   - **dominant type**: type_name
 *   - **last detected**: ISO date or "never"
 *   ### Signals
 *   - YYYY-MM-DD **type** (strength: N) [recognized]?
 *     description
 */
export function parseReversalsMd(content: string): {
  signals: { type: string; timestamp: string; description: string; strength: number; recognized: boolean }[];
  totalReversals: number;
  dominantType: string | null;
  reversalRate: number;
  lastDetected: string | null;
} {
  const totalMatch = content.match(/\*\*total reversals\*\*:\s*(\d+)/);
  const totalReversals = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  const rateMatch = content.match(/\*\*reversal rate\*\*:\s*([\d.]+)/);
  const reversalRate = rateMatch ? parseFloat(rateMatch[1]) : 0;

  const dominantMatch = content.match(/\*\*dominant type\*\*:\s*(.+)/);
  const dominantRaw = dominantMatch?.[1]?.trim() ?? "none";
  const dominantType = dominantRaw === "none" ? null : dominantRaw;

  const lastMatch = content.match(/\*\*last detected\*\*:\s*(.+)/);
  const lastRaw = lastMatch?.[1]?.trim() ?? "never";
  const lastDetected = lastRaw === "never" ? null : lastRaw;

  const signals: { type: string; timestamp: string; description: string; strength: number; recognized: boolean }[] = [];

  // Parse signals: "- YYYY-MM-DD **type** (strength: N) [recognized]?"
  // followed by "  description" on the next line
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const signalMatch = lines[i].match(/^- (\d{4}-\d{2}-\d{2}) \*\*(.+?)\*\* \(strength: (\d+)\)(.*)/);
    if (signalMatch) {
      const recognized = signalMatch[4].includes("[recognized]");
      const description = (i + 1 < lines.length) ? lines[i + 1].trim() : "";
      signals.push({
        type: signalMatch[2],
        timestamp: signalMatch[1],
        description,
        strength: parseInt(signalMatch[3], 10),
        recognized,
      });
    }
  }

  return { signals, totalReversals, dominantType, reversalRate, lastDetected };
}

/**
 * Parse COEXIST.md content into structured coexistence quality data.
 * Expects format produced by formatCoexistMd():
 *   # COEXISTENCE
 *   - **status**: active
 *   - **quality**: N
 *   - **days in epsilon**: N
 *   ## Indicators
 *   - Silence Comfort: ████░░░░░░ 40
 *   ...
 *   ## Moments
 *   - YYYY-MM-DD [type]: description
 *
 * When inactive, the file contains only:
 *   # COEXISTENCE
 *   _Not yet in Phase epsilon. Coexistence has not begun._
 */
export function parseCoexistMd(content: string): {
  active: boolean;
  quality: number;
  indicators: {
    silenceComfort: number;
    sharedVocabulary: number;
    rhythmSync: number;
    sharedMemory: number;
    autonomyRespect: number;
  };
  moments: { timestamp: string; type: string; description: string }[];
  daysInEpsilon: number;
} {
  const active = /\*\*status\*\*:\s*active/.test(content);

  if (!active) {
    return {
      active: false,
      quality: 0,
      indicators: {
        silenceComfort: 0,
        sharedVocabulary: 0,
        rhythmSync: 0,
        sharedMemory: 0,
        autonomyRespect: 0,
      },
      moments: [],
      daysInEpsilon: 0,
    };
  }

  const qualityMatch = content.match(/\*\*quality\*\*:\s*(\d+)/);
  const quality = qualityMatch ? parseInt(qualityMatch[1], 10) : 0;

  const daysMatch = content.match(/\*\*days in epsilon\*\*:\s*(\d+)/);
  const daysInEpsilon = daysMatch ? parseInt(daysMatch[1], 10) : 0;

  // Parse indicator values from bar lines: "- Label: ████░░░░░░ 40"
  const getIndicator = (label: string): number => {
    const re = new RegExp(`- ${label}:.*?(\\d+)\\s*$`, "m");
    const m = content.match(re);
    return m ? parseInt(m[1], 10) : 0;
  };

  const indicators = {
    silenceComfort: getIndicator("Silence Comfort"),
    sharedVocabulary: getIndicator("Shared Vocabulary"),
    rhythmSync: getIndicator("Rhythm Synchrony"),
    sharedMemory: getIndicator("Shared Memory"),
    autonomyRespect: getIndicator("Autonomy Respect"),
  };

  // Parse moments: "- YYYY-MM-DD [type]: description"
  const moments: { timestamp: string; type: string; description: string }[] = [];
  const momentRegex = /^- (\d{4}-\d{2}-\d{2}) \[(.+?)\]: (.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = momentRegex.exec(content)) !== null) {
    moments.push({
      timestamp: match[1],
      type: match[2],
      description: match[3],
    });
  }

  return { active, quality, indicators, moments, daysInEpsilon };
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
