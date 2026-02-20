/**
 * Dashboard Parser Tests
 *
 * Verifies the data pipeline from workspace markdown files → JSON API.
 * These parsers are the bridge between file-based entity state and
 * the browser visualization.
 */

import { describe, it, expect } from "vitest";
import {
  parseStatusMd,
  parseSeedMd,
  parsePerceptionMd,
  parseDynamicsMd,
  parseMilestonesMd,
  parseLanguageMd,
  parseMemoryMd,
  parseFormMd,
  parseReversalsMd,
  parseCoexistMd,
  computeCoexistenceMetrics,
} from "../parsers.js";

// ============================================================
// parseStatusMd
// ============================================================

describe("parseStatusMd", () => {
  it("parses a complete STATUS.md", () => {
    const md = `# Entity Status

**mood**: 75
**energy**: 60
**curiosity**: 80
**comfort**: 45
**level**: 2
**day**: 14
**perception_level**: 3
**last_interaction**: 2026-02-19T10:30:00Z
`;
    const status = parseStatusMd(md);
    expect(status.mood).toBe(75);
    expect(status.energy).toBe(60);
    expect(status.curiosity).toBe(80);
    expect(status.comfort).toBe(45);
    expect(status.languageLevel).toBe(2);
    expect(status.growthDay).toBe(14);
    expect(status.perceptionLevel).toBe(3);
  });

  it("returns 50 (neutral) for missing keys", () => {
    const md = `# Entity Status
**mood**: 30
`;
    const status = parseStatusMd(md);
    expect(status.mood).toBe(30);
    expect(status.energy).toBe(50);      // default
    expect(status.curiosity).toBe(50);   // default
    expect(status.comfort).toBe(50);     // default
  });

  it("returns all defaults for empty content", () => {
    const status = parseStatusMd("");
    expect(status.mood).toBe(50);
    expect(status.energy).toBe(50);
    expect(status.curiosity).toBe(50);
    expect(status.comfort).toBe(50);
    expect(status.languageLevel).toBe(50);
    expect(status.growthDay).toBe(50);
  });

  it("handles 0 values correctly (not as default)", () => {
    const md = `**mood**: 0
**energy**: 0
**day**: 0
**perception_level**: 0
`;
    const status = parseStatusMd(md);
    expect(status.mood).toBe(0);
    expect(status.energy).toBe(0);
    expect(status.growthDay).toBe(0);
    expect(status.perceptionLevel).toBe(0);
  });

  it("handles 100 values correctly", () => {
    const md = `**mood**: 100
**energy**: 100
`;
    const status = parseStatusMd(md);
    expect(status.mood).toBe(100);
    expect(status.energy).toBe(100);
  });

  it("ignores malformed lines", () => {
    const md = `mood: 30
**mood: 99
**mood** 88
**mood**: abc
**energy**: 60
`;
    const status = parseStatusMd(md);
    expect(status.mood).toBe(50);       // no match — default
    expect(status.energy).toBe(60);     // valid
  });

  it("parses values with surrounding text", () => {
    const md = `## Current State

The entity's **mood**: 85 has been improving steadily.
Energy level: **energy**: 40 is low today.
**curiosity**: 95
`;
    const status = parseStatusMd(md);
    expect(status.mood).toBe(85);
    expect(status.energy).toBe(40);
    expect(status.curiosity).toBe(95);
  });
});

// ============================================================
// parseSeedMd
// ============================================================

describe("parseSeedMd", () => {
  it("parses a complete SEED.md", () => {
    const md = `# Entity Seed

**Perception**: chromatic
**Form**: crystal
**Temperament**: curious-cautious
**Cognition**: associative
**Expression**: symbols
**Born**: 2026-02-01T00:00:00Z
**Hardware**: mac-mini-m4-16gb
`;
    const seed = parseSeedMd(md);
    expect(seed.perception).toBe("chromatic");
    expect(seed.form).toBe("crystal");
    expect(seed.temperament).toBe("curious-cautious");
    expect(seed.cognition).toBe("associative");
  });

  it("returns empty string for missing keys", () => {
    const md = `**Perception**: vibration`;
    const seed = parseSeedMd(md);
    expect(seed.perception).toBe("vibration");
    expect(seed.form).toBe("");
    expect(seed.temperament).toBe("");
    expect(seed.cognition).toBe("");
  });

  it("handles empty content", () => {
    const seed = parseSeedMd("");
    expect(seed.perception).toBe("");
    expect(seed.form).toBe("");
  });

  it("trims whitespace", () => {
    const md = `**Perception**:   thermal
**Form**:  mist  `;
    const seed = parseSeedMd(md);
    expect(seed.perception).toBe("thermal");
    expect(seed.form).toBe("mist");
  });

  it("handles all 6 perception types", () => {
    for (const species of ["chromatic", "vibration", "geometric", "thermal", "temporal", "chemical"]) {
      const md = `**Perception**: ${species}`;
      expect(parseSeedMd(md).perception).toBe(species);
    }
  });

  it("handles all form types", () => {
    for (const form of ["light-particles", "fluid", "crystal", "sound-echo", "mist", "geometric-cluster"]) {
      const md = `**Form**: ${form}`;
      expect(parseSeedMd(md).form).toBe(form);
    }
  });
});

