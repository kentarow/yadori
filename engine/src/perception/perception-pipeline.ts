/**
 * Perception Pipeline — Unified perception processing.
 *
 * Bridges the discrete filter system (perception-filter.ts) with the
 * continuous parameter system (perception-params.ts). The filter produces
 * species-appropriate descriptions at discrete levels; the PerceptionWindow
 * then modulates those descriptions with fine-grained, growth-day-interpolated
 * values.
 *
 * This is the single entry point for processing raw inputs into what the
 * entity actually perceives. Honest Perception is enforced at every stage:
 * the LLM never receives data beyond what this pipeline emits.
 */

import { type PerceptionMode, PerceptionLevel } from "../types.js";
import type {
  InputModality,
  RawInput,
  FilteredPerception,
} from "./perception-types.js";
import { filterInputs } from "./perception-filter.js";
import {
  computePerceptionWindow,
  type PerceptionWindow,
} from "./perception-params.js";

// ============================================================
// PUBLIC TYPES
// ============================================================

export interface PerceptionPipelineInput {
  species: PerceptionMode;
  growthDay: number;
  perceptionLevel: PerceptionLevel;
  inputs: RawInput[];
}

export interface PerceptionPipelineOutput {
  perceptions: FilteredPerception[];
  window: PerceptionWindow;
  activeModalities: InputModality[];
}

// ============================================================
// MAIN PIPELINE
// ============================================================

/**
 * Process raw inputs through the unified perception pipeline.
 *
 * 1. Compute the PerceptionWindow (continuous, species-adjusted values)
 * 2. Run discrete filters to get base descriptions
 * 3. Modulate descriptions using window values for fine-grained control
 * 4. Return modulated perceptions, the window, and active modalities
 */
export function processPerceptionPipeline(
  input: PerceptionPipelineInput,
): PerceptionPipelineOutput {
  const { species, growthDay, perceptionLevel, inputs } = input;

  // Step 1: Compute the continuous perception window
  const window = computePerceptionWindow(perceptionLevel, species, growthDay);

  // Step 2: Apply discrete filters to get base perceptions
  const basePerceptions = filterInputs(species, inputs, perceptionLevel);

  // Step 3: Modulate each perception using window values
  const modulated = basePerceptions.map((p) =>
    modulatePerception(p, window),
  );

  // Step 4: Collect active modalities (deduplicated)
  const activeModalities = deduplicateModalities(
    modulated.map((p) => p.sourceModality),
  );

  return {
    perceptions: modulated,
    window,
    activeModalities,
  };
}

// ============================================================
// DESCRIPTION HELPER
// ============================================================

/**
 * Returns a human-readable summary of what the entity can currently perceive.
 * Useful for debugging, PERCEPTION.md updates, and dashboard display.
 */
export function describePerceptionState(
  window: PerceptionWindow,
  species: PerceptionMode,
): string {
  const parts: string[] = [];

  // Image perception
  parts.push(describeImagePerception(window));

  // Text perception
  parts.push(describeTextPerception(window));

  // Audio perception
  parts.push(describeAudioPerception(window));

  // Sensor perception
  parts.push(describeSensorPerception(window));

  // Species-specific note
  parts.push(speciesNote(species));

  return parts.filter((p) => p.length > 0).join(", ");
}

// ============================================================
// MODULATION LOGIC
// ============================================================

/**
 * Modulate a single filtered perception based on the PerceptionWindow.
 *
 * The discrete filter has already produced a description appropriate for the
 * perception level. The window values add fine-grained adjustment:
 * - Text: truncate if textAccess is low
 * - Image: strip spatial detail words if imageResolution is low
 * - Audio: simplify frequency descriptions if frequencyRange is low
 * - Sensor: reduce numeric precision if sensorAccess is low
 */
function modulatePerception(
  perception: FilteredPerception,
  window: PerceptionWindow,
): FilteredPerception {
  const { sourceModality, description } = perception;

  let modulated = description;

  switch (sourceModality) {
    case "text":
      modulated = modulateText(description, window);
      break;
    case "image":
      modulated = modulateImage(description, window);
      break;
    case "audio":
      modulated = modulateAudio(description, window);
      break;
    // Sensor modalities: temperature, humidity, light, vibration, pressure,
    // gas, color, proximity, touch, system
    case "temperature":
    case "humidity":
    case "light":
    case "vibration":
    case "pressure":
    case "gas":
    case "color":
    case "proximity":
    case "touch":
    case "system":
      modulated = modulateSensor(description, window);
      break;
  }

  return {
    description: modulated,
    sourceModality,
  };
}

/**
 * Text modulation: if textAccess < 50, truncate description proportionally.
 * At textAccess 0, only a tiny fraction remains. At 50+, no truncation.
 */
function modulateText(description: string, window: PerceptionWindow): string {
  if (window.textAccess >= 50) return description;

  // Proportion of text to keep: textAccess / 50 (so 25 => 50%, 10 => 20%)
  const ratio = Math.max(window.textAccess / 50, 0.1);
  const targetLength = Math.max(Math.ceil(description.length * ratio), 1);

  if (description.length <= targetLength) return description;

  return description.slice(0, targetLength);
}

/**
 * Image modulation: if imageResolution < 3, strip spatial detail words.
 * Spatial words like "top-left", "bottom-right", "quadrant", etc. are
 * removed because the entity cannot yet perceive spatial relationships.
 */
