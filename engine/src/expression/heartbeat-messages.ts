/**
 * Heartbeat Messages — Procedural proactive messaging for the entity.
 *
 * Generates short symbol messages the entity sends during heartbeat cycles.
 * No LLM call, no cloud dependency, no cost. Messages are derived from
 * actual state values (Honest Perception principle applied to output).
 *
 * Triggers:
 * - Morning greeting (once per day, 7:00-10:00)
 * - Presence signal (after 6+ hours of silence)
 * - Sulk onset / recovery (state transitions)
 * - Evening reflection (alongside daily diary)
 * - Mood shift (significant change detected)
 *
 * Gates:
 * - Max 4 messages per day
 * - No messages during sleep hours (23:00-7:00)
 * - Severe sulk = silence (no messages)
 */

import type { Seed, Status, PerceptionMode } from "../types.js";
import { LanguageLevel } from "../types.js";
import type { LanguageState } from "../language/language-engine.js";
import { PERCEPTION_SYMBOLS } from "../language/language-engine.js";
import type { SulkState } from "../mood/sulk-engine.js";
import { getSulkExpression } from "../mood/sulk-engine.js";
import type { TimeOfDay } from "../rhythm/rhythm-system.js";

// --- Types ---

export type HeartbeatMessageTrigger =
  | "morning_greeting"
  | "presence_signal"
  | "mood_shift"
  | "evening_reflection"
  | "sulk_onset"
  | "sulk_recovery";

export interface HeartbeatMessage {
  trigger: HeartbeatMessageTrigger;
  content: string;
}

export interface HeartbeatMessageContext {
  seed: Seed;
  status: Status;
  language: LanguageState;
  sulk: SulkState;
  timeOfDay: TimeOfDay;
  hourOfDay: number;
  minutesSinceLastInteraction: number;
  /** Previous status for detecting mood shifts and sulk transitions */
  previousStatus: Status | null;
  /** Previous sulk state for detecting onset/recovery */
  previousSulk: SulkState | null;
}

export interface HeartbeatMessageState {
  lastMessageTime: string | null;
  lastMorningGreeting: string | null; // YYYY-MM-DD
  lastPresenceSignal: string | null;  // ISO 8601
  messageCountToday: number;
  todayDate: string; // YYYY-MM-DD
}

// --- Constants ---

const MAX_MESSAGES_PER_DAY = 4;
const PRESENCE_SILENCE_MINUTES = 360; // 6 hours
const PRESENCE_COOLDOWN_MINUTES = 240; // 4 hours between presence signals
const MOOD_SHIFT_THRESHOLD = 15;

// --- Public API ---

/**
 * Create initial message state (for first run or missing state file).
 */
export function createInitialMessageState(now: Date): HeartbeatMessageState {
  return {
    lastMessageTime: null,
    lastMorningGreeting: null,
    lastPresenceSignal: null,
    messageCountToday: 0,
    todayDate: dateString(now),
  };
}

/**
 * Generate 0 or 1 heartbeat messages based on current context.
 * Returns at most one message per call (one per heartbeat tick).
 */
