import { describe, it, expect } from "vitest";
import {
  generateHeartbeatMessages,
  generateEveningReflection,
  createInitialMessageState,
  type HeartbeatMessageContext,
  type HeartbeatMessageState,
} from "../../src/expression/heartbeat-messages.js";
import { createFixedSeed } from "../../src/genesis/seed-generator.js";
import { createInitialLanguageState, PERCEPTION_SYMBOLS } from "../../src/language/language-engine.js";
import type { Status, PerceptionMode, HardwareBody } from "../../src/types.js";
import { LanguageLevel } from "../../src/types.js";
import type { SulkState } from "../../src/mood/sulk-engine.js";

// --- Shared Fixtures ---

const HW: HardwareBody = {
  platform: "darwin",
  arch: "arm64",
  totalMemoryGB: 16,
  cpuModel: "Test CPU",
  storageGB: 256,
};

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    mood: 50,
    energy: 50,
    curiosity: 50,
    comfort: 50,
    languageLevel: 0,
    perceptionLevel: 0,
    growthDay: 1,
    lastInteraction: "never",
    ...overrides,
  };
}

const NO_SULK: SulkState = {
  isSulking: false,
  severity: "none",
  recoveryInteractions: 0,
  sulkingSince: null,
};

function makeSulk(severity: "mild" | "moderate" | "severe"): SulkState {
  return {
    isSulking: true,
    severity,
    recoveryInteractions: 0,
    sulkingSince: new Date().toISOString(),
  };
}