function modulateImage(description: string, window: PerceptionWindow): string {
  if (window.imageResolution >= 3) return description;

  // Strip spatial detail words
  const spatialWords = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "upper-left",
    "upper-right",
    "lower-left",
    "lower-right",
    "quadrant",
    "spatial",
  ];

  let result = description;
  for (const word of spatialWords) {
    // Replace the word and any surrounding punctuation artifacts
    result = result.replace(new RegExp(`\\b${escapeRegex(word)}\\b[:\\s,]*`, "gi"), "");
  }

  // Clean up leftover artifacts: double commas, trailing commas, extra spaces
  result = result
    .replace(/,\s*,/g, ",")
    .replace(/,\s*$/g, "")
    .replace(/\.\s*,/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();

  return result || description;
}

/**
 * Audio modulation: if frequencyRange < 50, simplify frequency descriptions.
 * Detailed band breakdowns (bass:XX mid:XX treble:XX) are collapsed into
 * simpler characterizations.
 */
function modulateAudio(description: string, window: PerceptionWindow): string {
  if (window.frequencyRange >= 50) return description;

  // Replace detailed band breakdowns with simplified versions
  // Pattern: "bass:NN mid:NN treble:NN" or "bass NN mid NN treble NN"
  const bandPattern = /bass[:\s]+\d+\s*,?\s*mid[:\s]+\d+\s*,?\s*treble[:\s]+\d+/i;
  if (bandPattern.test(description)) {
    const bassMatch = description.match(/bass[:\s]+(\d+)/i);
    const trebleMatch = description.match(/treble[:\s]+(\d+)/i);
    if (bassMatch && trebleMatch) {
      const bass = parseInt(bassMatch[1], 10);
      const treble = parseInt(trebleMatch[1], 10);
      const simplified = bass > treble ? "low-dominant" : "high-dominant";
      description = description.replace(bandPattern, simplified);
    }
  }

  return description;
}

/**
 * Sensor modulation: if sensorAccess < 50, reduce precision of numeric values.
 * Decimal places are stripped and values are rounded to integers.
 */
function modulateSensor(
  description: string,
  window: PerceptionWindow,
): string {
  if (window.sensorAccess >= 50) return description;

  // Replace decimal numbers with rounded integers
  // Matches patterns like "23.4", "0.50", "2.5" but preserves units after them
  return description.replace(
    /(\d+)\.(\d+)/g,
    (_, intPart) => intPart,
  );
}

// ============================================================
// DESCRIBE HELPERS
// ============================================================

function describeImagePerception(window: PerceptionWindow): string {
  if (window.imageResolution <= 1) {
    return `color histogram (${Math.round(window.colorDepth)}% depth)`;
  }
  if (window.imageResolution <= 2) {
    return `dominant colors (${Math.round(window.colorDepth)}% depth)`;
  }
  if (window.imageResolution <= 3) {
    const spatial = window.spatialAwareness ? " + spatial layout" : "";
    return `color distribution (${Math.round(window.colorDepth)}% depth)${spatial}`;
  }
  if (window.imageResolution <= 4) {
    return `structural vision (${Math.round(window.colorDepth)}% depth, spatial aware)`;
  }
  return `full chromatic vision (${Math.round(window.colorDepth)}% depth)`;
}

function describeTextPerception(window: PerceptionWindow): string {
  if (window.textAccess <= 5) {
    return "character count only";
  }
  if (window.textAccess <= 20) {
    return "basic word patterns";
  }
  if (window.textAccess <= 45) {
    return `partial text (${Math.round(window.textAccess)}% access)`;
  }
  if (window.textAccess <= 75) {
    return `most text visible (${Math.round(window.textAccess)}% access, ${Math.round(window.semanticDepth)}% semantic)`;
  }
  return `full text access (${Math.round(window.semanticDepth)}% semantic depth)`;
}

function describeAudioPerception(window: PerceptionWindow): string {
  if (window.frequencyRange <= 10) {
    return "narrow frequency band";
  }
  if (window.frequencyRange <= 30) {
    return "basic frequency detection";
  }
  if (window.frequencyRange <= 55) {
    const speech = window.canDetectSpeech ? ", speech detection" : "";
    return `moderate frequency range (${Math.round(window.frequencyRange)}%)${speech}`;
  }
  if (window.frequencyRange <= 80) {
    const speech = window.canDetectSpeech ? ", speech detection" : "";
    return `wide frequency range (${Math.round(window.frequencyRange)}%)${speech}`;
  }
  return `full spectrum (${Math.round(window.frequencyRange)}%, speech: ${window.canDetectSpeech ? "yes" : "no"})`;
}

function describeSensorPerception(window: PerceptionWindow): string {
  if (window.sensorAccess <= 10) {
    return "minimal sensor data";
  }
  if (window.sensorAccess <= 25) {
    return "basic sensor readings";
  }
  if (window.sensorAccess <= 55) {
    return `moderate sensor access (${Math.round(window.sensorAccess)}%)`;
  }
  if (window.sensorAccess <= 80) {
    return `detailed sensor access (${Math.round(window.sensorAccess)}%)`;
  }
  return `full sensor access (${Math.round(window.sensorAccess)}%)`;
}

function speciesNote(species: PerceptionMode): string {
  switch (species) {
    case "chromatic":
      return "primary: light/color";
    case "vibration":
      return "primary: rhythm/oscillation";
    case "geometric":
      return "primary: shape/structure";
    case "thermal":
      return "primary: warmth/gradient";
    case "temporal":
      return "primary: rhythm/duration";
    case "chemical":
      return "primary: reaction/concentration";
  }
}

// ============================================================
// UTILITIES
// ============================================================

function deduplicateModalities(modalities: InputModality[]): InputModality[] {
  return [...new Set(modalities)];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