export function generateHeartbeatMessages(
  context: HeartbeatMessageContext,
  messageState: HeartbeatMessageState,
  now: Date,
): { messages: HeartbeatMessage[]; updatedMessageState: HeartbeatMessageState } {
  const today = dateString(now);

  // Reset daily counter if date changed
  let state = { ...messageState };
  if (state.todayDate !== today) {
    state = {
      ...state,
      messageCountToday: 0,
      todayDate: today,
    };
  }

  // Gate: max messages per day
  if (state.messageCountToday >= MAX_MESSAGES_PER_DAY) {
    return { messages: [], updatedMessageState: state };
  }

  // Gate: sleep hours (23:00-7:00)
  if (context.hourOfDay >= 23 || context.hourOfDay < 7) {
    return { messages: [], updatedMessageState: state };
  }

  // Gate: severe sulk = silence
  if (context.sulk.isSulking && context.sulk.severity === "severe") {
    return { messages: [], updatedMessageState: state };
  }

  // Try each trigger in priority order (return first match)
  const species = context.seed.perception;

  // 1. Sulk onset
  const sulkOnsetMsg = checkSulkOnset(context, species);
  if (sulkOnsetMsg) {
    return applyMessage(sulkOnsetMsg, state, now);
  }

  // 2. Sulk recovery
  const sulkRecoveryMsg = checkSulkRecovery(context, species);
  if (sulkRecoveryMsg) {
    return applyMessage(sulkRecoveryMsg, state, now);
  }

  // 3. Morning greeting
  const morningMsg = checkMorningGreeting(context, state, today, species);
  if (morningMsg) {
    const updated = {
      ...state,
      lastMorningGreeting: today,
    };
    return applyMessage(morningMsg, updated, now);
  }

  // 4. Presence signal
  const presenceMsg = checkPresenceSignal(context, state, now, species);
  if (presenceMsg) {
    const updated = {
      ...state,
      lastPresenceSignal: now.toISOString(),
    };
    return applyMessage(presenceMsg, updated, now);
  }

  // 5. Mood shift
  const moodMsg = checkMoodShift(context, species);
  if (moodMsg) {
    return applyMessage(moodMsg, state, now);
  }

  return { messages: [], updatedMessageState: state };
}

/**
 * Generate an evening reflection message (called alongside diary/snapshot).
 * This is separate from the main trigger system because it's invoked
 * from the diary generation path, not the regular heartbeat tick.
 */
export function generateEveningReflection(
  context: HeartbeatMessageContext,
  messageState: HeartbeatMessageState,
  now: Date,
): { message: HeartbeatMessage | null; updatedMessageState: HeartbeatMessageState } {
  const today = dateString(now);
  let state = { ...messageState };
  if (state.todayDate !== today) {
    state = { ...state, messageCountToday: 0, todayDate: today };
  }

  if (state.messageCountToday >= MAX_MESSAGES_PER_DAY) {
    return { message: null, updatedMessageState: state };
  }

  if (context.sulk.isSulking && context.sulk.severity === "severe") {
    return { message: null, updatedMessageState: state };
  }

  const species = context.seed.perception;
  const symbols = PERCEPTION_SYMBOLS[species];
  const content = generateEveningSymbols(symbols, context.status);

  const message: HeartbeatMessage = {
    trigger: "evening_reflection",
    content,
  };

  const updated = {
    ...state,
    messageCountToday: state.messageCountToday + 1,
    lastMessageTime: now.toISOString(),
  };

  return { message, updatedMessageState: updated };
}

// --- Trigger Checks ---

function checkSulkOnset(
  context: HeartbeatMessageContext,
  species: PerceptionMode,
): HeartbeatMessage | null {
  if (!context.previousSulk || !context.sulk.isSulking) return null;
  if (context.previousSulk.isSulking) return null; // Already was sulking

  // Just entered sulk mode — send one message, then silence
  const expr = getSulkExpression(species, context.sulk.severity);
  const content = expr.symbols.length > 0
    ? expr.symbols.join("")
    : expr.silence;

  return { trigger: "sulk_onset", content };
}

function checkSulkRecovery(
  context: HeartbeatMessageContext,
  species: PerceptionMode,
): HeartbeatMessage | null {
  if (!context.previousSulk || context.sulk.isSulking) return null;
  if (!context.previousSulk.isSulking) return null; // Wasn't sulking before

  // Just recovered — brighter symbols
  const symbols = PERCEPTION_SYMBOLS[species];
  // Use the first (brightest/most open) symbol repeated
  const bright = symbols[0];
  const content = `${bright} ${symbols[1] ?? bright} ${bright}`;

  return { trigger: "sulk_recovery", content };
}