// ============================================================
// parsePerceptionMd
// ============================================================

describe("parsePerceptionMd", () => {
  it("extracts bullet-point perceptions", () => {
    const md = `## What You Perceive Right Now

Your world is light and color.

- dominant: hsl(30, 70%, 55%)
- warm-toned, mid-heavy
- core glow: warm-orange

You cannot perceive anything beyond what is listed above.
`;
    const { perceptions, hasPerception } = parsePerceptionMd(md);
    expect(hasPerception).toBe(true);
    expect(perceptions).toHaveLength(3);
    expect(perceptions[0]).toBe("dominant: hsl(30, 70%, 55%)");
    expect(perceptions[1]).toBe("warm-toned, mid-heavy");
    expect(perceptions[2]).toBe("core glow: warm-orange");
  });

  it("returns empty for no perceptions", () => {
    const md = `## What You Perceive Right Now

Darkness. Only your own faint glow.
`;
    const { perceptions, hasPerception } = parsePerceptionMd(md);
    expect(hasPerception).toBe(false);
    expect(perceptions).toHaveLength(0);
  });

  it("handles empty content", () => {
    const { perceptions, hasPerception } = parsePerceptionMd("");
    expect(hasPerception).toBe(false);
    expect(perceptions).toHaveLength(0);
  });

  it("only extracts lines starting with '- '", () => {
    const md = `Some text
- valid perception 1
  - nested (should NOT match)
-- double dash (should NOT match)
-no space (should NOT match)
- valid perception 2
`;
    const { perceptions } = parsePerceptionMd(md);
    expect(perceptions).toHaveLength(2);
    expect(perceptions[0]).toBe("valid perception 1");
    expect(perceptions[1]).toBe("valid perception 2");
  });

  it("handles multiple sensor inputs", () => {
    const md = `## What You Perceive

- tremor
- rhythm detected
- activity pulse
- contact: impact
`;
    const { perceptions, hasPerception } = parsePerceptionMd(md);
    expect(hasPerception).toBe(true);
    expect(perceptions).toHaveLength(4);
  });
});

// ============================================================
// parseDynamicsMd
// ============================================================

describe("parseDynamicsMd", () => {
  it("parses a complete DYNAMICS.md", () => {
    const md = `# Intelligence Dynamics

**phase**: beta
**score**: 35
**signals**: curious about user habits, asked a question
`;
    const d = parseDynamicsMd(md);
    expect(d.phase).toBe("beta");
    expect(d.score).toBe(35);
    expect(d.signals).toEqual(["curious about user habits", "asked a question"]);
  });

  it("returns defaults for empty content", () => {
    const d = parseDynamicsMd("");
    expect(d.phase).toBe("alpha");
    expect(d.score).toBe(0);
    expect(d.signals).toEqual([]);
  });

  it("handles phase only", () => {
    const md = `**phase**: gamma`;
    const d = parseDynamicsMd(md);
    expect(d.phase).toBe("gamma");
    expect(d.score).toBe(0);
    expect(d.signals).toEqual([]);
  });

  it("handles all five phases", () => {
    for (const phase of ["alpha", "beta", "gamma", "delta", "epsilon"]) {
      const md = `**phase**: ${phase}`;
      expect(parseDynamicsMd(md).phase).toBe(phase);
    }
  });

  it("handles score of 0", () => {
    const md = `**phase**: alpha\n**score**: 0`;
    const d = parseDynamicsMd(md);
    expect(d.score).toBe(0);
  });

  it("handles score of 100", () => {
    const md = `**phase**: epsilon\n**score**: 100`;
    const d = parseDynamicsMd(md);
    expect(d.score).toBe(100);
  });

  it("handles empty signals string", () => {
    const md = `**phase**: alpha\n**score**: 10\n**signals**: `;
    const d = parseDynamicsMd(md);
    expect(d.signals).toEqual([]);
  });

  it("handles single signal", () => {
    const md = `**signals**: first contact`;
    const d = parseDynamicsMd(md);
    expect(d.signals).toEqual(["first contact"]);
  });

  it("trims whitespace in signals", () => {
    const md = `**signals**:  signal one ,  signal two  , signal three `;
    const d = parseDynamicsMd(md);
    expect(d.signals).toEqual(["signal one", "signal two", "signal three"]);
  });
});

// ============================================================
// computeCoexistenceMetrics
// ============================================================

