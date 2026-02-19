import { describe, it, expect } from "vitest";
import {
  processImage,
  rgbToHsl,
  computeColorHistogram,
} from "../../src/perception/image-processor.js";

// --- Helper: create solid-color pixel buffer ---
function solidPixels(
  r: number, g: number, b: number,
  width: number, height: number,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

// --- Helper: create gradient pixel buffer (left dark, right bright) ---
function horizontalGradient(width: number, height: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.round((x / (width - 1)) * 255);
      const idx = (y * width + x) * 4;
      pixels[idx] = v;
      pixels[idx + 1] = v;
      pixels[idx + 2] = v;
      pixels[idx + 3] = 255;
    }
  }
  return pixels;
}

// --- Helper: checkerboard pattern for high edge density ---
function checkerboard(
  width: number, height: number, blockSize: number,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isWhite =
        (Math.floor(x / blockSize) + Math.floor(y / blockSize)) % 2 === 0;
      const v = isWhite ? 255 : 0;
      const idx = (y * width + x) * 4;
      pixels[idx] = v;
      pixels[idx + 1] = v;
      pixels[idx + 2] = v;
      pixels[idx + 3] = 255;
    }
  }
  return pixels;
}

// --- Helper: two-color split (top=color1, bottom=color2) ---
function splitImage(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
  width: number, height: number,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const mid = Math.floor(height / 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (y < mid) {
        pixels[idx] = r1; pixels[idx + 1] = g1; pixels[idx + 2] = b1;
      } else {
        pixels[idx] = r2; pixels[idx + 1] = g2; pixels[idx + 2] = b2;
      }
      pixels[idx + 3] = 255;
    }
  }
  return pixels;
}

describe("rgbToHsl", () => {
  it("converts pure red", () => {
    const hsl = rgbToHsl(255, 0, 0);
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);
  });

  it("converts pure green", () => {
    const hsl = rgbToHsl(0, 255, 0);
    expect(hsl.h).toBe(120);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);
  });

  it("converts pure blue", () => {
    const hsl = rgbToHsl(0, 0, 255);
    expect(hsl.h).toBe(240);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);
  });

  it("converts white", () => {
    const hsl = rgbToHsl(255, 255, 255);
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(0);
    expect(hsl.l).toBe(100);
  });

  it("converts black", () => {
    const hsl = rgbToHsl(0, 0, 0);
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(0);
    expect(hsl.l).toBe(0);
  });

  it("converts mid-gray", () => {
    const hsl = rgbToHsl(128, 128, 128);
    expect(hsl.s).toBe(0);
    expect(hsl.l).toBeCloseTo(50.2, 0);
  });

  it("converts orange", () => {
    const hsl = rgbToHsl(255, 165, 0);
    expect(hsl.h).toBeCloseTo(38.8, 0);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);
  });
});

