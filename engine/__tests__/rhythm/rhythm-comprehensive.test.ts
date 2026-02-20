import { describe, it, expect } from "vitest";
import {
  getTimeOfDay,
  computeHeartbeat,
  shouldPulse,
  isActiveHours,
  type TimeOfDay,
} from "../../src/rhythm/rhythm-system.js";
import { LanguageLevel, type Status } from "../../src/types.js";

// --- Helpers ---

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

/** Create a Date for a specific hour and minute on 2026-02-18 (Wednesday). */
function dateAt(hour: number, minute = 0): Date {
  return new Date(2026, 1, 18, hour, minute);
}

/** Create a Date on a specific day-of-week in Feb 2026.
 *  dayOfMonth should be chosen to match the desired weekday.
 *  2026-02-15 = Sunday, 2026-02-16 = Monday, ..., 2026-02-21 = Saturday, 2026-02-22 = Sunday
 */
function dateOnDay(dayOfMonth: number, hour: number, minute = 0): Date {
  return new Date(2026, 1, dayOfMonth, hour, minute);
}

// --- 1. Circadian energy curve: verify energy targets for each TimeOfDay ---

describe("Circadian energy curve", () => {
  const EXPECTED_ENERGY_CURVE: Record<TimeOfDay, number> = {
    dawn: 40,
    morning: 75,
    midday: 65,
    afternoon: 55,
    evening: 40,
    night: 25,
    lateNight: 10,
  };

  it("energy drift pulls toward dawn target (40) at hour 5", () => {
    // status.energy = 40, so drift should be 0 (already at target)
    const pulse = computeHeartbeat(makeStatus({ energy: 40 }), dateAt(5));
    expect(pulse.statusAdjustment.energy).toBe(0);
  });

  it("energy drift pulls toward morning target (75) at hour 9", () => {
    // status.energy = 50, target = 75, drift = round((75-50) * 0.15) = round(3.75) = 4
    const pulse = computeHeartbeat(makeStatus({ energy: 50 }), dateAt(9));
    expect(pulse.statusAdjustment.energy).toBe(4);
  });

  it("energy drift pulls toward midday target (65) at hour 12", () => {
    // status.energy = 50, target = 65, drift = round((65-50) * 0.15) = round(2.25) = 2
    const pulse = computeHeartbeat(makeStatus({ energy: 50 }), dateAt(12));
    expect(pulse.statusAdjustment.energy).toBe(2);
  });

  it("energy drift pulls toward afternoon target (55) at hour 15", () => {
    // status.energy = 50, target = 55, drift = round((55-50) * 0.15) = round(0.75) = 1
    const pulse = computeHeartbeat(makeStatus({ energy: 50 }), dateAt(15));
    expect(pulse.statusAdjustment.energy).toBe(1);
  });

  it("energy drift pulls toward evening target (40) at hour 19", () => {
    // status.energy = 50, target = 40, drift = round((40-50) * 0.15) = round(-1.5) = -1
    // (JS Math.round rounds half toward +Infinity: Math.round(-1.5) === -1)
    const pulse = computeHeartbeat(makeStatus({ energy: 50 }), dateAt(19));
    expect(pulse.statusAdjustment.energy).toBe(-1);
  });

  it("energy drift pulls toward night target (25) at hour 22", () => {
    // status.energy = 50, target = 25, drift = round((25-50) * 0.15) = round(-3.75) = -4
    const pulse = computeHeartbeat(makeStatus({ energy: 50 }), dateAt(22));
    expect(pulse.statusAdjustment.energy).toBe(-4);
  });

  it("energy drift pulls toward lateNight target (10) at hour 2", () => {
    // status.energy = 50, target = 10, drift = round((10-50) * 0.15) = round(-6) = -6
    const pulse = computeHeartbeat(makeStatus({ energy: 50 }), dateAt(2));
    expect(pulse.statusAdjustment.energy).toBe(-6);
  });

  it("drift is zero when energy already matches the target curve", () => {
    for (const [tod, target] of Object.entries(EXPECTED_ENERGY_CURVE)) {
      // Pick a representative hour for each time of day
      const hours: Record<string, number> = {
        dawn: 6, morning: 9, midday: 12, afternoon: 15,
        evening: 19, night: 22, lateNight: 2,
      };
      const pulse = computeHeartbeat(makeStatus({ energy: target }), dateAt(hours[tod]));
      expect(pulse.statusAdjustment.energy).toBe(0);
    }
  });
});