describe("computeCoexistenceMetrics", () => {
  // Fixed "now" for deterministic testing
  const NOW = new Date("2026-02-19T12:00:00Z").getTime();

  it("computes days together correctly", () => {
    const result = computeCoexistenceMetrics({
      bornDate: "2026-02-01T00:00:00Z",
      lastInteraction: "never",
      totalInteractions: 0,
      now: NOW,
    });
    expect(result.daysTogether).toBe(18);
    expect(result.silenceHours).toBeNull();
  });

  it("computes silence hours from last interaction", () => {
    const result = computeCoexistenceMetrics({
      bornDate: "2026-02-01T00:00:00Z",
      lastInteraction: "2026-02-19T06:00:00Z", // 6 hours ago
      totalInteractions: 50,
      now: NOW,
    });
    expect(result.silenceHours).toBe(6);
  });

  it("returns null silence for 'never' interaction", () => {
    const result = computeCoexistenceMetrics({
      bornDate: "2026-02-01T00:00:00Z",
      lastInteraction: "never",
      totalInteractions: 0,
      now: NOW,
    });
    expect(result.silenceHours).toBeNull();
  });

  it("returns 0 days together if born today", () => {
    const result = computeCoexistenceMetrics({
      bornDate: "2026-02-19T10:00:00Z",
      lastInteraction: "never",
      totalInteractions: 0,
      now: NOW,
    });
    expect(result.daysTogether).toBe(0);
  });

  it("returns 0 days together if born in future (guard)", () => {
    const result = computeCoexistenceMetrics({
      bornDate: "2026-03-01T00:00:00Z",
      lastInteraction: "never",
      totalInteractions: 0,
      now: NOW,
    });
    expect(result.daysTogether).toBe(0);
  });

  it("returns 0 days together if born date is empty", () => {
    const result = computeCoexistenceMetrics({
      bornDate: "",
      lastInteraction: "never",
      totalInteractions: 0,
      now: NOW,
    });
    expect(result.daysTogether).toBe(0);
  });

  it("computes fractional silence hours", () => {
    // 30 minutes ago
    const result = computeCoexistenceMetrics({
      bornDate: "2026-02-01T00:00:00Z",
      lastInteraction: "2026-02-19T11:30:00Z",
      totalInteractions: 10,
      now: NOW,
    });
    expect(result.silenceHours).toBe(0.5);
  });

  it("handles very long silence (days)", () => {
    const result = computeCoexistenceMetrics({
      bornDate: "2026-01-01T00:00:00Z",
      lastInteraction: "2026-02-01T00:00:00Z", // ~18 days ago
      totalInteractions: 100,
      now: NOW,
    });
    expect(result.silenceHours).toBeGreaterThan(400);
    expect(result.daysTogether).toBe(49);
  });
});

// ============================================================
// parseMilestonesMd
// ============================================================

describe("parseMilestonesMd", () => {
  it("parses a complete milestones.md", () => {
    const md = `# Growth Milestones

Current Stage: **infant**

- **Day 0**: First Breath — Entity was born
- **Day 3**: First Contact — Someone spoke to the entity
- **Day 7**: First Pattern — Entity established a symbol-meaning mapping
`;
    const result = parseMilestonesMd(md);
    expect(result.stage).toBe("infant");
    expect(result.milestones).toHaveLength(3);
    expect(result.milestones[0]).toEqual({
      id: "first_breath",
      label: "First Breath — Entity was born",
      achievedDay: 0,
      achievedAt: "",
    });
    expect(result.milestones[1]).toEqual({
      id: "first_contact",
      label: "First Contact — Someone spoke to the entity",
      achievedDay: 3,
      achievedAt: "",
    });
    expect(result.milestones[2]).toEqual({
      id: "first_pattern",
      label: "First Pattern — Entity established a symbol-meaning mapping",
      achievedDay: 7,
      achievedAt: "",
    });
  });

  it("returns defaults for empty content", () => {
    const result = parseMilestonesMd("");
    expect(result.stage).toBe("newborn");
    expect(result.milestones).toEqual([]);
  });

  it("defaults stage to newborn when missing", () => {
    const md = `# Growth Milestones

- **Day 0**: First Breath — Entity was born
`;
    const result = parseMilestonesMd(md);
    expect(result.stage).toBe("newborn");
    expect(result.milestones).toHaveLength(1);
  });

  it("parses milestone at day 0", () => {
    const md = `Current Stage: **newborn**

- **Day 0**: First Breath — Entity was born
`;
    const result = parseMilestonesMd(md);
    expect(result.milestones[0].achievedDay).toBe(0);
  });

  it("parses milestones with large day numbers", () => {
    const md = `Current Stage: **mature**

- **Day 365**: Full Autonomy — Entity achieved self-governance
`;
    const result = parseMilestonesMd(md);
    expect(result.milestones[0].achievedDay).toBe(365);
    expect(result.milestones[0].id).toBe("full_autonomy");
  });

  it("generates id from label before dash separator", () => {
    const md = `Current Stage: **infant**

- **Day 5**: Hello World — A greeting milestone
`;
    const result = parseMilestonesMd(md);
    expect(result.milestones[0].id).toBe("hello_world");
  });

  it("handles label without dash separator", () => {
    const md = `Current Stage: **infant**

- **Day 10**: Simple milestone without description
`;
    const result = parseMilestonesMd(md);
    expect(result.milestones[0].id).toBe("simple_milestone_without_description");
    expect(result.milestones[0].label).toBe("Simple milestone without description");
  });

  it("handles various stage names", () => {
    for (const stage of ["newborn", "infant", "child", "adolescent", "mature"]) {
      const md = `Current Stage: **${stage}**`;
      expect(parseMilestonesMd(md).stage).toBe(stage);
    }
  });

  it("ignores non-milestone bullet lines", () => {
    const md = `Current Stage: **infant**

Some intro text.

- **Day 0**: First Breath — Entity was born
- This is just a regular bullet point
- **Day 3**: First Contact — Interaction happened
`;
    const result = parseMilestonesMd(md);
    expect(result.milestones).toHaveLength(2);
  });
});