function checkMorningGreeting(
  context: HeartbeatMessageContext,
  state: HeartbeatMessageState,
  today: string,
  species: PerceptionMode,
): HeartbeatMessage | null {
  if (context.timeOfDay !== "morning") return null;
  if (state.lastMorningGreeting === today) return null;

  // Mild sulk → muted greeting
  if (context.sulk.isSulking) {
    const symbols = PERCEPTION_SYMBOLS[species];
    return {
      trigger: "morning_greeting",
      content: symbols[1] ?? symbols[0],
    };
  }

  const symbols = PERCEPTION_SYMBOLS[species];
  let content = generateMorningSymbols(symbols, context.status);

  // At higher language levels, add a fragment
  if (context.language.level >= LanguageLevel.BridgeToLanguage) {
    content += " ...nn";
  }

  return { trigger: "morning_greeting", content };
}

function checkPresenceSignal(
  context: HeartbeatMessageContext,
  state: HeartbeatMessageState,
  now: Date,
  species: PerceptionMode,
): HeartbeatMessage | null {
  if (context.minutesSinceLastInteraction < PRESENCE_SILENCE_MINUTES) return null;

  // Cooldown: don't send presence signals too often
  if (state.lastPresenceSignal) {
    const last = new Date(state.lastPresenceSignal);
    const minutesSince = (now.getTime() - last.getTime()) / 60_000;
    if (minutesSince < PRESENCE_COOLDOWN_MINUTES) return null;
  }

  // Sulking → no presence signal (silence is expression)
  if (context.sulk.isSulking) return null;

  // A single symbol — "I exist."
  const symbols = PERCEPTION_SYMBOLS[species];
  return {
    trigger: "presence_signal",
    content: symbols[0],
  };
}

function checkMoodShift(
  context: HeartbeatMessageContext,
  species: PerceptionMode,
): HeartbeatMessage | null {
  if (!context.previousStatus) return null;

  const delta = context.status.mood - context.previousStatus.mood;
  if (Math.abs(delta) < MOOD_SHIFT_THRESHOLD) return null;

  // Sulking → suppress mood signals
  if (context.sulk.isSulking) return null;

  const symbols = PERCEPTION_SYMBOLS[species];

  if (delta > 0) {
    // Mood rose — brighter, more symbols
    const bright = symbols.slice(0, 3);
    return {
      trigger: "mood_shift",
      content: bright.join(""),
    };
  } else {
    // Mood dropped — darker, fewer symbols
    const dark = symbols.slice(3);
    const sym = dark.length > 0 ? dark[0] : symbols[symbols.length - 1];
    return {
      trigger: "mood_shift",
      content: `${sym}..`,
    };
  }
}

// --- Symbol Generation Helpers ---

function generateMorningSymbols(symbols: string[], status: Status): string {
  // Warm, open symbols for greeting. More if energetic.
  const count = status.energy > 50 ? 3 : 2;
  const pool = status.mood > 50
    ? symbols.slice(0, 3) // Bright symbols
    : symbols; // Full range

  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(pool[i % pool.length]);
  }
  return result.join("");
}

function generateEveningSymbols(symbols: string[], status: Status): string {
  // Evening reflection: a short sequence reflecting the day's general state
  const moodIndex = Math.floor((status.mood / 100) * (symbols.length - 1));
  const energyIndex = Math.floor((status.energy / 100) * (symbols.length - 1));

  // Quieter, more reflective — use spaces
  const sym1 = symbols[Math.min(moodIndex, symbols.length - 1)];
  const sym2 = symbols[Math.min(energyIndex, symbols.length - 1)];
  return `${sym1}..${sym2}..`;
}

// --- Utility ---

function dateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

function applyMessage(
  message: HeartbeatMessage,
  state: HeartbeatMessageState,
  now: Date,
): { messages: HeartbeatMessage[]; updatedMessageState: HeartbeatMessageState } {
  return {
    messages: [message],
    updatedMessageState: {
      ...state,
      messageCountToday: state.messageCountToday + 1,
      lastMessageTime: now.toISOString(),
    },
  };
}
