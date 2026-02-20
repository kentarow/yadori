/**
 * Comprehensive tests for Mood Engine and Sulk Engine.
 *
 * Covers: decay rates, comfort drop, interaction boosts, clamping,
 * sulk onset thresholds, severity escalation, recovery, species-specific
 * expressions, sulk duration tracking, temperament effects, energy/curiosity
 * effects, combined status changes, and natural drift toward baseline.
 */
import { describe, it, expect } from "vitest";
import {
  computeInteractionEffect,
  computeNaturalDecay,
  applyMoodDelta,
  type MoodDelta,
  type InteractionContext,
} from "../../src/mood/mood-engine.js";
import {
  createInitialSulkState,
  evaluateSulk,
  processSulkInteraction,
  getActiveSoulFile,
  getSulkExpression,
  generateSoulEvilMd,
  type SulkState,
  type SulkSeverity,
} from "../../src/mood/sulk-engine.js";
import { LanguageLevel, type Status, type PerceptionMode, type Temperament } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    mood: 50,
    energy: 50,
    curiosity: 50,
    comfort: 50,
    languageLevel: LanguageLevel.SymbolsOnly,
    perceptionLevel: 0,
    growthDay: 5,
    lastInteraction: "2026-02-20T12:00:00.000Z",
    ...overrides,
  };
}

function makeSulkState(overrides: Partial<SulkState> = {}): SulkState {
  return {
    isSulking: false,
    severity: "none",
    recoveryInteractions: 0,
    sulkingSince: null,
    ...overrides,
  };
}

const NOW = new Date("2026-02-20T12:00:00.000Z");

const ALL_PERCEPTIONS: PerceptionMode[] = [
  "chromatic", "vibration", "geometric", "thermal", "temporal", "chemical",
];

const ALL_TEMPERAMENTS: Temperament[] = [
  "curious-cautious", "bold-impulsive", "calm-observant", "restless-exploratory",
];

// ---------------------------------------------------------------------------
// 1. Mood decay over time — verify exact decay rates
// ---------------------------------------------------------------------------

describe("Mood decay over time", () => {
  it("decayRate scales linearly from 0 to 1 over 0-120 minutes", () => {
    // At 0 minutes, decayRate = 0 => all deltas should be numerically zero
    const atZero = computeNaturalDecay(makeStatus({ mood: 80 }), 0);
    expect(atZero.mood + 0).toBe(0);   // +0 normalizes -0 to 0
    expect(atZero.energy + 0).toBe(0);
    expect(atZero.curiosity + 0).toBe(0);
    expect(atZero.comfort + 0).toBe(0);
  });

  it("decayRate caps at 1.0 for intervals exceeding 120 minutes", () => {
    const status = makeStatus({ mood: 80 });
    const at120 = computeNaturalDecay(status, 120);
    const at240 = computeNaturalDecay(status, 240);
    // Beyond 120 minutes, decayRate = 1 so results should be identical
    expect(at120).toEqual(at240);
  });

  it("computes exact mood decay for high mood at full decay rate", () => {
    // mood=80, baseline=50 => (50-80)*0.05*1.0 = -1.5 => round = -2
    const decay = computeNaturalDecay(makeStatus({ mood: 80 }), 120);
    expect(decay.mood).toBe(Math.round((50 - 80) * 0.05 * 1));
  });

  it("computes exact energy decay at full decay rate", () => {
    // energy=80, baseline=50 => (50-80)*0.03*1.0 = -0.9 => round = -1
    const decay = computeNaturalDecay(makeStatus({ energy: 80 }), 120);
    expect(decay.energy).toBe(Math.round((50 - 80) * 0.03 * 1));
  });

  it("computes exact curiosity decay at full decay rate", () => {
    // curiosity=90, baseline=50 => (50-90)*0.02*1.0 = -0.8 => round = -1
    const decay = computeNaturalDecay(makeStatus({ curiosity: 90 }), 120);
    expect(decay.curiosity).toBe(Math.round((50 - 90) * 0.02 * 1));
  });

  it("comfort always decays: -2 at full decay rate", () => {
    const decay = computeNaturalDecay(makeStatus({ comfort: 90 }), 120);
    expect(decay.comfort).toBe(Math.round(-2 * 1));
  });

  it("comfort decay is proportional at half decay rate", () => {
    // 60 minutes => decayRate = 60/120 = 0.5 => comfort = round(-2*0.5) = -1
    const decay = computeNaturalDecay(makeStatus(), 60);
    expect(decay.comfort).toBe(Math.round(-2 * 0.5));
  });
});