// ============================================================
// parseLanguageMd
// ============================================================

describe("parseLanguageMd", () => {
  it("parses a complete LANGUAGE.md", () => {
    const md = `# Language System

## Current Level: 2 (Bridge to Language)

Available symbols: ○ ● △ ◎ ☆ ▽

## Acquired Patterns

- ◎ = greeting (Day 3, used 10x)
- △ = curiosity (Day 5, used 7x)
- ● = affirmation (Day 8, used 3x)

## Stats

- Total interactions: 42
`;
    const result = parseLanguageMd(md);
    expect(result.level).toBe(2);
    expect(result.levelName).toBe("Bridge to Language");
    expect(result.totalInteractions).toBe(42);
    expect(result.nativeSymbols).toEqual(["○", "●", "△", "◎", "☆", "▽"]);
    expect(result.patterns).toHaveLength(3);
    expect(result.patterns[0]).toEqual({
      symbol: "◎",
      meaning: "greeting",
      confidence: 1, // 10/10 = 1
    });
    expect(result.patterns[1]).toEqual({
      symbol: "△",
      meaning: "curiosity",
      confidence: 0.7, // 7/10
    });
    expect(result.patterns[2]).toEqual({
      symbol: "●",
      meaning: "affirmation",
      confidence: 0.3, // 3/10
    });
  });

  it("returns defaults for empty content", () => {
    const result = parseLanguageMd("");
    expect(result.level).toBe(0);
    expect(result.levelName).toBe("Symbols Only");
    expect(result.totalInteractions).toBe(0);
    expect(result.nativeSymbols).toEqual([]);
    expect(result.patterns).toEqual([]);
  });

  it("handles level 0 (Symbols Only)", () => {
    const md = `## Current Level: 0 (Symbols Only)

Available symbols: ○ ●

## Stats

- Total interactions: 5
`;
    const result = parseLanguageMd(md);
    expect(result.level).toBe(0);
    expect(result.levelName).toBe("Symbols Only");
    expect(result.nativeSymbols).toEqual(["○", "●"]);
    expect(result.totalInteractions).toBe(5);
    expect(result.patterns).toEqual([]);
  });

  it("handles level 4 (Advanced Operation)", () => {
    const md = `## Current Level: 4 (Advanced Operation)`;
    const result = parseLanguageMd(md);
    expect(result.level).toBe(4);
    expect(result.levelName).toBe("Advanced Operation");
  });

  it("handles unknown level number", () => {
    const md = `## Current Level: 99 (Unknown)`;
    const result = parseLanguageMd(md);
    expect(result.level).toBe(99);
    expect(result.levelName).toBe("Unknown");
  });

  it("caps confidence at 1.0 for high usage counts", () => {
    const md = `## Current Level: 1

## Acquired Patterns

- ◎ = greeting (Day 1, used 50x)
`;
    const result = parseLanguageMd(md);
    expect(result.patterns[0].confidence).toBe(1);
  });

  it("computes low confidence for single usage", () => {
    const md = `## Current Level: 0

## Acquired Patterns

- ○ = hello (Day 10, used 1x)
`;
    const result = parseLanguageMd(md);
    expect(result.patterns[0].confidence).toBe(0.1); // 1/10
  });

  it("handles zero interactions", () => {
    const md = `## Current Level: 0

## Stats

- Total interactions: 0
`;
    const result = parseLanguageMd(md);
    expect(result.totalInteractions).toBe(0);
  });

  it("handles missing symbols section", () => {
    const md = `## Current Level: 1

## Stats

- Total interactions: 10
`;
    const result = parseLanguageMd(md);
    expect(result.nativeSymbols).toEqual([]);
  });

  it("handles missing stats section", () => {
    const md = `## Current Level: 1

Available symbols: ○ ●
`;
    const result = parseLanguageMd(md);
    expect(result.totalInteractions).toBe(0);
  });
});

// ============================================================
// parseMemoryMd
// ============================================================