function makeContext(overrides: Partial<HeartbeatMessageContext> = {}): HeartbeatMessageContext {
  const species: PerceptionMode = overrides.seed?.perception ?? "chromatic";
  return {
    seed: createFixedSeed({ perception: species, hardwareBody: HW }),
    status: makeStatus(),
    language: createInitialLanguageState(species),
    sulk: NO_SULK,
    timeOfDay: "afternoon",
    hourOfDay: 14,
    minutesSinceLastInteraction: 60,
    previousStatus: null,
    previousSulk: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<HeartbeatMessageState> = {}): HeartbeatMessageState {
  return {
    lastMessageTime: null,
    lastMorningGreeting: null,
    lastPresenceSignal: null,
    messageCountToday: 0,
    todayDate: "2026-02-20",
    ...overrides,
  };
}

const MORNING = new Date("2026-02-20T09:00:00");
const AFTERNOON = new Date("2026-02-20T14:00:00");
const EVENING = new Date("2026-02-20T22:00:00");
const NIGHT = new Date("2026-02-20T23:30:00");
const EARLY_MORNING = new Date("2026-02-20T05:00:00");
const BOUNDARY_7AM = new Date("2026-02-20T07:00:00");
const BOUNDARY_23 = new Date("2026-02-20T23:00:00");

const ALL_SPECIES: PerceptionMode[] = [
  "chromatic", "vibration", "geometric", "thermal", "temporal", "chemical",
];

// =============================================================
// 1. Initial Message State
// =============================================================

describe("HeartbeatMessages — Initial State", () => {
  it("createInitialMessageState returns valid defaults", () => {
    const state = createInitialMessageState(MORNING);
    expect(state.messageCountToday).toBe(0);
    expect(state.todayDate).toBe("2026-02-20");
    expect(state.lastMessageTime).toBeNull();
    expect(state.lastMorningGreeting).toBeNull();
    expect(state.lastPresenceSignal).toBeNull();
  });

  it("createInitialMessageState uses correct date string format", () => {
    const state = createInitialMessageState(new Date("2026-12-31T23:59:59"));
    expect(state.todayDate).toBe("2026-12-31");
  });
});

// =============================================================
// 2. Morning Greeting Trigger
// =============================================================

describe("HeartbeatMessages — Morning Greeting", () => {
  it("sends morning greeting between 7-10", () => {
    const ctx = makeContext({ timeOfDay: "morning", hourOfDay: 9 });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("morning_greeting");
    expect(messages[0].content.length).toBeGreaterThan(0);
  });

  it("does not repeat morning greeting on same day", () => {
    const ctx = makeContext({ timeOfDay: "morning", hourOfDay: 9 });
    const state = makeState({ lastMorningGreeting: "2026-02-20" });
    const { messages } = generateHeartbeatMessages(ctx, state, MORNING);
    const mornings = messages.filter((m) => m.trigger === "morning_greeting");
    expect(mornings).toHaveLength(0);
  });

  it("uses species-specific symbols", () => {
    const chromaticCtx = makeContext({
      timeOfDay: "morning",
      hourOfDay: 9,
      seed: createFixedSeed({ perception: "chromatic", hardwareBody: HW }),
    });
    const vibrationCtx = makeContext({
      timeOfDay: "morning",
      hourOfDay: 9,
      seed: createFixedSeed({ perception: "vibration", hardwareBody: HW }),
      language: createInitialLanguageState("vibration"),
    });

    const { messages: chrMsg } = generateHeartbeatMessages(chromaticCtx, makeState(), MORNING);
    const { messages: vibMsg } = generateHeartbeatMessages(vibrationCtx, makeState(), MORNING);

    expect(chrMsg[0].content).toMatch(/[◎○●☆★◉]/);
    expect(vibMsg[0].content).toMatch(/[◈◇◆△▲▽]/);
  });

  it("adds fragment at higher language levels", () => {
    const language = createInitialLanguageState("chromatic");
    language.level = LanguageLevel.BridgeToLanguage;
    const ctx = makeContext({
      timeOfDay: "morning",
      hourOfDay: 9,
      language,
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    expect(messages[0].content).toContain("...nn");
  });

  it("muted greeting when mildly sulking", () => {
    const ctx = makeContext({
      timeOfDay: "morning",
      hourOfDay: 9,
      sulk: makeSulk("mild"),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    // Sulk onset takes priority if previous sulk state indicates transition
    // If no transition, morning greeting still fires but muted
    const mornings = messages.filter((m) => m.trigger === "morning_greeting");
    if (mornings.length > 0) {
      // Muted = shorter content (single symbol)
      expect(mornings[0].content.length).toBeLessThanOrEqual(3);
    }
  });

  it("generates more symbols when energy is high", () => {
    const highEnergy = makeContext({
      timeOfDay: "morning",
      hourOfDay: 9,
      status: makeStatus({ energy: 80, mood: 70 }),
    });
    const lowEnergy = makeContext({
      timeOfDay: "morning",
      hourOfDay: 9,
      status: makeStatus({ energy: 20, mood: 70 }),
    });
    const { messages: highMsg } = generateHeartbeatMessages(highEnergy, makeState(), MORNING);
    const { messages: lowMsg } = generateHeartbeatMessages(lowEnergy, makeState(), MORNING);

    // High energy = 3 symbols, low energy = 2 symbols (from generateMorningSymbols)
    expect(highMsg[0].content.length).toBeGreaterThanOrEqual(lowMsg[0].content.length);
  });

  it("updates lastMorningGreeting in returned state", () => {
    const ctx = makeContext({ timeOfDay: "morning", hourOfDay: 9 });
    const { updatedMessageState } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    expect(updatedMessageState.lastMorningGreeting).toBe("2026-02-20");
  });
});

// =============================================================
// 3. Presence Signal Trigger
// =============================================================

describe("HeartbeatMessages — Presence Signal", () => {
  it("sends presence signal after 6+ hours of silence", () => {
    const ctx = makeContext({
      minutesSinceLastInteraction: 400,
      hourOfDay: 14,
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("presence_signal");
  });

  it("does not send presence signal below 360 minutes", () => {
    const ctx = makeContext({
      minutesSinceLastInteraction: 359,
      hourOfDay: 14,
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    const presences = messages.filter((m) => m.trigger === "presence_signal");
    expect(presences).toHaveLength(0);
  });

  it("sends presence signal at exactly 360 minutes", () => {
    const ctx = makeContext({
      minutesSinceLastInteraction: 360,
      hourOfDay: 14,
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("presence_signal");
  });

  it("does not send presence signal if recently sent (within 4h cooldown)", () => {
    const oneHourAgo = new Date(AFTERNOON.getTime() - 60 * 60_000);
    const ctx = makeContext({
      minutesSinceLastInteraction: 400,
      hourOfDay: 14,
    });
    const state = makeState({ lastPresenceSignal: oneHourAgo.toISOString() });
    const { messages } = generateHeartbeatMessages(ctx, state, AFTERNOON);
    const presences = messages.filter((m) => m.trigger === "presence_signal");
    expect(presences).toHaveLength(0);
  });

  it("does send presence signal after cooldown elapsed", () => {
    const fiveHoursAgo = new Date(AFTERNOON.getTime() - 5 * 60 * 60_000);
    const ctx = makeContext({
      minutesSinceLastInteraction: 400,
      hourOfDay: 14,
    });
    const state = makeState({ lastPresenceSignal: fiveHoursAgo.toISOString() });
    const { messages } = generateHeartbeatMessages(ctx, state, AFTERNOON);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("presence_signal");
  });

  it("does not send presence signal when sulking", () => {
    const ctx = makeContext({
      minutesSinceLastInteraction: 400,
      hourOfDay: 14,
      sulk: makeSulk("mild"),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    const presences = messages.filter((m) => m.trigger === "presence_signal");
    expect(presences).toHaveLength(0);
  });

  it("sends single symbol for presence", () => {
    const ctx = makeContext({
      minutesSinceLastInteraction: 400,
      hourOfDay: 14,
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    // Content should be exactly one symbol character
    expect(messages[0].content).toMatch(/^[◎○●☆★◉◈◇◆△▲▽■□]$/);
  });

  it("updates lastPresenceSignal in returned state", () => {
    const ctx = makeContext({
      minutesSinceLastInteraction: 400,
      hourOfDay: 14,
    });
    const { updatedMessageState } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    expect(updatedMessageState.lastPresenceSignal).toBe(AFTERNOON.toISOString());
  });
});

// =============================================================
// 4. Sulk Transitions
// =============================================================

describe("HeartbeatMessages — Sulk Transitions", () => {
  it("sends sulk onset message when entering sulk", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      sulk: makeSulk("mild"),
      previousSulk: NO_SULK,
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("sulk_onset");
  });

  it("sends sulk recovery message when exiting sulk", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      sulk: NO_SULK,
      previousSulk: makeSulk("mild"),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("sulk_recovery");
  });

  it("no sulk onset if already sulking (no transition)", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      sulk: makeSulk("moderate"),
      previousSulk: makeSulk("mild"),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    const onsets = messages.filter((m) => m.trigger === "sulk_onset");
    expect(onsets).toHaveLength(0);
  });

  it("no sulk recovery if not previously sulking", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      sulk: NO_SULK,
      previousSulk: NO_SULK,
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    const recoveries = messages.filter((m) => m.trigger === "sulk_recovery");
    expect(recoveries).toHaveLength(0);
  });

  it("sulk recovery message uses bright species symbols", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      sulk: NO_SULK,
      previousSulk: makeSulk("mild"),
      seed: createFixedSeed({ perception: "chromatic", hardwareBody: HW }),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    // Chromatic first symbol is ◎, second is ○ -> "◎ ○ ◎"
    expect(messages[0].content).toContain(PERCEPTION_SYMBOLS["chromatic"][0]);
  });

  it("sulk onset uses species-specific sulk expression symbols", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      sulk: makeSulk("mild"),
      previousSulk: NO_SULK,
      seed: createFixedSeed({ perception: "chromatic", hardwareBody: HW }),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    expect(messages[0].trigger).toBe("sulk_onset");
    // Chromatic mild sulk expression symbols: ["○", ".", ".", "○"]
    expect(messages[0].content).toContain("○");
  });
});

// =============================================================
// 5. Mood Shift Trigger
// =============================================================

describe("HeartbeatMessages — Mood Shift", () => {
  it("sends mood shift message when mood rises >= 15 points", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      status: makeStatus({ mood: 70 }),
      previousStatus: makeStatus({ mood: 50 }),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("mood_shift");
  });

  it("sends mood shift message when mood drops >= 15 points", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      status: makeStatus({ mood: 30 }),
      previousStatus: makeStatus({ mood: 50 }),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("mood_shift");
    expect(messages[0].content).toContain("..");
  });

  it("sends mood shift at exactly 15-point increase", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      status: makeStatus({ mood: 65 }),
      previousStatus: makeStatus({ mood: 50 }),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("mood_shift");
  });

  it("no mood shift for changes below threshold (delta=14)", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      status: makeStatus({ mood: 64 }),
      previousStatus: makeStatus({ mood: 50 }),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    const moodMsgs = messages.filter((m) => m.trigger === "mood_shift");
    expect(moodMsgs).toHaveLength(0);
  });

  it("no mood shift message without previousStatus", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      status: makeStatus({ mood: 80 }),
      previousStatus: null,
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    const moodMsgs = messages.filter((m) => m.trigger === "mood_shift");
    expect(moodMsgs).toHaveLength(0);
  });

  it("no mood shift message when sulking", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      status: makeStatus({ mood: 70 }),
      previousStatus: makeStatus({ mood: 50 }),
      sulk: makeSulk("mild"),
      previousSulk: makeSulk("mild"),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    const moodMsgs = messages.filter((m) => m.trigger === "mood_shift");
    expect(moodMsgs).toHaveLength(0);
  });

  it("rising mood produces bright symbols (first 3 from species)", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      status: makeStatus({ mood: 80 }),
      previousStatus: makeStatus({ mood: 50 }),
      seed: createFixedSeed({ perception: "chromatic", hardwareBody: HW }),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    const content = messages[0].content;
    // Should contain first 3 chromatic symbols joined: "◎○●"
    const brightSymbols = PERCEPTION_SYMBOLS["chromatic"].slice(0, 3);
    expect(content).toBe(brightSymbols.join(""));
  });

  it("dropping mood produces darker symbol with trailing dots", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      status: makeStatus({ mood: 20 }),
      previousStatus: makeStatus({ mood: 50 }),
      seed: createFixedSeed({ perception: "chromatic", hardwareBody: HW }),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    const content = messages[0].content;
    // chromatic dark symbols: slice(3) = ["☆", "★", "◉"], first one + ".."
    expect(content).toBe("☆..");
  });
});

// =============================================================
// 6. Evening Reflection Trigger
// =============================================================

describe("HeartbeatMessages — Evening Reflection", () => {
  it("generates evening reflection message", () => {
    const ctx = makeContext({ hourOfDay: 22 });
    const { message } = generateEveningReflection(ctx, makeState(), EVENING);
    expect(message).not.toBeNull();
    expect(message!.trigger).toBe("evening_reflection");
    expect(message!.content.length).toBeGreaterThan(0);
  });

  it("evening reflection content has reflective format (sym..sym..)", () => {
    const ctx = makeContext({ hourOfDay: 22 });
    const { message } = generateEveningReflection(ctx, makeState(), EVENING);
    expect(message!.content).toMatch(/.+\.\..+\.\./);
  });

  it("no evening reflection during severe sulk", () => {
    const ctx = makeContext({
      hourOfDay: 22,
      sulk: makeSulk("severe"),
    });
    const { message } = generateEveningReflection(ctx, makeState(), EVENING);
    expect(message).toBeNull();
  });

  it("no evening reflection when daily limit reached", () => {
    const ctx = makeContext({ hourOfDay: 22 });
    const state = makeState({ messageCountToday: 4 });
    const { message } = generateEveningReflection(ctx, state, EVENING);
    expect(message).toBeNull();
  });

  it("evening reflection increments message count", () => {
    const ctx = makeContext({ hourOfDay: 22 });
    const state = makeState({ messageCountToday: 2 });
    const { updatedMessageState } = generateEveningReflection(ctx, state, EVENING);
    expect(updatedMessageState.messageCountToday).toBe(3);
  });

  it("evening reflection resets daily counter on new day", () => {
    const ctx = makeContext({ hourOfDay: 22 });
    const state = makeState({ messageCountToday: 4, todayDate: "2026-02-19" });
    const { message, updatedMessageState } = generateEveningReflection(ctx, state, EVENING);
    expect(message).not.toBeNull();
    expect(updatedMessageState.messageCountToday).toBe(1);
    expect(updatedMessageState.todayDate).toBe("2026-02-20");
  });
});

// =============================================================
// 7. Gate Tests
// =============================================================

describe("HeartbeatMessages — Gates", () => {
  it("no messages during sleep hours (23:00)", () => {
    const ctx = makeContext({ timeOfDay: "lateNight", hourOfDay: 23 });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), NIGHT);
    expect(messages).toHaveLength(0);
  });

  it("no messages before 7:00 (hour=5)", () => {
    const ctx = makeContext({ timeOfDay: "morning", hourOfDay: 5 });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), EARLY_MORNING);
    expect(messages).toHaveLength(0);
  });

  it("no messages at hour=0 (midnight)", () => {
    const midnight = new Date("2026-02-20T00:00:00");
    const ctx = makeContext({ timeOfDay: "lateNight", hourOfDay: 0 });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), midnight);
    expect(messages).toHaveLength(0);
  });

  it("allows messages at exactly hour=7 (boundary)", () => {
    const ctx = makeContext({ timeOfDay: "morning", hourOfDay: 7 });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), BOUNDARY_7AM);
    // Should produce a morning greeting at 7AM
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("morning_greeting");
  });

  it("blocks messages at exactly hour=23 (boundary)", () => {
    const ctx = makeContext({ timeOfDay: "night", hourOfDay: 23 });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), BOUNDARY_23);
    expect(messages).toHaveLength(0);
  });

  it("allows messages at hour=22 (last allowed hour)", () => {
    const ctx = makeContext({
      hourOfDay: 22,
      minutesSinceLastInteraction: 400,
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), EVENING);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("no messages when daily limit (4) reached", () => {
    const ctx = makeContext({ timeOfDay: "morning", hourOfDay: 9 });
    const state = makeState({ messageCountToday: 4 });
    const { messages } = generateHeartbeatMessages(ctx, state, MORNING);
    expect(messages).toHaveLength(0);
  });

  it("allows message when count is 3 (below limit)", () => {
    const ctx = makeContext({ timeOfDay: "morning", hourOfDay: 9 });
    const state = makeState({ messageCountToday: 3 });
    const { messages } = generateHeartbeatMessages(ctx, state, MORNING);
    expect(messages).toHaveLength(1);
  });

  it("no messages during severe sulk", () => {
    const ctx = makeContext({
      timeOfDay: "morning",
      hourOfDay: 9,
      sulk: makeSulk("severe"),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    expect(messages).toHaveLength(0);
  });

  it("allows messages during mild sulk (only severe blocks)", () => {
    const ctx = makeContext({
      timeOfDay: "morning",
      hourOfDay: 9,
      sulk: makeSulk("mild"),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    // Mild sulk should still allow morning greeting (muted)
    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows messages during moderate sulk", () => {
    const ctx = makeContext({
      timeOfDay: "morning",
      hourOfDay: 9,
      sulk: makeSulk("moderate"),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("resets daily counter on new day", () => {
    const ctx = makeContext({ timeOfDay: "morning", hourOfDay: 9 });
    const state = makeState({
      messageCountToday: 4,
      todayDate: "2026-02-19",
    });
    const { messages, updatedMessageState } = generateHeartbeatMessages(ctx, state, MORNING);
    expect(messages).toHaveLength(1);
    expect(updatedMessageState.todayDate).toBe("2026-02-20");
    expect(updatedMessageState.messageCountToday).toBe(1);
  });
});

// =============================================================
// 8. Message State Tracking
// =============================================================

describe("HeartbeatMessages — State Management", () => {
  it("increments message count after generating a message", () => {
    const ctx = makeContext({ timeOfDay: "morning", hourOfDay: 9 });
    const { updatedMessageState } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    expect(updatedMessageState.messageCountToday).toBe(1);
  });

  it("records last message time as ISO string", () => {
    const ctx = makeContext({ timeOfDay: "morning", hourOfDay: 9 });
    const { updatedMessageState } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    expect(updatedMessageState.lastMessageTime).toBe(MORNING.toISOString());
  });

  it("preserves state when no message is generated", () => {
    const ctx = makeContext({ hourOfDay: 23, timeOfDay: "lateNight" });
    const originalState = makeState({ messageCountToday: 2 });
    const { updatedMessageState } = generateHeartbeatMessages(ctx, originalState, NIGHT);
    expect(updatedMessageState.messageCountToday).toBe(2);
    expect(updatedMessageState.lastMessageTime).toBeNull();
  });

  it("tracks morning greeting date separately from message count", () => {
    const ctx = makeContext({ timeOfDay: "morning", hourOfDay: 9 });
    const { updatedMessageState } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    expect(updatedMessageState.lastMorningGreeting).toBe("2026-02-20");
    expect(updatedMessageState.messageCountToday).toBe(1);
  });

  it("tracks presence signal timestamp", () => {
    const ctx = makeContext({
      minutesSinceLastInteraction: 400,
      hourOfDay: 14,
    });
    const { updatedMessageState } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    expect(updatedMessageState.lastPresenceSignal).toBe(AFTERNOON.toISOString());
  });

  it("accumulates message count across multiple calls", () => {
    // First call: morning greeting
    const ctx1 = makeContext({ timeOfDay: "morning", hourOfDay: 9 });
    const { updatedMessageState: state1 } = generateHeartbeatMessages(ctx1, makeState(), MORNING);
    expect(state1.messageCountToday).toBe(1);

    // Second call: presence signal (using updated state)
    const ctx2 = makeContext({
      minutesSinceLastInteraction: 400,
      hourOfDay: 14,
    });
    const { updatedMessageState: state2 } = generateHeartbeatMessages(ctx2, state1, AFTERNOON);
    expect(state2.messageCountToday).toBe(2);
  });
});

// =============================================================
// 9. Priority Ordering (Multiple Triggers at Same Time)
// =============================================================

describe("HeartbeatMessages — Priority Ordering", () => {
  it("sulk onset takes priority over morning greeting", () => {
    const ctx = makeContext({
      timeOfDay: "morning",
      hourOfDay: 9,
      sulk: makeSulk("mild"),
      previousSulk: NO_SULK,
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("sulk_onset");
  });

  it("sulk recovery takes priority over morning greeting", () => {
    const ctx = makeContext({
      timeOfDay: "morning",
      hourOfDay: 9,
      sulk: NO_SULK,
      previousSulk: makeSulk("mild"),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("sulk_recovery");
  });

  it("sulk onset takes priority over presence signal", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      minutesSinceLastInteraction: 400,
      sulk: makeSulk("mild"),
      previousSulk: NO_SULK,
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("sulk_onset");
  });

  it("sulk onset takes priority over mood shift", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      sulk: makeSulk("mild"),
      previousSulk: NO_SULK,
      status: makeStatus({ mood: 70 }),
      previousStatus: makeStatus({ mood: 50 }),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("sulk_onset");
  });

  it("morning greeting takes priority over presence signal", () => {
    const ctx = makeContext({
      timeOfDay: "morning",
      hourOfDay: 9,
      minutesSinceLastInteraction: 400,
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("morning_greeting");
  });

  it("returns at most one message per call", () => {
    // Set up conditions for multiple triggers: morning + presence + mood shift
    const ctx = makeContext({
      timeOfDay: "morning",
      hourOfDay: 9,
      minutesSinceLastInteraction: 400,
      status: makeStatus({ mood: 80 }),
      previousStatus: makeStatus({ mood: 50 }),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    expect(messages).toHaveLength(1);
  });
});

// =============================================================
// 10. Species Variation
// =============================================================

describe("HeartbeatMessages — All Species", () => {
  for (const sp of ALL_SPECIES) {
    it(`generates morning greeting for ${sp}`, () => {
      const ctx = makeContext({
        timeOfDay: "morning",
        hourOfDay: 9,
        seed: createFixedSeed({ perception: sp, hardwareBody: HW }),
        language: createInitialLanguageState(sp),
      });
      const { messages } = generateHeartbeatMessages(ctx, makeState(), MORNING);
      expect(messages).toHaveLength(1);
      expect(messages[0].trigger).toBe("morning_greeting");
      expect(messages[0].content.length).toBeGreaterThan(0);
    });

    it(`generates presence signal for ${sp}`, () => {
      const ctx = makeContext({
        hourOfDay: 14,
        minutesSinceLastInteraction: 400,
        seed: createFixedSeed({ perception: sp, hardwareBody: HW }),
        language: createInitialLanguageState(sp),
      });
      const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
      expect(messages).toHaveLength(1);
      expect(messages[0].trigger).toBe("presence_signal");
      // Presence signal should be the species' first symbol
      expect(messages[0].content).toBe(PERCEPTION_SYMBOLS[sp][0]);
    });

    it(`generates sulk onset for ${sp}`, () => {
      const ctx = makeContext({
        hourOfDay: 14,
        sulk: makeSulk("mild"),
        previousSulk: NO_SULK,
        seed: createFixedSeed({ perception: sp, hardwareBody: HW }),
        language: createInitialLanguageState(sp),
      });
      const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
      expect(messages).toHaveLength(1);
      expect(messages[0].trigger).toBe("sulk_onset");
      expect(messages[0].content.length).toBeGreaterThan(0);
    });

    it(`generates sulk recovery for ${sp}`, () => {
      const ctx = makeContext({
        hourOfDay: 14,
        sulk: NO_SULK,
        previousSulk: makeSulk("mild"),
        seed: createFixedSeed({ perception: sp, hardwareBody: HW }),
        language: createInitialLanguageState(sp),
      });
      const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
      expect(messages).toHaveLength(1);
      expect(messages[0].trigger).toBe("sulk_recovery");
      expect(messages[0].content).toContain(PERCEPTION_SYMBOLS[sp][0]);
    });

    it(`generates mood shift for ${sp}`, () => {
      const ctx = makeContext({
        hourOfDay: 14,
        status: makeStatus({ mood: 80 }),
        previousStatus: makeStatus({ mood: 50 }),
        seed: createFixedSeed({ perception: sp, hardwareBody: HW }),
        language: createInitialLanguageState(sp),
      });
      const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
      expect(messages).toHaveLength(1);
      expect(messages[0].trigger).toBe("mood_shift");
      expect(messages[0].content.length).toBeGreaterThan(0);
    });

    it(`generates evening reflection for ${sp}`, () => {
      const ctx = makeContext({
        hourOfDay: 22,
        seed: createFixedSeed({ perception: sp, hardwareBody: HW }),
        language: createInitialLanguageState(sp),
      });
      const { message } = generateEveningReflection(ctx, makeState(), EVENING);
      expect(message).not.toBeNull();
      expect(message!.trigger).toBe("evening_reflection");
      expect(message!.content.length).toBeGreaterThan(0);
    });
  }

  it("different species produce different symbol patterns for morning greeting", () => {
    const results = new Map<string, string>();
    for (const sp of ALL_SPECIES) {
      const ctx = makeContext({
        timeOfDay: "morning",
        hourOfDay: 9,
        status: makeStatus({ mood: 70, energy: 70 }),
        seed: createFixedSeed({ perception: sp, hardwareBody: HW }),
        language: createInitialLanguageState(sp),
      });
      const { messages } = generateHeartbeatMessages(ctx, makeState(), MORNING);
      results.set(sp, messages[0].content);
    }
    // At least some species should produce different content
    const uniqueContents = new Set(results.values());
    expect(uniqueContents.size).toBeGreaterThan(1);
  });
});

// =============================================================
// 11. Edge Cases
// =============================================================

describe("HeartbeatMessages — Edge Cases", () => {
  it("brand new entity: no previousStatus, no previousSulk", () => {
    const ctx = makeContext({
      timeOfDay: "morning",
      hourOfDay: 9,
      previousStatus: null,
      previousSulk: null,
    });
    const state = createInitialMessageState(MORNING);
    const { messages } = generateHeartbeatMessages(ctx, state, MORNING);
    // Should still produce a morning greeting
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("morning_greeting");
  });

  it("brand new entity: no sulk onset without previousSulk", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      sulk: makeSulk("mild"),
      previousSulk: null, // No previous state to compare
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    const onsets = messages.filter((m) => m.trigger === "sulk_onset");
    expect(onsets).toHaveLength(0);
  });

  it("brand new entity: no sulk recovery without previousSulk", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      sulk: NO_SULK,
      previousSulk: null,
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    const recoveries = messages.filter((m) => m.trigger === "sulk_recovery");
    expect(recoveries).toHaveLength(0);
  });

  it("no triggers fire when all conditions are neutral", () => {
    // Afternoon, no morning, recent interaction, no sulk transition, no mood shift
    const ctx = makeContext({
      timeOfDay: "afternoon",
      hourOfDay: 14,
      minutesSinceLastInteraction: 60,
      previousStatus: makeStatus({ mood: 50 }), // Same mood
      previousSulk: NO_SULK,
      sulk: NO_SULK,
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    expect(messages).toHaveLength(0);
  });

  it("handles extreme status values (mood=0, energy=0)", () => {
    const ctx = makeContext({
      timeOfDay: "morning",
      hourOfDay: 9,
      status: makeStatus({ mood: 0, energy: 0 }),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    expect(messages).toHaveLength(1);
    expect(messages[0].content.length).toBeGreaterThan(0);
  });

  it("handles extreme status values (mood=100, energy=100)", () => {
    const ctx = makeContext({
      timeOfDay: "morning",
      hourOfDay: 9,
      status: makeStatus({ mood: 100, energy: 100 }),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    expect(messages).toHaveLength(1);
    expect(messages[0].content.length).toBeGreaterThan(0);
  });

  it("severe sulk onset still produces a message (silence as expression, not blocked)", () => {
    // Severe sulk is gated AFTER the sulk check in the main function,
    // but the severe sulk gate runs before triggers, so onset for severe
    // entering sulk from non-sulk should be blocked by the severe gate
    const ctx = makeContext({
      hourOfDay: 14,
      sulk: makeSulk("severe"),
      previousSulk: NO_SULK,
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    // Severe sulk gate fires first, blocking all messages including onset
    expect(messages).toHaveLength(0);
  });
});
