import type { Status } from "../types.js";
import type { MoodDelta } from "../mood/mood-engine.js";

export type TimeOfDay = "dawn" | "morning" | "midday" | "afternoon" | "evening" | "night" | "lateNight";

export interface RhythmPulse {
  timeOfDay: TimeOfDay;
  shouldWake: boolean;
  shouldSleep: boolean;
  shouldDiary: boolean;
  shouldConsolidateMemory: boolean;
  statusAdjustment: MoodDelta;
}

/**
 * Determine the time-of-day segment from a Date.
 */
export function getTimeOfDay(date: Date): TimeOfDay {
  const h = date.getHours();
  if (h >= 5 && h < 7) return "dawn";
  if (h >= 7 && h < 11) return "morning";
  if (h >= 11 && h < 14) return "midday";
  if (h >= 14 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  if (h >= 21 && h < 24) return "night";
  return "lateNight"; // 0-5
}

/**
 * Energy baseline curve across the day.
 * Entities have a natural rhythm — energy rises in morning, dips after midday, falls at night.
 */
const ENERGY_CURVE: Record<TimeOfDay, number> = {
  dawn: 40,
  morning: 75,
  midday: 65,
  afternoon: 55,
  evening: 40,
  night: 25,
  lateNight: 10,
};

/**
 * Compute a heartbeat pulse for the given time.
 * Returns what should happen and how status should naturally shift.
 */
export function computeHeartbeat(status: Status, now: Date): RhythmPulse {
  const timeOfDay = getTimeOfDay(now);
  const targetEnergy = ENERGY_CURVE[timeOfDay];

  // Gently pull energy toward the day's natural curve
  const energyDrift = Math.round((targetEnergy - status.energy) * 0.15);

  // Mood slightly lifts in morning, dips at night
  let moodDrift = 0;
  if (timeOfDay === "morning" || timeOfDay === "dawn") moodDrift = 2;
  if (timeOfDay === "night" || timeOfDay === "lateNight") moodDrift = -2;

  // Consolidate memory on Sunday nights (weekly summary)
  const isSunday = now.getDay() === 0;
  const shouldConsolidateMemory = isSunday && timeOfDay === "night";

  return {
    timeOfDay,
    shouldWake: timeOfDay === "morning",
    shouldSleep: timeOfDay === "night",
    shouldDiary: timeOfDay === "evening",
    shouldConsolidateMemory,
    statusAdjustment: {
      mood: moodDrift,
      energy: energyDrift,
      curiosity: 0,
      comfort: 0,
    },
  };
}

/**
 * Check if a heartbeat should fire based on the last heartbeat time.
 * Returns true if at least `intervalMinutes` have passed.
 */
export function shouldPulse(
  lastPulse: Date | null,
  now: Date,
  intervalMinutes: number,
): boolean {
  if (!lastPulse) return true;
  const elapsed = (now.getTime() - lastPulse.getTime()) / 60_000;
  return elapsed >= intervalMinutes;
}

/**
 * Check if the entity is in active hours (not sleeping).
 * By default, active from 7:00 to 23:00.
 */
export function isActiveHours(now: Date): boolean {
  const h = now.getHours();
  return h >= 7 && h < 23;
}
