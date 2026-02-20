/**
 * Comprehensive Diary Engine Tests
 *
 * Covers: diary structure, species-specific styles, scheduling integration,
 * language level effects, mood effects, sulk mode / low comfort, growth day
 * references, curiosity and combined state, edge cases, date formatting,
 * and formatDiaryMd behavior.
 */
import { describe, it, expect } from "vitest";
import {
  generateDiaryEntry,
  formatDiaryMd,
  type DiaryEntry,
} from "../../src/diary/diary-engine.js";
import {
  createInitialLanguageState,
  PERCEPTION_SYMBOLS,
} from "../../src/language/language-engine.js";
import { computeHeartbeat } from "../../src/rhythm/rhythm-system.js";
import { LanguageLevel, type Status, type PerceptionMode } from "../../src/types.js";

// --- Helpers ---

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    mood: 50,
    energy: 50,
    curiosity: 50,
    comfort: 50,
    languageLevel: LanguageLevel.SymbolsOnly,
    perceptionLevel: 0,
    growthDay: 0,
    lastInteraction: "never",
    ...overrides,
  };
}

function dateAt(hour: number, minute = 0): Date {
  return new Date(2026, 1, 20, hour, minute);
}

const ALL_SPECIES: PerceptionMode[] = [
  "chromatic",
  "vibration",
  "geometric",
  "thermal",
  "temporal",
  "chemical",
];

const EVENING_DATE = new Date("2026-02-20T19:00:00");
const MORNING_DATE = new Date("2026-02-20T08:00:00");

// --- 1. Diary Content Structure ---

describe("diary content structure", () => {
  it("starts with a markdown heading and includes growth day on its own line", () => {
    const lang = createInitialLanguageState("vibration");
    const entry = generateDiaryEntry(makeStatus({ growthDay: 5 }), lang, "vibration", EVENING_DATE);
    const lines = entry.content.split("\n");
    expect(lines[0]).toBe("# 2026-02-20");
    const dayLine = lines.find((l) => l.startsWith("Day "));
    expect(dayLine).toBe("Day 5");
  });

  it("ends with a metadata HTML comment encoding all four status values", () => {
    const status = makeStatus({ mood: 60, energy: 45, curiosity: 70, comfort: 55 });
    const lang = createInitialLanguageState("geometric");
    const entry = generateDiaryEntry(status, lang, "geometric", EVENING_DATE);
    expect(entry.content).toContain("<!-- mood:60 energy:45 curiosity:70 comfort:55 -->");
  });

  it("has at least 5 non-empty lines (header + day + mood + energy + metadata)", () => {
    const lang = createInitialLanguageState("chromatic");
    const entry = generateDiaryEntry(makeStatus(), lang, "chromatic", EVENING_DATE);
    const nonEmpty = entry.content.split("\n").filter((l) => l.trim().length > 0);
    expect(nonEmpty.length).toBeGreaterThanOrEqual(5);
  });

  it("returns a DiaryEntry with date in YYYY-MM-DD format", () => {
    const lang = createInitialLanguageState("thermal");
    const entry = generateDiaryEntry(makeStatus(), lang, "thermal", EVENING_DATE);
    expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(entry.date).toBe("2026-02-20");
  });
});

// --- 2. Species-Specific Diary Styles ---

describe("species-specific diary styles", () => {
  it("each species uses its own native symbols in diary entries", () => {
    for (const species of ALL_SPECIES) {
      const lang = createInitialLanguageState(species);
      const entry = generateDiaryEntry(makeStatus(), lang, species, EVENING_DATE);
      const expectedSymbols = PERCEPTION_SYMBOLS[species];
      const hasOwnSymbol = expectedSymbols.some((s) => entry.content.includes(s));
      expect(hasOwnSymbol, `${species} should use its own symbols`).toBe(true);
    }
  });

  it("different species produce different diary body for identical status", () => {
    const status = makeStatus({ mood: 80, energy: 70 });
    const chromaticLang = createInitialLanguageState("chromatic");
    const geometricLang = createInitialLanguageState("geometric");

    const chromaticEntry = generateDiaryEntry(status, chromaticLang, "chromatic", EVENING_DATE);
    const geometricEntry = generateDiaryEntry(status, geometricLang, "geometric", EVENING_DATE);

    const extractBody = (content: string) =>
      content.split("\n").filter(
        (l) => !l.startsWith("#") && !l.startsWith("Day") && !l.startsWith("<!--") && l.trim(),
      ).join("");

    expect(extractBody(chromaticEntry.content)).not.toBe(extractBody(geometricEntry.content));
  });

  it("vibration species diary contains at least one of ◈ ◇ ◆ △ ▲ ▽", () => {
    const lang = createInitialLanguageState("vibration");
    const entry = generateDiaryEntry(makeStatus(), lang, "vibration", EVENING_DATE);
    const hasVibSym = PERCEPTION_SYMBOLS["vibration"].some((s) => entry.content.includes(s));
    expect(hasVibSym).toBe(true);
  });

  it("chemical species diary contains at least one of ◆ ◈ ● ◉ ■ ★", () => {
    const lang = createInitialLanguageState("chemical");
    const entry = generateDiaryEntry(makeStatus(), lang, "chemical", EVENING_DATE);
    const hasChemSym = PERCEPTION_SYMBOLS["chemical"].some((s) => entry.content.includes(s));
    expect(hasChemSym).toBe(true);
  });
});

