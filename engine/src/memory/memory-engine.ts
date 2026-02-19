/**
 * Memory Engine — 3-tier memory system (hot / warm / cold)
 *
 * Hot:  Recent interactions (last N entries, stored in MEMORY.md)
 * Warm: Weekly summaries (stored in memory/weekly/)
 * Cold: Monthly summaries (stored in memory/monthly/)
 *
 * Memories flow: interaction → hot → warm (weekly consolidation) → cold (monthly)
 */

export interface MemoryEntry {
  timestamp: string;   // ISO 8601
  summary: string;     // Brief description of interaction
  mood: number;        // Mood at time of memory
}

export interface WarmMemory {
  week: string;        // "YYYY-Www" e.g., "2026-W08"
  entries: number;     // How many hot memories were consolidated
  summary: string;     // Summarized content
  averageMood: number;
}

export interface ColdMemory {
  month: string;       // "YYYY-MM"
  weeks: number;       // How many warm memories were consolidated
  summary: string;
  averageMood: number;
}

export interface MemoryState {
  hot: MemoryEntry[];
  warm: WarmMemory[];
  cold: ColdMemory[];
  notes: string[];     // Important observations that persist permanently
}

const HOT_CAPACITY = 10;
const WARM_CAPACITY = 8; // ~2 months of weekly summaries

/**
 * Create empty memory state.
 */
export function createInitialMemoryState(): MemoryState {
  return { hot: [], warm: [], cold: [], notes: [] };
}

/**
 * Record a new interaction in hot memory.
 * If hot memory exceeds capacity, the oldest entry is returned for consolidation.
 */
export function addHotMemory(
  state: MemoryState,
  entry: MemoryEntry,
): { updated: MemoryState; overflow: MemoryEntry | null } {
  const hot = [...state.hot, entry];

  if (hot.length > HOT_CAPACITY) {
    const overflow = hot.shift()!;
    return { updated: { ...state, hot }, overflow };
  }

  return { updated: { ...state, hot }, overflow: null };
}

/**
 * Consolidate all current hot memories into a warm (weekly) summary.
 * Called at the end of each week (or when manually triggered).
 */
export function consolidateToWarm(state: MemoryState, week: string): MemoryState {
  if (state.hot.length === 0) return state;

  const totalMood = state.hot.reduce((sum, e) => sum + e.mood, 0);
  const averageMood = Math.round(totalMood / state.hot.length);

  const summaryParts = state.hot.map((e) => e.summary);
  const summary = summaryParts.join(" / ");

  const warmEntry: WarmMemory = {
    week,
    entries: state.hot.length,
    summary,
    averageMood,
  };

  let warm = [...state.warm, warmEntry];

  // If warm exceeds capacity, consolidate oldest to cold
  let cold = state.cold;
  if (warm.length > WARM_CAPACITY) {
    const oldest = warm.shift()!;
    cold = consolidateToColdInternal(cold, oldest);
  }

  return {
    ...state,
    hot: [],
    warm,
    cold,
  };
}

/**
 * Consolidate warm memories into a cold (monthly) summary.
 * Called when warm memory exceeds capacity.
 */
function consolidateToColdInternal(cold: ColdMemory[], warm: WarmMemory): ColdMemory[] {
  // Try to merge into existing month entry
  const month = warm.week.slice(0, 4) + "-" + getMonthFromWeek(warm.week);
  const existing = cold.find((c) => c.month === month);

  if (existing) {
    const totalMood = existing.averageMood * existing.weeks + warm.averageMood;
    const totalWeeks = existing.weeks + 1;
    return cold.map((c) =>
      c.month === month
        ? {
            ...c,
            weeks: totalWeeks,
            summary: c.summary + " / " + warm.summary,
            averageMood: Math.round(totalMood / totalWeeks),
          }
        : c,
    );
  }

  return [
    ...cold,
    {
      month,
      weeks: 1,
      summary: warm.summary,
      averageMood: warm.averageMood,
    },
  ];
}

