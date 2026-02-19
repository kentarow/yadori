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
  type ColdMemory,
} from "../../src/memory/memory-engine.js";

function makeEntry(n: number, mood = 50): MemoryEntry {
  return {
    timestamp: `2026-02-${String(n).padStart(2, "0")}T12:00:00.000Z`,
    summary: `interaction ${n}`,
    mood,
  };
}

describe("Memory Engine", () => {
  describe("createInitialMemoryState", () => {
    it("returns empty state", () => {
      const state = createInitialMemoryState();
      expect(state.hot).toEqual([]);
      expect(state.warm).toEqual([]);
      expect(state.cold).toEqual([]);
      expect(state.notes).toEqual([]);
    });
  });

  describe("addHotMemory", () => {
    it("adds entry to hot memory", () => {
      const state = createInitialMemoryState();
      const entry = makeEntry(1);
      const { updated, overflow } = addHotMemory(state, entry);

      expect(updated.hot).toHaveLength(1);
      expect(updated.hot[0].summary).toBe("interaction 1");
      expect(overflow).toBeNull();
    });

    it("returns overflow when capacity exceeded", () => {
      let state = createInitialMemoryState();
      for (let i = 1; i <= 10; i++) {
        const { updated } = addHotMemory(state, makeEntry(i));
        state = updated;
      }
      expect(state.hot).toHaveLength(10);

      // 11th entry should cause overflow
      const { updated, overflow } = addHotMemory(state, makeEntry(11));
      expect(updated.hot).toHaveLength(10);
      expect(overflow).not.toBeNull();
      expect(overflow!.summary).toBe("interaction 1");
      expect(updated.hot[updated.hot.length - 1].summary).toBe("interaction 11");
    });
  });

  describe("consolidateToWarm", () => {
    it("moves hot memories to a warm weekly summary", () => {
      let state = createInitialMemoryState();
      for (let i = 1; i <= 5; i++) {
        const { updated } = addHotMemory(state, makeEntry(i, 40 + i * 10));
        state = updated;
      }

      const consolidated = consolidateToWarm(state, "2026-W08");
      expect(consolidated.hot).toHaveLength(0);
      expect(consolidated.warm).toHaveLength(1);
      expect(consolidated.warm[0].week).toBe("2026-W08");
      expect(consolidated.warm[0].entries).toBe(5);
      expect(consolidated.warm[0].averageMood).toBe(70); // (50+60+70+80+90)/5
    });

    it("does nothing when hot is empty", () => {
      const state = createInitialMemoryState();
      const consolidated = consolidateToWarm(state, "2026-W08");
      expect(consolidated.warm).toHaveLength(0);
    });

    it("consolidates warm to cold when warm capacity exceeded", () => {
      let state = createInitialMemoryState();

      // Fill warm to capacity (8 weeks)
      for (let w = 1; w <= 9; w++) {
        const { updated } = addHotMemory(state, makeEntry(w, 60));
        state = updated;
        state = consolidateToWarm(state, `2026-W${String(w).padStart(2, "0")}`);
      }

      // 9th consolidation should push oldest to cold
      expect(state.warm.length).toBeLessThanOrEqual(8);
      expect(state.cold.length).toBeGreaterThan(0);
    });
  });

  describe("addNote", () => {
    it("adds a persistent note", () => {
      const state = createInitialMemoryState();
      const updated = addNote(state, "User likes morning greetings");
      expect(updated.notes).toEqual(["User likes morning greetings"]);
    });
  });

  describe("getActiveMemoryContext", () => {
    it("returns formatted context from hot + warm", () => {
      let state = createInitialMemoryState();
      const { updated } = addHotMemory(state, makeEntry(1));
      state = updated;
      state = addNote(state, "Important thing");

      const context = getActiveMemoryContext(state);
      expect(context).toContain("## Recent");
      expect(context).toContain("interaction 1");
      expect(context).toContain("## Notes");
      expect(context).toContain("Important thing");
    });

    it("returns empty string for empty state", () => {
      const state = createInitialMemoryState();
      const context = getActiveMemoryContext(state);
      expect(context).toBe("");
    });
  });

  describe("formatMemoryMd / parseMemoryMd", () => {
    it("round-trips hot memories", () => {
      let state = createInitialMemoryState();
      for (let i = 1; i <= 3; i++) {
        const { updated } = addHotMemory(state, makeEntry(i, 50 + i));
        state = updated;
      }

      const md = formatMemoryMd(state);
      const parsed = parseMemoryMd(md);

      expect(parsed.hot).toHaveLength(3);
      expect(parsed.hot[0].summary).toBe("interaction 1");
      expect(parsed.hot[0].mood).toBe(51);
      expect(parsed.hot[2].summary).toBe("interaction 3");
    });

    it("round-trips notes", () => {
      let state = createInitialMemoryState();
      state = addNote(state, "First note");
      state = addNote(state, "Second note");

      const md = formatMemoryMd(state);
      const parsed = parseMemoryMd(md);

      expect(parsed.notes).toEqual(["First note", "Second note"]);
    });
  });

  describe("formatColdMemoryMd", () => {
    it("formats a cold memory entry as markdown", () => {
      const cold: ColdMemory = {
        month: "2026-02",
        weeks: 3,
        summary: "First weeks of coexistence / symbol patterns emerging",
        averageMood: 62,
      };

      const md = formatColdMemoryMd(cold);
      expect(md).toContain("# Monthly Memory — 2026-02");
      expect(md).toContain("Weeks consolidated: 3");
      expect(md).toContain("Average mood: 62");
      expect(md).toContain("symbol patterns emerging");
    });

    it("works with cold memories generated by consolidation", () => {
      let state = createInitialMemoryState();

      // Generate enough warm → cold consolidation
      for (let w = 1; w <= 9; w++) {
        const { updated } = addHotMemory(state, makeEntry(w, 55));
        state = updated;
        state = consolidateToWarm(state, `2026-W${String(w).padStart(2, "0")}`);
      }

      expect(state.cold.length).toBeGreaterThan(0);
      const md = formatColdMemoryMd(state.cold[0]);
      expect(md).toContain("# Monthly Memory");
      expect(md).toContain("## Summary");
    });
  });

  describe("getISOWeek", () => {
    it("returns correct ISO week for known dates", () => {
      // 2026-02-18 is a Wednesday in week 8
      expect(getISOWeek(new Date("2026-02-18"))).toBe("2026-W08");
      // 2026-01-01 is a Thursday in week 1
      expect(getISOWeek(new Date("2026-01-01"))).toBe("2026-W01");
    });
  });
});
