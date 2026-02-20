/**
 * End-to-End Test — Memory Consolidation Lifecycle
 *
 * Verifies the complete 3-tier memory system:
 *   Hot (recent interactions) → Warm (weekly consolidation) → Cold (monthly archive)
 *
 * Tests the full lifecycle:
 *   1. Interactions create hot memories
 *   2. Sunday night heartbeat consolidates hot → warm
 *   3. Warm overflow triggers warm → cold
 *   4. Notes persist through all consolidation cycles
 *   5. Memory data survives serialization round-trips
 *   6. Growth milestones fire based on memory state
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
  type MemoryState,
  createInitialMemoryState,
  addHotMemory,
  consolidateToWarm,
  addNote,
  formatMemoryMd,
  parseMemoryMd,
  getISOWeek,
  type MemoryEntry,
} from "../../engine/src/memory/memory-engine.js";
import type { HardwareBody } from "../../engine/src/types.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TEST_HW: HardwareBody = {
  platform: "darwin",
  arch: "arm64",
  totalMemoryGB: 16,
  cpuModel: "Apple M4",
  storageGB: 256,
};

/** Birth time: a Monday morning so we have a clean week ahead. */
const BIRTH = new Date("2026-02-16T08:00:00Z"); // Monday

function makeSeed(createdAt = BIRTH.toISOString()) {
  return createFixedSeed({ hardwareBody: TEST_HW, createdAt });
}

/** Helper: process N interactions on a given state, spacing them 30 minutes apart. */
function doInteractions(
  state: ReturnType<typeof createEntityState>,
  count: number,
  startTime: Date,
  intervalMs = 30 * 60_000,
) {
  let current = state;
  const milestones: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = new Date(startTime.getTime() + i * intervalMs);
    const result = processInteraction(
      current,
      { minutesSinceLastInteraction: i === 0 ? 999 : intervalMs / 60_000, userInitiated: true, messageLength: 40 + i },
      t,
      `interaction-${i}`,
    );
    current = result.updatedState;
    for (const m of result.newMilestones) milestones.push(m.id);
  }
  return { state: current, milestones };
}

/** Helper: create a Sunday 21:xx date in the same week as the given date. */
function nextSundayNight(reference: Date): Date {
  const d = new Date(reference);
  const daysUntilSunday = (7 - d.getUTCDay()) % 7;
  d.setUTCDate(d.getUTCDate() + daysUntilSunday);
  d.setUTCHours(21, 30, 0, 0); // 21:30 — "night" time-of-day
  return d;
}

// ============================================================
// 1. Hot memory creation
// ============================================================

describe("hot memory creation", () => {
  it("creates one hot memory per interaction", () => {
    const seed = makeSeed();
    const { state } = doInteractions(createEntityState(seed, BIRTH), 5, BIRTH);

    expect(state.memory.hot).toHaveLength(5);
  });

  it("each hot memory has correct timestamp, summary, and mood", () => {
    const seed = makeSeed();
    let entity = createEntityState(seed, BIRTH);

    // First interaction is a first encounter — use it to advance past that
    const t0 = new Date("2026-02-16T09:00:00Z");
    const first = processInteraction(
      entity,
      { minutesSinceLastInteraction: 999, userInitiated: true, messageLength: 20 },
      t0,
    );
    entity = first.updatedState;

    // Second interaction: the memory summary we provide should be stored as-is
    const t = new Date("2026-02-16T10:00:00Z");
    const result = processInteraction(
      entity,
      { minutesSinceLastInteraction: 60, userInitiated: true, messageLength: 60 },
      t,
      "user greeted the entity",
    );
    entity = result.updatedState;

    // hot[0] is first encounter, hot[1] is our test interaction
    const mem = entity.memory.hot[1];
    expect(mem.timestamp).toBe(t.toISOString());
    expect(mem.summary).toBe("user greeted the entity");
    expect(typeof mem.mood).toBe("number");
    expect(mem.mood).toBeGreaterThanOrEqual(0);
    expect(mem.mood).toBeLessThanOrEqual(100);
  });

  it("preserves chronological order of hot memories", () => {
    const seed = makeSeed();
    const { state } = doInteractions(createEntityState(seed, BIRTH), 5, BIRTH);

    for (let i = 1; i < state.memory.hot.length; i++) {
      const prev = new Date(state.memory.hot[i - 1].timestamp).getTime();
      const curr = new Date(state.memory.hot[i].timestamp).getTime();
      expect(curr).toBeGreaterThan(prev);
    }
  });
});

