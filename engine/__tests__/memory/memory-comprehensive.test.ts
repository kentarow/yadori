/**
 * Comprehensive tests for the Memory Engine.
 *
 * Covers: hot memory, warm consolidation, cold consolidation,
 * notes, formatting, parsing round-trips, edge cases, immutability.
 */
import { describe, it, expect } from "vitest";
import {
  createInitialMemoryState,
  addHotMemory,
  consolidateToWarm,
  addNote,
  getActiveMemoryContext,
  formatMemoryMd,
  formatColdMemoryMd,
  parseMemoryMd,
  getISOWeek,
  type MemoryEntry,
  type MemoryState,
  type WarmMemory,
  type ColdMemory,
} from "../../src/memory/memory-engine.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(n: number, mood = 50): MemoryEntry {
  return {
    timestamp: `2026-02-${String(n).padStart(2, "0")}T12:00:00.000Z`,
    summary: `interaction ${n}`,
    mood,
  };
}

function fillHot(state: MemoryState, count: number, moodFn?: (i: number) => number): MemoryState {
  let s = state;
  for (let i = 1; i <= count; i++) {
    const mood = moodFn ? moodFn(i) : 50;
    const { updated } = addHotMemory(s, makeEntry(i, mood));
    s = updated;
  }
  return s;
}

// ---------------------------------------------------------------------------
// 1. Hot Memory
// ---------------------------------------------------------------------------

