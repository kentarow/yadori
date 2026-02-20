/**
 * Snapshot Generator Tests — Visual Layer
 *
 * Tests the snapshot PNG generation from the visual layer's perspective.
 * Covers color derivation from status values, species-specific visual
 * characteristics, edge cases, output format validation, and determinism.
 *
 * These tests decompress the PNG IDAT payload to inspect actual pixel data,
 * going deeper than "is it a valid PNG" to verify that state values produce
 * the expected visual effects.
 */

import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { generateSnapshot, type SnapshotState } from "../../engine/src/identity/snapshot-generator.js";
import type { PerceptionMode, SelfForm } from "../../engine/src/types.js";

// ============================================================
// Helpers
// ============================================================

const ALL_SPECIES: PerceptionMode[] = [
  "chromatic", "vibration", "geometric", "thermal", "temporal", "chemical",
];

const ALL_FORMS: SelfForm[] = [
  "light-particles", "fluid", "crystal", "sound-echo", "mist", "geometric-cluster",
];

const DEFAULT_STATE: SnapshotState = {
  mood: 50,
  energy: 50,
  curiosity: 50,
  comfort: 50,
  density: 20,
  complexity: 10,
};

/** Extract IDAT chunk data from a raw PNG buffer. */
function extractIdatData(png: Buffer): Buffer {
  // Skip 8-byte signature
  let offset = 8;
  const idatChunks: Buffer[] = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") {
      idatChunks.push(png.subarray(offset + 8, offset + 8 + length));
    }
    if (type === "IEND") break;
    offset += 4 + 4 + length + 4; // length + type + data + crc
  }

  const compressed = Buffer.concat(idatChunks);
  return inflateSync(compressed);
}

/**
 * Decode raw PNG row data (with filter bytes) into flat RGB pixel array.
 * Assumes filter type 0 (None) for all rows, which is what our encoder produces.
 */
function decodePixels(rawRows: Buffer, width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 3);
    // Skip filter byte (rawRows[rowOffset] should be 0)
    for (let x = 0; x < width; x++) {
      const srcIdx = rowOffset + 1 + x * 3;
      const dstIdx = (y * width + x) * 3;
      pixels[dstIdx] = rawRows[srcIdx];
      pixels[dstIdx + 1] = rawRows[srcIdx + 1];
      pixels[dstIdx + 2] = rawRows[srcIdx + 2];
    }
  }
  return pixels;
}

/** Get the RGB values of a specific pixel from decoded data. */
function getPixel(pixels: Uint8Array, width: number, x: number, y: number): [number, number, number] {
  const idx = (y * width + x) * 3;
  return [pixels[idx], pixels[idx + 1], pixels[idx + 2]];
}

/** Compute average brightness across all pixels (0-255). */
function averageBrightness(pixels: Uint8Array): number {
  let total = 0;
  for (let i = 0; i < pixels.length; i += 3) {
    // Perceived brightness formula
    total += pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
  }
  return total / (pixels.length / 3);
}

/** Compute average of the center N x N region. */
function centerBrightness(pixels: Uint8Array, size: number, regionSize: number): number {
  const start = Math.floor((size - regionSize) / 2);
  let total = 0;
  let count = 0;
  for (let y = start; y < start + regionSize; y++) {
    for (let x = start; x < start + regionSize; x++) {
      const idx = (y * size + x) * 3;
      total += pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
      count++;
    }
  }
  return total / count;
}

/** Count unique pixel colors in the image. */
function countUniqueColors(pixels: Uint8Array): number {
  const colors = new Set<string>();
  for (let i = 0; i < pixels.length; i += 3) {
    colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
  }
  return colors.size;
}

// ============================================================
// 1. Snapshot generation from entity state
// ============================================================

