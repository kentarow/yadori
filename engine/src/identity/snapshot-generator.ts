/**
 * Snapshot Generator — Produces a state-aware PNG of the entity's current appearance.
 *
 * Unlike the static avatar, this image reflects live state values:
 *   - mood → hue shift within the species palette
 *   - energy → glow size and brightness
 *   - curiosity → scattered sparkle particles
 *   - comfort → edge smoothness (low comfort = noisy edges)
 *   - form density/complexity → glow layers and detail
 *
 * No external dependencies. Uses the same PNG encoder as avatar-generator.
 */

import { deflateSync } from "node:zlib";
import type { PerceptionMode, SelfForm } from "../types.js";

// --- Species color palettes (mirrors dashboard PALETTES) ---

interface SpeciesPalette {
  hueMin: number;
  hueMax: number;
  saturation: number;
  lightness: number;
}

const SPECIES_PALETTES: Record<PerceptionMode, SpeciesPalette> = {
  chromatic: { hueMin: 20, hueMax: 50, saturation: 80, lightness: 60 },
  vibration: { hueMin: 250, hueMax: 290, saturation: 65, lightness: 55 },
  geometric: { hueMin: 180, hueMax: 200, saturation: 50, lightness: 55 },
  thermal:   { hueMin: 0, hueMax: 40, saturation: 85, lightness: 55 },
  temporal:  { hueMin: 210, hueMax: 260, saturation: 55, lightness: 60 },
  chemical:  { hueMin: 90, hueMax: 130, saturation: 65, lightness: 50 },
};

// --- Form-based glow shape ---

type GlowShape = "soft" | "sharp" | "ring" | "diffuse";

const FORM_GLOW: Record<SelfForm, GlowShape> = {
  "light-particles": "soft",
  "fluid": "diffuse",
  "crystal": "sharp",
  "sound-echo": "ring",
  "mist": "diffuse",
  "geometric-cluster": "sharp",
};

// --- Snapshot state inputs ---

export interface SnapshotState {
  /** 0-100 */
  mood: number;
  /** 0-100 */
  energy: number;
  /** 0-100 */
  curiosity: number;
  /** 0-100 */
  comfort: number;
  /** Form density 0-100 */
  density: number;
  /** Form complexity 0-100 */
  complexity: number;
}

/**
 * Generate a state-aware snapshot PNG of the entity.
 *
 * @param perception - Species perception mode (determines base color)
 * @param form - Self-form (determines glow shape)
 * @param state - Current status values (mood, energy, curiosity, comfort, form params)
 * @param size - Image width/height in pixels (default 512)
 */
export function generateSnapshot(
  perception: PerceptionMode,
  form: SelfForm,
  state: SnapshotState,
  size: number = 512,
): Buffer {
  const palette = SPECIES_PALETTES[perception];
  const glowShape = FORM_GLOW[form] ?? "soft";
  const pixels = renderSnapshot(palette, glowShape, state, size);
  return encodePNG(pixels, size, size);
}

// --- Rendering ---

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/**
 * Seeded pseudo-random number generator (simple LCG).
 * Produces deterministic but visually varied patterns from a seed.
 */
