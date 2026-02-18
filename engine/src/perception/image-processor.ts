/**
 * Image Processor — Extracts features from raw pixel data.
 *
 * This is the REAL preprocessing that makes Honest Perception work for images.
 * Raw RGBA pixel data goes in; numerical features come out.
 * The LLM never sees the image — only these extracted numbers.
 *
 * No external dependencies. Pure TypeScript computation.
 */

import type { ImageFeatures } from "../types.js";

// --- Public API ---

/**
 * Process raw RGBA pixel data into image features.
 * The input is a flat Uint8Array or Uint8ClampedArray where every 4 bytes
 * represent one pixel: [R, G, B, A, R, G, B, A, ...].
 */
export function processImage(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): ImageFeatures {
  const totalPixels = width * height;

  if (pixels.length < totalPixels * 4) {
    throw new Error(
      `Expected at least ${totalPixels * 4} bytes for ${width}x${height} image, got ${pixels.length}`,
    );
  }

  // Compute per-pixel lightness for brightness and contrast calculations
  const lightnessValues = new Float64Array(totalPixels);
  let brightnessSum = 0;

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const r = pixels[offset] / 255;
    const g = pixels[offset + 1] / 255;
    const b = pixels[offset + 2] / 255;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; // Rec. 709 luminance
    lightnessValues[i] = l;
    brightnessSum += l;
  }

  const brightness = (brightnessSum / totalPixels) * 100;

  // Contrast: standard deviation of luminance, scaled to 0-100
  const meanL = brightnessSum / totalPixels;
  let varianceSum = 0;
  for (let i = 0; i < totalPixels; i++) {
    const diff = lightnessValues[i] - meanL;
    varianceSum += diff * diff;
  }
  const stdDev = Math.sqrt(varianceSum / totalPixels);
  // Max possible std dev for 0-1 range is 0.5, so scale accordingly
  const contrast = Math.min(100, (stdDev / 0.5) * 100);

  // Color histogram via K-means clustering
  const colorHistogram = computeColorHistogram(pixels, width, height, 8);

  // Dominant color
  const dominantHSL = colorHistogram.length > 0
    ? { ...colorHistogram[0].hsl }
    : { h: 0, s: 0, l: 0 };

  // Edge density and dominant angles
  const { edgeDensity, dominantAngles } = computeEdgeFeatures(
    lightnessValues,
    width,
    height,
  );

  // Quadrant brightness
  const quadrantBrightness = computeQuadrantBrightness(
    lightnessValues,
    width,
    height,
  );

  // Color count: number of clusters with >= 3% representation
  const colorCount = colorHistogram.filter(c => c.percentage >= 3).length;

  // Warmth: based on dominant hue distribution
  const warmth = computeWarmth(pixels, totalPixels);

  return {
    dominantHSL,
    colorHistogram,
    brightness: round2(brightness),
    edgeDensity: round2(edgeDensity),
    dominantAngles,
    quadrantBrightness: {
      topLeft: round2(quadrantBrightness.topLeft),
      topRight: round2(quadrantBrightness.topRight),
      bottomLeft: round2(quadrantBrightness.bottomLeft),
      bottomRight: round2(quadrantBrightness.bottomRight),
    },
    colorCount,
    contrast: round2(contrast),
    warmth: round2(warmth),
  };
}

// --- RGB to HSL conversion ---

/**
 * Convert RGB (0-255 each) to HSL.
 * Returns { h: 0-360, s: 0-100, l: 0-100 }.
 */
export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: round2(l * 100) };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === rn) {
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  } else if (max === gn) {
    h = ((bn - rn) / d + 2) / 6;
  } else {
    h = ((rn - gn) / d + 4) / 6;
  }

  return {
    h: round2(h * 360),
    s: round2(s * 100),
    l: round2(l * 100),
  };
}

// --- Color Histogram via simplified K-means ---

/**
 * Compute a color histogram by clustering pixel colors.
 * Uses a simplified K-means approach with HSL space.
 * Returns clusters sorted by percentage (largest first).
 */