describe("snapshot generation from entity state", () => {
  it("generates a non-empty PNG buffer from default state", () => {
    const png = generateSnapshot("chromatic", "light-particles", DEFAULT_STATE, 64);
    expect(png).toBeInstanceOf(Buffer);
    expect(png.length).toBeGreaterThan(100);
  });

  it("produces square images with correct pixel data layout", () => {
    const size = 32;
    const png = generateSnapshot("vibration", "crystal", DEFAULT_STATE, size);
    const rawRows = extractIdatData(png);

    // Each row: 1 filter byte + width * 3 RGB bytes
    const expectedLength = size * (1 + size * 3);
    expect(rawRows.length).toBe(expectedLength);
  });

  it("uses filter type 0 (None) for all rows", () => {
    const size = 16;
    const png = generateSnapshot("geometric", "fluid", DEFAULT_STATE, size);
    const rawRows = extractIdatData(png);

    for (let y = 0; y < size; y++) {
      const filterByte = rawRows[y * (1 + size * 3)];
      expect(filterByte).toBe(0);
    }
  });

  it("produces deterministic output for identical inputs", () => {
    const state: SnapshotState = { mood: 73, energy: 42, curiosity: 88, comfort: 15, density: 50, complexity: 40 };
    const a = generateSnapshot("temporal", "sound-echo", state, 32);
    const b = generateSnapshot("temporal", "sound-echo", state, 32);
    expect(a.equals(b)).toBe(true);
  });

  it("center pixels are brighter than corner pixels (glow effect)", () => {
    const size = 64;
    const png = generateSnapshot("chromatic", "light-particles", { ...DEFAULT_STATE, energy: 80 }, size);
    const rawRows = extractIdatData(png);
    const pixels = decodePixels(rawRows, size, size);

    const [cr, cg, cb] = getPixel(pixels, size, size / 2, size / 2);
    const centerLum = cr * 0.299 + cg * 0.587 + cb * 0.114;

    const [er, eg, eb] = getPixel(pixels, size, 0, 0);
    const cornerLum = er * 0.299 + eg * 0.587 + eb * 0.114;

    expect(centerLum).toBeGreaterThan(cornerLum);
  });
});

// ============================================================
// 2. Color derivation from status values
// ============================================================