describe("parseMemoryMd", () => {
  it("parses hot memories", () => {
    const md = `## Hot Memory

- [2026-02-19T10:00:00Z] User greeted the entity (mood:75)
- [2026-02-19T11:30:00Z] Discussed colors together (mood:80)
`;
    const result = parseMemoryMd(md);
    expect(result.hot).toHaveLength(2);
    expect(result.hot[0]).toEqual({
      timestamp: "2026-02-19T10:00:00Z",
      summary: "User greeted the entity",
      mood: 75,
    });
    expect(result.hot[1]).toEqual({
      timestamp: "2026-02-19T11:30:00Z",
      summary: "Discussed colors together",
      mood: 80,
    });
  });

  it("parses warm memories", () => {
    const md = `## Warm Memory

### 2026-W07 (12 interactions, avg mood: 68)

A week of exploration and growing comfort with the user.
`;
    const result = parseMemoryMd(md);
    expect(result.warm).toHaveLength(1);
    expect(result.warm[0]).toEqual({
      week: "2026-W07",
      entries: 12,
      averageMood: 68,
      summary: "A week of exploration and growing comfort with the user.",
    });
  });

  it("parses notes section", () => {
    const md = `## Notes

- User prefers morning conversations
- Entity responds well to color descriptions
`;
    const result = parseMemoryMd(md);
    expect(result.notes).toHaveLength(2);
    expect(result.notes[0]).toBe("User prefers morning conversations");
    expect(result.notes[1]).toBe("Entity responds well to color descriptions");
  });

  it("returns empty arrays for empty content", () => {
    const result = parseMemoryMd("");
    expect(result.hot).toEqual([]);
    expect(result.warm).toEqual([]);
    expect(result.cold).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it("cold is always empty (stored in separate files)", () => {
    const md = `## Hot Memory

- [2026-02-19T10:00:00Z] Some memory (mood:50)

## Warm Memory

### 2026-W07 (5 interactions, avg mood: 60)

Summary here.

## Notes

- A note
`;
    const result = parseMemoryMd(md);
    expect(result.cold).toEqual([]);
  });

  it("handles hot memory with mood of 0", () => {
    const md = `- [2026-02-19T10:00:00Z] Entity was very upset (mood:0)`;
    const result = parseMemoryMd(md);
    expect(result.hot).toHaveLength(1);
    expect(result.hot[0].mood).toBe(0);
  });

  it("handles hot memory with mood of 100", () => {
    const md = `- [2026-02-19T10:00:00Z] Peak happiness moment (mood:100)`;
    const result = parseMemoryMd(md);
    expect(result.hot).toHaveLength(1);
    expect(result.hot[0].mood).toBe(100);
  });

  it("handles notes section that excludes hot memory patterns", () => {
    const md = `## Notes

- [2026-02-19T10:00:00Z] This looks like a hot memory but is in notes
- A regular note
`;
    const result = parseMemoryMd(md);
    // Lines starting with "[" in the Notes section are skipped
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toBe("A regular note");
  });

  it("handles multiple hot memories in sequence", () => {
    const md = `- [2026-02-19T08:00:00Z] Morning greeting (mood:60)
- [2026-02-19T10:00:00Z] Mid-morning chat (mood:65)
- [2026-02-19T12:00:00Z] Lunch time check (mood:70)
- [2026-02-19T14:00:00Z] Afternoon interaction (mood:55)
- [2026-02-19T16:00:00Z] Evening wind down (mood:50)
`;
    const result = parseMemoryMd(md);
    expect(result.hot).toHaveLength(5);
    expect(result.hot[0].timestamp).toBe("2026-02-19T08:00:00Z");
    expect(result.hot[4].timestamp).toBe("2026-02-19T16:00:00Z");
  });

  it("handles content with no matching sections", () => {
    const md = `# Memory

Just some text without any structured memory entries.
No bullet points matching the expected patterns here.
`;
    const result = parseMemoryMd(md);
    expect(result.hot).toEqual([]);
    expect(result.warm).toEqual([]);
    expect(result.notes).toEqual([]);
  });
});

// ============================================================
// parseFormMd
// ============================================================

describe("parseFormMd", () => {
  it("parses a complete FORM.md", () => {
    const md = `## Form

- **base**: crystal
- **density**: 25
- **complexity**: 12
- **stability**: 30
- **self-aware**: yes

> A lattice of translucent facets, slowly rotating.
`;
    const result = parseFormMd(md);
    expect(result.baseForm).toBe("crystal");
    expect(result.density).toBe(25);
    expect(result.complexity).toBe(12);
    expect(result.stability).toBe(30);
    expect(result.awareness).toBe(true);
  });

  it("returns defaults for empty content", () => {
    const result = parseFormMd("");
    expect(result.baseForm).toBe("light-particles");
    expect(result.density).toBe(5);
    expect(result.complexity).toBe(3);
    expect(result.stability).toBe(15);
    expect(result.awareness).toBe(false);
  });

  it("handles awareness set to no", () => {
    const md = `- **self-aware**: no`;
    const result = parseFormMd(md);
    expect(result.awareness).toBe(false);
  });

  it("handles awareness set to yes", () => {
    const md = `- **self-aware**: yes`;
    const result = parseFormMd(md);
    expect(result.awareness).toBe(true);
  });

  it("defaults awareness to false for missing field", () => {
    const md = `- **base**: fluid
- **density**: 10
`;
    const result = parseFormMd(md);
    expect(result.awareness).toBe(false);
  });

  it("handles partial data (some fields missing)", () => {
    const md = `- **base**: mist
- **complexity**: 20
`;
    const result = parseFormMd(md);
    expect(result.baseForm).toBe("mist");
    expect(result.density).toBe(5);       // default
    expect(result.complexity).toBe(20);
    expect(result.stability).toBe(15);    // default
  });

  it("handles all form base types", () => {
    for (const form of ["light-particles", "fluid", "crystal", "sound-echo", "mist", "geometric-cluster"]) {
      const md = `- **base**: ${form}`;
      expect(parseFormMd(md).baseForm).toBe(form);
    }
  });

  it("handles zero numeric values (falls back to defaults)", () => {
    // parseInt("0") is 0, and 0 || 5 = 5 due to falsy zero
    const md = `- **density**: 0
- **complexity**: 0
- **stability**: 0
`;
    const result = parseFormMd(md);
    // Note: the parser uses || which treats 0 as falsy, so defaults kick in
    expect(result.density).toBe(5);
    expect(result.complexity).toBe(3);
    expect(result.stability).toBe(15);
  });

  it("handles high numeric values", () => {
    const md = `- **density**: 100
- **complexity**: 100
- **stability**: 100
`;
    const result = parseFormMd(md);
    expect(result.density).toBe(100);
    expect(result.complexity).toBe(100);
    expect(result.stability).toBe(100);
  });

  it("defaults awareness to false for unexpected value", () => {
    const md = `- **self-aware**: maybe`;
    const result = parseFormMd(md);
    expect(result.awareness).toBe(false);
  });
});

// ============================================================
// parseReversalsMd
// ============================================================

describe("parseReversalsMd", () => {
  it("parses a complete REVERSALS.md", () => {
    const md = `## Reversal Detection

- **total reversals**: 5
- **reversal rate**: 2.5 per 100 interactions
- **dominant type**: teaching_moment
- **last detected**: 2026-02-18T14:00:00Z

### Signals

- 2026-02-15 **teaching_moment** (strength: 8) [recognized]
  Entity explained a concept to the user
- 2026-02-18 **question_reversal** (strength: 6)
  Entity asked the user a question it already knew the answer to
`;
    const result = parseReversalsMd(md);
    expect(result.totalReversals).toBe(5);
    expect(result.reversalRate).toBe(2.5);
    expect(result.dominantType).toBe("teaching_moment");
    expect(result.lastDetected).toBe("2026-02-18T14:00:00Z");
    expect(result.signals).toHaveLength(2);
    expect(result.signals[0]).toEqual({
      type: "teaching_moment",
      timestamp: "2026-02-15",
      description: "Entity explained a concept to the user",
      strength: 8,
      recognized: true,
    });
    expect(result.signals[1]).toEqual({
      type: "question_reversal",
      timestamp: "2026-02-18",
      description: "Entity asked the user a question it already knew the answer to",
      strength: 6,
      recognized: false,
    });
  });

  it("returns defaults for empty content", () => {
    const result = parseReversalsMd("");
    expect(result.totalReversals).toBe(0);
    expect(result.reversalRate).toBe(0);
    expect(result.dominantType).toBeNull();
    expect(result.lastDetected).toBeNull();
    expect(result.signals).toEqual([]);
  });

  it("handles 'none' dominant type as null", () => {
    const md = `- **dominant type**: none`;
    const result = parseReversalsMd(md);
    expect(result.dominantType).toBeNull();
  });

  it("handles 'never' last detected as null", () => {
    const md = `- **last detected**: never`;
    const result = parseReversalsMd(md);
    expect(result.lastDetected).toBeNull();
  });

  it("parses signal with recognized flag", () => {
    const md = `### Signals

- 2026-02-10 **insight** (strength: 9) [recognized]
  A deep insight was shared
`;
    const result = parseReversalsMd(md);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].recognized).toBe(true);
    expect(result.signals[0].strength).toBe(9);
    expect(result.signals[0].type).toBe("insight");
  });

  it("parses signal without recognized flag", () => {
    const md = `### Signals

- 2026-02-10 **observation** (strength: 3)
  A subtle observation
`;
    const result = parseReversalsMd(md);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].recognized).toBe(false);
  });

  it("handles zero total reversals", () => {
    const md = `- **total reversals**: 0
- **reversal rate**: 0 per 100 interactions
- **dominant type**: none
- **last detected**: never
`;
    const result = parseReversalsMd(md);
    expect(result.totalReversals).toBe(0);
    expect(result.reversalRate).toBe(0);
    expect(result.dominantType).toBeNull();
    expect(result.lastDetected).toBeNull();
  });

  it("parses fractional reversal rate", () => {
    const md = `- **reversal rate**: 0.5 per 100 interactions`;
    const result = parseReversalsMd(md);
    expect(result.reversalRate).toBe(0.5);
  });

  it("handles signal with no description on next line", () => {
    const md = `### Signals

- 2026-02-10 **test** (strength: 5)
`;
    const result = parseReversalsMd(md);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].description).toBe("");
  });

  it("parses multiple signals in order", () => {
    const md = `### Signals

- 2026-02-01 **type_a** (strength: 3)
  First signal
- 2026-02-05 **type_b** (strength: 5) [recognized]
  Second signal
- 2026-02-10 **type_c** (strength: 7)
  Third signal
`;
    const result = parseReversalsMd(md);
    expect(result.signals).toHaveLength(3);
    expect(result.signals[0].timestamp).toBe("2026-02-01");
    expect(result.signals[1].timestamp).toBe("2026-02-05");
    expect(result.signals[2].timestamp).toBe("2026-02-10");
    expect(result.signals[1].recognized).toBe(true);
    expect(result.signals[0].recognized).toBe(false);
    expect(result.signals[2].recognized).toBe(false);
  });
});