function createRng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function renderSnapshot(
  palette: SpeciesPalette,
  glowShape: GlowShape,
  state: SnapshotState,
  size: number,
): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const center = size / 2;
  const maxDist = size / 2;

  // Map mood (0-100) to hue within species range
  const moodFraction = state.mood / 100;
  const hue = palette.hueMin + (palette.hueMax - palette.hueMin) * moodFraction;

  // Energy affects brightness and glow radius
  const energyFactor = 0.4 + (state.energy / 100) * 0.6; // 0.4 - 1.0
  const saturation = palette.saturation * (0.7 + moodFraction * 0.3);
  const lightness = palette.lightness * energyFactor;

  const [r, g, b] = hslToRgb(hue, saturation, lightness);

  // Background: very dark version of the species hue
  const [bgR, bgG, bgB] = hslToRgb(hue, 12, 4);

  // Comfort affects edge noise (low comfort = more wobble)
  const noiseAmount = Math.max(0, (100 - state.comfort) / 100) * 0.15;

  // Density affects glow size multiplier
  const densityScale = 0.8 + (state.density / 100) * 0.4; // 0.8 - 1.2

  // Complexity adds secondary glow layers
  const layerCount = 1 + Math.floor(state.complexity / 30); // 1-4 layers

  // Use mood+energy as seed for reproducible noise
  const rng = createRng(Math.round(state.mood * 100 + state.energy));

  // Pre-generate sparkle positions based on curiosity
  const sparkleCount = Math.floor((state.curiosity / 100) * 24);
  const sparkles: Array<{ x: number; y: number; brightness: number }> = [];
  const sparkleRng = createRng(Math.round(state.curiosity * 73 + state.mood * 17));
  for (let i = 0; i < sparkleCount; i++) {
    const angle = sparkleRng() * Math.PI * 2;
    const dist = 0.25 + sparkleRng() * 0.55; // Between 25% and 80% from center
    sparkles.push({
      x: center + Math.cos(angle) * dist * maxDist,
      y: center + Math.sin(angle) * dist * maxDist,
      brightness: 0.3 + sparkleRng() * 0.7,
    });
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let normalizedDist = dist / maxDist;

      // Apply comfort-based noise to distance (wobble effect)
      if (noiseAmount > 0 && normalizedDist > 0.05) {
        const angle = Math.atan2(dy, dx);
        const noise = rng() * 2 - 1;
        normalizedDist += noise * noiseAmount * normalizedDist;
      }

      // Apply density scaling
      normalizedDist /= densityScale;

      // Compute main glow
      let alpha = computeGlowAlpha(normalizedDist, glowShape) * energyFactor;

      // Add secondary layers (from complexity)
      for (let layer = 1; layer < layerCount; layer++) {
        const layerScale = 1 + layer * 0.3;
        const layerDist = normalizedDist * layerScale;
        const layerAlpha = computeGlowAlpha(layerDist, glowShape) * 0.15 * energyFactor;
        alpha = Math.min(1, alpha + layerAlpha);
      }

      // Check sparkle proximity
      let sparkleAlpha = 0;
      for (const sparkle of sparkles) {
        const sdx = x - sparkle.x;
        const sdy = y - sparkle.y;
        const sDist = Math.sqrt(sdx * sdx + sdy * sdy);
        const sparkleRadius = 2 + (state.curiosity / 100) * 3; // 2-5px radius
        if (sDist < sparkleRadius) {
          const sFalloff = 1 - (sDist / sparkleRadius);
          sparkleAlpha = Math.max(sparkleAlpha, sFalloff * sparkle.brightness * 0.8);
        }
      }
      alpha = Math.min(1, alpha + sparkleAlpha);

      const idx = (y * size + x) * 4;
      data[idx]     = Math.round(bgR * (1 - alpha) + r * alpha);
      data[idx + 1] = Math.round(bgG * (1 - alpha) + g * alpha);
      data[idx + 2] = Math.round(bgB * (1 - alpha) + b * alpha);
      data[idx + 3] = 255;
    }
  }

  return data;
}

function computeGlowAlpha(normalizedDist: number, shape: GlowShape): number {
  if (normalizedDist > 1.5) return 0;

  switch (shape) {
    case "soft": {
      const d = normalizedDist * 2.5;
      return Math.exp(-d * d) * 0.95;
    }
    case "sharp": {
      if (normalizedDist < 0.12) return 0.95;
      const d = (normalizedDist - 0.12) * 2.8;
      return Math.exp(-d * d) * 0.85;
    }
    case "ring": {
      const ringCenter = 0.25;
      const ringWidth = 0.12;
      const ringDist = Math.abs(normalizedDist - ringCenter) / ringWidth;
      const ring = Math.exp(-ringDist * ringDist) * 0.8;
      const ctr = Math.exp(-normalizedDist * normalizedDist * 10) * 0.4;
      return Math.min(1, ring + ctr);
    }
    case "diffuse": {
      const d = normalizedDist * 1.6;
      return Math.exp(-d * d) * 0.7;
    }
  }
}

// --- Minimal PNG encoder (shared logic with avatar-generator) ---

function encodePNG(pixels: Uint8Array, width: number, height: number): Buffer {
  const rawRows = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 3);
    rawRows[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = rowOffset + 1 + x * 3;
      rawRows[dstIdx]     = pixels[srcIdx];
      rawRows[dstIdx + 1] = pixels[srcIdx + 1];
      rawRows[dstIdx + 2] = pixels[srcIdx + 2];
    }
  }

  const compressed = deflateSync(rawRows);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = createChunk("IHDR", (() => {
    const buf = Buffer.alloc(13);
    buf.writeUInt32BE(width, 0);
    buf.writeUInt32BE(height, 4);
    buf[8] = 8;
    buf[9] = 2; // RGB
    buf[10] = 0;
    buf[11] = 0;
    buf[12] = 0;
    return buf;
  })());
  const idat = createChunk("IDAT", compressed);
  const iend = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([typeBytes, data]);
  const crc = crc32(crcData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeInt32BE(crc, 0);
  return Buffer.concat([length, typeBytes, data, crcBuf]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ -1;
}