describe("color derivation from status values", () => {
  it("higher mood shifts hue within species palette", () => {
    const size = 32;
    const low = generateSnapshot("chromatic", "light-particles", { ...DEFAULT_STATE, mood: 5 }, size);
    const high = generateSnapshot("chromatic", "light-particles", { ...DEFAULT_STATE, mood: 95 }, size);

    const lowPixels = decodePixels(extractIdatData(low), size, size);
    const highPixels = decodePixels(extractIdatData(high), size, size);

    // Center pixel should differ in color (hue shift)
    const [lr, lg, lb] = getPixel(lowPixels, size, size / 2, size / 2);
    const [hr, hg, hb] = getPixel(highPixels, size, size / 2, size / 2);

    const colorDist = Math.abs(lr - hr) + Math.abs(lg - hg) + Math.abs(lb - hb);
    expect(colorDist).toBeGreaterThan(0);
  });

  it("higher energy produces brighter center glow", () => {
    const size = 32;
    const lowEnergy = generateSnapshot("vibration", "light-particles", { ...DEFAULT_STATE, energy: 10 }, size);
    const highEnergy = generateSnapshot("vibration", "light-particles", { ...DEFAULT_STATE, energy: 90 }, size);

    const lowPixels = decodePixels(extractIdatData(lowEnergy), size, size);
    const highPixels = decodePixels(extractIdatData(highEnergy), size, size);

    const lowCenter = centerBrightness(lowPixels, size, 6);
    const highCenter = centerBrightness(highPixels, size, 6);

    expect(highCenter).toBeGreaterThan(lowCenter);
  });

  it("zero energy produces dimmer image than full energy", () => {
    const size = 32;
    const zero = generateSnapshot("thermal", "mist", { ...DEFAULT_STATE, energy: 0 }, size);
    const full = generateSnapshot("thermal", "mist", { ...DEFAULT_STATE, energy: 100 }, size);

    const zeroPixels = decodePixels(extractIdatData(zero), size, size);
    const fullPixels = decodePixels(extractIdatData(full), size, size);

    expect(averageBrightness(fullPixels)).toBeGreaterThan(averageBrightness(zeroPixels));
  });

  it("higher curiosity produces more sparkle particles (more unique colors)", () => {
    const size = 64;
    const noCuriosity = generateSnapshot("chemical", "light-particles",
      { ...DEFAULT_STATE, curiosity: 0, comfort: 100 }, size);
    const maxCuriosity = generateSnapshot("chemical", "light-particles",
      { ...DEFAULT_STATE, curiosity: 100, comfort: 100 }, size);

    const noPixels = decodePixels(extractIdatData(noCuriosity), size, size);
    const maxPixels = decodePixels(extractIdatData(maxCuriosity), size, size);

    // Max curiosity should have more color variation from sparkles
    const noColors = countUniqueColors(noPixels);
    const maxColors = countUniqueColors(maxPixels);
    expect(maxColors).toBeGreaterThanOrEqual(noColors);
  });

  it("higher complexity increases visual detail (more unique colors in image)", () => {
    const size = 64;
    const simple = generateSnapshot("geometric", "crystal",
      { ...DEFAULT_STATE, complexity: 0, curiosity: 0, comfort: 100 }, size);
    const complex = generateSnapshot("geometric", "crystal",
      { ...DEFAULT_STATE, complexity: 100, curiosity: 0, comfort: 100 }, size);

    const simplePixels = decodePixels(extractIdatData(simple), size, size);
    const complexPixels = decodePixels(extractIdatData(complex), size, size);

    const simpleColors = countUniqueColors(simplePixels);
    const complexColors = countUniqueColors(complexPixels);

    // More complexity layers produce more color gradients
    expect(complexColors).toBeGreaterThanOrEqual(simpleColors);
  });
});

// ============================================================
// 3. Different species produce different visual characteristics
// ============================================================