// --- 3. Diary Scheduling (integration with rhythm system) ---

describe("diary scheduling", () => {
  it("rhythm system flags shouldDiary=true only during evening (17-21)", () => {
    const status = makeStatus();
    expect(computeHeartbeat(status, dateAt(18)).shouldDiary).toBe(true);
    expect(computeHeartbeat(status, dateAt(19)).shouldDiary).toBe(true);
  });

  it("rhythm system flags shouldDiary=false outside evening hours", () => {
    const status = makeStatus();
    expect(computeHeartbeat(status, dateAt(8)).shouldDiary).toBe(false);   // morning
    expect(computeHeartbeat(status, dateAt(22)).shouldDiary).toBe(false);  // night
    expect(computeHeartbeat(status, dateAt(3)).shouldDiary).toBe(false);   // lateNight
    expect(computeHeartbeat(status, dateAt(12)).shouldDiary).toBe(false);  // midday
  });

  it("diary engine itself does not enforce scheduling (generates at any hour)", () => {
    const lang = createInitialLanguageState("chromatic");
    const morningEntry = generateDiaryEntry(makeStatus(), lang, "chromatic", MORNING_DATE);
    expect(morningEntry.date).toBe("2026-02-20");
    expect(morningEntry.content.length).toBeGreaterThan(0);
  });
});

// --- 4. Language Level Effects on Diary Content ---

describe("language level effects on diary content", () => {
  it("level 0 diary body contains no alphabetic characters (symbols only)", () => {
    const lang = createInitialLanguageState("chromatic");
    const entry = generateDiaryEntry(makeStatus(), lang, "chromatic", EVENING_DATE);

    const bodyLines = entry.content.split("\n").filter(
      (l) => !l.startsWith("#") && !l.startsWith("Day") && !l.startsWith("<!--") && l.trim(),
    );

    for (const line of bodyLines) {
      const stripped = line.replace(/[!?.\s]/g, "");
      for (const ch of stripped) {
        expect(ch.match(/[a-zA-Z]/), `unexpected letter "${ch}" in: "${line}"`).toBeNull();
      }
    }
  });

  it("diary uses the specific nativeSymbols of the language state", () => {
    const lang = createInitialLanguageState("temporal");
    const entry = generateDiaryEntry(makeStatus(), lang, "temporal", EVENING_DATE);
    const hasSymbol = lang.nativeSymbols.some((s) => entry.content.includes(s));
    expect(hasSymbol).toBe(true);
  });

  it("thermal entity diary uses thermal first symbol for high mood, not chromatic first", () => {
    const thermalLang = createInitialLanguageState("thermal");
    const entry = generateDiaryEntry(makeStatus({ mood: 80 }), thermalLang, "thermal", EVENING_DATE);
    const thermalFirst = PERCEPTION_SYMBOLS["thermal"][0];
    expect(entry.content).toContain(thermalFirst);
  });
});

// --- 5. Mood Effects on Diary Tone ---

describe("mood effects on diary tone", () => {
  it("high mood (>70) repeats first symbol three times consecutively", () => {
    const lang = createInitialLanguageState("chromatic");
    const entry = generateDiaryEntry(makeStatus({ mood: 85 }), lang, "chromatic", EVENING_DATE);
    expect(entry.content).toContain(lang.nativeSymbols[0].repeat(3));
  });

  it("low mood (<30) uses last symbol flanking an ellipsis", () => {
    const lang = createInitialLanguageState("chromatic");
    const entry = generateDiaryEntry(makeStatus({ mood: 15 }), lang, "chromatic", EVENING_DATE);
    const last = lang.nativeSymbols[lang.nativeSymbols.length - 1];
    expect(entry.content).toContain(last + "..." + last);
  });

  it("neutral mood (30-70) uses first two symbols separated by space", () => {
    const lang = createInitialLanguageState("geometric");
    const entry = generateDiaryEntry(makeStatus({ mood: 50 }), lang, "geometric", EVENING_DATE);
    expect(entry.content).toContain(lang.nativeSymbols[0] + " " + lang.nativeSymbols[1]);
  });

  it("high mood line never contains ellipsis", () => {
    const lang = createInitialLanguageState("vibration");
    const entry = generateDiaryEntry(makeStatus({ mood: 90 }), lang, "vibration", EVENING_DATE);
    const moodLine = entry.content.split("\n").find(
      (l) => l.includes(lang.nativeSymbols[0].repeat(3)),
    );
    expect(moodLine).toBeDefined();
    expect(moodLine).not.toContain("...");
  });
});

