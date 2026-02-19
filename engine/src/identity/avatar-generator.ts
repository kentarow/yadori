/**
 * Avatar Generator — Produces a species-specific avatar as PNG.
 *
 * No external dependencies. Uses node:zlib for PNG compression.
 * The avatar is a soft glowing circle in the species' palette color,
 * representing the entity's "light point" — the same visual present
 * on the dashboard. Platform-agnostic: outputs raw PNG buffer.
 */

import { deflateSync } from "node:zlib";
import type { PerceptionMode, SelfForm } from "../types.js";

// --- Species color palettes (mirrors visual/index.html PALETTES) ---

interface SpeciesPalette {
  hue: number;
  saturation: number;
  lightness: number;
}

const SPECIES_PALETTES: Record<PerceptionMode, SpeciesPalette> = {
  chromatic: { hue: 35, saturation: 80, lightness: 60 },   // warm gold/pink
  vibration: { hue: 270, saturation: 65, lightness: 55 },   // blue-purple
  geometric: { hue: 190, saturation: 50, lightness: 55 },   // teal-cyan
  thermal: { hue: 20, saturation: 85, lightness: 55 },      // orange-red
  temporal: { hue: 235, saturation: 55, lightness: 60 },    // purple-blue
  chemical: { hue: 110, saturation: 65, lightness: 50 },    // green
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

/**
 * Generate a species-specific avatar PNG.
 * Returns a Buffer containing a valid PNG file.
 *
 * @param perception - Species perception mode (determines color)
 * @param form - Self-form (determines glow shape)
 * @param size - Image width/height in pixels (default 256)
 */
export function generateAvatar(
  perception: PerceptionMode,
  form: SelfForm,
  size: number = 256,
): Buffer {
  const palette = SPECIES_PALETTES[perception];
  const glowShape = FORM_GLOW[form] ?? "soft";
  const pixels = generatePixels(palette, glowShape, size);
  return encodePNG(pixels, size, size);
}

/**
 * Generate the species bot display name from native symbols.
 */
export function generateBotName(perception: PerceptionMode): string {
  const PERCEPTION_SYMBOLS: Record<PerceptionMode, string[]> = {
    chromatic: ["◎", "○", "●"],
    vibration: ["◈", "◇", "◆"],
    geometric: ["■", "□", "△"],
    thermal: ["●", "○", "◎"],
    temporal: ["○", "◎", "◉"],
    chemical: ["◆", "◈", "●"],
  };

  const symbols = PERCEPTION_SYMBOLS[perception];
  return symbols.join("");
}

// --- Pixel generation ---

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

function generatePixels(
  palette: SpeciesPalette,
  glowShape: GlowShape,
  size: number,
): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const center = size / 2;
  const maxDist = size / 2;
  const [r, g, b] = hslToRgb(palette.hue, palette.saturation, palette.lightness);

  // Background: very dark version of the species hue
  const [bgR, bgG, bgB] = hslToRgb(palette.hue, 15, 5);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const normalizedDist = dist / maxDist;

      let alpha = computeGlowAlpha(normalizedDist, glowShape);

      const idx = (y * size + x) * 4;
      // Blend glow color over dark background
      data[idx] = Math.round(bgR * (1 - alpha) + r * alpha);
      data[idx + 1] = Math.round(bgG * (1 - alpha) + g * alpha);
      data[idx + 2] = Math.round(bgB * (1 - alpha) + b * alpha);
      data[idx + 3] = 255; // Fully opaque
    }
  }

  return data;
}

function computeGlowAlpha(normalizedDist: number, shape: GlowShape): number {
  if (normalizedDist > 1) return 0;

  switch (shape) {
    case "soft": {
      // Smooth gaussian-like falloff
      const d = normalizedDist * 2.5;
      return Math.exp(-d * d) * 0.95;
    }
    case "sharp": {
      // Brighter center, sharper falloff
      if (normalizedDist < 0.15) return 0.95;
      const d = (normalizedDist - 0.15) * 3.0;
      return Math.exp(-d * d) * 0.85;
    }
    case "ring": {
      // Ring shape: peak at ~0.3 radius
      const ringCenter = 0.3;
      const ringWidth = 0.15;
      const ringDist = Math.abs(normalizedDist - ringCenter) / ringWidth;
      const ring = Math.exp(-ringDist * ringDist) * 0.8;
      // Plus a dim center
      const center = Math.exp(-normalizedDist * normalizedDist * 8) * 0.4;
      return Math.min(1, ring + center);
    }
    case "diffuse": {
      // Very wide, gentle glow
      const d = normalizedDist * 1.8;
      return Math.exp(-d * d) * 0.7;
    }
  }
}

// --- Minimal PNG encoder (no dependencies) ---

function encodePNG(pixels: Uint8Array, width: number, height: number): Buffer {
  // Build raw image data: each row starts with filter byte (0 = None)
  const rawRows = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 3);
    rawRows[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = rowOffset + 1 + x * 3;
      rawRows[dstIdx] = pixels[srcIdx];     // R
      rawRows[dstIdx + 1] = pixels[srcIdx + 1]; // G
      rawRows[dstIdx + 2] = pixels[srcIdx + 2]; // B
    }
  }

  const compressed = deflateSync(rawRows);

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = createChunk("IHDR", (() => {
    const buf = Buffer.alloc(13);
    buf.writeUInt32BE(width, 0);
    buf.writeUInt32BE(height, 4);
    buf[8] = 8;  // Bit depth
    buf[9] = 2;  // Color type: RGB
    buf[10] = 0; // Compression
    buf[11] = 0; // Filter
    buf[12] = 0; // Interlace
    return buf;
  })());

  // IDAT chunk
  const idat = createChunk("IDAT", compressed);

  // IEND chunk
  const iend = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBytes = Buffer.from(type, "ascii");

  // CRC over type + data
  const crcData = Buffer.concat([typeBytes, data]);
  const crc = crc32(crcData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeInt32BE(crc, 0);

  return Buffer.concat([length, typeBytes, data, crcBuf]);
}

// CRC-32 (PNG standard)
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