// ============================================================
// 2. Hot memory overflow
// ============================================================

describe("hot memory overflow", () => {
  it("caps hot memory at 10 entries after 15 interactions", () => {
    const seed = makeSeed();
    const { state } = doInteractions(createEntityState(seed, BIRTH), 15, BIRTH);

    // Hot capacity is 10 — oldest entries are evicted
    expect(state.memory.hot.length).toBeLessThanOrEqual(10);
  });

  it("retains the most recent entries on overflow", () => {
    const seed = makeSeed();
    const { state } = doInteractions(createEntityState(seed, BIRTH), 15, BIRTH);

    // The last hot memory's summary should reference the last interaction
    const lastMem = state.memory.hot[state.memory.hot.length - 1];
    expect(lastMem.summary).toBe("interaction-14");
  });

  it("overflow returns evicted entry from addHotMemory", () => {
    let mem = createInitialMemoryState();
    let lastOverflow: MemoryEntry | null = null;

    for (let i = 0; i < 12; i++) {
      const entry: MemoryEntry = {
        timestamp: new Date(BIRTH.getTime() + i * 60_000).toISOString(),
        summary: `entry-${i}`,
        mood: 50,
      };
      const result = addHotMemory(mem, entry);
      mem = result.updated;
      lastOverflow = result.overflow;
    }

    // After 12 inserts into a capacity-10 buffer, overflow should have occurred
    expect(lastOverflow).not.toBeNull();
    expect(lastOverflow!.summary).toBe("entry-1");
    expect(mem.hot).toHaveLength(10);
  });
});

// ============================================================
// 3. Hot → Warm consolidation
// ============================================================