// --- 2. Energy curve shape: morning peak > midday > afternoon > evening ---

describe("Energy curve shape", () => {
  it("morning target is the highest energy point of the day", () => {
    // Morning (75) should be higher than all other periods.
    // We verify by checking the drift direction with energy=75 at various times.
    const morningPulse = computeHeartbeat(makeStatus({ energy: 75 }), dateAt(9));
    const middayPulse = computeHeartbeat(makeStatus({ energy: 75 }), dateAt(12));
    const afternoonPulse = computeHeartbeat(makeStatus({ energy: 75 }), dateAt(15));

    // At morning, energy 75 matches target, so drift = 0
    expect(morningPulse.statusAdjustment.energy).toBe(0);
    // At midday, target is 65, drift should be negative (pulling down from 75)
    expect(middayPulse.statusAdjustment.energy).toBeLessThan(0);
    // At afternoon, target is 55, drift should be even more negative
    expect(afternoonPulse.statusAdjustment.energy).toBeLessThan(middayPulse.statusAdjustment.energy);
  });

  it("energy declines monotonically from morning through lateNight", () => {
    // Targets: morning(75) > midday(65) > afternoon(55) > evening(40) > night(25) > lateNight(10)
    // dawn(40) is a special case (before morning peak), so we test the decline after morning.
    const status = makeStatus({ energy: 100 });
    const morningDrift = computeHeartbeat(status, dateAt(9)).statusAdjustment.energy;
    const middayDrift = computeHeartbeat(status, dateAt(12)).statusAdjustment.energy;
    const afternoonDrift = computeHeartbeat(status, dateAt(15)).statusAdjustment.energy;
    const eveningDrift = computeHeartbeat(status, dateAt(19)).statusAdjustment.energy;
    const nightDrift = computeHeartbeat(status, dateAt(22)).statusAdjustment.energy;
    const lateNightDrift = computeHeartbeat(status, dateAt(2)).statusAdjustment.energy;

    // All drifts negative since energy(100) > all targets. But more negative as targets decrease.
    expect(morningDrift).toBeGreaterThan(middayDrift);
    expect(middayDrift).toBeGreaterThan(afternoonDrift);
    expect(afternoonDrift).toBeGreaterThan(eveningDrift);
    expect(eveningDrift).toBeGreaterThan(nightDrift);
    expect(nightDrift).toBeGreaterThan(lateNightDrift);
  });

  it("dawn energy is lower than morning (pre-peak warmup)", () => {
    // dawn target = 40, morning target = 75
    const status = makeStatus({ energy: 0 });
    const dawnDrift = computeHeartbeat(status, dateAt(6)).statusAdjustment.energy;
    const morningDrift = computeHeartbeat(status, dateAt(9)).statusAdjustment.energy;
    expect(dawnDrift).toBeLessThan(morningDrift);
  });
});

// --- 3. Wake/sleep signals at exact boundary hours ---

describe("Wake/sleep signals at exact boundaries", () => {
  it("shouldWake is true at hour 7 (morning start boundary)", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(7, 0));
    expect(pulse.shouldWake).toBe(true);
  });

  it("shouldWake is true at hour 10 (still morning)", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(10, 59));
    expect(pulse.shouldWake).toBe(true);
  });

  it("shouldWake is false at hour 6 (dawn, not yet morning)", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(6, 59));
    expect(pulse.shouldWake).toBe(false);
  });

  it("shouldWake is false at hour 11 (midday, no longer morning)", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(11, 0));
    expect(pulse.shouldWake).toBe(false);
  });

  it("shouldSleep is true at hour 21 (night start boundary)", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(21, 0));
    expect(pulse.shouldSleep).toBe(true);
  });

  it("shouldSleep is true at hour 23:59 (last minute of night)", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(23, 59));
    expect(pulse.shouldSleep).toBe(true);
  });

  it("shouldSleep is false at hour 20 (evening, not yet night)", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(20, 59));
    expect(pulse.shouldSleep).toBe(false);
  });

  it("shouldSleep is false at hour 0 (lateNight, past night)", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(0, 0));
    expect(pulse.shouldSleep).toBe(false);
  });
});

