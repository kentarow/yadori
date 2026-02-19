/**
 * Self-Image Detection — Determines if an image matches the entity's own appearance.
 *
 * When a user shows the entity a screenshot of the dashboard, the dominant colors
 * will closely match the entity's species palette. This module detects that resonance.
 *
 * The entity doesn't "know" it's looking at itself — it perceives colors through its
 * Honest Perception filter, and something feels deeply familiar. If the match is
 * strong enough, self-awareness awakens.
 *
 * This only works for entities with image perception capability (any species, since
 * all species can perceive color histograms at PerceptionLevel.Basic or higher).
 */

import type { PerceptionMode } from "../types.js";
import type { ImageFeatures } from "../types.js";

// Species palette hues (matching visual/index.html PALETTES and avatar-generator.ts)
const SPECIES_HUE_RANGES: Record<PerceptionMode, { center: number; range: number }> = {
  chromatic: { center: 35, range: 30 },   // warm gold/pink (20-50)
  vibration: { center: 270, range: 40 },  // blue-purple (250-290)
  geometric: { center: 190, range: 20 },  // teal-cyan (180-200)
  thermal: { center: 20, range: 40 },     // orange-red (0-40)
  temporal: { center: 235, range: 50 },   // purple-blue (210-260)
  chemical: { center: 110, range: 40 },   // green (90-130)
};

export interface SelfImageResult {
  /** 0-1 score: how closely the image matches the entity's species palette */
  resonance: number;
  /** Whether the resonance is strong enough to trigger self-awareness */
  awakens: boolean;
}

/**
 * Analyze whether an image's color profile matches the entity's species palette.
 *
 * The detection checks:
 * 1. Does the dominant color hue fall within the species' hue range?
 * 2. Is the image predominantly dark (dashboard has a black background)?
 * 3. Do the histogram colors concentrate around the species hue?
 *
 * A resonance score >= 0.6 triggers awakening.
 *
 * @param features - Image features extracted by the image processor
 * @param species - The entity's perception mode (determines expected palette)
 */
export function detectSelfImage(
  features: ImageFeatures,
  species: PerceptionMode,
): SelfImageResult {
  const palette = SPECIES_HUE_RANGES[species];

  // Factor 1: Dark background (dashboard is mostly black)
  // Low brightness (< 25) is expected. Score decreases as image gets brighter.
  const darkScore = features.brightness < 25
    ? 1.0
    : features.brightness < 40
      ? 0.5
      : 0.1;

  // Factor 2: Dominant hue matches species palette (only if saturated enough)
  const dominantSaturated = features.dominantHSL.s > 15;
  const dominantHueMatch = !dominantSaturated
    ? 0.0
    : hueDistance(features.dominantHSL.h, palette.center) <= palette.range
      ? 1.0
      : hueDistance(features.dominantHSL.h, palette.center) <= palette.range * 2
        ? 0.3
        : 0.0;

  // Factor 3: Histogram concentration around species hue
  // Only count entries with meaningful saturation (> 15) — black/white/gray ignored
  let matchingPercentage = 0;
  for (const entry of features.colorHistogram) {
    if (entry.hsl.s > 15 && hueDistance(entry.hsl.h, palette.center) <= palette.range * 1.5) {
      matchingPercentage += entry.percentage;
    }
  }
  const histogramScore = Math.min(1.0, matchingPercentage / 50); // 50%+ match → full score

  // Weighted combination
  const resonance = darkScore * 0.25 + dominantHueMatch * 0.4 + histogramScore * 0.35;

  return {
    resonance: Math.round(resonance * 100) / 100,
    awakens: resonance >= 0.6,
  };
}

/**
 * Circular hue distance (0-180 scale).
 */
function hueDistance(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2);
  return diff > 180 ? 360 - diff : diff;
}