export function computeColorHistogram(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  clusterCount = 8,
): Array<{ hsl: { h: number; s: number; l: number }; percentage: number }> {
  const totalPixels = width * height;

  if (totalPixels === 0) return [];

  // Sample pixels for performance (max 2000 samples)
  const sampleStep = Math.max(1, Math.floor(totalPixels / 2000));
  const samples: Array<{ h: number; s: number; l: number }> = [];

  for (let i = 0; i < totalPixels; i += sampleStep) {
    const offset = i * 4;
    const hsl = rgbToHsl(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    samples.push(hsl);
  }

  if (samples.length === 0) return [];

  // Initialize centroids by evenly spacing through the sample array
  const k = Math.min(clusterCount, samples.length);
  const centroids: Array<{ h: number; s: number; l: number }> = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.floor((i * samples.length) / k);
    centroids.push({ ...samples[idx] });
  }

  // K-means iterations (limited to 10 for performance)
  const assignments = new Uint8Array(samples.length);
  const MAX_ITERATIONS = 10;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = false;

    // Assignment step
    for (let i = 0; i < samples.length; i++) {
      let bestDist = Infinity;
      let bestCluster = 0;

      for (let c = 0; c < k; c++) {
        const dist = hslDistance(samples[i], centroids[c]);
        if (dist < bestDist) {
          bestDist = dist;
          bestCluster = c;
        }
      }

      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed = true;
      }
    }

    if (!changed) break;

    // Update step: recompute centroids
    // For hue (circular), use atan2-based averaging
    for (let c = 0; c < k; c++) {
      let sinSum = 0;
      let cosSum = 0;
      let sSum = 0;
      let lSum = 0;
      let count = 0;

      for (let i = 0; i < samples.length; i++) {
        if (assignments[i] === c) {
          const hRad = (samples[i].h / 360) * 2 * Math.PI;
          sinSum += Math.sin(hRad);
          cosSum += Math.cos(hRad);
          sSum += samples[i].s;
          lSum += samples[i].l;
          count++;
        }
      }

      if (count > 0) {
        let avgH = (Math.atan2(sinSum / count, cosSum / count) / (2 * Math.PI)) * 360;
        if (avgH < 0) avgH += 360;
        centroids[c] = {
          h: round2(avgH),
          s: round2(sSum / count),
          l: round2(lSum / count),
        };
      }
    }
  }

  // Count cluster sizes and build result
  const counts = new Array<number>(k).fill(0);
  for (let i = 0; i < samples.length; i++) {
    counts[assignments[i]]++;
  }

  const result: Array<{ hsl: { h: number; s: number; l: number }; percentage: number }> = [];
  for (let c = 0; c < k; c++) {
    if (counts[c] > 0) {
      result.push({
        hsl: {
          h: round2(centroids[c].h),
          s: round2(centroids[c].s),
          l: round2(centroids[c].l),
        },
        percentage: round2((counts[c] / samples.length) * 100),
      });
    }
  }

  // Sort by percentage descending
  result.sort((a, b) => b.percentage - a.percentage);
  return result;
}

// --- Internal helpers ---

/**
 * Distance between two HSL colors.
 * Hue is circular (0-360), so we handle wrap-around.
 * Weights: hue matters most, then saturation, then lightness.
 */
function hslDistance(
  a: { h: number; s: number; l: number },
  b: { h: number; s: number; l: number },
): number {
  // Circular hue difference (0-180 range)
  let dh = Math.abs(a.h - b.h);
  if (dh > 180) dh = 360 - dh;
  // Normalize hue diff to 0-1 scale (180 = max)
  const dhNorm = dh / 180;
  const dsNorm = Math.abs(a.s - b.s) / 100;
  const dlNorm = Math.abs(a.l - b.l) / 100;

  // Weighted Euclidean distance
  return Math.sqrt(dhNorm * dhNorm * 2 + dsNorm * dsNorm + dlNorm * dlNorm);
}

/**
 * Compute edge density and dominant angles using Sobel-like operators.
 * Operates on the luminance array.
 */