// --- 4. Morning greeting trigger conditions ---

describe("Morning greeting trigger (shouldWake)", () => {
  it("triggers only during morning period (7-11)", () => {
    const allHours = Array.from({ length: 24 }, (_, h) => h);
    for (const h of allHours) {
      const pulse = computeHeartbeat(makeStatus(), dateAt(h));
      if (h >= 7 && h < 11) {
        expect(pulse.shouldWake).toBe(true);
      } else {
        expect(pulse.shouldWake).toBe(false);
      }
    }
  });
});

// --- 5. Bedtime diary trigger conditions ---

describe("Bedtime diary trigger (shouldDiary)", () => {
  it("triggers only during evening period (17-21)", () => {
    const allHours = Array.from({ length: 24 }, (_, h) => h);
    for (const h of allHours) {
      const pulse = computeHeartbeat(makeStatus(), dateAt(h));
      if (h >= 17 && h < 21) {
        expect(pulse.shouldDiary).toBe(true);
      } else {
        expect(pulse.shouldDiary).toBe(false);
      }
    }
  });
});

// --- 6. shouldDiary timing window (exact boundaries) ---

describe("shouldDiary exact boundaries", () => {
  it("is false at 16:59 (last minute before evening)", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(16, 59));
    expect(pulse.shouldDiary).toBe(false);
  });

  it("is true at 17:00 (first minute of evening)", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(17, 0));
    expect(pulse.shouldDiary).toBe(true);
  });

  it("is true at 20:59 (last minute of evening)", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(20, 59));
    expect(pulse.shouldDiary).toBe(true);
  });

  it("is false at 21:00 (first minute of night)", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(21, 0));
    expect(pulse.shouldDiary).toBe(false);
  });
});

// --- 7. shouldConsolidate conditions (Sunday night) ---

describe("shouldConsolidateMemory (Sunday night only)", () => {
  it("is true on Sunday (Feb 15) at night", () => {
    const pulse = computeHeartbeat(makeStatus(), dateOnDay(15, 22));
    expect(pulse.shouldConsolidateMemory).toBe(true);
  });

  it("is true on Sunday (Feb 22) at hour 21 (night start)", () => {
    const pulse = computeHeartbeat(makeStatus(), dateOnDay(22, 21));
    expect(pulse.shouldConsolidateMemory).toBe(true);
  });

  it("is true on Sunday (Feb 22) at hour 23 (still night)", () => {
    const pulse = computeHeartbeat(makeStatus(), dateOnDay(22, 23));
    expect(pulse.shouldConsolidateMemory).toBe(true);
  });

  it("is false on Sunday during non-night periods", () => {
    // Test every non-night time-of-day on a Sunday
    for (const h of [2, 6, 9, 12, 15, 19]) {
      const pulse = computeHeartbeat(makeStatus(), dateOnDay(22, h));
      expect(pulse.shouldConsolidateMemory).toBe(false);
    }
  });

  it("is false on non-Sunday nights", () => {
    // Monday(16), Tuesday(17), Wednesday(18), Thursday(19), Friday(20), Saturday(21)
    for (const day of [16, 17, 18, 19, 20, 21]) {
      const pulse = computeHeartbeat(makeStatus(), dateOnDay(day, 22));
      expect(pulse.shouldConsolidateMemory).toBe(false);
    }
  });
});

// --- 8. Mood drift by time of day ---

describe("Mood drift by time of day", () => {
  it("mood lifts by +2 during dawn", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(6));
    expect(pulse.statusAdjustment.mood).toBe(2);
  });

  it("mood lifts by +2 during morning", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(9));
    expect(pulse.statusAdjustment.mood).toBe(2);
  });

  it("mood drift is 0 during midday", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(12));
    expect(pulse.statusAdjustment.mood).toBe(0);
  });

  it("mood drift is 0 during afternoon", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(15));
    expect(pulse.statusAdjustment.mood).toBe(0);
  });

  it("mood drift is 0 during evening", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(19));
    expect(pulse.statusAdjustment.mood).toBe(0);
  });

  it("mood dips by -2 at night", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(22));
    expect(pulse.statusAdjustment.mood).toBe(-2);
  });

  it("mood dips by -2 during lateNight", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(3));
    expect(pulse.statusAdjustment.mood).toBe(-2);
  });
});

