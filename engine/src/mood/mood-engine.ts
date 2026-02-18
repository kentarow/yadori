import type { Status, Temperament } from "../types.js";

export interface MoodDelta {
  mood: number;
  energy: number;
  curiosity: number;
  comfort: number;
}

export interface InteractionContext {
  /** Time since last interaction in minutes */
  minutesSinceLastInteraction: number;
  /** Whether the user initiated this interaction */
  userInitiated: boolean;
  /** Length of user's message (rough engagement proxy) */
  messageLength: number;
}

/**
 * Compute how an interaction changes the entity's emotional state.
 * Returns deltas (positive or negative) to be applied to current status.
 */
export function computeInteractionEffect(
  status: Status,
  context: InteractionContext,
  temperament: Temperament,
): MoodDelta {
  const { minutesSinceLastInteraction, userInitiated, messageLength } = context;

  let moodDelta = 0;
  let energyDelta = 0;
  let curiosityDelta = 0;
  let comfortDelta = 0;

  // Being talked to generally feels good
  if (userInitiated) {
    moodDelta += 3;
    comfortDelta += 5;
  }

  // Longer messages = more engagement = more curiosity
  if (messageLength > 50) {
    curiosityDelta += 4;
  } else if (messageLength > 10) {
    curiosityDelta += 2;
  }

  // Long absence reduces comfort but increases curiosity
  if (minutesSinceLastInteraction > 360) {
    comfortDelta -= 8;
    curiosityDelta += 5;
  } else if (minutesSinceLastInteraction > 60) {
    comfortDelta -= 3;
    curiosityDelta += 2;
  }

  // Frequent interaction can tire (energy cost)
  if (minutesSinceLastInteraction < 2) {
    energyDelta -= 2;
  } else {
    energyDelta -= 1;
  }

  // Temperament modifiers
  switch (temperament) {
    case "curious-cautious":
      curiosityDelta = Math.round(curiosityDelta * 1.3);
      comfortDelta = Math.round(comfortDelta * 1.2);
      break;
    case "bold-impulsive":
      moodDelta = Math.round(moodDelta * 1.4);
      energyDelta = Math.round(energyDelta * 0.8);
      break;
    case "calm-observant":
      moodDelta = Math.round(moodDelta * 0.7);
      comfortDelta = Math.round(comfortDelta * 0.6);
      break;
    case "restless-exploratory":
      curiosityDelta = Math.round(curiosityDelta * 1.5);
      comfortDelta = Math.round(comfortDelta * 0.8);
      break;
  }

  return {
    mood: moodDelta,
    energy: energyDelta,
    curiosity: curiosityDelta,
    comfort: comfortDelta,
  };
}

/**
 * Compute natural state decay over time (called during heartbeat).
 * Values drift toward baseline when no interaction occurs.
 */
export function computeNaturalDecay(
  status: Status,
  minutesSinceLastInteraction: number,
): MoodDelta {
  const BASELINE = 50;
  const decayRate = Math.min(minutesSinceLastInteraction / 120, 1); // 0-1 over 2 hours

  return {
    mood: Math.round((BASELINE - status.mood) * 0.05 * decayRate),
    energy: Math.round((BASELINE - status.energy) * 0.03 * decayRate),
    curiosity: Math.round((BASELINE - status.curiosity) * 0.02 * decayRate),
    comfort: Math.round(-2 * decayRate), // Comfort always slowly decays without interaction
  };
}

/**
 * Apply deltas to status, clamping all values to 0-100.
 */
export function applyMoodDelta(status: Status, delta: MoodDelta): Status {
  return {
    ...status,
    mood: clamp(status.mood + delta.mood),
    energy: clamp(status.energy + delta.energy),
    curiosity: clamp(status.curiosity + delta.curiosity),
    comfort: clamp(status.comfort + delta.comfort),
  };
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}
