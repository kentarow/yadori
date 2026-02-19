/**
 * Dashboard Parsers — Extract entity state from workspace markdown files.
 *
 * These parsers convert the markdown-based workspace files into structured
 * JSON that the dashboard API serves. They are the bridge between the
 * file-based state and the browser visualization.
 */

/**
 * Parse STATUS.md content into numeric status values.
 * Expects format like: **mood**: 75
 * Returns 50 (neutral) for any missing key.
 */
export function parseStatusMd(content: string): Record<string, number> {
  const get = (key: string): number => {
    const match = content.match(new RegExp(`\\*\\*${key}\\*\\*:\\s*(\\d+)`));
    return match ? parseInt(match[1], 10) : 50;
  };
  return {
    mood: get("mood"),
    energy: get("energy"),
    curiosity: get("curiosity"),
    comfort: get("comfort"),
    languageLevel: get("level"),
    growthDay: get("day"),
    perceptionLevel: get("perception_level"),
  };
}

/**
 * Parse SEED.md content into seed trait strings.
 * Expects format like: **Perception**: chromatic
 */
export function parseSeedMd(content: string): Record<string, string> {
  const get = (key: string): string => {
    const match = content.match(new RegExp(`\\*\\*${key}\\*\\*:\\s*(.+)`));
    return match?.[1]?.trim() ?? "";
  };
  return {
    perception: get("Perception"),
    form: get("Form"),
    temperament: get("Temperament"),
    cognition: get("Cognition"),
  };
}

/**
 * Parse PERCEPTION.md content into structured perception data.
 * Extracts bullet-point lines starting with "- ".
 */
export function parsePerceptionMd(content: string): {
  perceptions: string[];
  hasPerception: boolean;
} {
  const lines = content.split("\n").filter(l => l.startsWith("- ")).map(l => l.slice(2));
  return {
    perceptions: lines,
    hasPerception: lines.length > 0,
  };
}

/**
 * Compute coexistence metrics from entity state.
 */
export function computeCoexistenceMetrics(params: {
  bornDate: string;
  lastInteraction: string;
  totalInteractions: number;
  now?: number; // injectable for testing
}): {
  daysTogether: number;
  silenceHours: number | null;
} {
  const now = params.now ?? Date.now();

  let daysTogether = 0;
  if (params.bornDate) {
    daysTogether = Math.max(0, Math.floor((now - new Date(params.bornDate).getTime()) / 86_400_000));
  }

  let silenceHours: number | null = null;
  if (params.lastInteraction && params.lastInteraction !== "never") {
    silenceHours = Math.round((now - new Date(params.lastInteraction).getTime()) / 3_600_000 * 10) / 10;
  }

  return { daysTogether, silenceHours };
}