function computeEdgeFeatures(
  luminance: Float64Array,
  width: number,
  height: number,
): { edgeDensity: number; dominantAngles: number[] } {
  if (width < 3 || height < 3) {
    return { edgeDensity: 0, dominantAngles: [] };
  }

  // Sobel kernels applied to luminance
  let edgeSum = 0;
  let edgeCount = 0;

  // Angle histogram: 18 bins of 10 degrees each (0-180)
  const angleBins = new Float64Array(18);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      // Sobel horizontal (Gx)
      const gx =
        -luminance[(y - 1) * width + (x - 1)] +
        luminance[(y - 1) * width + (x + 1)] +
        -2 * luminance[y * width + (x - 1)] +
        2 * luminance[y * width + (x + 1)] +
        -luminance[(y + 1) * width + (x - 1)] +
        luminance[(y + 1) * width + (x + 1)];

      // Sobel vertical (Gy)
      const gy =
        -luminance[(y - 1) * width + (x - 1)] +
        -2 * luminance[(y - 1) * width + x] +
        -luminance[(y - 1) * width + (x + 1)] +
        luminance[(y + 1) * width + (x - 1)] +
        2 * luminance[(y + 1) * width + x] +
        luminance[(y + 1) * width + (x + 1)];

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edgeSum += magnitude;
      edgeCount++;

      // Only consider significant edges for angle histogram
      if (magnitude > 0.1) {
        // atan2 gives -PI to PI, convert to 0-180 degrees
        let angle = (Math.atan2(gy, gx) * 180) / Math.PI;
        if (angle < 0) angle += 180;
        const bin = Math.min(17, Math.floor(angle / 10));
        angleBins[bin] += magnitude;
      }
    }
  }

  // Edge density: average magnitude scaled to 0-100
  // Sobel max theoretical output is ~4.0 for binary edge, typical is much lower
  const avgEdge = edgeCount > 0 ? edgeSum / edgeCount : 0;
  const edgeDensity = Math.min(100, avgEdge * 100);

  // Find dominant angles: bins with energy > 50% of max bin
  const maxBinEnergy = Math.max(...angleBins);
  const dominantAngles: number[] = [];

  if (maxBinEnergy > 0) {
    const threshold = maxBinEnergy * 0.5;
    for (let bin = 0; bin < 18; bin++) {
      if (angleBins[bin] >= threshold) {
        dominantAngles.push(bin * 10 + 5); // Center of the bin
      }
    }
  }

  return {
    edgeDensity: round2(edgeDensity),
    dominantAngles,
  };
}

/**
 * Compute average brightness for each image quadrant.
 */
function computeQuadrantBrightness(
  luminance: Float64Array,
  width: number,
  height: number,
): { topLeft: number; topRight: number; bottomLeft: number; bottomRight: number } {
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);

  let tlSum = 0, tlCount = 0;
  let trSum = 0, trCount = 0;
  let blSum = 0, blCount = 0;
  let brSum = 0, brCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const l = luminance[y * width + x];
      if (y < midY) {
        if (x < midX) { tlSum += l; tlCount++; }
        else { trSum += l; trCount++; }
      } else {
        if (x < midX) { blSum += l; blCount++; }
        else { brSum += l; brCount++; }
      }
    }
  }

  return {
    topLeft: tlCount > 0 ? (tlSum / tlCount) * 100 : 0,
    topRight: trCount > 0 ? (trSum / trCount) * 100 : 0,
    bottomLeft: blCount > 0 ? (blSum / blCount) * 100 : 0,
    bottomRight: brCount > 0 ? (brSum / brCount) * 100 : 0,
  };
}

/**
 * Compute color warmth from pixel data.
 * Warm colors (reds, oranges, yellows: hue 0-60, 300-360) contribute positive.
 * Cool colors (blues, cyans: hue 150-270) contribute negative.
 * Returns -100 (fully cool) to 100 (fully warm).
 */
function computeWarmth(
  pixels: Uint8Array | Uint8ClampedArray,
  totalPixels: number,
): number {
  let warmSum = 0;
  const sampleStep = Math.max(1, Math.floor(totalPixels / 1000));

  let sampleCount = 0;
  for (let i = 0; i < totalPixels; i += sampleStep) {
    const offset = i * 4;
    const hsl = rgbToHsl(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    const h = hsl.h;
    const satWeight = hsl.s / 100; // Low saturation = neutral, weight less

    if ((h >= 0 && h <= 60) || h >= 300) {
      // Warm hues
      warmSum += satWeight;
    } else if (h >= 150 && h <= 270) {
      // Cool hues
      warmSum -= satWeight;
    }
    // Hues 60-150 and 270-300 are neutral (green/yellow-green and purple)
    sampleCount++;
  }

  if (sampleCount === 0) return 0;

  // Normalize: max possible is +-1 per sample, scale to +-100
  return Math.max(-100, Math.min(100, (warmSum / sampleCount) * 100));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
