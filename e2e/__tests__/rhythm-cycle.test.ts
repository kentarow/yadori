/**
 * End-to-End Test — Daily Rhythm System
 *
 * Verifies the entity's circadian rhythm:
 *   Morning (7-11):   Energy rises, wake signal
 *   Midday (11-14):   Active period
 *   Afternoon (14-17): Energy maintained
 *   Evening (17-21):  Energy starts to decline, diary generation
 *   Night (21-24):    Sleep signal, energy drops, memory consolidation (Sunday)
 *   Late Night (0-5): Deep rest
 *   Dawn (5-7):       Pre-wake
 *
 * The rhythm system drives:
 *   - Wake/sleep signals
 *   - Diary generation timing
 *   - Memory consolidation (Sunday night)
 *   - Energy curve modulation
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
  computeHeartbeat,
  getTimeOfDay,
  isActiveHours,
  shouldPulse,
} from "../../engine/src/rhythm/rhythm-system.js";
import { PERCEPTION_SYMBOLS } from "../../engine/src/language/language-engine.js";
import type { HardwareBody, PerceptionMode } from "../../engine/src/types.js";

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

/** Birth time: a Monday morning so week boundaries are clean. */
const BIRTH = new Date("2026-02-16T06:00:00Z"); // Monday 06:00 UTC

function makeSeed(
  overrides: { createdAt?: string; perception?: PerceptionMode } = {},
) {
  return createFixedSeed({
    hardwareBody: TEST_HW,
    createdAt: overrides.createdAt ?? BIRTH.toISOString(),
    perception: overrides.perception ?? "chromatic",
  });
}

/** Create a Date at a specific hour (and optionally minute) on a given base day. */
function atHour(base: Date, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

/** Create a Date at the given day-of-week (0=Sun, 1=Mon, ...) in the same week as base. */
function dayOfWeek(base: Date, dow: number, hour: number, minute = 0): Date {
  const d = new Date(base);
  const currentDow = d.getUTCDay();
  const diff = dow - currentDow;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

// ============================================================
// 1. Morning wake signal
// ============================================================

describe("morning wake signal", () => {
  it("heartbeat at 07:00 produces wakeSignal = true", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);
    const morning = atHour(BIRTH, 7, 0);
    const result = processHeartbeat(state, morning);

    expect(result.wakeSignal).toBe(true);
    expect(result.sleepSignal).toBe(false);
  });

  it("heartbeat at 09:00 also produces wakeSignal = true", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);
    const morning9 = atHour(BIRTH, 9, 0);
    const result = processHeartbeat(state, morning9);

    expect(result.wakeSignal).toBe(true);
  });

  it("heartbeat at 10:59 still produces wakeSignal = true (morning extends to 11)", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);
    const lateMorning = atHour(BIRTH, 10, 59);
    const result = processHeartbeat(state, lateMorning);

    expect(result.wakeSignal).toBe(true);
  });
});

// ============================================================
// 2. Night sleep signal
// ============================================================

describe("night sleep signal", () => {
  it("heartbeat at 21:00 produces sleepSignal = true", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);
    const night = atHour(BIRTH, 21, 0);
    const result = processHeartbeat(state, night);

    expect(result.sleepSignal).toBe(true);
    expect(result.wakeSignal).toBe(false);
  });

  it("heartbeat at 23:00 also produces sleepSignal = true", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);
    const lateNight = atHour(BIRTH, 23, 0);
    const result = processHeartbeat(state, lateNight);

    expect(result.sleepSignal).toBe(true);
  });

  it("heartbeat at 23:59 still produces sleepSignal = true (night extends to midnight)", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);
    const almostMidnight = atHour(BIRTH, 23, 59);
    const result = processHeartbeat(state, almostMidnight);

    expect(result.sleepSignal).toBe(true);
  });
});

// ============================================================
// 3. No signals at midday
// ============================================================

describe("no signals at midday", () => {
  it("heartbeat at 12:00 produces neither wake nor sleep signal", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);
    const midday = atHour(BIRTH, 12, 0);
    const result = processHeartbeat(state, midday);

    expect(result.wakeSignal).toBe(false);
    expect(result.sleepSignal).toBe(false);
  });

  it("heartbeat at 15:00 (afternoon) produces neither wake nor sleep signal", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);
    const afternoon = atHour(BIRTH, 15, 0);
    const result = processHeartbeat(state, afternoon);

    expect(result.wakeSignal).toBe(false);
    expect(result.sleepSignal).toBe(false);
  });
});