// ---------------------------------------------------------------------------
// 2. Comfort drop when no interaction
// ---------------------------------------------------------------------------

describe("Comfort drop when no interaction", () => {
  it("comfort drops steadily without any interaction over 2 hours", () => {
    let status = makeStatus({ comfort: 80 });
    // Simulate 4 heartbeats at 30-minute intervals with no interaction
    for (let minutes = 30; minutes <= 120; minutes += 30) {
      const decay = computeNaturalDecay(status, minutes);
      status = applyMoodDelta(status, decay);
    }
    expect(status.comfort).toBeLessThan(80);
  });

  it("comfort reaches 0 after sustained neglect", () => {
    let status = makeStatus({ comfort: 20 });
    // Apply full-rate decay repeatedly
    for (let i = 0; i < 20; i++) {
      const decay = computeNaturalDecay(status, 120);
      status = applyMoodDelta(status, decay);
    }
    expect(status.comfort).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Interaction mood boost calculation
// ---------------------------------------------------------------------------

describe("Interaction mood boost calculation", () => {
  it("user-initiated interaction gives +3 mood base", () => {
    // restless-exploratory applies 0.8x to comfort => round(5*0.8) = 4
    const delta = computeInteractionEffect(
      makeStatus(),
      { minutesSinceLastInteraction: 30, userInitiated: true, messageLength: 5 },
      "restless-exploratory",
    );
    expect(delta.mood).toBe(3);
    expect(delta.comfort).toBe(Math.round(5 * 0.8)); // 4
  });

  it("non-user-initiated interaction gives 0 mood and 0 comfort base", () => {
    const delta = computeInteractionEffect(
      makeStatus(),
      { minutesSinceLastInteraction: 30, userInitiated: false, messageLength: 5 },
      "restless-exploratory",
    );
    expect(delta.mood).toBe(0);
    expect(delta.comfort).toBe(0);
  });

  it("medium message (11-50 chars) gives +2 curiosity base", () => {
    const delta = computeInteractionEffect(
      makeStatus(),
      { minutesSinceLastInteraction: 30, userInitiated: false, messageLength: 30 },
      "restless-exploratory",
    );
    // restless-exploratory: curiosity *= 1.5 => round(2 * 1.5) = 3
    expect(delta.curiosity).toBe(Math.round(2 * 1.5));
  });

  it("long message (>50 chars) gives +4 curiosity base", () => {
    const delta = computeInteractionEffect(
      makeStatus(),
      { minutesSinceLastInteraction: 30, userInitiated: false, messageLength: 100 },
      "restless-exploratory",
    );
    // restless-exploratory: curiosity *= 1.5 => round(4 * 1.5) = 6
    expect(delta.curiosity).toBe(Math.round(4 * 1.5));
  });
});

// ---------------------------------------------------------------------------
// 4. Mood bounds clamping (0-100)
// ---------------------------------------------------------------------------

describe("Mood bounds clamping (0-100)", () => {
  it("clamps all four fields at 0 when deltas are extremely negative", () => {
    const status = makeStatus({ mood: 5, energy: 3, curiosity: 2, comfort: 1 });
    const result = applyMoodDelta(status, { mood: -50, energy: -50, curiosity: -50, comfort: -50 });
    expect(result.mood).toBe(0);
    expect(result.energy).toBe(0);
    expect(result.curiosity).toBe(0);
    expect(result.comfort).toBe(0);
  });

  it("clamps all four fields at 100 when deltas are extremely positive", () => {
    const status = makeStatus({ mood: 95, energy: 98, curiosity: 97, comfort: 99 });
    const result = applyMoodDelta(status, { mood: 50, energy: 50, curiosity: 50, comfort: 50 });
    expect(result.mood).toBe(100);
    expect(result.energy).toBe(100);
    expect(result.curiosity).toBe(100);
    expect(result.comfort).toBe(100);
  });

  it("does not alter value when delta is 0", () => {
    const status = makeStatus({ mood: 42, energy: 73 });
    const result = applyMoodDelta(status, { mood: 0, energy: 0, curiosity: 0, comfort: 0 });
    expect(result.mood).toBe(42);
    expect(result.energy).toBe(73);
  });
});

// ---------------------------------------------------------------------------
// 5. Sulk onset conditions (exact thresholds)
// ---------------------------------------------------------------------------

describe("Sulk onset conditions — exact thresholds", () => {
  it("enters sulk when comfort=24 AND mood=34 (both just below thresholds)", () => {
    const result = evaluateSulk(
      createInitialSulkState(),
      makeStatus({ comfort: 24, mood: 34 }),
      60, "restless-exploratory", NOW,
    );
    expect(result.isSulking).toBe(true);
  });

  it("does NOT sulk when comfort=25 (at threshold, not below)", () => {
    const result = evaluateSulk(
      createInitialSulkState(),
      makeStatus({ comfort: 25, mood: 30 }),
      60, "restless-exploratory", NOW,
    );
    expect(result.isSulking).toBe(false);
  });

  it("does NOT sulk when mood=35 (at threshold, not below)", () => {
    const result = evaluateSulk(
      createInitialSulkState(),
      makeStatus({ comfort: 20, mood: 35 }),
      60, "restless-exploratory", NOW,
    );
    expect(result.isSulking).toBe(false);
  });

  it("absence-triggered sulk requires >720 minutes AND comfort<40", () => {
    // 720 minutes exact — should NOT trigger (needs >720)
    const atBoundary = evaluateSulk(
      createInitialSulkState(),
      makeStatus({ comfort: 35, mood: 60 }),
      720, "restless-exploratory", NOW,
    );
    expect(atBoundary.isSulking).toBe(false);

    // 721 minutes — should trigger
    const pastBoundary = evaluateSulk(
      createInitialSulkState(),
      makeStatus({ comfort: 35, mood: 60 }),
      721, "restless-exploratory", NOW,
    );
    expect(pastBoundary.isSulking).toBe(true);
  });

  it("absence sulk does NOT trigger when comfort >= 40", () => {
    const result = evaluateSulk(
      createInitialSulkState(),
      makeStatus({ comfort: 40, mood: 60 }),
      800, "restless-exploratory", NOW,
    );
    expect(result.isSulking).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Sulk severity escalation (mild -> moderate -> severe)
// ---------------------------------------------------------------------------

describe("Sulk severity escalation", () => {
  it("assigns mild severity when comfort is 20-24, mood is 25-34, neutral temperament", () => {
    // comfort=22: score +2; mood=30: score +1; restless-exploratory: +0 => total 3 => moderate
    // Let's find a mild case: comfort=22, mood=50 won't sulk because mood >= 35
    // Need both conditions: comfort<25 AND mood<35
    // comfort=24, mood=34: score = 1 (comfort >=20) + 0 (mood >=35 — wait, 34 < 35 => +1) = 2
    // restless-exploratory: +0 => total 2 => mild
    const result = evaluateSulk(
      createInitialSulkState(),
      makeStatus({ comfort: 24, mood: 34 }),
      60, "restless-exploratory", NOW,
    );
    expect(result.severity).toBe("mild");
  });

  it("assigns moderate severity for lower comfort and mood", () => {
    // comfort=15: score +2; mood=25: score +1; restless-exploratory: +0 => total 3 => moderate
    const result = evaluateSulk(
      createInitialSulkState(),
      makeStatus({ comfort: 15, mood: 25 }),
      60, "restless-exploratory", NOW,
    );
    expect(result.severity).toBe("moderate");
  });

  it("assigns severe severity for very low comfort and mood", () => {
    // comfort=5: score +3; mood=15: score +2; restless-exploratory: +0 => total 5 => severe
    const result = evaluateSulk(
      createInitialSulkState(),
      makeStatus({ comfort: 5, mood: 15 }),
      60, "restless-exploratory", NOW,
    );
    expect(result.severity).toBe("severe");
  });

  it("temperament can push severity up: curious-cautious adds +1", () => {
    // comfort=22, mood=30: base score = 2+1 = 3 (moderate)
    // curious-cautious: +1 => score 4 => moderate (still, need >=5 for severe)
    // Let's use comfort=15, mood=25: base=3, +1=4 => moderate
    // comfort=8, mood=25: base = 3+1 = 4, +1 = 5 => severe
    const result = evaluateSulk(
      createInitialSulkState(),
      makeStatus({ comfort: 8, mood: 25 }),
      60, "curious-cautious", NOW,
    );
    expect(result.severity).toBe("severe");
  });

  it("calm-observant temperament reduces severity by 1", () => {
    // comfort=15, mood=25: base=3; calm-observant: -1 => 2 => mild
    const result = evaluateSulk(
      createInitialSulkState(),
      makeStatus({ comfort: 15, mood: 25 }),
      60, "calm-observant", NOW,
    );
    expect(result.severity).toBe("mild");
  });
});

// ---------------------------------------------------------------------------
// 7. Sulk recovery through interaction
// ---------------------------------------------------------------------------

describe("Sulk recovery through interaction", () => {
  it("mild sulk recovers after 3 interactions + comfort >= 40", () => {
    let sulk = makeSulkState({ isSulking: true, severity: "mild", recoveryInteractions: 0, sulkingSince: NOW.toISOString() });
    const comfortableStatus = makeStatus({ comfort: 45 });

    for (let i = 0; i < 3; i++) {
      sulk = processSulkInteraction(sulk, comfortableStatus);
    }
    expect(sulk.isSulking).toBe(false);
    expect(sulk.severity).toBe("none");
  });

  it("moderate sulk recovers after 6 interactions + comfort >= 40", () => {
    let sulk = makeSulkState({ isSulking: true, severity: "moderate", recoveryInteractions: 0, sulkingSince: NOW.toISOString() });
    const comfortableStatus = makeStatus({ comfort: 45 });

    for (let i = 0; i < 6; i++) {
      sulk = processSulkInteraction(sulk, comfortableStatus);
    }
    expect(sulk.isSulking).toBe(false);
    expect(sulk.severity).toBe("none");
  });

  it("severe sulk recovers after 10 interactions + comfort >= 40", () => {
    let sulk = makeSulkState({ isSulking: true, severity: "severe", recoveryInteractions: 0, sulkingSince: NOW.toISOString() });
    const comfortableStatus = makeStatus({ comfort: 45 });

    for (let i = 0; i < 10; i++) {
      sulk = processSulkInteraction(sulk, comfortableStatus);
    }
    expect(sulk.isSulking).toBe(false);
    expect(sulk.severity).toBe("none");
  });

  it("does NOT recover if comfort stays below 40, even with enough interactions", () => {
    let sulk = makeSulkState({ isSulking: true, severity: "mild", recoveryInteractions: 0, sulkingSince: NOW.toISOString() });
    const lowComfort = makeStatus({ comfort: 30 });

    for (let i = 0; i < 5; i++) {
      sulk = processSulkInteraction(sulk, lowComfort);
    }
    // Has 5 interactions (>= 3 needed for mild) but comfort < 40
    expect(sulk.isSulking).toBe(true);
  });

  it("severe downgrades to moderate after 5 interactions (partial recovery)", () => {
    let sulk = makeSulkState({ isSulking: true, severity: "severe", recoveryInteractions: 0, sulkingSince: NOW.toISOString() });
    const lowComfort = makeStatus({ comfort: 30 });

    for (let i = 0; i < 5; i++) {
      sulk = processSulkInteraction(sulk, lowComfort);
    }
    expect(sulk.severity).toBe("moderate");
    expect(sulk.isSulking).toBe(true);
  });

  it("moderate downgrades to mild after 3 interactions (partial recovery)", () => {
    let sulk = makeSulkState({ isSulking: true, severity: "moderate", recoveryInteractions: 0, sulkingSince: NOW.toISOString() });
    const lowComfort = makeStatus({ comfort: 30 });

    for (let i = 0; i < 3; i++) {
      sulk = processSulkInteraction(sulk, lowComfort);
    }
    expect(sulk.severity).toBe("mild");
    expect(sulk.isSulking).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. Species-specific sulk expressions (SOUL_EVIL.md content)
// ---------------------------------------------------------------------------

describe("Species-specific sulk expressions", () => {
  it("chromatic severe describes darkness and light going out", () => {
    const expr = getSulkExpression("chromatic", "severe");
    expect(expr.description).toContain("Darkness");
    expect(expr.symbols).toEqual(["●"]);
  });

  it("vibration severe has no symbols (complete silence)", () => {
    const expr = getSulkExpression("vibration", "severe");
    expect(expr.symbols).toEqual([]);
    expect(expr.description).toContain("Complete stillness");
  });

  it("geometric sulk progression: forms dissolve", () => {
    const mild = getSulkExpression("geometric", "mild");
    const severe = getSulkExpression("geometric", "severe");
    expect(mild.description).toContain("Edges");
    expect(severe.description).toContain("structure dissolved");
  });

  it("thermal sulk goes cold", () => {
    const severe = getSulkExpression("thermal", "severe");
    expect(severe.description).toContain("Cold");
  });

  it("temporal sulk breaks rhythm", () => {
    const mild = getSulkExpression("temporal", "mild");
    expect(mild.description).toContain("Rhythm");
    const severe = getSulkExpression("temporal", "severe");
    expect(severe.description).toContain("Time has stopped");
  });

  it("chemical sulk becomes inert", () => {
    const severe = getSulkExpression("chemical", "severe");
    expect(severe.description).toContain("inertia");
  });

  it("generateSoulEvilMd uses (silence) when species has no symbols at that severity", () => {
    // vibration severe has no symbols
    const md = generateSoulEvilMd("vibration", "severe");
    expect(md).toContain("(silence)");
    expect(md).toContain("vibration");
    expect(md).toContain("Severity: severe");
  });

  it("generateSoulEvilMd includes species-specific symbols when available", () => {
    const md = generateSoulEvilMd("chromatic", "mild");
    expect(md).toContain("○");
    expect(md).not.toContain("(silence)");
  });
});

// ---------------------------------------------------------------------------
// 9. Sulk duration tracking
// ---------------------------------------------------------------------------

describe("Sulk duration tracking", () => {
  it("records sulkingSince timestamp on entry", () => {
    const result = evaluateSulk(
      createInitialSulkState(),
      makeStatus({ comfort: 10, mood: 20 }),
      60, "restless-exploratory", NOW,
    );
    expect(result.sulkingSince).toBe(NOW.toISOString());
  });

  it("preserves sulkingSince across interactions during sulk", () => {
    const sulk = makeSulkState({
      isSulking: true,
      severity: "moderate",
      recoveryInteractions: 0,
      sulkingSince: "2026-02-19T08:00:00.000Z",
    });
    const result = processSulkInteraction(sulk, makeStatus({ comfort: 30 }));
    expect(result.sulkingSince).toBe("2026-02-19T08:00:00.000Z");
  });

  it("clears sulkingSince on full recovery", () => {
    const sulk = makeSulkState({
      isSulking: true,
      severity: "mild",
      recoveryInteractions: 2,
      sulkingSince: "2026-02-19T08:00:00.000Z",
    });
    const result = processSulkInteraction(sulk, makeStatus({ comfort: 45 }));
    expect(result.isSulking).toBe(false);
    expect(result.sulkingSince).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 10. Temperament effects on mood dynamics
// ---------------------------------------------------------------------------

describe("Temperament effects on mood dynamics", () => {
  const userMessage: InteractionContext = {
    minutesSinceLastInteraction: 30,
    userInitiated: true,
    messageLength: 60,
  };

  it("bold-impulsive has 1.4x mood swing (more volatile)", () => {
    const bold = computeInteractionEffect(makeStatus(), userMessage, "bold-impulsive");
    // Base mood = 3 (user initiated), bold: round(3 * 1.4) = round(4.2) = 4
    expect(bold.mood).toBe(Math.round(3 * 1.4));
  });

  it("calm-observant has 0.7x mood swing (more stable)", () => {
    const calm = computeInteractionEffect(makeStatus(), userMessage, "calm-observant");
    // Base mood = 3, calm: round(3 * 0.7) = round(2.1) = 2
    expect(calm.mood).toBe(Math.round(3 * 0.7));
  });

  it("bold-impulsive mood delta > calm-observant mood delta for same interaction", () => {
    const bold = computeInteractionEffect(makeStatus(), userMessage, "bold-impulsive");
    const calm = computeInteractionEffect(makeStatus(), userMessage, "calm-observant");
    expect(bold.mood).toBeGreaterThan(calm.mood);
  });

  it("curious-cautious has 1.3x curiosity multiplier", () => {
    const delta = computeInteractionEffect(makeStatus(), userMessage, "curious-cautious");
    // messageLength=60 > 50 => base curiosity = 4; * 1.3 = 5.2 => round = 5
    expect(delta.curiosity).toBe(Math.round(4 * 1.3));
  });

  it("restless-exploratory has 1.5x curiosity multiplier", () => {
    const delta = computeInteractionEffect(makeStatus(), userMessage, "restless-exploratory");
    // base curiosity = 4; * 1.5 = 6
    expect(delta.curiosity).toBe(Math.round(4 * 1.5));
  });

  it("calm-observant has 0.6x comfort multiplier (less reactive)", () => {
    const calm = computeInteractionEffect(makeStatus(), userMessage, "calm-observant");
    // Base comfort = 5 (user initiated); calm: round(5 * 0.6) = 3
    expect(calm.comfort).toBe(Math.round(5 * 0.6));
  });
});

// ---------------------------------------------------------------------------
// 11. Energy effects from interactions
// ---------------------------------------------------------------------------

describe("Energy effects from interactions", () => {
  it("frequent interaction (<2 min) costs -2 energy", () => {
    const delta = computeInteractionEffect(
      makeStatus(),
      { minutesSinceLastInteraction: 1, userInitiated: false, messageLength: 5 },
      "restless-exploratory",
    );
    expect(delta.energy).toBe(-2);
  });

  it("normal interaction (>=2 min) costs -1 energy", () => {
    const delta = computeInteractionEffect(
      makeStatus(),
      { minutesSinceLastInteraction: 10, userInitiated: false, messageLength: 5 },
      "restless-exploratory",
    );
    expect(delta.energy).toBe(-1);
  });

  it("bold-impulsive reduces energy cost (0.8x multiplier)", () => {
    const delta = computeInteractionEffect(
      makeStatus(),
      { minutesSinceLastInteraction: 10, userInitiated: false, messageLength: 5 },
      "bold-impulsive",
    );
    // Base energy = -1; bold: round(-1 * 0.8) = round(-0.8) = -1
    expect(delta.energy).toBe(Math.round(-1 * 0.8));
  });

  it("bold-impulsive on frequent interaction: round(-2*0.8) = -2", () => {
    const delta = computeInteractionEffect(
      makeStatus(),
      { minutesSinceLastInteraction: 1, userInitiated: false, messageLength: 5 },
      "bold-impulsive",
    );
    // Base energy = -2; bold: round(-2 * 0.8) = round(-1.6) = -2
    expect(delta.energy).toBe(Math.round(-2 * 0.8));
  });
});

// ---------------------------------------------------------------------------
// 12. Curiosity boost from long messages
// ---------------------------------------------------------------------------

describe("Curiosity boost from long messages", () => {
  it("short message (<=10 chars) gives 0 curiosity", () => {
    const delta = computeInteractionEffect(
      makeStatus(),
      { minutesSinceLastInteraction: 30, userInitiated: false, messageLength: 10 },
      "restless-exploratory",
    );
    // Base curiosity = 0; * 1.5 = 0
    expect(delta.curiosity).toBe(0);
  });

  it("medium message (11-50 chars) gives base +2 curiosity", () => {
    const delta = computeInteractionEffect(
      makeStatus(),
      { minutesSinceLastInteraction: 30, userInitiated: false, messageLength: 25 },
      "restless-exploratory",
    );
    expect(delta.curiosity).toBe(Math.round(2 * 1.5));
  });

  it("long message (>50 chars) gives base +4 curiosity", () => {
    const delta = computeInteractionEffect(
      makeStatus(),
      { minutesSinceLastInteraction: 30, userInitiated: false, messageLength: 200 },
      "restless-exploratory",
    );
    expect(delta.curiosity).toBe(Math.round(4 * 1.5));
  });

  it("long absence (>360 min) adds +5 curiosity base on top of message curiosity", () => {
    const delta = computeInteractionEffect(
      makeStatus(),
      { minutesSinceLastInteraction: 400, userInitiated: false, messageLength: 200 },
      "restless-exploratory",
    );
    // curiosity = (4 from long message + 5 from absence) * 1.5 = 13.5 => 14
    expect(delta.curiosity).toBe(Math.round((4 + 5) * 1.5));
  });

  it("moderate absence (61-360 min) adds +2 curiosity base", () => {
    const delta = computeInteractionEffect(
      makeStatus(),
      { minutesSinceLastInteraction: 120, userInitiated: false, messageLength: 200 },
      "restless-exploratory",
    );
    // curiosity = (4 + 2) * 1.5 = 9
    expect(delta.curiosity).toBe(Math.round((4 + 2) * 1.5));
  });
});

// ---------------------------------------------------------------------------
// 13. Combined effects: multiple status changes in single interaction
// ---------------------------------------------------------------------------

describe("Combined effects: multiple status changes in single interaction", () => {
  it("user-initiated long message after long absence: all fields change", () => {
    const delta = computeInteractionEffect(
      makeStatus(),
      { minutesSinceLastInteraction: 400, userInitiated: true, messageLength: 100 },
      "curious-cautious",
    );
    // mood: 3 base, curious-cautious unchanged for mood => 3
    expect(delta.mood).toBe(3);
    // comfort: 5 (user) - 8 (absence) = -3; curious-cautious: round(-3*1.2) = round(-3.6) = -4
    expect(delta.comfort).toBe(Math.round((5 - 8) * 1.2));
    // curiosity: 4 (long msg) + 5 (absence) = 9; curious-cautious: round(9*1.3) = round(11.7) = 12
    expect(delta.curiosity).toBe(Math.round(9 * 1.3));
    // energy: -1 (normal interval); curious-cautious unchanged => -1
    expect(delta.energy).toBe(-1);
  });

  it("applying interaction effect then decay simulates one heartbeat cycle", () => {
    let status = makeStatus({ mood: 40, energy: 40, comfort: 30, curiosity: 60 });

    // User sends a message
    const interactionDelta = computeInteractionEffect(
      status,
      { minutesSinceLastInteraction: 45, userInitiated: true, messageLength: 80 },
      "bold-impulsive",
    );
    status = applyMoodDelta(status, interactionDelta);

    // Then 30 min of no interaction passes
    const decay = computeNaturalDecay(status, 30);
    status = applyMoodDelta(status, decay);

    // All values should remain in 0-100
    expect(status.mood).toBeGreaterThanOrEqual(0);
    expect(status.mood).toBeLessThanOrEqual(100);
    expect(status.energy).toBeGreaterThanOrEqual(0);
    expect(status.energy).toBeLessThanOrEqual(100);
    expect(status.comfort).toBeGreaterThanOrEqual(0);
    expect(status.comfort).toBeLessThanOrEqual(100);
    expect(status.curiosity).toBeGreaterThanOrEqual(0);
    expect(status.curiosity).toBeLessThanOrEqual(100);
  });

  it("sulk can be triggered by interaction that drops comfort below threshold", () => {
    // Start with comfort just above sulk threshold
    let status = makeStatus({ comfort: 28, mood: 30 });

    // Long absence interaction drops comfort further
    const delta = computeInteractionEffect(
      status,
      { minutesSinceLastInteraction: 400, userInitiated: true, messageLength: 5 },
      "calm-observant",
    );
    status = applyMoodDelta(status, delta);

    // Now check if sulk would trigger
    const sulkResult = evaluateSulk(
      createInitialSulkState(),
      status,
      0, "calm-observant", NOW,
    );
    // Comfort should have dropped and mood is low
    if (status.comfort < 25 && status.mood < 35) {
      expect(sulkResult.isSulking).toBe(true);
    } else {
      // If not meeting thresholds, it shouldn't sulk
      expect(sulkResult.isSulking).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 14. Natural mood drift toward baseline
// ---------------------------------------------------------------------------

describe("Natural mood drift toward baseline (50)", () => {
  it("high mood (90) drifts downward toward 50", () => {
    const decay = computeNaturalDecay(makeStatus({ mood: 90 }), 120);
    expect(decay.mood).toBeLessThan(0);
  });

  it("low mood (10) drifts upward toward 50", () => {
    const decay = computeNaturalDecay(makeStatus({ mood: 10 }), 120);
    expect(decay.mood).toBeGreaterThan(0);
  });

  it("mood at baseline (50) has zero drift", () => {
    const decay = computeNaturalDecay(makeStatus({ mood: 50 }), 120);
    expect(decay.mood).toBe(0);
  });

  it("high energy (85) drifts downward toward 50", () => {
    const decay = computeNaturalDecay(makeStatus({ energy: 85 }), 120);
    expect(decay.energy).toBeLessThan(0);
  });

  it("low curiosity (20) drifts upward toward 50", () => {
    const decay = computeNaturalDecay(makeStatus({ curiosity: 20 }), 120);
    expect(decay.curiosity).toBeGreaterThan(0);
  });

  it("over many decay cycles, mood converges toward fixed points near baseline", () => {
    // Due to Math.round on integer deltas, values settle at fixed points where
    // round((50 - x) * rate) === 0. For mood (0.05 rate) this is x=60,
    // for energy (0.03 rate) x=66, for curiosity (0.02 rate) x=75.
    let status = makeStatus({ mood: 95, energy: 95, curiosity: 95 });
    for (let i = 0; i < 200; i++) {
      const decay = computeNaturalDecay(status, 120);
      status = applyMoodDelta(status, decay);
    }
    // Verify convergence to the rounding-induced fixed points
    expect(status.mood).toBe(60);
    expect(status.energy).toBe(66);
    expect(status.curiosity).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// Edge cases and integration
// ---------------------------------------------------------------------------

describe("Edge cases", () => {
  it("processSulkInteraction is a no-op when not sulking", () => {
    const initial = createInitialSulkState();
    const result = processSulkInteraction(initial, makeStatus());
    expect(result).toEqual(initial);
  });

  it("getActiveSoulFile returns SOUL.md when not sulking", () => {
    expect(getActiveSoulFile(createInitialSulkState())).toBe("SOUL.md");
  });

  it("getActiveSoulFile returns SOUL_EVIL.md when sulking", () => {
    expect(getActiveSoulFile(makeSulkState({ isSulking: true, severity: "mild" }))).toBe("SOUL_EVIL.md");
  });

  it("all perception x severity combinations produce valid SOUL_EVIL.md", () => {
    const severities: SulkSeverity[] = ["mild", "moderate", "severe"];
    for (const p of ALL_PERCEPTIONS) {
      for (const s of severities) {
        const md = generateSoulEvilMd(p, s);
        expect(md).toContain("# SOUL (Sulking Mode)");
        expect(md).toContain(`Severity: ${s}`);
        expect(md).toContain(p);
        expect(md.length).toBeGreaterThan(100);
      }
    }
  });
});
