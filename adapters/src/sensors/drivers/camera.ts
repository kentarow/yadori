/**
 * Camera Driver — Pi Camera or USB webcam.
 *
 * Captures a low-resolution frame and passes it through the image processor.
 * Uses libcamera-still (RPi OS Bookworm+) or raspistill (legacy).
 *
 * The entity never sees the image. Only extracted features
 * (color histogram, edge density, brightness) are passed to perception.
 */

import type { SensorDriver, SensorDriverConfig, SensorDetectionResult } from "../../../../engine/src/perception/sensor-driver.js";
import type { RawInput, ImageInputData } from "../../../../engine/src/perception/perception-types.js";
import { processImage } from "../../../../engine/src/perception/image-processor.js";
import { commandExists, execBuffer } from "../exec-helper.js";

const DEFAULT_CONFIG: SensorDriverConfig = {
  id: "camera",
  name: "pi-camera",
  modality: "image",
  pollIntervalMs: 60000, // Every 60 seconds
  enabled: true,
};

/** Which capture command is available */
let captureCmd: "libcamera-still" | "raspistill" | "fswebcam" | null = null;

export function createCameraDriver(config?: Partial<SensorDriverConfig>): SensorDriver {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return {
    config: cfg,

    async detect(): Promise<SensorDetectionResult> {
      // Try libcamera-still (RPi OS Bookworm+)
      if (await commandExists("libcamera-still")) {
        captureCmd = "libcamera-still";
        return { available: true, details: "libcamera-still" };
      }

      // Try raspistill (legacy RPi OS)
      if (await commandExists("raspistill")) {
        captureCmd = "raspistill";
        return { available: true, details: "raspistill (legacy)" };
      }

      // Try fswebcam (USB webcam on any Linux)
      if (await commandExists("fswebcam")) {
        captureCmd = "fswebcam";
        return { available: true, details: "fswebcam (USB)" };
      }

      return { available: false, reason: "No camera command found (libcamera-still, raspistill, fswebcam)" };
    },

    async start(): Promise<void> {
      // Nothing to initialize
    },

    async read(): Promise<RawInput | null> {
      if (!captureCmd) return null;

      try {
        // Capture a small raw RGB image
        // We use BMP format for easy parsing (no compression, known header)
        const width = 160;
        const height = 120;

        let bmpBuffer: Buffer;

        if (captureCmd === "libcamera-still") {
          bmpBuffer = await execBuffer("libcamera-still", [
            "-o", "-",            // stdout
            "--width", String(width),
            "--height", String(height),
            "--timeout", "1000",  // 1 second
            "-n",                 // no preview
            "--encoding", "bmp",
          ], 10000);
        } else if (captureCmd === "raspistill") {
          bmpBuffer = await execBuffer("raspistill", [
            "-o", "-",
            "-w", String(width),
            "-h", String(height),
            "-t", "1000",
            "-n",
            "-e", "bmp",
          ], 10000);
        } else {
          // fswebcam outputs BMP
          bmpBuffer = await execBuffer("fswebcam", [
            "-r", `${width}x${height}`,
            "--no-banner",
            "--bmp",
            "-",
          ], 10000);
        }

        // Parse BMP to raw RGBA pixels
        const pixels = parseBmpToRGBA(bmpBuffer, width, height);
        if (!pixels) return null;

        // Process through image processor (Honest Perception)
        const features = processImage(pixels, width, height);

        const data: ImageInputData = {
          type: "image",
          width,
          height,
          dominantHSL: [features.dominantHSL.h, features.dominantHSL.s, features.dominantHSL.l],
          colorHistogram: features.colorHistogram.map(c => ({
            h: c.hsl.h,
            s: c.hsl.s,
            l: c.hsl.l,
            pct: c.percentage,
          })),
          edgeDensity: features.edgeDensity / 100,
          dominantAngles: features.dominantAngles,
          brightness: features.brightness / 100,
          quadrantBrightness: [
            features.quadrantBrightness.topLeft / 100,
            features.quadrantBrightness.topRight / 100,
            features.quadrantBrightness.bottomLeft / 100,
            features.quadrantBrightness.bottomRight / 100,
          ],
        };

        return {
          modality: "image",
          timestamp: new Date().toISOString(),
          source: cfg.name,
          data,
        };
      } catch {
        return null;
      }
    },

    async stop(): Promise<void> {
      // Nothing to release
    },
  };
}

/**
 * Parse a BMP file buffer to RGBA pixel array.
 * BMP stores pixels bottom-up in BGR format.
 */
function parseBmpToRGBA(buf: Buffer, expectedW: number, expectedH: number): Uint8ClampedArray | null {
  if (buf.length < 54) return null;

  // BMP header
  const dataOffset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const height = Math.abs(buf.readInt32LE(22));
  const bitsPerPixel = buf.readUInt16LE(28);

  if (bitsPerPixel !== 24 && bitsPerPixel !== 32) return null;

  const bytesPerPixel = bitsPerPixel / 8;
  const rowSize = Math.ceil((width * bytesPerPixel) / 4) * 4; // Rows padded to 4 bytes
  const pixels = new Uint8ClampedArray(width * height * 4);

  const isTopDown = buf.readInt32LE(22) < 0;

  for (let y = 0; y < height; y++) {
    const srcRow = isTopDown ? y : height - 1 - y;
    const srcOffset = dataOffset + srcRow * rowSize;

    for (let x = 0; x < width; x++) {
      const srcIdx = srcOffset + x * bytesPerPixel;
      const dstIdx = (y * width + x) * 4;

      if (srcIdx + 2 < buf.length) {
        pixels[dstIdx] = buf[srcIdx + 2];     // R (BMP stores BGR)
        pixels[dstIdx + 1] = buf[srcIdx + 1]; // G
        pixels[dstIdx + 2] = buf[srcIdx];     // B
        pixels[dstIdx + 3] = 255;             // A
      }
    }
  }

  return pixels;
}
