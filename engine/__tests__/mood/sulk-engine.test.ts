import { describe, it, expect } from "vitest";
import {
  createInitialSulkState,
  evaluateSulk,
  processSulkInteraction,
  getActiveSoulFile,
  type SulkState,
} from "../../src/mood/sulk-engine.js";
import type { Status, Temperament } from "../../src/types.js";

const NOW = new Date("2026-02-18T12:00:00.000Z");

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    mood: 50,
    energy: 50,
    curiosity: 50,
    comfort: 50,
    languageLevel: 0,
    perceptionLevel: 0,
    growthDay: 5,
    lastInteraction: NOW.toISOString(),
    ...overrides,
  };
}

describe("Sulk Engine", () => {
  describe("createInitialSulkState", () => {
    it("starts not sulking", () => {
      const state = createInitialSulkState();
      expect(state.isSulking).toBe(false);
      expect(state.severity).toBe("none");
    });
  });

  describe("evaluateSulk — entry conditions", () => {
    it("does not sulk when comfort and mood are normal", () => {
      const sulk = createInitialSulkState();
      const status = makeStatus({ comfort: 50, mood: 50 });
      const result = evaluateSulk(sulk, status, 60, "curious-cautious", NOW);
      expect(result.isSulking).toBe(false);
    });

    it("enters sulk when comfort AND mood are low", () => {
      const sulk = createInitialSulkState();
      const status = makeStatus({ comfort: 20, mood: 25 });
      const result = evaluateSulk(sulk, status, 60, "curious-cautious", NOW);
      expect(result.isSulking).toBe(true);
      expect(result.sulkingSince).not.toBeNull();
    });

    it("enters sulk on prolonged absence + low comfort", () => {
      const sulk = createInitialSulkState();
      const status = makeStatus({ comfort: 35, mood: 50 });
      const result = evaluateSulk(sulk, status, 800, "curious-cautious", NOW); // >720 min
      expect(result.isSulking).toBe(true);
    });

    it("does not sulk on absence alone if comfort is fine", () => {
      const sulk = createInitialSulkState();
      const status = makeStatus({ comfort: 50, mood: 50 });
      const result = evaluateSulk(sulk, status, 800, "curious-cautious", NOW);
      expect(result.isSulking).toBe(false);
    });

    it("calm-observant temperament is more tolerant", () => {
      const sulk = createInitialSulkState();
      const status = makeStatus({ comfort: 22, mood: 30 });

      const cautious = evaluateSulk(sulk, status, 60, "curious-cautious", NOW);
      const calm = evaluateSulk(sulk, status, 60, "calm-observant", NOW);

      // Both enter sulk, but calm should have lower severity
      expect(cautious.isSulking).toBe(true);
      expect(calm.isSulking).toBe(true);
      // calm-observant gets -1 to score, so should be less severe or equal
      const severityOrder = ["none", "mild", "moderate", "severe"];
      expect(severityOrder.indexOf(calm.severity)).toBeLessThanOrEqual(
        severityOrder.indexOf(cautious.severity),
      );
    });
  });

  describe("evaluateSulk — recovery", () => {
    it("stays sulking if recovery interactions not met", () => {
      const sulk: SulkState = {
        isSulking: true,
        severity: "moderate",
        recoveryInteractions: 1,
        sulkingSince: NOW.toISOString(),
      };
      const status = makeStatus({ comfort: 30 });
      const result = evaluateSulk(sulk, status, 30, "curious-cautious", NOW);
      expect(result.isSulking).toBe(true);
    });

    it("downgrades severity with partial recovery", () => {
      const sulk: SulkState = {
        isSulking: true,
        severity: "severe",
        recoveryInteractions: 5,
        sulkingSince: NOW.toISOString(),
      };
      const status = makeStatus({ comfort: 30 });
      const result = evaluateSulk(sulk, status, 30, "curious-cautious", NOW);
      expect(result.severity).toBe("moderate");
    });
  });

  describe("processSulkInteraction", () => {
    it("increments recovery interactions", () => {
      const sulk: SulkState = {
        isSulking: true,
        severity: "mild",
        recoveryInteractions: 0,
        sulkingSince: NOW.toISOString(),
      };
      const status = makeStatus({ comfort: 30 });
      const result = processSulkInteraction(sulk, status);
      expect(result.recoveryInteractions).toBe(1);
    });

    it("recovers from mild sulk after enough interactions + comfort", () => {
      const sulk: SulkState = {
        isSulking: true,
        severity: "mild",
        recoveryInteractions: 2, // One more needed
        sulkingSince: NOW.toISOString(),
      };
      const status = makeStatus({ comfort: 45 }); // Above recovery threshold
      const result = processSulkInteraction(sulk, status);
      expect(result.isSulking).toBe(false);
      expect(result.severity).toBe("none");
    });

    it("does nothing if not sulking", () => {
      const sulk = createInitialSulkState();
      const status = makeStatus();
      const result = processSulkInteraction(sulk, status);
      expect(result).toEqual(sulk);
    });
  });

  describe("getActiveSoulFile", () => {
    it("returns SOUL.md when not sulking", () => {
      expect(getActiveSoulFile(createInitialSulkState())).toBe("SOUL.md");
    });

    it("returns SOUL_EVIL.md when sulking", () => {
      const sulk: SulkState = {
        isSulking: true,
        severity: "moderate",
        recoveryInteractions: 0,
        sulkingSince: NOW.toISOString(),
      };
      expect(getActiveSoulFile(sulk)).toBe("SOUL_EVIL.md");
    });
  });
});
