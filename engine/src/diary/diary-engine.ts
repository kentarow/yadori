import type { Status, PerceptionMode } from "../types.js";
import type { LanguageState } from "../language/language-engine.js";

export interface DiaryEntry {
  date: string; // YYYY-MM-DD
  content: string;
}

/**
 * Generate a diary entry for today based on the entity's current state.
 * The diary is written in the entity's own language (symbols at early levels).
 */
export function generateDiaryEntry(
  status: Status,
  languageState: LanguageState,
  perception: PerceptionMode,
  date: Date,
): DiaryEntry {
  const dateStr = formatDate(date);
  const lines: string[] = [];

  lines.push(`# ${dateStr}`);
  lines.push("");
  lines.push(`Day ${status.growthDay}`);
  lines.push("");

  // The diary reflects the entity's perception mode and language level
  lines.push(generateMoodLine(status, languageState));
  lines.push(generateEnergyLine(status, languageState));

  if (status.curiosity > 60) {
    lines.push(generateCuriosityLine(languageState));
  }

  if (status.comfort < 30) {
    lines.push(generateDiscomfortLine(languageState));
  }

  lines.push("");
  lines.push(`<!-- mood:${status.mood} energy:${status.energy} curiosity:${status.curiosity} comfort:${status.comfort} -->`);

  return {
    date: dateStr,
    content: lines.join("\n"),
  };
}

export function formatDiaryMd(entry: DiaryEntry): string {
  return entry.content + "\n";
}

function generateMoodLine(status: Status, lang: LanguageState): string {
  const symbols = lang.nativeSymbols;
  if (status.mood > 70) {
    return symbols[0] + symbols[0] + symbols[0] + " " + repeatSymbol(symbols[0], 2);
  }
  if (status.mood < 30) {
    const dark = symbols[symbols.length - 1];
    return dark + "..." + dark;
  }
  return symbols[0] + " " + symbols[1];
}

function generateEnergyLine(status: Status, lang: LanguageState): string {
  const s = lang.nativeSymbols;
  if (status.energy > 60) {
    return s.slice(0, 3).join("") + "!";
  }
  if (status.energy < 30) {
    return s[0] + "...";
  }
  return s[0] + " " + s[1];
}

function generateCuriosityLine(lang: LanguageState): string {
  const s = lang.nativeSymbols;
  return s[2] + "?" + s[2];
}

function generateDiscomfortLine(lang: LanguageState): string {
  const s = lang.nativeSymbols;
  return s[s.length - 1] + "..." + s[s.length - 1] + "..." + s[s.length - 1];
}

function repeatSymbol(symbol: string, count: number): string {
  return Array(count).fill(symbol).join("");
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
