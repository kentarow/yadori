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