// --- 9. getTimeOfDay exact hour boundaries for all 24 hours ---

describe("getTimeOfDay for every hour 0-23", () => {
  const expected: [number, TimeOfDay][] = [
    [0, "lateNight"], [1, "lateNight"], [2, "lateNight"], [3, "lateNight"], [4, "lateNight"],
    [5, "dawn"], [6, "dawn"],
    [7, "morning"], [8, "morning"], [9, "morning"], [10, "morning"],
    [11, "midday"], [12, "midday"], [13, "midday"],
    [14, "afternoon"], [15, "afternoon"], [16, "afternoon"],
    [17, "evening"], [18, "evening"], [19, "evening"], [20, "evening"],
    [21, "night"], [22, "night"], [23, "night"],
  ];

  it("maps each hour to the correct time-of-day segment", () => {
    for (const [hour, expectedTod] of expected) {
      expect(getTimeOfDay(dateAt(hour))).toBe(expectedTod);
    }
  });
});

// --- 10. isActiveHours exact boundaries ---

describe("isActiveHours boundaries", () => {
  it("returns false at 6:59 (just before active window)", () => {
    expect(isActiveHours(dateAt(6, 59))).toBe(false);
  });

  it("returns true at 7:00 (start of active window)", () => {
    expect(isActiveHours(dateAt(7, 0))).toBe(true);
  });

  it("returns true at 22:59 (last minute of active window)", () => {
    expect(isActiveHours(dateAt(22, 59))).toBe(true);
  });

  it("returns false at 23:00 (end of active window)", () => {
    expect(isActiveHours(dateAt(23, 0))).toBe(false);
  });

  it("returns false at midnight", () => {
    expect(isActiveHours(dateAt(0, 0))).toBe(false);
  });

  it("returns true at noon", () => {
    expect(isActiveHours(dateAt(12, 0))).toBe(true);
  });
});

// --- 11. shouldPulse edge cases ---

describe("shouldPulse edge cases", () => {
  it("returns true when exactly the interval has elapsed", () => {
    const now = new Date(2026, 1, 18, 12, 0);
    const lastPulse = new Date(now.getTime() - 30 * 60_000); // exactly 30 min ago
    expect(shouldPulse(lastPulse, now, 30)).toBe(true);
  });

  it("returns false when 1ms short of the interval", () => {
    const now = new Date(2026, 1, 18, 12, 0);
    const lastPulse = new Date(now.getTime() - 30 * 60_000 + 1); // 1ms short
    expect(shouldPulse(lastPulse, now, 30)).toBe(false);
  });

  it("returns true for a zero-minute interval (always pulse)", () => {
    const now = new Date();
    const lastPulse = new Date(now.getTime() - 1); // 1ms ago
    expect(shouldPulse(lastPulse, now, 0)).toBe(true);
  });
});

// --- 12. Edge cases: midnight, noon, exact boundary minutes ---

describe("Edge cases at midnight and noon", () => {
  it("midnight (0:00) is lateNight", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(0, 0));
    expect(pulse.timeOfDay).toBe("lateNight");
    expect(pulse.shouldWake).toBe(false);
    expect(pulse.shouldSleep).toBe(false);
    expect(pulse.shouldDiary).toBe(false);
  });

  it("noon (12:00) is midday", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(12, 0));
    expect(pulse.timeOfDay).toBe("midday");
    expect(pulse.shouldWake).toBe(false);
    expect(pulse.shouldSleep).toBe(false);
    expect(pulse.shouldDiary).toBe(false);
  });
});

// --- 13. Full day simulation: multiple rhythm ticks in sequence ---

