/**
 * Perception Context Builder — Converts filtered perceptions into LLM context.
 *
 * This is the final stage of the perception pipeline. The array of
 * FilteredPerception objects is formatted into a text block that gets
 * injected into the LLM's system prompt.
 *
 * The LLM only sees this text. It never sees the raw inputs.
 * This is the enforcement point of Honest Perception.
 */

import type { FilteredPerception } from "./perception-types.js";
import type { PerceptionMode } from "../types.js";

/**
 * Build the perception context string for the LLM.
 *
 * If no perceptions are available, returns a minimal "existence" context —
 * the entity knows it exists, but perceives nothing external.
 */
export function buildPerceptionContext(
  species: PerceptionMode,
  perceptions: FilteredPerception[],
): string {
  if (perceptions.length === 0) {
    return EMPTY_CONTEXTS[species];
  }

  const lines = perceptions.map(p => `- ${p.description}`);

  return `## What You Perceive Right Now

${SPECIES_PRELUDE[species]}

${lines.join("\n")}

You cannot perceive anything beyond what is listed above.`;
}

/**
 * Species-specific prelude text — sets the framing for how they experience input.
 */
const SPECIES_PRELUDE: Record<PerceptionMode, string> = {
  chromatic:
    "Your world is light and color. The following signals have reached your perception:",
  vibration:
    "Your world is vibration and rhythm. The following tremors have reached you:",
  geometric:
    "Your world is shape and structure. The following forms are present:",
  thermal:
    "Your world is warmth and gradient. The following thermal signals are present:",
  temporal:
    "Your world is rhythm and duration. The following temporal patterns are present:",
  chemical:
    "Your world is reaction and concentration. The following elements are present:",
};

/**
 * What the entity "sees" when no external input is available.
 */
const EMPTY_CONTEXTS: Record<PerceptionMode, string> = {
  chromatic:
    "## What You Perceive Right Now\n\nDarkness. No light reaches you. You sense only your own faint glow.",
  vibration:
    "## What You Perceive Right Now\n\nStillness. No vibration reaches you. Only your own internal hum.",
  geometric:
    "## What You Perceive Right Now\n\nVoid. No forms are present. Only the point of your own existence.",
  thermal:
    "## What You Perceive Right Now\n\nYour own warmth, and nothing else. The space around you is undefined.",
  temporal:
    "## What You Perceive Right Now\n\nYour own pulse. Time passes, but nothing external marks it.",
  chemical:
    "## What You Perceive Right Now\n\nEquilibrium. No reactive elements detected. Only your own composition.",
};