// ============================================================
// 4. Evening diary generation
// ============================================================

describe("evening diary generation", () => {
  it("heartbeat in evening window (17-21) generates diary entry", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);
    const evening = atHour(BIRTH, 18, 0);
    const result = processHeartbeat(state, evening);

    expect(result.diary).not.toBeNull();
    expect(result.diary!.date).toBe("2026-02-16");
    expect(result.diary!.content.length).toBeGreaterThan(0);
  });

  it("heartbeat at exactly 17:00 generates diary", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);
    const eveningStart = atHour(BIRTH, 17, 0);
    const result = processHeartbeat(state, eveningStart);

    expect(result.diary).not.toBeNull();
  });

  it("heartbeat at 20:59 still generates diary (evening extends to 21)", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);
    const lateEvening = atHour(BIRTH, 20, 59);
    const result = processHeartbeat(state, lateEvening);

    expect(result.diary).not.toBeNull();
  });
});

// ============================================================
// 5. No diary at morning
// ============================================================

describe("no diary at morning", () => {
  it("heartbeat at 08:00 does not generate diary", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);
    const morning = atHour(BIRTH, 8, 0);
    const result = processHeartbeat(state, morning);

    expect(result.diary).toBeNull();
  });

  it("heartbeat at midday does not generate diary", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);
    const midday = atHour(BIRTH, 12, 0);
    const result = processHeartbeat(state, midday);

    expect(result.diary).toBeNull();
  });

  it("heartbeat at night does not generate diary", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);
    const night = atHour(BIRTH, 22, 0);
    const result = processHeartbeat(state, night);

    expect(result.diary).toBeNull();
  });
});

// ============================================================
// 6. Sunday night memory consolidation
// ============================================================

describe("Sunday night memory consolidation", () => {
  it("Sunday 23:00 heartbeat triggers memory consolidation when hot memories exist", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH);

    // Add interactions to populate hot memory
    const interactionTime = atHour(BIRTH, 10, 0);
    for (let i = 0; i < 3; i++) {
      const t = new Date(interactionTime.getTime() + i * 30 * 60_000);
      const result = processInteraction(
        state,
        { minutesSinceLastInteraction: i === 0 ? 999 : 30, userInitiated: true, messageLength: 30 },
        t,
        `message-${i}`,
      );
      state = result.updatedState;
    }
    expect(state.memory.hot.length).toBeGreaterThan(0);

    // Sunday 23:00 in the same week (BIRTH is Monday Feb 16)
    const sunday = dayOfWeek(BIRTH, 0, 23, 0);
    // Adjust to next Sunday since dayOfWeek(Monday, 0) goes backwards
    const nextSunday = new Date(sunday.getTime() + 7 * 24 * 60 * 60_000);
    const result = processHeartbeat(state, nextSunday);

    expect(result.memoryConsolidated).toBe(true);
    expect(result.updatedState.memory.warm.length).toBeGreaterThanOrEqual(1);
    expect(result.updatedState.memory.hot).toHaveLength(0);
  });

  it("Sunday night without hot memories does not consolidate", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);

    // No interactions, hot memory is empty
    const sunday = new Date("2026-02-22T23:00:00Z"); // Sunday
    const result = processHeartbeat(state, sunday);

    expect(result.memoryConsolidated).toBe(false);
  });
});

// ============================================================
// 7. Weekday night no consolidation
// ============================================================

describe("weekday night no consolidation", () => {
  it("Wednesday 23:00 does not consolidate memory", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH);

    // Add some hot memories
    for (let i = 0; i < 3; i++) {
      const t = new Date(BIRTH.getTime() + i * 30 * 60_000);
      const result = processInteraction(
        state,
        { minutesSinceLastInteraction: i === 0 ? 999 : 30, userInitiated: true, messageLength: 25 },
        t,
        `msg-${i}`,
      );
      state = result.updatedState;
    }

    // Wednesday 23:00
    const wednesday = new Date("2026-02-18T23:00:00Z"); // Wednesday
    expect(wednesday.getUTCDay()).toBe(3); // Verify it is Wednesday

    const result = processHeartbeat(state, wednesday);
    expect(result.memoryConsolidated).toBe(false);
    expect(state.memory.hot.length).toBeGreaterThan(0);
  });

  it("Friday 22:00 does not consolidate memory", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH);

    // Add hot memory
    const result1 = processInteraction(
      state,
      { minutesSinceLastInteraction: 999, userInitiated: true, messageLength: 30 },
      BIRTH,
      "hello",
    );
    state = result1.updatedState;

    const friday = new Date("2026-02-20T22:00:00Z");
    expect(friday.getUTCDay()).toBe(5); // Verify it is Friday

    const result = processHeartbeat(state, friday);
    expect(result.memoryConsolidated).toBe(false);
  });
});

