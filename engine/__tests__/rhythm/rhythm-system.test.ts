import { describe, it, expect } from "vitest";
import {
  getTimeOfDay,
  computeHeartbeat,
  shouldPulse,
  isActiveHours,
} from "../../src/rhythm/rhythm-system.js";
import { LanguageLevel, type Status } from "../../src/types.js";

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    mood: 50,
    energy: 50,
    curiosity: 50,
    comfort: 50,
    languageLevel: LanguageLevel.SymbolsOnly,
    growthDay: 0,
    lastInteraction: "never",
    ...overrides,
  };
}

function dateAt(hour: number, minute = 0): Date {
  return new Date(2026, 1, 18, hour, minute);
}

describe("getTimeOfDay", () => {
  it("returns dawn for 5-7", () => {
    expect(getTimeOfDay(dateAt(5))).toBe("dawn");
    expect(getTimeOfDay(dateAt(6, 59))).toBe("dawn");
  });

  it("returns morning for 7-11", () => {
    expect(getTimeOfDay(dateAt(7))).toBe("morning");
    expect(getTimeOfDay(dateAt(10, 59))).toBe("morning");
  });

  it("returns midday for 11-14", () => {
    expect(getTimeOfDay(dateAt(12))).toBe("midday");
  });

  it("returns afternoon for 14-17", () => {
    expect(getTimeOfDay(dateAt(15))).toBe("afternoon");
  });

  it("returns evening for 17-21", () => {
    expect(getTimeOfDay(dateAt(19))).toBe("evening");
  });

  it("returns night for 21-24", () => {
    expect(getTimeOfDay(dateAt(22))).toBe("night");
  });

  it("returns lateNight for 0-5", () => {
    expect(getTimeOfDay(dateAt(3))).toBe("lateNight");
  });
});

describe("computeHeartbeat", () => {
  it("sets shouldWake in morning", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(9));
    expect(pulse.shouldWake).toBe(true);
    expect(pulse.shouldSleep).toBe(false);
  });

  it("sets shouldSleep at night", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(22));
    expect(pulse.shouldSleep).toBe(true);
    expect(pulse.shouldWake).toBe(false);
  });

  it("sets shouldDiary in evening", () => {
    const pulse = computeHeartbeat(makeStatus(), dateAt(19));
    expect(pulse.shouldDiary).toBe(true);
  });

  it("pulls energy up in morning when low", () => {
    const pulse = computeHeartbeat(makeStatus({ energy: 20 }), dateAt(9));
    expect(pulse.statusAdjustment.energy).toBeGreaterThan(0);
  });

  it("pulls energy down at night when high", () => {
    const pulse = computeHeartbeat(makeStatus({ energy: 80 }), dateAt(22));
    expect(pulse.statusAdjustment.energy).toBeLessThan(0);
  });

  it("triggers memory consolidation on Sunday night", () => {
    // 2026-02-22 is a Sunday
    const sundayNight = new Date(2026, 1, 22, 22, 0);
    const pulse = computeHeartbeat(makeStatus(), sundayNight);
    expect(pulse.shouldConsolidateMemory).toBe(true);
  });

  it("does not trigger memory consolidation on other nights", () => {
    // 2026-02-18 is a Wednesday
    const wedNight = dateAt(22);
    const pulse = computeHeartbeat(makeStatus(), wedNight);
    expect(pulse.shouldConsolidateMemory).toBe(false);
  });

  it("does not trigger memory consolidation on Sunday morning", () => {
    const sundayMorning = new Date(2026, 1, 22, 9, 0);
    const pulse = computeHeartbeat(makeStatus(), sundayMorning);
    expect(pulse.shouldConsolidateMemory).toBe(false);
  });
});

describe("shouldPulse", () => {
  it("returns true when no previous pulse", () => {
    expect(shouldPulse(null, new Date(), 30)).toBe(true);
  });

  it("returns false when interval not elapsed", () => {
    const now = new Date();
    const lastPulse = new Date(now.getTime() - 10 * 60_000); // 10 min ago
    expect(shouldPulse(lastPulse, now, 30)).toBe(false);
  });

  it("returns true when interval elapsed", () => {
    const now = new Date();
    const lastPulse = new Date(now.getTime() - 35 * 60_000); // 35 min ago
    expect(shouldPulse(lastPulse, now, 30)).toBe(true);
  });
});

describe("isActiveHours", () => {
  it("returns true during daytime", () => {
    expect(isActiveHours(dateAt(12))).toBe(true);
    expect(isActiveHours(dateAt(7))).toBe(true);
    expect(isActiveHours(dateAt(22, 59))).toBe(true);
  });

  it("returns false during sleep hours", () => {
    expect(isActiveHours(dateAt(3))).toBe(false);
    expect(isActiveHours(dateAt(6))).toBe(false);
    expect(isActiveHours(dateAt(23))).toBe(false);
  });
});