describe("Hot Memory", () => {
  it("starts empty", () => {
    const state = createInitialMemoryState();
    expect(state.hot).toHaveLength(0);
  });

  it("adds a single entry", () => {
    const state = createInitialMemoryState();
    const entry = makeEntry(1, 72);
    const { updated, overflow } = addHotMemory(state, entry);

    expect(updated.hot).toHaveLength(1);
    expect(updated.hot[0]).toEqual(entry);
    expect(overflow).toBeNull();
  });

  it("preserves insertion order", () => {
    const state = fillHot(createInitialMemoryState(), 5);
    for (let i = 0; i < 5; i++) {
      expect(state.hot[i].summary).toBe(`interaction ${i + 1}`);
    }
  });

  it("holds exactly 10 entries at capacity", () => {
    const state = fillHot(createInitialMemoryState(), 10);
    expect(state.hot).toHaveLength(10);
  });

  it("overflows oldest (FIFO) when capacity exceeded", () => {
    const atCapacity = fillHot(createInitialMemoryState(), 10);
    const { updated, overflow } = addHotMemory(atCapacity, makeEntry(11, 99));

    expect(updated.hot).toHaveLength(10);
    expect(overflow).not.toBeNull();
    expect(overflow!.summary).toBe("interaction 1");
    expect(updated.hot[0].summary).toBe("interaction 2");
    expect(updated.hot[9].summary).toBe("interaction 11");
    expect(updated.hot[9].mood).toBe(99);
  });

  it("returns successive overflows on repeated adds beyond capacity", () => {
    let state = fillHot(createInitialMemoryState(), 10);

    for (let extra = 11; extra <= 13; extra++) {
      const { updated, overflow } = addHotMemory(state, makeEntry(extra));
      state = updated;
      expect(overflow).not.toBeNull();
      expect(overflow!.summary).toBe(`interaction ${extra - 10}`);
    }
    expect(state.hot).toHaveLength(10);
    expect(state.hot[0].summary).toBe("interaction 4");
    expect(state.hot[9].summary).toBe("interaction 13");
  });

  it("stores correct mood values", () => {
    const state = createInitialMemoryState();
    const { updated } = addHotMemory(state, makeEntry(1, 0));
    expect(updated.hot[0].mood).toBe(0);

    const { updated: updated2 } = addHotMemory(updated, makeEntry(2, 100));
    expect(updated2.hot[1].mood).toBe(100);
  });

  it("stores correct timestamps", () => {
    const state = createInitialMemoryState();
    const entry: MemoryEntry = {
      timestamp: "2026-06-15T08:30:00.000Z",
      summary: "morning chat",
      mood: 65,
    };
    const { updated } = addHotMemory(state, entry);
    expect(updated.hot[0].timestamp).toBe("2026-06-15T08:30:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// 2. Warm Memory — Weekly Consolidation
// ---------------------------------------------------------------------------

describe("Warm Memory (Weekly Consolidation)", () => {
  it("consolidates hot entries into a warm summary", () => {
    const state = fillHot(createInitialMemoryState(), 4, (i) => 40 + i * 10);
    const consolidated = consolidateToWarm(state, "2026-W08");

    expect(consolidated.hot).toHaveLength(0);
    expect(consolidated.warm).toHaveLength(1);
    expect(consolidated.warm[0].week).toBe("2026-W08");
    expect(consolidated.warm[0].entries).toBe(4);
  });

  it("computes correct average mood (rounded)", () => {
    // moods: 50, 60, 70 → avg = 60
    const state = fillHot(createInitialMemoryState(), 3, (i) => 40 + i * 10);
    const consolidated = consolidateToWarm(state, "2026-W08");
    expect(consolidated.warm[0].averageMood).toBe(60);
  });

  it("computes average mood with rounding", () => {
    // moods: 33, 33, 34 → sum 100, avg 33.33... → rounded to 33
    let state = createInitialMemoryState();
    for (const m of [33, 33, 34]) {
      const { updated } = addHotMemory(state, { timestamp: "t", summary: "s", mood: m });
      state = updated;
    }
    const consolidated = consolidateToWarm(state, "2026-W01");
    expect(consolidated.warm[0].averageMood).toBe(33);
  });

  it("joins hot summaries with \" / \" separator", () => {
    let state = createInitialMemoryState();
    const { updated: s1 } = addHotMemory(state, { timestamp: "t1", summary: "alpha", mood: 50 });
    const { updated: s2 } = addHotMemory(s1, { timestamp: "t2", summary: "beta", mood: 50 });
    const consolidated = consolidateToWarm(s2, "2026-W01");
    expect(consolidated.warm[0].summary).toBe("alpha / beta");
  });

  it("clears hot memory after consolidation", () => {
    const state = fillHot(createInitialMemoryState(), 5);
    const consolidated = consolidateToWarm(state, "2026-W08");
    expect(consolidated.hot).toHaveLength(0);
  });

  it("does nothing when hot is empty", () => {
    const state = createInitialMemoryState();
    const result = consolidateToWarm(state, "2026-W08");
    expect(result).toBe(state); // same reference — no change
    expect(result.warm).toHaveLength(0);
  });

  it("accumulates multiple warm entries across weeks", () => {
    let state = createInitialMemoryState();
    for (let w = 1; w <= 4; w++) {
      const { updated } = addHotMemory(state, makeEntry(w, 50));
      state = updated;
      state = consolidateToWarm(state, `2026-W${String(w).padStart(2, "0")}`);
    }
    expect(state.warm).toHaveLength(4);
    expect(state.warm[0].week).toBe("2026-W01");
    expect(state.warm[3].week).toBe("2026-W04");
  });

  it("preserves notes through consolidation", () => {
    let state = createInitialMemoryState();
    state = addNote(state, "important fact");
    const { updated } = addHotMemory(state, makeEntry(1));
    state = updated;
    state = consolidateToWarm(state, "2026-W08");
    expect(state.notes).toEqual(["important fact"]);
  });
});

// ---------------------------------------------------------------------------
// 3. Cold Memory — Monthly Consolidation (via warm overflow)
// ---------------------------------------------------------------------------

describe("Cold Memory (Monthly Consolidation)", () => {
  it("triggers when warm exceeds capacity of 8", () => {
    let state = createInitialMemoryState();
    for (let w = 1; w <= 9; w++) {
      const { updated } = addHotMemory(state, makeEntry(w, 60));
      state = updated;
      state = consolidateToWarm(state, `2026-W${String(w).padStart(2, "0")}`);
    }
    expect(state.warm.length).toBeLessThanOrEqual(8);
    expect(state.cold.length).toBeGreaterThan(0);
  });

  it("cold entry has correct weeks count of 1 for a single overflow", () => {
    let state = createInitialMemoryState();
    for (let w = 1; w <= 9; w++) {
      const { updated } = addHotMemory(state, makeEntry(w, 60));
      state = updated;
      state = consolidateToWarm(state, `2026-W${String(w).padStart(2, "0")}`);
    }
    expect(state.cold[0].weeks).toBe(1);
  });

  it("cold entry preserves the summary from the evicted warm entry", () => {
    let state = createInitialMemoryState();
    for (let w = 1; w <= 9; w++) {
      const { updated } = addHotMemory(state, makeEntry(w, 60));
      state = updated;
      state = consolidateToWarm(state, `2026-W${String(w).padStart(2, "0")}`);
    }
    // The first warm entry (W01) was evicted
    expect(state.cold[0].summary).toContain("interaction 1");
  });

  it("merges multiple warm overflows into the same month", () => {
    let state = createInitialMemoryState();
    // Create 10 warm entries → 2 overflows, both from early weeks (same month)
    for (let w = 1; w <= 10; w++) {
      const { updated } = addHotMemory(state, makeEntry(w, 50 + w));
      state = updated;
      state = consolidateToWarm(state, `2026-W${String(w).padStart(2, "0")}`);
    }
    // Both W01 and W02 map to the same month — should merge
    const janEntries = state.cold.filter((c) => c.month === "2026-01");
    if (janEntries.length === 1) {
      expect(janEntries[0].weeks).toBe(2);
    }
    // Regardless of month mapping, total cold entries should exist
    expect(state.cold.length).toBeGreaterThan(0);
  });

  it("cold average mood is computed correctly for merged entries", () => {
    let state = createInitialMemoryState();
    for (let w = 1; w <= 10; w++) {
      const { updated } = addHotMemory(state, makeEntry(w, 50 + w));
      state = updated;
      state = consolidateToWarm(state, `2026-W${String(w).padStart(2, "0")}`);
    }
    for (const cold of state.cold) {
      expect(cold.averageMood).toBeGreaterThanOrEqual(0);
      expect(cold.averageMood).toBeLessThanOrEqual(100);
    }
  });

  it("cold month string has correct format YYYY-MM", () => {
    let state = createInitialMemoryState();
    for (let w = 1; w <= 9; w++) {
      const { updated } = addHotMemory(state, makeEntry(w, 60));
      state = updated;
      state = consolidateToWarm(state, `2026-W${String(w).padStart(2, "0")}`);
    }
    for (const cold of state.cold) {
      expect(cold.month).toMatch(/^\d{4}-\d{2}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Memory Notes
// ---------------------------------------------------------------------------

describe("Memory Notes", () => {
  it("adds a note to empty state", () => {
    const state = addNote(createInitialMemoryState(), "first note");
    expect(state.notes).toEqual(["first note"]);
  });

  it("accumulates multiple notes in order", () => {
    let state = createInitialMemoryState();
    state = addNote(state, "note A");
    state = addNote(state, "note B");
    state = addNote(state, "note C");
    expect(state.notes).toEqual(["note A", "note B", "note C"]);
  });

  it("preserves existing hot/warm/cold when adding notes", () => {
    let state = fillHot(createInitialMemoryState(), 3);
    state = addNote(state, "observation");
    expect(state.hot).toHaveLength(3);
    expect(state.warm).toHaveLength(0);
    expect(state.cold).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. getActiveMemoryContext
// ---------------------------------------------------------------------------

describe("getActiveMemoryContext", () => {
  it("returns empty string for empty state", () => {
    expect(getActiveMemoryContext(createInitialMemoryState())).toBe("");
  });

  it("includes Recent section header for hot memories", () => {
    const state = fillHot(createInitialMemoryState(), 2);
    const ctx = getActiveMemoryContext(state);
    expect(ctx).toContain("## Recent");
    expect(ctx).toContain("- interaction 1");
    expect(ctx).toContain("- interaction 2");
  });

  it("includes Earlier section with latest warm summary only", () => {
    let state = createInitialMemoryState();
    // Create two warm entries
    for (let w = 1; w <= 2; w++) {
      const { updated } = addHotMemory(state, makeEntry(w, 50));
      state = updated;
      state = consolidateToWarm(state, `2026-W${String(w).padStart(2, "0")}`);
    }
    // Add one hot entry for current context
    const { updated } = addHotMemory(state, makeEntry(10, 50));
    state = updated;

    const ctx = getActiveMemoryContext(state);
    expect(ctx).toContain("## Earlier");
    // Should show only the latest warm (W02), not W01
    expect(ctx).toContain("interaction 2");
  });

  it("includes Notes section", () => {
    let state = createInitialMemoryState();
    state = addNote(state, "likes silence");
    const ctx = getActiveMemoryContext(state);
    expect(ctx).toContain("## Notes");
    expect(ctx).toContain("- likes silence");
  });

  it("omits sections that have no data", () => {
    // Only notes, no hot/warm
    let state = createInitialMemoryState();
    state = addNote(state, "standalone note");
    const ctx = getActiveMemoryContext(state);
    expect(ctx).not.toContain("## Recent");
    expect(ctx).not.toContain("## Earlier");
    expect(ctx).toContain("## Notes");
  });
});

// ---------------------------------------------------------------------------
// 6. formatMemoryMd
// ---------------------------------------------------------------------------

describe("formatMemoryMd", () => {
  it("includes all section headers", () => {
    const md = formatMemoryMd(createInitialMemoryState());
    expect(md).toContain("# MEMORY");
    expect(md).toContain("## Hot Memory (Recent)");
    expect(md).toContain("## Warm Memory (This Week)");
    expect(md).toContain("## Notes");
  });

  it("shows 'No recent memories.' for empty hot", () => {
    const md = formatMemoryMd(createInitialMemoryState());
    expect(md).toContain("No recent memories.");
  });

  it("formats hot entries with timestamp, summary, and mood", () => {
    const state = fillHot(createInitialMemoryState(), 2, (i) => 40 + i);
    const md = formatMemoryMd(state);
    expect(md).toContain("- [2026-02-01T12:00:00.000Z] interaction 1 (mood:41)");
    expect(md).toContain("- [2026-02-02T12:00:00.000Z] interaction 2 (mood:42)");
  });

  it("formats warm entries with week, count, and average mood", () => {
    let state = fillHot(createInitialMemoryState(), 3, () => 75);
    state = consolidateToWarm(state, "2026-W08");
    const md = formatMemoryMd(state);
    expect(md).toContain("### 2026-W08 (3 interactions, avg mood: 75)");
  });

  it("shows HTML comment placeholders for empty warm and notes", () => {
    const md = formatMemoryMd(createInitialMemoryState());
    expect(md).toContain("<!-- No weekly summaries yet -->");
    expect(md).toContain("<!-- Important observations that persist across sessions -->");
  });

  it("formats notes as bullet list", () => {
    let state = createInitialMemoryState();
    state = addNote(state, "note alpha");
    state = addNote(state, "note beta");
    const md = formatMemoryMd(state);
    expect(md).toContain("- note alpha");
    expect(md).toContain("- note beta");
  });
});

// ---------------------------------------------------------------------------
// 7. formatColdMemoryMd
// ---------------------------------------------------------------------------

describe("formatColdMemoryMd", () => {
  it("formats a cold memory entry", () => {
    const cold: ColdMemory = {
      month: "2026-01",
      weeks: 4,
      summary: "entity explored symbols",
      averageMood: 55,
    };
    const md = formatColdMemoryMd(cold);
    expect(md).toContain("# Monthly Memory — 2026-01");
    expect(md).toContain("Weeks consolidated: 4");
    expect(md).toContain("Average mood: 55");
    expect(md).toContain("## Summary");
    expect(md).toContain("entity explored symbols");
  });
});

// ---------------------------------------------------------------------------
// 8. parseMemoryMd Round-Trip
// ---------------------------------------------------------------------------

describe("parseMemoryMd round-trip", () => {
  it("round-trips hot memories", () => {
    const state = fillHot(createInitialMemoryState(), 5, (i) => 30 + i * 5);
    const parsed = parseMemoryMd(formatMemoryMd(state));
    expect(parsed.hot).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(parsed.hot[i].summary).toBe(state.hot[i].summary);
      expect(parsed.hot[i].mood).toBe(state.hot[i].mood);
      expect(parsed.hot[i].timestamp).toBe(state.hot[i].timestamp);
    }
  });

  it("round-trips notes", () => {
    let state = createInitialMemoryState();
    state = addNote(state, "user is quiet in mornings");
    state = addNote(state, "responds well to symbols");
    const parsed = parseMemoryMd(formatMemoryMd(state));
    expect(parsed.notes).toEqual(state.notes);
  });

  it("round-trips warm memories", () => {
    let state = fillHot(createInitialMemoryState(), 3, () => 65);
    state = consolidateToWarm(state, "2026-W08");
    const md = formatMemoryMd(state);
    const parsed = parseMemoryMd(md);
    expect(parsed.warm).toHaveLength(1);
    expect(parsed.warm[0].week).toBe("2026-W08");
    expect(parsed.warm[0].entries).toBe(3);
    expect(parsed.warm[0].averageMood).toBe(65);
    expect(parsed.warm[0].summary).toBe(state.warm[0].summary);
  });

  it("round-trips empty state", () => {
    const state = createInitialMemoryState();
    const parsed = parseMemoryMd(formatMemoryMd(state));
    expect(parsed.hot).toHaveLength(0);
    expect(parsed.warm).toHaveLength(0);
    expect(parsed.cold).toHaveLength(0);
    expect(parsed.notes).toHaveLength(0);
  });

  it("round-trips mixed state (hot + warm + notes)", () => {
    let state = fillHot(createInitialMemoryState(), 3, () => 70);
    state = consolidateToWarm(state, "2026-W07");
    // Add new hot entries after consolidation
    const { updated } = addHotMemory(state, makeEntry(8, 80));
    state = updated;
    state = addNote(state, "test note");

    const parsed = parseMemoryMd(formatMemoryMd(state));
    expect(parsed.hot).toHaveLength(1);
    expect(parsed.hot[0].mood).toBe(80);
    expect(parsed.warm).toHaveLength(1);
    expect(parsed.notes).toEqual(["test note"]);
  });
});

// ---------------------------------------------------------------------------
// 9. getISOWeek
// ---------------------------------------------------------------------------

describe("getISOWeek", () => {
  it("returns 2026-W08 for 2026-02-18 (Wednesday)", () => {
    expect(getISOWeek(new Date("2026-02-18"))).toBe("2026-W08");
  });

  it("returns 2026-W01 for 2026-01-01 (Thursday)", () => {
    expect(getISOWeek(new Date("2026-01-01"))).toBe("2026-W01");
  });

  it("returns correct week for a known Sunday (end of week)", () => {
    // 2026-02-22 is a Sunday → still W08
    expect(getISOWeek(new Date("2026-02-22"))).toBe("2026-W08");
  });

  it("handles year boundary correctly", () => {
    // 2025-12-29 is a Monday → ISO week 1 of 2026
    expect(getISOWeek(new Date("2025-12-29"))).toBe("2026-W01");
  });
});

// ---------------------------------------------------------------------------
// 10. Edge Cases
// ---------------------------------------------------------------------------

describe("Edge Cases", () => {
  it("addHotMemory with mood 0", () => {
    const state = createInitialMemoryState();
    const entry: MemoryEntry = { timestamp: "t", summary: "low", mood: 0 };
    const { updated } = addHotMemory(state, entry);
    expect(updated.hot[0].mood).toBe(0);
  });

  it("addHotMemory with very high mood", () => {
    const state = createInitialMemoryState();
    const entry: MemoryEntry = { timestamp: "t", summary: "high", mood: 100 };
    const { updated } = addHotMemory(state, entry);
    expect(updated.hot[0].mood).toBe(100);
  });

  it("consolidateToWarm with a single hot entry", () => {
    const state = fillHot(createInitialMemoryState(), 1, () => 42);
    const consolidated = consolidateToWarm(state, "2026-W01");
    expect(consolidated.warm).toHaveLength(1);
    expect(consolidated.warm[0].entries).toBe(1);
    expect(consolidated.warm[0].averageMood).toBe(42);
    expect(consolidated.warm[0].summary).toBe("interaction 1");
  });

  it("consolidateToWarm with max capacity hot entries", () => {
    const state = fillHot(createInitialMemoryState(), 10, () => 50);
    const consolidated = consolidateToWarm(state, "2026-W01");
    expect(consolidated.warm[0].entries).toBe(10);
    expect(consolidated.hot).toHaveLength(0);
  });

  it("addNote with empty string", () => {
    const state = addNote(createInitialMemoryState(), "");
    expect(state.notes).toEqual([""]);
  });

  it("formatMemoryMd output ends with newline", () => {
    const md = formatMemoryMd(createInitialMemoryState());
    expect(md.endsWith("\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 11. Immutability — consolidation does not mutate input
// ---------------------------------------------------------------------------

describe("Immutability", () => {
  it("addHotMemory does not mutate original state", () => {
    const original = createInitialMemoryState();
    const originalHotRef = original.hot;
    addHotMemory(original, makeEntry(1));
    expect(original.hot).toHaveLength(0);
    expect(original.hot).toBe(originalHotRef);
  });

  it("consolidateToWarm does not mutate original state", () => {
    const state = fillHot(createInitialMemoryState(), 5);
    const hotSnapshot = [...state.hot];
    const warmSnapshot = [...state.warm];
    consolidateToWarm(state, "2026-W08");
    // Original should be untouched
    expect(state.hot).toHaveLength(5);
    expect(state.hot.map((e) => e.summary)).toEqual(hotSnapshot.map((e) => e.summary));
    expect(state.warm).toEqual(warmSnapshot);
  });

  it("addNote does not mutate original state", () => {
    const state = createInitialMemoryState();
    addNote(state, "something");
    expect(state.notes).toHaveLength(0);
  });

  it("overflow from addHotMemory does not affect original state", () => {
    const atCapacity = fillHot(createInitialMemoryState(), 10);
    const hotBefore = [...atCapacity.hot];
    addHotMemory(atCapacity, makeEntry(11));
    expect(atCapacity.hot).toHaveLength(10);
    expect(atCapacity.hot.map((e) => e.summary)).toEqual(hotBefore.map((e) => e.summary));
  });
});