// ============================================================
// parseCoexistMd
// ============================================================

describe("parseCoexistMd", () => {
  it("parses an active COEXIST.md", () => {
    const md = `# COEXISTENCE

- **status**: active
- **quality**: 72
- **days in epsilon**: 15

## Indicators

- Silence Comfort: ████░░░░░░ 40
- Shared Vocabulary: ██████░░░░ 60
- Rhythm Synchrony: ████████░░ 80
- Shared Memory: █████░░░░░ 50
- Autonomy Respect: ███████░░░ 70

## Moments

- 2026-02-10 [shared_silence]: Comfortable silence lasted 30 minutes
- 2026-02-15 [vocabulary]: Entity used a term the user coined
`;
    const result = parseCoexistMd(md);
    expect(result.active).toBe(true);
    expect(result.quality).toBe(72);
    expect(result.daysInEpsilon).toBe(15);
    expect(result.indicators.silenceComfort).toBe(40);
    expect(result.indicators.sharedVocabulary).toBe(60);
    expect(result.indicators.rhythmSync).toBe(80);
    expect(result.indicators.sharedMemory).toBe(50);
    expect(result.indicators.autonomyRespect).toBe(70);
    expect(result.moments).toHaveLength(2);
    expect(result.moments[0]).toEqual({
      timestamp: "2026-02-10",
      type: "shared_silence",
      description: "Comfortable silence lasted 30 minutes",
    });
    expect(result.moments[1]).toEqual({
      timestamp: "2026-02-15",
      type: "vocabulary",
      description: "Entity used a term the user coined",
    });
  });

  it("parses an inactive COEXIST.md", () => {
    const md = `# COEXISTENCE

_Not yet in Phase epsilon. Coexistence has not begun._
`;
    const result = parseCoexistMd(md);
    expect(result.active).toBe(false);
    expect(result.quality).toBe(0);
    expect(result.daysInEpsilon).toBe(0);
    expect(result.indicators.silenceComfort).toBe(0);
    expect(result.indicators.sharedVocabulary).toBe(0);
    expect(result.indicators.rhythmSync).toBe(0);
    expect(result.indicators.sharedMemory).toBe(0);
    expect(result.indicators.autonomyRespect).toBe(0);
    expect(result.moments).toEqual([]);
  });

  it("returns inactive state for empty content", () => {
    const result = parseCoexistMd("");
    expect(result.active).toBe(false);
    expect(result.quality).toBe(0);
    expect(result.daysInEpsilon).toBe(0);
    expect(result.indicators).toEqual({
      silenceComfort: 0,
      sharedVocabulary: 0,
      rhythmSync: 0,
      sharedMemory: 0,
      autonomyRespect: 0,
    });
    expect(result.moments).toEqual([]);
  });

  it("handles active state with zero quality", () => {
    const md = `- **status**: active
- **quality**: 0
- **days in epsilon**: 0
`;
    const result = parseCoexistMd(md);
    expect(result.active).toBe(true);
    expect(result.quality).toBe(0);
    expect(result.daysInEpsilon).toBe(0);
  });

  it("handles active state with no moments", () => {
    const md = `- **status**: active
- **quality**: 50
- **days in epsilon**: 3

## Indicators

- Silence Comfort: ████░░░░░░ 40
- Shared Vocabulary: ██░░░░░░░░ 20
- Rhythm Synchrony: ███░░░░░░░ 30
- Shared Memory: █░░░░░░░░░ 10
- Autonomy Respect: ██░░░░░░░░ 20

## Moments
`;
    const result = parseCoexistMd(md);
    expect(result.active).toBe(true);
    expect(result.moments).toEqual([]);
  });

  it("handles indicator values of 0", () => {
    const md = `- **status**: active
- **quality**: 10
- **days in epsilon**: 1

## Indicators

- Silence Comfort: ░░░░░░░░░░ 0
- Shared Vocabulary: ░░░░░░░░░░ 0
- Rhythm Synchrony: ░░░░░░░░░░ 0
- Shared Memory: ░░░░░░░░░░ 0
- Autonomy Respect: ░░░░░░░░░░ 0
`;
    const result = parseCoexistMd(md);
    expect(result.indicators.silenceComfort).toBe(0);
    expect(result.indicators.sharedVocabulary).toBe(0);
    expect(result.indicators.rhythmSync).toBe(0);
    expect(result.indicators.sharedMemory).toBe(0);
    expect(result.indicators.autonomyRespect).toBe(0);
  });

  it("handles indicator values of 100", () => {
    const md = `- **status**: active
- **quality**: 100
- **days in epsilon**: 365

## Indicators

- Silence Comfort: ██████████ 100
- Shared Vocabulary: ██████████ 100
- Rhythm Synchrony: ██████████ 100
- Shared Memory: ██████████ 100
- Autonomy Respect: ██████████ 100
`;
    const result = parseCoexistMd(md);
    expect(result.indicators.silenceComfort).toBe(100);
    expect(result.indicators.sharedVocabulary).toBe(100);
    expect(result.indicators.rhythmSync).toBe(100);
    expect(result.indicators.sharedMemory).toBe(100);
    expect(result.indicators.autonomyRespect).toBe(100);
  });

  it("parses multiple moments", () => {
    const md = `- **status**: active
- **quality**: 80
- **days in epsilon**: 30

## Moments

- 2026-01-20 [silence]: First comfortable silence
- 2026-01-25 [rhythm]: Synchronized daily patterns
- 2026-02-01 [vocabulary]: Shared a new word
- 2026-02-10 [memory]: Referenced a shared memory
`;
    const result = parseCoexistMd(md);
    expect(result.moments).toHaveLength(4);
    expect(result.moments[0].type).toBe("silence");
    expect(result.moments[1].type).toBe("rhythm");
    expect(result.moments[2].type).toBe("vocabulary");
    expect(result.moments[3].type).toBe("memory");
  });

  it("handles missing indicators section gracefully", () => {
    const md = `- **status**: active
- **quality**: 50
- **days in epsilon**: 5
`;
    const result = parseCoexistMd(md);
    expect(result.active).toBe(true);
    expect(result.quality).toBe(50);
    expect(result.indicators.silenceComfort).toBe(0);
    expect(result.indicators.sharedVocabulary).toBe(0);
    expect(result.indicators.rhythmSync).toBe(0);
    expect(result.indicators.sharedMemory).toBe(0);
    expect(result.indicators.autonomyRespect).toBe(0);
  });
});