// --- 6. Sulk Mode / Low Comfort Diary Behavior ---

describe("sulk mode / low comfort diary behavior", () => {
  it("comfort < 30 adds a discomfort line with triple last-symbol-ellipsis pattern", () => {
    const lang = createInitialLanguageState("chromatic");
    const entry = generateDiaryEntry(makeStatus({ comfort: 10 }), lang, "chromatic", EVENING_DATE);
    const last = lang.nativeSymbols[lang.nativeSymbols.length - 1];
    expect(entry.content).toContain(last + "..." + last + "..." + last);
  });

  it("comfort >= 30 does not include the discomfort triple-ellipsis pattern", () => {
    const lang = createInitialLanguageState("chromatic");
    const entry = generateDiaryEntry(makeStatus({ comfort: 50 }), lang, "chromatic", EVENING_DATE);
    const last = lang.nativeSymbols[lang.nativeSymbols.length - 1];
    expect(entry.content).not.toContain(last + "..." + last + "..." + last);
  });

  it("low comfort + low mood produces both discomfort pattern and sad mood markers", () => {
    const lang = createInitialLanguageState("vibration");
    const entry = generateDiaryEntry(
      makeStatus({ comfort: 10, mood: 15 }),
      lang,
      "vibration",
      EVENING_DATE,
    );
    const last = lang.nativeSymbols[lang.nativeSymbols.length - 1];
    expect(entry.content).toContain(last + "..." + last + "..." + last);
    // sad mood marker also present
    expect(entry.content).toContain(last + "..." + last);
  });

  it("low comfort diary has more non-empty lines than high comfort diary", () => {
    const lang = createInitialLanguageState("geometric");
    const sulk = generateDiaryEntry(
      makeStatus({ comfort: 10, curiosity: 80 }),
      lang, "geometric", EVENING_DATE,
    );
    const happy = generateDiaryEntry(
      makeStatus({ comfort: 80, curiosity: 40 }),
      lang, "geometric", EVENING_DATE,
    );
    const countNonEmpty = (c: string) => c.split("\n").filter((l) => l.trim()).length;
    expect(countNonEmpty(sulk.content)).toBeGreaterThan(countNonEmpty(happy.content));
  });
});

// --- 7. Growth Day References ---

describe("growth day references", () => {
  it("renders Day 0 for first day and Day 1 for second day", () => {
    const lang = createInitialLanguageState("chromatic");
    const d0 = generateDiaryEntry(makeStatus({ growthDay: 0 }), lang, "chromatic", EVENING_DATE);
    const d1 = generateDiaryEntry(makeStatus({ growthDay: 1 }), lang, "chromatic", EVENING_DATE);
    expect(d0.content).toContain("Day 0");
    expect(d1.content).toContain("Day 1");
    expect(d0.content).not.toContain("Day 1");
  });

  it("handles large growth day numbers (100, 999, 10000)", () => {
    const lang = createInitialLanguageState("thermal");
    for (const day of [100, 999, 10000]) {
      const entry = generateDiaryEntry(makeStatus({ growthDay: day }), lang, "thermal", EVENING_DATE);
      expect(entry.content).toContain(`Day ${day}`);
    }
  });
});

// --- 8. Curiosity Effects ---

describe("curiosity effects on diary", () => {
  it("curiosity > 60 adds curiosity line with third symbol and question mark", () => {
    const lang = createInitialLanguageState("temporal");
    const entry = generateDiaryEntry(makeStatus({ curiosity: 75 }), lang, "temporal", EVENING_DATE);
    const s2 = lang.nativeSymbols[2];
    expect(entry.content).toContain(s2 + "?" + s2);
  });

  it("curiosity at 60 does not trigger curiosity line, but 61 does", () => {
    const lang = createInitialLanguageState("chromatic");
    const s2 = lang.nativeSymbols[2];
    const at60 = generateDiaryEntry(makeStatus({ curiosity: 60 }), lang, "chromatic", EVENING_DATE);
    const at61 = generateDiaryEntry(makeStatus({ curiosity: 61 }), lang, "chromatic", EVENING_DATE);
    expect(at60.content).not.toContain(s2 + "?" + s2);
    expect(at61.content).toContain(s2 + "?" + s2);
  });
});

