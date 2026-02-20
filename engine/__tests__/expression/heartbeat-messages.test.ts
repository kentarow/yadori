import { describe, it, expect } from "vitest";
import {
  generateHeartbeatMessages,
  generateEveningReflection,
  createInitialMessageState,
  type HeartbeatMessageContext,
  type HeartbeatMessageState,
} from "../../src/expression/heartbeat-messages.js";
import { createFixedSeed } from "../../src/genesis/seed-generator.js";
import { createInitialLanguageState } from "../../src/language/language-engine.js";
import type { Status, PerceptionMode, HardwareBody } from "../../src/types.js";
import { LanguageLevel } from "../../src/types.js";
import type { SulkState } from "../../src/mood/sulk-engine.js";

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

// --- Gate Tests ---

describe("HeartbeatMessages — Gates", () => {
  it("no messages during sleep hours (23:00-7:00)", () => {
    const ctx = makeContext({ timeOfDay: "lateNight", hourOfDay: 23 });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), NIGHT);
    expect(messages).toHaveLength(0);
  });

  it("no messages before 7:00", () => {
    const ctx = makeContext({ timeOfDay: "morning", hourOfDay: 5 });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), EARLY_MORNING);
    expect(messages).toHaveLength(0);
  });

  it("no messages when daily limit reached", () => {
    const ctx = makeContext({ timeOfDay: "morning", hourOfDay: 9 });
    const state = makeState({ messageCountToday: 4 });
    const { messages } = generateHeartbeatMessages(ctx, state, MORNING);
    expect(messages).toHaveLength(0);
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

  it("resets daily counter on new day", () => {
    const ctx = makeContext({ timeOfDay: "morning", hourOfDay: 9 });
    const state = makeState({
      messageCountToday: 4,
      todayDate: "2026-02-19", // Yesterday
    });
    const { messages, updatedMessageState } = generateHeartbeatMessages(ctx, state, MORNING);
    expect(messages).toHaveLength(1); // Morning greeting should fire
    expect(updatedMessageState.todayDate).toBe("2026-02-20");
  });
});

// --- Morning Greeting ---

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
    // Should not have morning_greeting trigger
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

    // chromatic symbols (◎, ○, ●...) vs vibration symbols (◈, ◇, ◆...)
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
      // Muted = shorter content
      expect(mornings[0].content.length).toBeLessThanOrEqual(3);
    }
  });
});

// --- Presence Signal ---

describe("HeartbeatMessages — Presence Signal", () => {
  it("sends presence signal after 6+ hours of silence", () => {
    const ctx = makeContext({
      minutesSinceLastInteraction: 400, // ~6.7 hours
      hourOfDay: 14,
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("presence_signal");
  });

  it("does not send presence signal if recently sent", () => {
    const fourHoursAgo = new Date(AFTERNOON.getTime() - 60 * 60_000); // 1 hour ago, within 4h cooldown
    const ctx = makeContext({
      minutesSinceLastInteraction: 400,
      hourOfDay: 14,
    });
    const state = makeState({ lastPresenceSignal: fourHoursAgo.toISOString() });
    const { messages } = generateHeartbeatMessages(ctx, state, AFTERNOON);
    const presences = messages.filter((m) => m.trigger === "presence_signal");
    expect(presences).toHaveLength(0);
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
    expect(messages[0].content).toMatch(/^[◎○●☆★◉◈◇◆△▲▽■□]$/);
  });
});

// --- Sulk Transitions ---

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

  it("no sulk onset if already sulking", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      sulk: makeSulk("moderate"),
      previousSulk: makeSulk("mild"),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    const onsets = messages.filter((m) => m.trigger === "sulk_onset");
    expect(onsets).toHaveLength(0);
  });
});

// --- Mood Shift ---

describe("HeartbeatMessages — Mood Shift", () => {
  it("sends mood shift message when mood rises significantly", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      status: makeStatus({ mood: 70 }),
      previousStatus: makeStatus({ mood: 50 }),
    });
    const { messages } = generateHeartbeatMessages(ctx, makeState(), AFTERNOON);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe("mood_shift");
  });

  it("sends mood shift message when mood drops significantly", () => {
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

  it("no mood shift message for small changes", () => {
    const ctx = makeContext({
      hourOfDay: 14,
      status: makeStatus({ mood: 55 }),
      previousStatus: makeStatus({ mood: 50 }),
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
});

// --- Evening Reflection ---

describe("HeartbeatMessages — Evening Reflection", () => {
  it("generates evening reflection", () => {
    const ctx = makeContext({ hourOfDay: 22 });
    const { message } = generateEveningReflection(ctx, makeState(), EVENING);
    expect(message).not.toBeNull();
    expect(message!.trigger).toBe("evening_reflection");
    expect(message!.content.length).toBeGreaterThan(0);
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
});

// --- Message State Management ---

describe("HeartbeatMessages — State Management", () => {
  it("increments message count", () => {
    const ctx = makeContext({ timeOfDay: "morning", hourOfDay: 9 });
    const { updatedMessageState } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    expect(updatedMessageState.messageCountToday).toBe(1);
  });

  it("records last message time", () => {
    const ctx = makeContext({ timeOfDay: "morning", hourOfDay: 9 });
    const { updatedMessageState } = generateHeartbeatMessages(ctx, makeState(), MORNING);
    expect(updatedMessageState.lastMessageTime).toBe(MORNING.toISOString());
  });

  it("createInitialMessageState returns valid state", () => {
    const state = createInitialMessageState(MORNING);
    expect(state.messageCountToday).toBe(0);
    expect(state.todayDate).toBe("2026-02-20");
    expect(state.lastMessageTime).toBeNull();
  });
});

// --- All Species ---

describe("HeartbeatMessages — All Species", () => {
  const species: PerceptionMode[] = [
    "chromatic", "vibration", "geometric", "thermal", "temporal", "chemical",
  ];

  for (const sp of species) {
    it(`generates morning greeting for ${sp}`, () => {
      const ctx = makeContext({
        timeOfDay: "morning",
        hourOfDay: 9,
        seed: createFixedSeed({ perception: sp, hardwareBody: HW }),
        language: createInitialLanguageState(sp),
      });
      const { messages } = generateHeartbeatMessages(ctx, makeState(), MORNING);
      expect(messages).toHaveLength(1);
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
      expect(messages[0].content.length).toBeGreaterThan(0);
    });
  }
});