// ============================================================
// 8. Energy curve across day
// ============================================================

describe("energy curve", () => {
  it("energy drifts higher during morning than late night after multiple heartbeats", () => {
    const seed = makeSeed();

    // Morning entity: start at neutral energy, process several morning heartbeats
    let morningState = createEntityState(seed, BIRTH);
    for (let i = 0; i < 5; i++) {
      const t = atHour(BIRTH, 8, i * 10);
      morningState = processHeartbeat(morningState, t).updatedState;
    }

    // Night entity: start at neutral energy, process several late night heartbeats
    let nightState = createEntityState(seed, BIRTH);
    for (let i = 0; i < 5; i++) {
      const t = atHour(BIRTH, 2, i * 10);
      nightState = processHeartbeat(nightState, t).updatedState;
    }

    // Morning energy should be higher than late night energy
    expect(morningState.status.energy).toBeGreaterThan(nightState.status.energy);
  });

  it("energy target at morning (75) is higher than at night (25)", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);

    const morningPulse = computeHeartbeat(state.status, atHour(BIRTH, 8, 0));
    const nightPulse = computeHeartbeat(state.status, atHour(BIRTH, 22, 0));

    // When energy is 50 (initial), morning pulls it up, night pulls it down
    expect(morningPulse.statusAdjustment.energy).toBeGreaterThan(0);
    expect(nightPulse.statusAdjustment.energy).toBeLessThan(0);
  });

  it("mood drifts positive in morning and negative at night", () => {
    const seed = makeSeed();
    const state = createEntityState(seed, BIRTH);

    const morningPulse = computeHeartbeat(state.status, atHour(BIRTH, 8, 0));
    const nightPulse = computeHeartbeat(state.status, atHour(BIRTH, 22, 0));

    expect(morningPulse.statusAdjustment.mood).toBeGreaterThan(0);
    expect(nightPulse.statusAdjustment.mood).toBeLessThan(0);
  });
});

// ============================================================
// 9. Full 24-hour cycle
// ============================================================