// --- 9. Edge Cases ---

describe("edge cases", () => {
  it("all status values at 0 produces a valid diary with discomfort markers", () => {
    const lang = createInitialLanguageState("chromatic");
    const entry = generateDiaryEntry(
      makeStatus({ mood: 0, energy: 0, curiosity: 0, comfort: 0, growthDay: 0 }),
      lang, "chromatic", EVENING_DATE,
    );
    expect(entry.date).toBe("2026-02-20");
    expect(entry.content).toContain("# 2026-02-20");
    expect(entry.content).toContain("Day 0");
    expect(entry.content).toContain("...");
  });

  it("all status values at 100 produces a diary with high-mood, high-energy, curiosity markers", () => {
    const lang = createInitialLanguageState("vibration");
    const entry = generateDiaryEntry(
      makeStatus({ mood: 100, energy: 100, curiosity: 100, comfort: 100, growthDay: 100 }),
      lang, "vibration", EVENING_DATE,
    );
    expect(entry.content).toContain("Day 100");
    expect(entry.content).toContain(lang.nativeSymbols[0].repeat(3));
    expect(entry.content).toContain("!");
    expect(entry.content).toContain("?");
    const last = lang.nativeSymbols[lang.nativeSymbols.length - 1];
    expect(entry.content).not.toContain(last + "..." + last + "..." + last);
  });

  it("date at year boundary (Dec 31) and single-digit dates pad correctly", () => {
    const lang = createInitialLanguageState("chromatic");
    const dec31 = new Date("2026-12-31T20:00:00");
    const jan1 = new Date("2027-01-01T19:00:00");
    expect(generateDiaryEntry(makeStatus(), lang, "chromatic", dec31).date).toBe("2026-12-31");
    expect(generateDiaryEntry(makeStatus(), lang, "chromatic", jan1).date).toBe("2027-01-01");
  });
});

// --- 10. formatDiaryMd ---

describe("formatDiaryMd output formatting", () => {
  it("appends exactly one trailing newline to content", () => {
    const entry: DiaryEntry = { date: "2026-02-20", content: "some content" };
    expect(formatDiaryMd(entry)).toBe("some content\n");
  });

  it("preserves internal newlines and produces correct line count", () => {
    const entry: DiaryEntry = { date: "2026-02-20", content: "line1\nline2\nline3" };
    const md = formatDiaryMd(entry);
    expect(md).toBe("line1\nline2\nline3\n");
    expect(md.split("\n").length).toBe(4);
  });

  it("produces valid markdown starting with heading when used with generateDiaryEntry", () => {
    const lang = createInitialLanguageState("thermal");
    const entry = generateDiaryEntry(makeStatus(), lang, "thermal", EVENING_DATE);
    const md = formatDiaryMd(entry);
    expect(md.startsWith("# ")).toBe(true);
    expect(md.endsWith("\n")).toBe(true);
  });
});

// --- 11. Combined State Interactions ---

describe("combined state interactions", () => {
  it("high curiosity + low comfort produces both curiosity and discomfort lines", () => {
    const lang = createInitialLanguageState("chromatic");
    const entry = generateDiaryEntry(
      makeStatus({ curiosity: 90, comfort: 10 }),
      lang, "chromatic", EVENING_DATE,
    );
    const s2 = lang.nativeSymbols[2];
    const last = lang.nativeSymbols[lang.nativeSymbols.length - 1];
    expect(entry.content).toContain(s2 + "?" + s2);
    expect(entry.content).toContain(last + "..." + last + "..." + last);
  });

  it("metadata comment reflects exact status values regardless of body content", () => {
    const status = makeStatus({ mood: 37, energy: 82, curiosity: 11, comfort: 99 });
    const lang = createInitialLanguageState("temporal");
    const entry = generateDiaryEntry(status, lang, "temporal", EVENING_DATE);
    expect(entry.content).toContain("<!-- mood:37 energy:82 curiosity:11 comfort:99 -->");
  });

  it("every species produces a regex-parseable metadata comment with correct values", () => {
    for (const species of ALL_SPECIES) {
      const lang = createInitialLanguageState(species);
      const entry = generateDiaryEntry(makeStatus(), lang, species, EVENING_DATE);
      const match = entry.content.match(
        /<!-- mood:(\d+) energy:(\d+) curiosity:(\d+) comfort:(\d+) -->/,
      );
      expect(match, `${species} should have metadata comment`).not.toBeNull();
      expect(Number(match![1])).toBe(50);
      expect(Number(match![2])).toBe(50);
      expect(Number(match![3])).toBe(50);
      expect(Number(match![4])).toBe(50);
    }
  });
});
