import { describe, it, expect } from "vitest";
import {
  generateDiaryEntry,
  formatDiaryMd,
  type DiaryEntry,
} from "../../src/diary/diary-engine.js";
import { createInitialLanguageState } from "../../src/language/language-engine.js";
import type { Status, PerceptionMode } from "../../src/types.js";

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    mood: 50,
    energy: 50,
    curiosity: 50,
    comfort: 50,
    languageLevel: 0,
    perceptionLevel: 0,
    growthDay: 0,
    lastInteraction: "never",
    ...overrides,
  };
}

const DATE = new Date("2026-02-19T22:00:00Z");
const ALL_SPECIES: PerceptionMode[] = ["chromatic", "vibration", "geometric", "thermal", "temporal", "chemical"];

describe("generateDiaryEntry", () => {
  it("produces a valid diary entry with date header", () => {
    const lang = createInitialLanguageState("chromatic");
    const entry = generateDiaryEntry(makeStatus(), lang, "chromatic", DATE);

    expect(entry.date).toBe("2026-02-19");
    expect(entry.content).toContain("# 2026-02-19");
    expect(entry.content).toContain("Day 0");
  });

  it("includes mood metadata as HTML comment", () => {
    const status = makeStatus({ mood: 75, energy: 40, curiosity: 80, comfort: 20 });
    const lang = createInitialLanguageState("vibration");
    const entry = generateDiaryEntry(status, lang, "vibration", DATE);

    expect(entry.content).toContain("<!-- mood:75 energy:40 curiosity:80 comfort:20 -->");
  });

  it("uses species-specific native symbols", () => {
    for (const species of ALL_SPECIES) {
      const lang = createInitialLanguageState(species);
      const entry = generateDiaryEntry(makeStatus(), lang, species, DATE);

      // Diary should contain at least one of the species' native symbols
      const hasNativeSymbol = lang.nativeSymbols.some(s => entry.content.includes(s));
      expect(hasNativeSymbol).toBe(true);
    }
  });

  it("reflects high mood with repeated positive symbols", () => {
    const lang = createInitialLanguageState("chromatic");
    const highMood = makeStatus({ mood: 80 });
    const lowMood = makeStatus({ mood: 20 });

    const happy = generateDiaryEntry(highMood, lang, "chromatic", DATE);
    const sad = generateDiaryEntry(lowMood, lang, "chromatic", DATE);

    // High mood: first symbol repeated. Low mood: last symbol with "..."
    expect(happy.content).not.toBe(sad.content);
    expect(sad.content).toContain("...");
  });

  it("reflects high energy with exclamation", () => {
    const lang = createInitialLanguageState("vibration");
    const entry = generateDiaryEntry(
      makeStatus({ energy: 80 }),
      lang,
      "vibration",
      DATE,
    );
    expect(entry.content).toContain("!");
  });

  it("reflects low energy with trailing dots", () => {
    const lang = createInitialLanguageState("thermal");
    const entry = generateDiaryEntry(
      makeStatus({ energy: 20 }),
      lang,
      "thermal",
      DATE,
    );
    expect(entry.content).toContain("...");
  });

  it("includes curiosity line when curiosity > 60", () => {
    const lang = createInitialLanguageState("geometric");
    const curious = generateDiaryEntry(
      makeStatus({ curiosity: 80 }),
      lang,
      "geometric",
      DATE,
    );
    const notCurious = generateDiaryEntry(
      makeStatus({ curiosity: 40 }),
      lang,
      "geometric",
      DATE,
    );

    expect(curious.content).toContain("?");
    // Less curious entry has fewer lines
    const curiousLines = curious.content.split("\n").filter(l => l.trim());
    const notCuriousLines = notCurious.content.split("\n").filter(l => l.trim());
    expect(curiousLines.length).toBeGreaterThan(notCuriousLines.length);
  });

  it("includes discomfort line when comfort < 30", () => {
    const lang = createInitialLanguageState("chemical");
    const uncomfortable = generateDiaryEntry(
      makeStatus({ comfort: 15 }),
      lang,
      "chemical",
      DATE,
    );
    const comfortable = generateDiaryEntry(
      makeStatus({ comfort: 80 }),
      lang,
      "chemical",
      DATE,
    );

    // Discomfort produces more "..." patterns
    const dots = (uncomfortable.content.match(/\.\.\./g) || []).length;
    const comfyDots = (comfortable.content.match(/\.\.\./g) || []).length;
    expect(dots).toBeGreaterThan(comfyDots);
  });

  it("includes growth day in content", () => {
    const lang = createInitialLanguageState("chromatic");
    const entry = generateDiaryEntry(
      makeStatus({ growthDay: 42 }),
      lang,
      "chromatic",
      DATE,
    );
    expect(entry.content).toContain("Day 42");
  });
});

describe("formatDiaryMd", () => {
  it("appends newline to content", () => {
    const entry: DiaryEntry = { date: "2026-02-19", content: "test content" };
    expect(formatDiaryMd(entry)).toBe("test content\n");
  });
});