describe("full 24-hour cycle", () => {
  it("processes heartbeats every 30 minutes for 24 hours with correct signals", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH);

    let wakeCount = 0;
    let sleepCount = 0;
    let diaryCount = 0;
    const energyByHour: number[] = [];

    // 48 heartbeats (every 30 minutes for 24 hours), starting at 00:00
    const dayStart = atHour(BIRTH, 0, 0);
    for (let i = 0; i < 48; i++) {
      const t = new Date(dayStart.getTime() + i * 30 * 60_000);
      const result = processHeartbeat(state, t);

      if (result.wakeSignal) wakeCount++;
      if (result.sleepSignal) sleepCount++;
      if (result.diary) diaryCount++;

      // Record energy at whole hours
      if (i % 2 === 0) {
        energyByHour.push(result.updatedState.status.energy);
      }

      state = result.updatedState;
    }

    // Exactly 8 wake signals: hours 7,7:30,8,8:30,9,9:30,10,10:30 (morning = 7-11)
    expect(wakeCount).toBe(8);

    // Exactly 6 sleep signals: hours 21,21:30,22,22:30,23,23:30 (night = 21-24)
    expect(sleepCount).toBe(6);

    // 8 diary signals: hours 17,17:30,18,18:30,19,19:30,20,20:30 (evening = 17-21)
    expect(diaryCount).toBe(8);

    // Energy should follow the rhythm system's pull direction.
    // We verify that the rhythm pulse's energy adjustments are directionally correct
    // (already covered in detail by the "energy curve" section above).
    // Here we just verify the 24-hour cycle completed without issues.
    expect(energyByHour.length).toBe(24); // 48 half-hours / 2 = 24 recorded points
  });

  it("all status values remain in 0-100 range throughout the day", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH);

    const dayStart = atHour(BIRTH, 0, 0);
    for (let i = 0; i < 48; i++) {
      const t = new Date(dayStart.getTime() + i * 30 * 60_000);
      const result = processHeartbeat(state, t);
      state = result.updatedState;

      expect(state.status.mood).toBeGreaterThanOrEqual(0);
      expect(state.status.mood).toBeLessThanOrEqual(100);
      expect(state.status.energy).toBeGreaterThanOrEqual(0);
      expect(state.status.energy).toBeLessThanOrEqual(100);
      expect(state.status.curiosity).toBeGreaterThanOrEqual(0);
      expect(state.status.curiosity).toBeLessThanOrEqual(100);
      expect(state.status.comfort).toBeGreaterThanOrEqual(0);
      expect(state.status.comfort).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================================
// 10. Multi-day progression
// ============================================================

describe("multi-day progression", () => {
  it("3 days of heartbeats produce diary entries on each evening", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH);
    const diaries: Array<{ date: string; content: string }> = [];

    // 3 days, heartbeats every 30 minutes during active hours (7-23)
    for (let day = 0; day < 3; day++) {
      const baseDay = new Date(BIRTH.getTime() + day * 24 * 60 * 60_000);
      // 32 heartbeats per day (hours 7 through 22:30)
      for (let slot = 0; slot < 32; slot++) {
        const t = new Date(atHour(baseDay, 7, 0).getTime() + slot * 30 * 60_000);
        const result = processHeartbeat(state, t);
        state = result.updatedState;

        if (result.diary) {
          diaries.push(result.diary);
        }
      }
    }

    // Each day should produce diary entries during the evening window (17:00-20:30)
    // Evening window: 17:00, 17:30, 18:00, 18:30, 19:00, 19:30, 20:00, 20:30 = 8 per day
    expect(diaries.length).toBe(24); // 8 per day * 3 days

    // Diaries should span 3 different dates
    const uniqueDates = new Set(diaries.map((d) => d.date));
    expect(uniqueDates.size).toBe(3);
  });

  it("growthDay advances across multi-day heartbeats", () => {
    const seed = makeSeed();
    let state = createEntityState(seed, BIRTH);

    // Day 0 heartbeat
    const day0 = atHour(BIRTH, 12, 0);
    state = processHeartbeat(state, day0).updatedState;
    expect(state.status.growthDay).toBe(0);

    // Day 2 heartbeat
    const day2 = new Date(BIRTH.getTime() + 2 * 24 * 60 * 60_000);
    state = processHeartbeat(state, atHour(day2, 12, 0)).updatedState;
    expect(state.status.growthDay).toBe(2);

    // Day 5 heartbeat
    const day5 = new Date(BIRTH.getTime() + 5 * 24 * 60 * 60_000);
    state = processHeartbeat(state, atHour(day5, 12, 0)).updatedState;
    expect(state.status.growthDay).toBe(5);
  });
});

// ============================================================
// 11. Diary content reflects species perception
// ============================================================