/**
 * Add a persistent note (important observations).
 */
export function addNote(state: MemoryState, note: string): MemoryState {
  return { ...state, notes: [...state.notes, note] };
}

/**
 * Get a context window for the LLM: hot memories + latest warm summary.
 * This is what the entity "remembers" during conversation.
 */
export function getActiveMemoryContext(state: MemoryState): string {
  const lines: string[] = [];

  if (state.hot.length > 0) {
    lines.push("## Recent");
    for (const entry of state.hot) {
      lines.push(`- ${entry.summary}`);
    }
  }

  if (state.warm.length > 0) {
    const latest = state.warm[state.warm.length - 1];
    lines.push("");
    lines.push("## Earlier");
    lines.push(latest.summary);
  }

  if (state.notes.length > 0) {
    lines.push("");
    lines.push("## Notes");
    for (const note of state.notes) {
      lines.push(`- ${note}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format memory state as MEMORY.md content.
 */
export function formatMemoryMd(state: MemoryState): string {
  const lines: string[] = ["# MEMORY", ""];

  lines.push("## Hot Memory (Recent)");
  lines.push("");
  if (state.hot.length === 0) {
    lines.push("No recent memories.");
  } else {
    for (const entry of state.hot) {
      lines.push(`- [${entry.timestamp}] ${entry.summary} (mood:${entry.mood})`);
    }
  }

  lines.push("");
  lines.push("## Warm Memory (This Week)");
  lines.push("");
  if (state.warm.length === 0) {
    lines.push("<!-- No weekly summaries yet -->");
  } else {
    for (const w of state.warm) {
      lines.push(`### ${w.week} (${w.entries} interactions, avg mood: ${w.averageMood})`);
      lines.push("");
      lines.push(w.summary);
      lines.push("");
    }
  }

  lines.push("## Notes");
  lines.push("");
  if (state.notes.length === 0) {
    lines.push("<!-- Important observations that persist across sessions -->");
  } else {
    for (const note of state.notes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Parse MEMORY.md back into MemoryState.
 */
export function parseMemoryMd(content: string): MemoryState {
  const state = createInitialMemoryState();

  // Parse hot memories: lines matching "- [timestamp] summary (mood:N)"
  const hotRegex = /^- \[(.+?)\] (.+?) \(mood:(\d+)\)$/gm;
  let match: RegExpExecArray | null;
  while ((match = hotRegex.exec(content)) !== null) {
    state.hot.push({
      timestamp: match[1],
      summary: match[2],
      mood: parseInt(match[3], 10),
    });
  }

  // Parse warm memories: "### YYYY-Www (N interactions, avg mood: M)"
  const warmRegex = /^### (\d{4}-W\d{2}) \((\d+) interactions, avg mood: (\d+)\)\n\n(.+?)$/gm;
  while ((match = warmRegex.exec(content)) !== null) {
    state.warm.push({
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
      // Skip the hot memory pattern
      if (!match[1].startsWith("[")) {
        state.notes.push(match[1]);
      }
    }
  }

  return state;
}

/**
 * Format a single cold memory as a standalone monthly markdown file.
 * Written to memory/monthly/YYYY-MM.md
 */
export function formatColdMemoryMd(cold: ColdMemory): string {
  const lines: string[] = [
    `# Monthly Memory — ${cold.month}`,
    "",
    `- Weeks consolidated: ${cold.weeks}`,
    `- Average mood: ${cold.averageMood}`,
    "",
    "## Summary",
    "",
    cold.summary,
    "",
  ];
  return lines.join("\n");
}

/**
 * Approximate month from ISO week string. Simple heuristic.
 */
function getMonthFromWeek(week: string): string {
  const weekNum = parseInt(week.split("W")[1], 10);
  const month = Math.min(12, Math.max(1, Math.ceil(weekNum / 4.33)));
  return String(month).padStart(2, "0");
}

/**
 * Get ISO week string for a date.
 */
export function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