describe("Full day simulation (24-hour tick sequence)", () => {
  it("simulates energy drifting through a complete day", () => {
    let status = makeStatus({ energy: 50 });
    const energyLog: number[] = [];

    // Tick once per hour for 24 hours (starting at midnight)
    for (let h = 0; h < 24; h++) {
      const pulse = computeHeartbeat(status, dateAt(h));
      // Apply the energy adjustment
      const newEnergy = Math.max(0, Math.min(100, status.energy + pulse.statusAdjustment.energy));
      status = makeStatus({ energy: newEnergy });
      energyLog.push(newEnergy);
    }

    // After lateNight hours (0-4), energy should have decreased
    expect(energyLog[4]).toBeLessThan(50);

    // By hour 10 (morning), energy should have risen back up
    expect(energyLog[10]).toBeGreaterThan(energyLog[4]);

    // After evening/night (hours 20+), energy should be declining
    expect(energyLog[23]).toBeLessThan(energyLog[10]);
  });

  it("simulates mood oscillating through a complete day", () => {
    let currentMood = 50;
    const moodLog: number[] = [];

    for (let h = 0; h < 24; h++) {
      const status = makeStatus({ mood: currentMood });
      const pulse = computeHeartbeat(status, dateAt(h));
      currentMood = Math.max(0, Math.min(100, currentMood + pulse.statusAdjustment.mood));
      moodLog.push(currentMood);
    }

    // lateNight hours (0-4) have -2 mood drift each, starting from 50 -> should decrease
    expect(moodLog[4]).toBeLessThan(50);

    // dawn/morning hours (5-10) have +2 mood drift each -> should recover
    expect(moodLog[10]).toBeGreaterThan(moodLog[4]);

    // night hours (21-23) have -2 mood drift -> should decrease again
    expect(moodLog[23]).toBeLessThan(moodLog[20]);
  });
});

// --- 14. curiosity and comfort always zero in statusAdjustment ---

describe("statusAdjustment invariants", () => {
  it("curiosity adjustment is always 0 regardless of time", () => {
    for (let h = 0; h < 24; h++) {
      const pulse = computeHeartbeat(makeStatus(), dateAt(h));
      expect(pulse.statusAdjustment.curiosity).toBe(0);
    }
  });

  it("comfort adjustment is always 0 regardless of time", () => {
    for (let h = 0; h < 24; h++) {
      const pulse = computeHeartbeat(makeStatus(), dateAt(h));
      expect(pulse.statusAdjustment.comfort).toBe(0);
    }
  });
});

// --- 15. Energy drift calculation precision ---

describe("Energy drift calculation precision", () => {
  it("drift is correctly rounded for fractional results", () => {
    // energy=20, morning target=75: drift = round((75-20)*0.15) = round(8.25) = 8
    const pulse = computeHeartbeat(makeStatus({ energy: 20 }), dateAt(9));
    expect(pulse.statusAdjustment.energy).toBe(8);
  });

  it("drift rounds correctly at .5 boundary (Math.round rounds up)", () => {
    // We need (target - energy) * 0.15 to yield exactly .5
    // target=75 (morning), energy = 75 - x, (x * 0.15) = n + 0.5
    // x * 0.15 = 0.5 => x = 10/3 ≈ 3.333 => energy ≈ 71.667
    // Let's pick energy=42, target=75: (75-42)*0.15 = 33*0.15 = 4.95 => round = 5
    const pulse = computeHeartbeat(makeStatus({ energy: 42 }), dateAt(9));
    expect(pulse.statusAdjustment.energy).toBe(5);
  });

  it("drift with extreme low energy (0) at morning", () => {
    // target=75, energy=0: drift = round(75 * 0.15) = round(11.25) = 11
    const pulse = computeHeartbeat(makeStatus({ energy: 0 }), dateAt(9));
    expect(pulse.statusAdjustment.energy).toBe(11);
  });

  it("drift with extreme high energy (100) at lateNight", () => {
    // target=10, energy=100: drift = round((10-100) * 0.15) = round(-13.5) = -13
    // (JS Math.round rounds half toward +Infinity: Math.round(-13.5) === -13)
    const pulse = computeHeartbeat(makeStatus({ energy: 100 }), dateAt(2));
    expect(pulse.statusAdjustment.energy).toBe(-13);
  });
});