describe("species-specific visual characteristics", () => {
  it("each species produces a unique center pixel color", () => {
    const size = 32;
    const centerColors = new Map<string, PerceptionMode>();

    for (const species of ALL_SPECIES) {
      const png = generateSnapshot(species, "light-particles", DEFAULT_STATE, size);
      const pixels = decodePixels(extractIdatData(png), size, size);
      const [r, g, b] = getPixel(pixels, size, size / 2, size / 2);
      const key = `${r},${g},${b}`;

      // Each species should have a different center color
      expect(centerColors.has(key)).toBe(false);
      centerColors.set(key, species);
    }
  });

  it("chromatic species uses warm hues (orange/gold center)", () => {
    const size = 32;
    const png = generateSnapshot("chromatic", "light-particles", { ...DEFAULT_STATE, mood: 50, energy: 80 }, size);
    const pixels = decodePixels(extractIdatData(png), size, size);
    const [r, g, b] = getPixel(pixels, size, size / 2, size / 2);

    // Chromatic hue range 20-50 (orange/gold) should produce R > B
    expect(r).toBeGreaterThan(b);
  });

  it("vibration species uses cool hues (purple/violet center)", () => {
    const size = 32;
    const png = generateSnapshot("vibration", "light-particles", { ...DEFAULT_STATE, mood: 50, energy: 80 }, size);
    const pixels = decodePixels(extractIdatData(png), size, size);
    const [r, g, b] = getPixel(pixels, size, size / 2, size / 2);

    // Vibration hue range 250-290 (purple/violet) should produce B > G
    expect(b).toBeGreaterThan(g);
  });

  it("chemical species uses green hues (center has strong green channel)", () => {
    const size = 32;
    const png = generateSnapshot("chemical", "light-particles", { ...DEFAULT_STATE, mood: 50, energy: 80 }, size);
    const pixels = decodePixels(extractIdatData(png), size, size);
    const [r, g, b] = getPixel(pixels, size, size / 2, size / 2);

    // Chemical hue range 90-130 (green) should produce G > R and G > B
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("thermal species uses red/warm hues", () => {
    const size = 32;
    const png = generateSnapshot("thermal", "light-particles", { ...DEFAULT_STATE, mood: 50, energy: 80 }, size);
    const pixels = decodePixels(extractIdatData(png), size, size);
    const [r, g, b] = getPixel(pixels, size, size / 2, size / 2);

    // Thermal hue range 0-40 (red/orange) should produce R as dominant
    expect(r).toBeGreaterThan(b);
  });

  it("different forms produce different glow patterns at the same species", () => {
    const size = 64;
    const brightnesses: number[] = [];

    for (const form of ALL_FORMS) {
      const png = generateSnapshot("chromatic", form, { ...DEFAULT_STATE, energy: 70 }, size);
      const pixels = decodePixels(extractIdatData(png), size, size);
      brightnesses.push(centerBrightness(pixels, size, 4));
    }

    // Not all forms should produce identical center brightness
    const allSame = brightnesses.every(b => Math.abs(b - brightnesses[0]) < 1);
    expect(allSame).toBe(false);
  });
});

// ============================================================
// 4. Edge cases: extreme status values
// ============================================================

describe("edge cases with extreme status values", () => {
  it("all-zero state produces a valid PNG without errors", () => {
    const state: SnapshotState = { mood: 0, energy: 0, curiosity: 0, comfort: 0, density: 0, complexity: 0 };
    const png = generateSnapshot("chromatic", "light-particles", state, 32);
    expect(png[0]).toBe(137); // PNG signature
    expect(png.length).toBeGreaterThan(50);
  });

  it("all-max state produces a valid PNG without errors", () => {
    const state: SnapshotState = { mood: 100, energy: 100, curiosity: 100, comfort: 100, density: 100, complexity: 100 };
    const png = generateSnapshot("vibration", "crystal", state, 32);
    expect(png[0]).toBe(137);
    expect(png.length).toBeGreaterThan(50);
  });

  it("all-zero state produces a very dark image", () => {
    const size = 32;
    const state: SnapshotState = { mood: 0, energy: 0, curiosity: 0, comfort: 0, density: 0, complexity: 0 };
    const png = generateSnapshot("geometric", "mist", state, size);
    const pixels = decodePixels(extractIdatData(png), size, size);

    // With energy=0, the glow should be very dim
    const brightness = averageBrightness(pixels);
    expect(brightness).toBeLessThan(30);
  });

  it("all-max state produces a bright image", () => {
    const size = 32;
    const state: SnapshotState = { mood: 100, energy: 100, curiosity: 100, comfort: 100, density: 100, complexity: 100 };
    const png = generateSnapshot("thermal", "light-particles", state, size);
    const pixels = decodePixels(extractIdatData(png), size, size);

    const brightness = averageBrightness(pixels);
    // Should be brighter than the all-zero case
    expect(brightness).toBeGreaterThan(10);
  });

  it("zero curiosity produces zero sparkles", () => {
    const size = 64;
    const state: SnapshotState = { ...DEFAULT_STATE, curiosity: 0, comfort: 100 };
    const png = generateSnapshot("chemical", "light-particles", state, size);
    const pixels = decodePixels(extractIdatData(png), size, size);

    // With curiosity=0, sparkleCount = floor(0/100 * 24) = 0
    // The image should still be valid (just no sparkles)
    expect(png.length).toBeGreaterThan(50);

    // Compare with curiosity=100 — should have fewer unique colors
    const maxState: SnapshotState = { ...DEFAULT_STATE, curiosity: 100, comfort: 100 };
    const maxPng = generateSnapshot("chemical", "light-particles", maxState, size);
    const maxPixels = decodePixels(extractIdatData(maxPng), size, size);

    expect(countUniqueColors(pixels)).toBeLessThanOrEqual(countUniqueColors(maxPixels));
  });

  it("zero comfort adds edge noise while max comfort is smooth", () => {
    const size = 64;
    const noComfort = generateSnapshot("temporal", "light-particles",
      { ...DEFAULT_STATE, comfort: 0, curiosity: 0 }, size);
    const fullComfort = generateSnapshot("temporal", "light-particles",
      { ...DEFAULT_STATE, comfort: 100, curiosity: 0 }, size);

    // Different comfort levels should produce different images
    expect(noComfort.equals(fullComfort)).toBe(false);
  });

  it("size of 1 pixel produces a valid PNG", () => {
    const png = generateSnapshot("chromatic", "light-particles", DEFAULT_STATE, 1);
    expect(png[0]).toBe(137);

    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(1);
    expect(height).toBe(1);
  });

  it("very small size (2x2) produces valid decompressible data", () => {
    const size = 2;
    const png = generateSnapshot("vibration", "mist", DEFAULT_STATE, size);
    const rawRows = extractIdatData(png);
    const pixels = decodePixels(rawRows, size, size);

    // Should have 4 pixels * 3 channels = 12 bytes
    expect(pixels.length).toBe(12);

    // All pixel values should be valid 0-255
    for (let i = 0; i < pixels.length; i++) {
      expect(pixels[i]).toBeGreaterThanOrEqual(0);
      expect(pixels[i]).toBeLessThanOrEqual(255);
    }
  });
});

// ============================================================
// 5. Output format validation
// ============================================================

describe("PNG output format validation", () => {
  it("starts with the 8-byte PNG signature", () => {
    const png = generateSnapshot("chromatic", "light-particles", DEFAULT_STATE, 32);
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) {
      expect(png[i]).toBe(signature[i]);
    }
  });

  it("IHDR chunk specifies 8-bit RGB color type", () => {
    const png = generateSnapshot("vibration", "crystal", DEFAULT_STATE, 32);

    // IHDR starts at offset 8 (after signature)
    // Length: 4 bytes, Type: 4 bytes ("IHDR"), Data: 13 bytes
    const bitDepth = png[24]; // offset 8 + 4 (length) + 4 (type) + 8 (width+height)
    const colorType = png[25];

    expect(bitDepth).toBe(8);
    expect(colorType).toBe(2); // RGB
  });

  it("IHDR encodes the requested width and height", () => {
    const sizes = [16, 32, 64, 128, 256];
    for (const size of sizes) {
      const png = generateSnapshot("geometric", "fluid", DEFAULT_STATE, size);
      const width = png.readUInt32BE(16);
      const height = png.readUInt32BE(20);
      expect(width).toBe(size);
      expect(height).toBe(size);
    }
  });

  it("ends with an IEND chunk", () => {
    const png = generateSnapshot("thermal", "mist", DEFAULT_STATE, 32);

    // IEND is the last chunk: 4 bytes length (0) + "IEND" + 4 bytes CRC
    const iendType = png.subarray(png.length - 8, png.length - 4).toString("ascii");
    expect(iendType).toBe("IEND");

    // IEND has zero data length
    const iendLength = png.readUInt32BE(png.length - 12);
    expect(iendLength).toBe(0);
  });

  it("chunk structure is well-formed (length + type + data + crc)", () => {
    const png = generateSnapshot("temporal", "sound-echo", DEFAULT_STATE, 16);

    let offset = 8; // skip signature
    const chunks: string[] = [];

    while (offset < png.length) {
      const length = png.readUInt32BE(offset);
      const type = png.subarray(offset + 4, offset + 8).toString("ascii");
      chunks.push(type);

      // Validate type is 4 ASCII characters
      expect(type.length).toBe(4);
      for (const ch of type) {
        const code = ch.charCodeAt(0);
        expect(code).toBeGreaterThanOrEqual(65); // 'A'
        expect(code).toBeLessThanOrEqual(122);   // 'z'
      }

      offset += 4 + 4 + length + 4; // length field + type + data + crc
    }

    // Should contain exactly these chunks in order
    expect(chunks).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("IDAT data can be decompressed back to correct pixel count", () => {
    const size = 48;
    const png = generateSnapshot("chemical", "geometric-cluster", DEFAULT_STATE, size);
    const rawRows = extractIdatData(png);

    // Expected: height rows, each with 1 filter byte + width * 3 RGB bytes
    expect(rawRows.length).toBe(size * (1 + size * 3));
  });

  it("default size is 512x512", () => {
    const png = generateSnapshot("chromatic", "light-particles", DEFAULT_STATE);
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(512);
    expect(height).toBe(512);
  });
});

// ============================================================
// 6. Additional integration-level tests
// ============================================================

describe("snapshot integration behavior", () => {
  it("all 36 species x form combinations produce valid PNGs", () => {
    for (const species of ALL_SPECIES) {
      for (const form of ALL_FORMS) {
        const png = generateSnapshot(species, form, DEFAULT_STATE, 8);
        expect(png[0]).toBe(137);
        expect(png[1]).toBe(80);
        // Should be decompressible
        const rawRows = extractIdatData(png);
        expect(rawRows.length).toBe(8 * (1 + 8 * 3));
      }
    }
  });

  it("background color is very dark (near black at corners)", () => {
    const size = 32;
    const png = generateSnapshot("chromatic", "light-particles",
      { ...DEFAULT_STATE, comfort: 100, curiosity: 0 }, size);
    const pixels = decodePixels(extractIdatData(png), size, size);

    // Corner pixel (0,0) should be very dark (background)
    const [r, g, b] = getPixel(pixels, size, 0, 0);
    const brightness = r * 0.299 + g * 0.587 + b * 0.114;
    expect(brightness).toBeLessThan(25);
  });

  it("density scaling affects glow reach", () => {
    const size = 64;
    const lowDensity = generateSnapshot("vibration", "light-particles",
      { ...DEFAULT_STATE, density: 0, curiosity: 0, comfort: 100 }, size);
    const highDensity = generateSnapshot("vibration", "light-particles",
      { ...DEFAULT_STATE, density: 100, curiosity: 0, comfort: 100 }, size);

    const lowPixels = decodePixels(extractIdatData(lowDensity), size, size);
    const highPixels = decodePixels(extractIdatData(highDensity), size, size);

    // Higher density means larger glow, so overall brightness should be higher
    expect(averageBrightness(highPixels)).toBeGreaterThan(averageBrightness(lowPixels));
  });

  it("crystal form has sharp glow (bright core with rapid falloff)", () => {
    const size = 64;
    const png = generateSnapshot("geometric", "crystal",
      { ...DEFAULT_STATE, energy: 80, comfort: 100, curiosity: 0 }, size);
    const pixels = decodePixels(extractIdatData(png), size, size);

    // Center should be bright
    const centerBr = centerBrightness(pixels, size, 4);
    // Mid-ring should be dimmer
    const midPixel = getPixel(pixels, size, size / 2 + 15, size / 2);
    const midBr = midPixel[0] * 0.299 + midPixel[1] * 0.587 + midPixel[2] * 0.114;

    expect(centerBr).toBeGreaterThan(midBr);
  });

  it("file size grows with image dimensions", () => {
    const sizes = [8, 16, 32, 64, 128];
    const fileSizes: number[] = [];

    for (const size of sizes) {
      const png = generateSnapshot("chromatic", "light-particles", DEFAULT_STATE, size);
      fileSizes.push(png.length);
    }

    // Each subsequent size should produce a larger file
    for (let i = 1; i < fileSizes.length; i++) {
      expect(fileSizes[i]).toBeGreaterThan(fileSizes[i - 1]);
    }
  });
});