describe("processImage", () => {
  it("throws on insufficient pixel data", () => {
    expect(() => processImage(new Uint8Array(10), 10, 10)).toThrow();
  });

  describe("solid color images", () => {
    it("pure white → brightness 100, contrast 0", () => {
      const pixels = solidPixels(255, 255, 255, 20, 20);
      const f = processImage(pixels, 20, 20);
      expect(f.brightness).toBe(100);
      expect(f.contrast).toBe(0);
    });

    it("pure black → brightness 0, contrast 0", () => {
      const pixels = solidPixels(0, 0, 0, 20, 20);
      const f = processImage(pixels, 20, 20);
      expect(f.brightness).toBe(0);
      expect(f.contrast).toBe(0);
    });

    it("solid red → dominant hue near 0, warm positive", () => {
      const pixels = solidPixels(255, 0, 0, 20, 20);
      const f = processImage(pixels, 20, 20);
      expect(f.dominantHSL.h).toBe(0);
      expect(f.warmth).toBeGreaterThan(0);
    });

    it("solid blue → dominant hue 240, warm negative (cool)", () => {
      const pixels = solidPixels(0, 0, 255, 20, 20);
      const f = processImage(pixels, 20, 20);
      expect(f.dominantHSL.h).toBe(240);
      expect(f.warmth).toBeLessThan(0);
    });

    it("solid color → colorCount 1", () => {
      const pixels = solidPixels(100, 150, 200, 20, 20);
      const f = processImage(pixels, 20, 20);
      expect(f.colorCount).toBe(1);
    });

    it("solid color → no edges", () => {
      const pixels = solidPixels(128, 128, 128, 20, 20);
      const f = processImage(pixels, 20, 20);
      expect(f.edgeDensity).toBe(0);
      expect(f.dominantAngles).toHaveLength(0);
    });
  });

  describe("gradient images", () => {
    it("horizontal gradient → moderate brightness (~50)", () => {
      const pixels = horizontalGradient(40, 40);
      const f = processImage(pixels, 40, 40);
      expect(f.brightness).toBeGreaterThan(40);
      expect(f.brightness).toBeLessThan(60);
    });

    it("horizontal gradient → contrast > 0", () => {
      const pixels = horizontalGradient(40, 40);
      const f = processImage(pixels, 40, 40);
      expect(f.contrast).toBeGreaterThan(10);
    });

    it("horizontal gradient → edges detected", () => {
      const pixels = horizontalGradient(40, 40);
      const f = processImage(pixels, 40, 40);
      expect(f.edgeDensity).toBeGreaterThan(0);
    });

    it("horizontal gradient → quadrant brightness differs left vs right", () => {
      const pixels = horizontalGradient(40, 40);
      const f = processImage(pixels, 40, 40);
      expect(f.quadrantBrightness.topRight).toBeGreaterThan(f.quadrantBrightness.topLeft);
      expect(f.quadrantBrightness.bottomRight).toBeGreaterThan(f.quadrantBrightness.bottomLeft);
    });
  });

  describe("high-contrast images", () => {
    it("checkerboard → high edge density", () => {
      const pixels = checkerboard(40, 40, 4);
      const f = processImage(pixels, 40, 40);
      expect(f.edgeDensity).toBeGreaterThan(20);
    });

    it("top-white/bottom-black split → quadrant brightness reflects split", () => {
      const pixels = splitImage(255, 255, 255, 0, 0, 0, 40, 40);
      const f = processImage(pixels, 40, 40);
      expect(f.quadrantBrightness.topLeft).toBeGreaterThan(80);
      expect(f.quadrantBrightness.bottomLeft).toBeLessThan(20);
    });

    it("split red/blue → multiple colors and warmth near 0", () => {
      const pixels = splitImage(255, 0, 0, 0, 0, 255, 40, 40);
      const f = processImage(pixels, 40, 40);
      expect(f.colorCount).toBeGreaterThanOrEqual(2);
      // Warmth should be close to zero (warm + cool cancel)
      expect(Math.abs(f.warmth)).toBeLessThan(50);
    });
  });

  describe("output ranges", () => {
    it("all values within expected ranges", () => {
      const pixels = horizontalGradient(60, 40);
      const f = processImage(pixels, 60, 40);

      expect(f.brightness).toBeGreaterThanOrEqual(0);
      expect(f.brightness).toBeLessThanOrEqual(100);
      expect(f.contrast).toBeGreaterThanOrEqual(0);
      expect(f.contrast).toBeLessThanOrEqual(100);
      expect(f.edgeDensity).toBeGreaterThanOrEqual(0);
      expect(f.edgeDensity).toBeLessThanOrEqual(100);
      expect(f.warmth).toBeGreaterThanOrEqual(-100);
      expect(f.warmth).toBeLessThanOrEqual(100);
      expect(f.colorCount).toBeGreaterThanOrEqual(0);

      expect(f.dominantHSL.h).toBeGreaterThanOrEqual(0);
      expect(f.dominantHSL.h).toBeLessThanOrEqual(360);
      expect(f.dominantHSL.s).toBeGreaterThanOrEqual(0);
      expect(f.dominantHSL.s).toBeLessThanOrEqual(100);
      expect(f.dominantHSL.l).toBeGreaterThanOrEqual(0);
      expect(f.dominantHSL.l).toBeLessThanOrEqual(100);

      for (const angle of f.dominantAngles) {
        expect(angle).toBeGreaterThanOrEqual(0);
        expect(angle).toBeLessThanOrEqual(180);
      }
    });
  });
});

describe("computeColorHistogram", () => {
  it("solid image → one dominant cluster", () => {
    const pixels = solidPixels(200, 100, 50, 20, 20);
    const hist = computeColorHistogram(pixels, 20, 20, 4);
    expect(hist.length).toBeGreaterThanOrEqual(1);
    // Dominant cluster should have high percentage
    expect(hist[0].percentage).toBeGreaterThan(50);
  });

  it("two-color image → at least two clusters", () => {
    const pixels = splitImage(255, 0, 0, 0, 0, 255, 20, 20);
    const hist = computeColorHistogram(pixels, 20, 20, 4);
    const significant = hist.filter(c => c.percentage > 10);
    expect(significant.length).toBeGreaterThanOrEqual(2);
  });

  it("percentages sum to approximately 100", () => {
    const pixels = solidPixels(100, 100, 100, 20, 20);
    const hist = computeColorHistogram(pixels, 20, 20, 8);
    const total = hist.reduce((sum, c) => sum + c.percentage, 0);
    expect(total).toBeCloseTo(100, 0);
  });

  it("handles empty image", () => {
    const hist = computeColorHistogram(new Uint8ClampedArray(0), 0, 0, 4);
    expect(hist).toHaveLength(0);
  });

  it("sorted by percentage descending", () => {
    const pixels = splitImage(255, 0, 0, 0, 255, 0, 40, 40);
    const hist = computeColorHistogram(pixels, 40, 40, 4);
    for (let i = 1; i < hist.length; i++) {
      expect(hist[i].percentage).toBeLessThanOrEqual(hist[i - 1].percentage);
    }
  });
});