describe("hot to warm consolidation", () => {
  it("Sunday night heartbeat consolidates hot memories to warm", () => {
    const seed = makeSeed();
    let entity = createEntityState(seed, BIRTH);

    // Add some interactions during the week (Monday-Saturday)
    const { state: afterInteractions } = doInteractions(entity, 6, BIRTH);
    entity = afterInteractions;
    expect(entity.memory.hot.length).toBeGreaterThan(0);

    // Trigger Sunday night heartbeat
    const sunday = nextSundayNight(BIRTH);
    const hbResult = processHeartbeat(entity, sunday);

    expect(hbResult.memoryConsolidated).toBe(true);
    expect(hbResult.updatedState.memory.hot).toHaveLength(0);
    expect(hbResult.updatedState.memory.warm).toHaveLength(1);
  });

  it("warm entry has correct week string", () => {
    const seed = makeSeed();
    let entity = createEntityState(seed, BIRTH);
    const { state } = doInteractions(entity, 3, BIRTH);
    entity = state;

    const sunday = nextSundayNight(BIRTH);
    const hbResult = processHeartbeat(entity, sunday);
    const warmEntry = hbResult.updatedState.memory.warm[0];

    // Week of 2026-02-22 (the Sunday) should be W08
    const expectedWeek = getISOWeek(sunday);
    expect(warmEntry.week).toBe(expectedWeek);
  });

  it("warm entry records correct entry count", () => {
    const seed = makeSeed();
    let entity = createEntityState(seed, BIRTH);
    const { state } = doInteractions(entity, 7, BIRTH);
    entity = state;

    const sunday = nextSundayNight(BIRTH);
    const hbResult = processHeartbeat(entity, sunday);
    const warmEntry = hbResult.updatedState.memory.warm[0];

    // First interaction produces a first-encounter memory,
    // so 7 processInteraction calls = 7 hot memories (capped at 10)
    expect(warmEntry.entries).toBe(entity.memory.hot.length);
  });

  it("warm entry has correct average mood", () => {
    // Use the low-level consolidateToWarm to test mood averaging precisely
    let mem = createInitialMemoryState();
    const moods = [40, 60, 80];
    for (let i = 0; i < moods.length; i++) {
      const entry: MemoryEntry = {
        timestamp: new Date(BIRTH.getTime() + i * 60_000).toISOString(),
        summary: `test-${i}`,
        mood: moods[i],
      };
      const result = addHotMemory(mem, entry);
      mem = result.updated;
    }

    mem = consolidateToWarm(mem, "2026-W08");
    expect(mem.warm[0].averageMood).toBe(Math.round((40 + 60 + 80) / 3));
  });

  it("hot memory is empty after consolidation", () => {
    let mem = createInitialMemoryState();
    for (let i = 0; i < 5; i++) {
      const result = addHotMemory(mem, {
        timestamp: new Date(BIRTH.getTime() + i * 60_000).toISOString(),
        summary: `m-${i}`,
        mood: 50,
      });
      mem = result.updated;
    }

    mem = consolidateToWarm(mem, "2026-W08");
    expect(mem.hot).toHaveLength(0);
  });

  it("does not consolidate when hot memory is empty", () => {
    const seed = makeSeed();
    const entity = createEntityState(seed, BIRTH);

    // No interactions — hot is empty
    const sunday = nextSundayNight(BIRTH);
    const hbResult = processHeartbeat(entity, sunday);

    expect(hbResult.memoryConsolidated).toBe(false);
    expect(hbResult.updatedState.memory.warm).toHaveLength(0);
  });

  it("non-Sunday heartbeat does not consolidate memory", () => {
    const seed = makeSeed();
    let entity = createEntityState(seed, BIRTH);
    const { state } = doInteractions(entity, 5, BIRTH);
    entity = state;

    // Wednesday night (not Sunday)
    const wednesday = new Date("2026-02-18T21:30:00Z");
    const hbResult = processHeartbeat(entity, wednesday);

    expect(hbResult.memoryConsolidated).toBe(false);
    expect(hbResult.updatedState.memory.hot.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 4. Warm memory accumulation and warm → cold overflow
// ============================================================

describe("warm memory accumulation", () => {
  it("multiple weekly consolidations grow warm entries", () => {
    let mem = createInitialMemoryState();

    // Consolidate 3 separate weeks
    for (let w = 1; w <= 3; w++) {
      for (let i = 0; i < 4; i++) {
        const result = addHotMemory(mem, {
          timestamp: new Date(BIRTH.getTime() + (w * 7 + i) * 86400_000).toISOString(),
          summary: `week${w}-entry${i}`,
          mood: 50 + w,
        });
        mem = result.updated;
      }
      mem = consolidateToWarm(mem, `2026-W${String(7 + w).padStart(2, "0")}`);
    }

    expect(mem.warm).toHaveLength(3);
    expect(mem.hot).toHaveLength(0);
  });

  it("warm overflow pushes oldest entry to cold", () => {
    let mem = createInitialMemoryState();

    // WARM_CAPACITY is 8. Consolidate 9 weeks to trigger overflow.
    for (let w = 1; w <= 9; w++) {
      for (let i = 0; i < 2; i++) {
        const result = addHotMemory(mem, {
          timestamp: new Date(BIRTH.getTime() + (w * 7 + i) * 86400_000).toISOString(),
          summary: `w${w}-e${i}`,
          mood: 50,
        });
        mem = result.updated;
      }
      mem = consolidateToWarm(mem, `2026-W${String(7 + w).padStart(2, "0")}`);
    }

    // 9 consolidations into 8-capacity warm = 1 cold entry
    expect(mem.warm).toHaveLength(8);
    expect(mem.cold.length).toBeGreaterThanOrEqual(1);
    expect(mem.cold[0].weeks).toBeGreaterThanOrEqual(1);
  });

  it("cold entries have correct month and average mood", () => {
    let mem = createInitialMemoryState();

    for (let w = 1; w <= 9; w++) {
      const result = addHotMemory(mem, {
        timestamp: BIRTH.toISOString(),
        summary: `w${w}`,
        mood: 40 + w * 5,
      });
      mem = result.updated;
      mem = consolidateToWarm(mem, `2026-W${String(7 + w).padStart(2, "0")}`);
    }

    const cold = mem.cold[0];
    // Month should be a YYYY-MM string
    expect(cold.month).toMatch(/^\d{4}-\d{2}$/);
    expect(typeof cold.averageMood).toBe("number");
    expect(cold.averageMood).toBeGreaterThanOrEqual(0);
    expect(cold.averageMood).toBeLessThanOrEqual(100);
  });
});

// ============================================================
// 5. Notes system
// ============================================================

describe("notes system", () => {
  it("notes persist through hot → warm consolidation", () => {
    let mem = createInitialMemoryState();
    mem = addNote(mem, "The user prefers morning interactions");

    // Add some hot memories and consolidate
    for (let i = 0; i < 3; i++) {
      const result = addHotMemory(mem, {
        timestamp: BIRTH.toISOString(),
        summary: `entry-${i}`,
        mood: 55,
      });
      mem = result.updated;
    }
    mem = consolidateToWarm(mem, "2026-W08");

    expect(mem.notes).toHaveLength(1);
    expect(mem.notes[0]).toBe("The user prefers morning interactions");
    expect(mem.warm).toHaveLength(1);
    expect(mem.hot).toHaveLength(0);
  });

  it("multiple notes accumulate and survive multiple consolidations", () => {
    let mem = createInitialMemoryState();
    mem = addNote(mem, "note-alpha");

    // First consolidation
    const r1 = addHotMemory(mem, { timestamp: BIRTH.toISOString(), summary: "a", mood: 50 });
    mem = consolidateToWarm(r1.updated, "2026-W08");

    mem = addNote(mem, "note-beta");

    // Second consolidation
    const r2 = addHotMemory(mem, { timestamp: BIRTH.toISOString(), summary: "b", mood: 50 });
    mem = consolidateToWarm(r2.updated, "2026-W09");

    expect(mem.notes).toEqual(["note-alpha", "note-beta"]);
    expect(mem.warm).toHaveLength(2);
  });
});

// ============================================================
// 6. Memory in serialized state
// ============================================================

describe("memory in serialized state", () => {
  it("serializeState produces memoryMd containing hot memories", () => {
    const seed = makeSeed();
    const { state } = doInteractions(createEntityState(seed, BIRTH), 3, BIRTH);

    const { memoryMd } = serializeState(state);
    expect(memoryMd).toContain("Hot Memory");
    // Should contain the interaction summaries
    // First interaction is first encounter, rest are "interaction-N"
    expect(memoryMd).toContain("interaction-1");
    expect(memoryMd).toContain("interaction-2");
  });

  it("serializeState produces memoryMd containing warm entries after consolidation", () => {
    const seed = makeSeed();
    let entity = createEntityState(seed, BIRTH);
    const { state } = doInteractions(entity, 5, BIRTH);
    entity = state;

    const sunday = nextSundayNight(BIRTH);
    const hbResult = processHeartbeat(entity, sunday);
    entity = hbResult.updatedState;

    const { memoryMd } = serializeState(entity);
    expect(memoryMd).toContain("Warm Memory");
    // The warm section should now have a week header
    expect(memoryMd).toMatch(/###\s+\d{4}-W\d{2}/);
  });

  it("memoryMd round-trips hot memories through formatMemoryMd/parseMemoryMd", () => {
    let mem = createInitialMemoryState();
    for (let i = 0; i < 4; i++) {
      const result = addHotMemory(mem, {
        timestamp: new Date(BIRTH.getTime() + i * 60_000).toISOString(),
        summary: `round-trip-${i}`,
        mood: 50 + i * 5,
      });
      mem = result.updated;
    }

    const md = formatMemoryMd(mem);
    const parsed = parseMemoryMd(md);

    expect(parsed.hot).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(parsed.hot[i].summary).toBe(`round-trip-${i}`);
      expect(parsed.hot[i].mood).toBe(50 + i * 5);
    }
  });

  it("memoryMd round-trips notes through formatMemoryMd/parseMemoryMd", () => {
    let mem = createInitialMemoryState();
    mem = addNote(mem, "persistent observation A");
    mem = addNote(mem, "persistent observation B");

    const md = formatMemoryMd(mem);
    const parsed = parseMemoryMd(md);

    expect(parsed.notes).toEqual(["persistent observation A", "persistent observation B"]);
  });
});

// ============================================================
// 7. First encounter creates special memory
// ============================================================

describe("first encounter creates special memory", () => {
  it("first interaction produces a memory imprint with FIRST ENCOUNTER", () => {
    const seed = makeSeed();
    const entity = createEntityState(seed, BIRTH);

    const result = processInteraction(
      entity,
      { minutesSinceLastInteraction: 999, userInitiated: true, messageLength: 20 },
      new Date("2026-02-16T09:00:00Z"),
    );

    expect(result.firstEncounter).not.toBeNull();
    const mem = result.updatedState.memory.hot[0];
    expect(mem.summary).toContain("FIRST ENCOUNTER");
  });

  it("second interaction does NOT produce a first encounter memory", () => {
    const seed = makeSeed();
    let entity = createEntityState(seed, BIRTH);

    // First interaction
    const first = processInteraction(
      entity,
      { minutesSinceLastInteraction: 999, userInitiated: true, messageLength: 20 },
      new Date("2026-02-16T09:00:00Z"),
    );
    entity = first.updatedState;

    // Second interaction
    const second = processInteraction(
      entity,
      { minutesSinceLastInteraction: 60, userInitiated: true, messageLength: 30 },
      new Date("2026-02-16T10:00:00Z"),
      "normal conversation",
    );

    expect(second.firstEncounter).toBeNull();
    const lastMem = second.updatedState.memory.hot[1];
    expect(lastMem.summary).toBe("normal conversation");
    expect(lastMem.summary).not.toContain("FIRST ENCOUNTER");
  });

  it("first encounter memory survives consolidation to warm", () => {
    const seed = makeSeed();
    let entity = createEntityState(seed, BIRTH);

    // First encounter + a few more interactions
    const { state } = doInteractions(entity, 5, BIRTH);
    entity = state;

    // The first hot memory should be the first encounter
    expect(entity.memory.hot[0].summary).toContain("FIRST ENCOUNTER");

    // Consolidate
    const sunday = nextSundayNight(BIRTH);
    const hbResult = processHeartbeat(entity, sunday);
    entity = hbResult.updatedState;

    // The warm summary should contain the first encounter text
    expect(entity.memory.warm[0].summary).toContain("FIRST ENCOUNTER");
  });
});

// ============================================================
// 8. Memory integrity through heartbeats
// ============================================================

describe("memory integrity through heartbeats", () => {
  it("heartbeats between interactions do not lose hot memories", () => {
    const seed = makeSeed();
    let entity = createEntityState(seed, BIRTH);

    // Do 3 interactions
    const t1 = new Date("2026-02-16T09:00:00Z");
    for (let i = 0; i < 3; i++) {
      const result = processInteraction(
        entity,
        { minutesSinceLastInteraction: 60, userInitiated: true, messageLength: 30 },
        new Date(t1.getTime() + i * 3600_000),
        `msg-${i}`,
      );
      entity = result.updatedState;
    }

    const hotCountBefore = entity.memory.hot.length;

    // 10 non-Sunday heartbeats (Monday through Saturday midday)
    for (let i = 0; i < 10; i++) {
      // Spread heartbeats across Mon-Sat at midday (no consolidation trigger)
      const hbTime = new Date("2026-02-16T12:00:00Z");
      hbTime.setTime(hbTime.getTime() + i * 30 * 60_000);
      const hbResult = processHeartbeat(entity, hbTime);
      entity = hbResult.updatedState;
      expect(hbResult.memoryConsolidated).toBe(false);
    }

    // Hot memories should be untouched
    expect(entity.memory.hot.length).toBe(hotCountBefore);
  });

  it("warm memories persist through many heartbeats", () => {
    const seed = makeSeed();
    let entity = createEntityState(seed, BIRTH);

    // Interactions + consolidation
    const { state } = doInteractions(entity, 4, BIRTH);
    entity = state;

    const sunday = nextSundayNight(BIRTH);
    const hbResult = processHeartbeat(entity, sunday);
    entity = hbResult.updatedState;
    expect(entity.memory.warm).toHaveLength(1);

    // Many subsequent non-Sunday heartbeats
    const nextMonday = new Date("2026-02-23T10:00:00Z");
    for (let i = 0; i < 15; i++) {
      const hbTime = new Date(nextMonday.getTime() + i * 30 * 60_000);
      const result = processHeartbeat(entity, hbTime);
      entity = result.updatedState;
    }

    // Warm memory should still be there
    expect(entity.memory.warm).toHaveLength(1);
    expect(entity.memory.warm[0].entries).toBeGreaterThan(0);
  });

  it("memory is not corrupted by rapid heartbeat-interaction interleaving", () => {
    const seed = makeSeed();
    let entity = createEntityState(seed, BIRTH);

    // Interleave: interaction, heartbeat, interaction, heartbeat, ...
    const baseTime = new Date("2026-02-16T10:00:00Z");
    for (let i = 0; i < 8; i++) {
      const t = new Date(baseTime.getTime() + i * 15 * 60_000);
      if (i % 2 === 0) {
        const result = processInteraction(
          entity,
          { minutesSinceLastInteraction: 15, userInitiated: true, messageLength: 25 },
          t,
          `interleaved-${i}`,
        );
        entity = result.updatedState;
      } else {
        const result = processHeartbeat(entity, t);
        entity = result.updatedState;
      }
    }

    // 4 interactions (i=0,2,4,6) should have produced 4 hot memories
    expect(entity.memory.hot).toHaveLength(4);
    // All moods should be valid numbers
    for (const mem of entity.memory.hot) {
      expect(mem.mood).toBeGreaterThanOrEqual(0);
      expect(mem.mood).toBeLessThanOrEqual(100);
      expect(mem.timestamp).toBeTruthy();
      expect(mem.summary).toBeTruthy();
    }
  });
});

// ============================================================
// 9. Memory affects growth evaluation
// ============================================================

describe("memory affects growth evaluation", () => {
  it("first_memory_warm milestone fires after warm memory forms", () => {
    const seed = makeSeed();
    let entity = createEntityState(seed, BIRTH);

    // Before consolidation: no first_memory_warm milestone
    const { state: afterInteractions } = doInteractions(entity, 5, BIRTH);
    entity = afterInteractions;

    const hasMilestoneBefore = entity.growth.milestones.some(
      (m) => m.id === "first_memory_warm",
    );
    expect(hasMilestoneBefore).toBe(false);

    // Sunday night heartbeat triggers consolidation.
    // Note: In processHeartbeat, growth evaluation runs BEFORE memory
    // consolidation, so the milestone cannot fire on the same heartbeat.
    const sunday = nextSundayNight(BIRTH);
    const hbResult = processHeartbeat(entity, sunday);
    entity = hbResult.updatedState;

    // Verify consolidation happened
    expect(hbResult.memoryConsolidated).toBe(true);
    expect(entity.memory.warm).toHaveLength(1);

    // The milestone has not fired yet because growth was evaluated
    // before the consolidation in the same heartbeat
    const hasMilestoneAfterConsolidation = entity.growth.milestones.some(
      (m) => m.id === "first_memory_warm",
    );
    expect(hasMilestoneAfterConsolidation).toBe(false);

    // Next heartbeat (or interaction) after consolidation should fire the milestone,
    // because now warm memory exists when growth is evaluated.
    const nextInteractionTime = new Date("2026-02-23T09:00:00Z");
    const interactionResult = processInteraction(
      entity,
      { minutesSinceLastInteraction: 60, userInitiated: true, messageLength: 30 },
      nextInteractionTime,
      "hello after consolidation",
    );
    entity = interactionResult.updatedState;

    const hasMilestoneAfterNextInteraction = entity.growth.milestones.some(
      (m) => m.id === "first_memory_warm",
    );
    expect(hasMilestoneAfterNextInteraction).toBe(true);

    const newIds = interactionResult.newMilestones.map((m) => m.id);
    expect(newIds).toContain("first_memory_warm");
  });

  it("first_memory_warm milestone fires only once across multiple consolidations", () => {
    const seed = makeSeed();
    let entity = createEntityState(seed, BIRTH);

    // Week 1: interactions + Sunday consolidation
    const { state: w1 } = doInteractions(entity, 3, BIRTH);
    entity = w1;
    const sun1 = nextSundayNight(BIRTH);
    const hb1 = processHeartbeat(entity, sun1);
    entity = hb1.updatedState;

    // Trigger the milestone via an interaction after consolidation
    const postConsolidation1 = new Date("2026-02-23T09:00:00Z");
    const ir1 = processInteraction(
      entity,
      { minutesSinceLastInteraction: 60, userInitiated: true, messageLength: 30 },
      postConsolidation1,
      "post-consolidation-1",
    );
    entity = ir1.updatedState;
    const firstFire = ir1.newMilestones.filter((m) => m.id === "first_memory_warm");
    expect(firstFire).toHaveLength(1);

    // Week 2: more interactions + another consolidation
    const week2Start = new Date("2026-02-23T10:00:00Z");
    const { state: w2 } = doInteractions(entity, 3, week2Start);
    entity = w2;
    const sun2 = nextSundayNight(week2Start);
    const hb2 = processHeartbeat(entity, sun2);
    entity = hb2.updatedState;

    // Another interaction after second consolidation
    const postConsolidation2 = new Date("2026-03-02T09:00:00Z");
    const ir2 = processInteraction(
      entity,
      { minutesSinceLastInteraction: 60, userInitiated: true, messageLength: 30 },
      postConsolidation2,
      "post-consolidation-2",
    );
    entity = ir2.updatedState;

    // The milestone should NOT fire again
    const secondFire = ir2.newMilestones.filter((m) => m.id === "first_memory_warm");
    expect(secondFire).toHaveLength(0);
  });
});

// ============================================================
// Bonus: Full lifecycle simulation across multiple weeks
// ============================================================

describe("full memory lifecycle across multiple weeks", () => {
  it("simulates 3 weeks: interactions → consolidations → serialization", () => {
    const seed = makeSeed();
    let entity = createEntityState(seed, BIRTH);

    // --- Week 1 (Mon 2026-02-16 to Sun 2026-02-22) ---
    const week1Start = new Date("2026-02-16T09:00:00Z");
    const { state: w1 } = doInteractions(entity, 6, week1Start);
    entity = w1;

    const sun1 = new Date("2026-02-22T21:30:00Z"); // Sunday night
    const hb1 = processHeartbeat(entity, sun1);
    entity = hb1.updatedState;
    expect(hb1.memoryConsolidated).toBe(true);
    expect(entity.memory.warm).toHaveLength(1);
    expect(entity.memory.hot).toHaveLength(0);

    // --- Week 2 (Mon 2026-02-23 to Sun 2026-03-01) ---
    const week2Start = new Date("2026-02-23T09:00:00Z");
    const { state: w2 } = doInteractions(entity, 4, week2Start);
    entity = w2;

    const sun2 = new Date("2026-03-01T21:30:00Z");
    const hb2 = processHeartbeat(entity, sun2);
    entity = hb2.updatedState;
    expect(hb2.memoryConsolidated).toBe(true);
    expect(entity.memory.warm).toHaveLength(2);

    // --- Week 3 (Mon 2026-03-02 to Sun 2026-03-08) ---
    const week3Start = new Date("2026-03-02T09:00:00Z");
    const { state: w3 } = doInteractions(entity, 3, week3Start);
    entity = w3;

    const sun3 = new Date("2026-03-08T21:30:00Z");
    const hb3 = processHeartbeat(entity, sun3);
    entity = hb3.updatedState;
    expect(hb3.memoryConsolidated).toBe(true);
    expect(entity.memory.warm).toHaveLength(3);
    expect(entity.memory.cold).toHaveLength(0); // Not enough warm entries to overflow

    // --- Final serialization ---
    const { memoryMd } = serializeState(entity);
    expect(memoryMd).toContain("Warm Memory");
    expect(memoryMd).toContain("Hot Memory");
    // Three warm entries should produce three week headers
    const weekHeaders = memoryMd.match(/###\s+\d{4}-W\d{2}/g);
    expect(weekHeaders).toHaveLength(3);
  });
});