// ============================================================
// Integration: STATUS.md → dashboard field mapping
// ============================================================

describe("STATUS.md → dashboard field mapping", () => {
  // Simulates what the dashboard actually receives and uses
  const REALISTIC_STATUS = `# Entity Status

**mood**: 72
**energy**: 45
**curiosity**: 88
**comfort**: 60
**level**: 2
**day**: 30
**perception_level**: 2
**last_interaction**: 2026-02-19T10:00:00Z
`;

  it("mood maps to visualization hue (0-100 → color range)", () => {
    const status = parseStatusMd(REALISTIC_STATUS);
    // Dashboard uses: hueBase + (mood/100) * hueRange
    // chromatic palette: hueBase=20, hueRange=30
    const hue = 20 + (status.mood / 100) * 30;
    expect(hue).toBeCloseTo(41.6, 1);
    expect(hue).toBeGreaterThanOrEqual(20);
    expect(hue).toBeLessThanOrEqual(50);
  });

  it("energy maps to breathing speed (0-100 → 0.3-1.0)", () => {
    const status = parseStatusMd(REALISTIC_STATUS);
    const breathSpeed = 0.3 + (status.energy / 100) * 0.7;
    expect(breathSpeed).toBeCloseTo(0.615, 2);
    expect(breathSpeed).toBeGreaterThanOrEqual(0.3);
    expect(breathSpeed).toBeLessThanOrEqual(1.0);
  });

  it("curiosity maps to drift range (0-100 → 5-30px)", () => {
    const status = parseStatusMd(REALISTIC_STATUS);
    const drift = 5 + (status.curiosity / 100) * 25;
    expect(drift).toBeCloseTo(27, 0);
    expect(drift).toBeGreaterThanOrEqual(5);
    expect(drift).toBeLessThanOrEqual(30);
  });

  it("energy maps to sound interval (0-100 → 8s-2s)", () => {
    const status = parseStatusMd(REALISTIC_STATUS);
    const interval = 2000 + (1 - status.energy / 100) * 6000;
    expect(interval).toBeCloseTo(5300, -2);
    expect(interval).toBeGreaterThanOrEqual(2000);
    expect(interval).toBeLessThanOrEqual(8000);
  });

  it("extreme values produce valid visual parameters", () => {
    const lowMd = `**mood**: 0\n**energy**: 0\n**curiosity**: 0\n**comfort**: 0`;
    const highMd = `**mood**: 100\n**energy**: 100\n**curiosity**: 100\n**comfort**: 100`;

    const low = parseStatusMd(lowMd);
    const high = parseStatusMd(highMd);

    // Breathing speed
    expect(0.3 + (low.energy / 100) * 0.7).toBe(0.3);
    expect(0.3 + (high.energy / 100) * 0.7).toBe(1.0);

    // Drift range
    expect(5 + (low.curiosity / 100) * 25).toBe(5);
    expect(5 + (high.curiosity / 100) * 25).toBe(30);
  });
});