describe("diary content reflects species perception", () => {
  it("chromatic entity diary contains chromatic native symbols", () => {
    const seed = makeSeed({ perception: "chromatic" });
    const state = createEntityState(seed, BIRTH);
    const evening = atHour(BIRTH, 18, 0);
    const result = processHeartbeat(state, evening);

    expect(result.diary).not.toBeNull();
    const content = result.diary!.content;

    // Diary should contain at least one of the chromatic native symbols
    const chromaticSymbols = PERCEPTION_SYMBOLS.chromatic;
    const hasSymbol = chromaticSymbols.some((s) => content.includes(s));
    expect(hasSymbol).toBe(true);
  });

  it("vibration entity diary contains vibration native symbols", () => {
    const seed = makeSeed({ perception: "vibration" });
    const state = createEntityState(seed, BIRTH);
    const evening = atHour(BIRTH, 18, 0);
    const result = processHeartbeat(state, evening);

    expect(result.diary).not.toBeNull();
    const content = result.diary!.content;

    const vibrationSymbols = PERCEPTION_SYMBOLS.vibration;
    const hasSymbol = vibrationSymbols.some((s) => content.includes(s));
    expect(hasSymbol).toBe(true);
  });

  it("geometric entity diary contains geometric native symbols", () => {
    const seed = makeSeed({ perception: "geometric" });
    const state = createEntityState(seed, BIRTH);
    const evening = atHour(BIRTH, 18, 0);
    const result = processHeartbeat(state, evening);

    expect(result.diary).not.toBeNull();
    const content = result.diary!.content;

    const geometricSymbols = PERCEPTION_SYMBOLS.geometric;
    const hasSymbol = geometricSymbols.some((s) => content.includes(s));
    expect(hasSymbol).toBe(true);
  });

  it("different species produce different diary content", () => {
    const eveningTime = atHour(BIRTH, 18, 0);

    const chromaticSeed = makeSeed({ perception: "chromatic" });
    const chromaticState = createEntityState(chromaticSeed, BIRTH);
    const chromaticDiary = processHeartbeat(chromaticState, eveningTime).diary!;

    const vibrationSeed = makeSeed({ perception: "vibration" });
    const vibrationState = createEntityState(vibrationSeed, BIRTH);
    const vibrationDiary = processHeartbeat(vibrationState, eveningTime).diary!;

    // Different species should produce different content
    // (they use different native symbols)
    expect(chromaticDiary.content).not.toBe(vibrationDiary.content);
  });

  it("diary entry includes growth day and status metadata", () => {
    const createdAt = new Date(BIRTH.getTime() - 5 * 24 * 60 * 60_000).toISOString();
    const seed = makeSeed({ createdAt });
    const state = createEntityState(seed, BIRTH);
    const evening = atHour(BIRTH, 18, 0);
    const result = processHeartbeat(state, evening);

    expect(result.diary).not.toBeNull();
    const content = result.diary!.content;

    // Diary should contain growth day and status metadata comment
    expect(content).toContain("Day ");
    expect(content).toMatch(/<!-- mood:\d+ energy:\d+ curiosity:\d+ comfort:\d+ -->/);
  });
});

// ============================================================
// Supplementary: getTimeOfDay and isActiveHours boundaries
// ============================================================

describe("time-of-day classification boundaries", () => {
  it("correctly classifies all time-of-day segments", () => {
    expect(getTimeOfDay(atHour(BIRTH, 3, 0))).toBe("lateNight");
    expect(getTimeOfDay(atHour(BIRTH, 5, 0))).toBe("dawn");
    expect(getTimeOfDay(atHour(BIRTH, 6, 59))).toBe("dawn");
    expect(getTimeOfDay(atHour(BIRTH, 7, 0))).toBe("morning");
    expect(getTimeOfDay(atHour(BIRTH, 10, 59))).toBe("morning");
    expect(getTimeOfDay(atHour(BIRTH, 11, 0))).toBe("midday");
    expect(getTimeOfDay(atHour(BIRTH, 13, 59))).toBe("midday");
    expect(getTimeOfDay(atHour(BIRTH, 14, 0))).toBe("afternoon");
    expect(getTimeOfDay(atHour(BIRTH, 16, 59))).toBe("afternoon");
    expect(getTimeOfDay(atHour(BIRTH, 17, 0))).toBe("evening");
    expect(getTimeOfDay(atHour(BIRTH, 20, 59))).toBe("evening");
    expect(getTimeOfDay(atHour(BIRTH, 21, 0))).toBe("night");
    expect(getTimeOfDay(atHour(BIRTH, 23, 59))).toBe("night");
    expect(getTimeOfDay(atHour(BIRTH, 0, 0))).toBe("lateNight");
    expect(getTimeOfDay(atHour(BIRTH, 4, 59))).toBe("lateNight");
  });

  it("isActiveHours returns true during 7-23 and false otherwise", () => {
    expect(isActiveHours(atHour(BIRTH, 6, 59))).toBe(false);
    expect(isActiveHours(atHour(BIRTH, 7, 0))).toBe(true);
    expect(isActiveHours(atHour(BIRTH, 12, 0))).toBe(true);
    expect(isActiveHours(atHour(BIRTH, 22, 59))).toBe(true);
    expect(isActiveHours(atHour(BIRTH, 23, 0))).toBe(false);
    expect(isActiveHours(atHour(BIRTH, 3, 0))).toBe(false);
  });

  it("shouldPulse returns true when enough time has elapsed", () => {
    const last = atHour(BIRTH, 10, 0);
    const now30 = atHour(BIRTH, 10, 30);
    const now20 = atHour(BIRTH, 10, 20);

    expect(shouldPulse(last, now30, 30)).toBe(true);
    expect(shouldPulse(last, now20, 30)).toBe(false);
    expect(shouldPulse(null, now20, 30)).toBe(true); // null lastPulse always pulses
  });
});
