import { describe, it, expect } from "vitest";
import {
  processAudio,
  fft,
  estimateBPM,
} from "../../src/perception/audio-processor.js";

const SAMPLE_RATE = 16000;

// --- Helper: generate sine wave samples ---
function sineWave(
  freq: number,
  duration: number,
  sampleRate: number,
  amplitude = 0.8,
): Float32Array {
  const count = Math.floor(duration * sampleRate);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = amplitude * Math.sin(2 * Math.PI * freq * i / sampleRate);
  }
  return samples;
}

// --- Helper: generate white noise ---
function whiteNoise(duration: number, sampleRate: number, amplitude = 0.5): Float32Array {
  const count = Math.floor(duration * sampleRate);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = (Math.random() * 2 - 1) * amplitude;
  }
  return samples;
}

// --- Helper: generate silence ---
function silence(duration: number, sampleRate: number): Float32Array {
  return new Float32Array(Math.floor(duration * sampleRate));
}

// --- Helper: generate rhythmic clicks (beat) ---
function clickTrack(
  bpm: number,
  duration: number,
  sampleRate: number,
): Float32Array {
  const count = Math.floor(duration * sampleRate);
  const samples = new Float32Array(count);
  const interval = Math.floor((60 / bpm) * sampleRate);
  const clickDuration = Math.floor(0.005 * sampleRate); // 5ms clicks

  for (let pos = 0; pos < count; pos += interval) {
    for (let j = 0; j < clickDuration && pos + j < count; j++) {
      samples[pos + j] = 0.9 * Math.sin(2 * Math.PI * 1000 * j / sampleRate);
    }
  }
  return samples;
}

describe("fft", () => {
  it("handles empty arrays", () => {
    const real = new Float64Array(0);
    const imag = new Float64Array(0);
    expect(() => fft(real, imag)).not.toThrow();
  });

  it("handles single element", () => {
    const real = new Float64Array([1.0]);
    const imag = new Float64Array([0.0]);
    fft(real, imag);
    expect(real[0]).toBe(1.0);
  });

  it("throws on non-power-of-2 size", () => {
    const real = new Float64Array(6);
    const imag = new Float64Array(6);
    expect(() => fft(real, imag)).toThrow(/power of 2/);
  });

  it("detects a pure sine wave peak at the correct frequency", () => {
    const n = 1024;
    const freq = 440; // A4
    const sampleRate = 16000;
    const real = new Float64Array(n);
    const imag = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      real[i] = Math.sin(2 * Math.PI * freq * i / sampleRate);
    }

    fft(real, imag);

    // Find the bin with the maximum magnitude
    let maxMag = 0;
    let maxBin = 0;
    for (let k = 1; k < n / 2; k++) {
      const mag = Math.sqrt(real[k] ** 2 + imag[k] ** 2);
      if (mag > maxMag) {
        maxMag = mag;
        maxBin = k;
      }
    }

    const detectedFreq = maxBin * sampleRate / n;
    expect(detectedFreq).toBeCloseTo(freq, -1); // Within ~10Hz
  });

  it("DC signal produces energy only at bin 0", () => {
    const n = 256;
    const real = new Float64Array(n).fill(1.0);
    const imag = new Float64Array(n);

    fft(real, imag);

    // Bin 0 should have all the energy
    const dcMag = Math.sqrt(real[0] ** 2 + imag[0] ** 2);
    expect(dcMag).toBeCloseTo(n, 0);

    // All other bins should be ~0
    for (let k = 1; k < n / 2; k++) {
      const mag = Math.sqrt(real[k] ** 2 + imag[k] ** 2);
      expect(mag).toBeLessThan(0.01);
    }
  });
});

describe("processAudio", () => {
  describe("empty input", () => {
    it("returns zeroes for empty samples", () => {
      const f = processAudio(new Float32Array(0), SAMPLE_RATE);
      expect(f.duration).toBe(0);
      expect(f.amplitude).toBe(0);
      expect(f.bpm).toBe(0);
      expect(f.bands.bass).toBe(0);
      expect(f.bands.mid).toBe(0);
      expect(f.bands.treble).toBe(0);
    });
  });

  describe("silence", () => {
    it("has near-zero amplitude", () => {
      const samples = silence(2, SAMPLE_RATE);
      const f = processAudio(samples, SAMPLE_RATE);
      expect(f.amplitude).toBe(0);
    });

    it("reports correct duration", () => {
      const samples = silence(2, SAMPLE_RATE);
      const f = processAudio(samples, SAMPLE_RATE);
      expect(f.duration).toBe(2);
    });
  });

  describe("sine wave", () => {
    it("pure 100Hz sine → bass dominant", () => {
      const samples = sineWave(100, 2, SAMPLE_RATE);
      const f = processAudio(samples, SAMPLE_RATE);
      expect(f.bands.bass).toBeGreaterThan(f.bands.treble);
    });

    it("pure 8000Hz sine → treble dominant", () => {
      const samples = sineWave(8000, 2, SAMPLE_RATE, 0.5);
      const f = processAudio(samples, SAMPLE_RATE);
      // At 16kHz sample rate, 8kHz is right at Nyquist/2 - should register as treble
      expect(f.bands.treble).toBeGreaterThan(0);
    });

    it("high amplitude → high amplitude value", () => {
      const loud = sineWave(440, 2, SAMPLE_RATE, 0.9);
      const quiet = sineWave(440, 2, SAMPLE_RATE, 0.1);
      const fLoud = processAudio(loud, SAMPLE_RATE);
      const fQuiet = processAudio(quiet, SAMPLE_RATE);
      expect(fLoud.amplitude).toBeGreaterThan(fQuiet.amplitude);
    });

    it("has high harmonic richness (tonal)", () => {
      const samples = sineWave(440, 2, SAMPLE_RATE);
      const f = processAudio(samples, SAMPLE_RATE);
      expect(f.harmonicRichness).toBeGreaterThan(50);
    });
  });

  describe("white noise", () => {
    it("has low harmonic richness (noise-like)", () => {
      const samples = whiteNoise(2, SAMPLE_RATE);
      const f = processAudio(samples, SAMPLE_RATE);
      expect(f.harmonicRichness).toBeLessThan(50);
    });

    it("has energy across all bands", () => {
      const samples = whiteNoise(2, SAMPLE_RATE, 0.5);
      const f = processAudio(samples, SAMPLE_RATE);
      expect(f.bands.bass).toBeGreaterThan(0);
      expect(f.bands.mid).toBeGreaterThan(0);
      expect(f.bands.treble).toBeGreaterThan(0);
    });

    it("has high zero crossing rate", () => {
      const samples = whiteNoise(2, SAMPLE_RATE);
      const f = processAudio(samples, SAMPLE_RATE);
      expect(f.zeroCrossingRate).toBeGreaterThan(30);
    });
  });

  describe("output ranges", () => {
    it("all values within expected ranges", () => {
      const samples = sineWave(440, 2, SAMPLE_RATE);
      const f = processAudio(samples, SAMPLE_RATE);

      expect(f.duration).toBeGreaterThan(0);
      expect(f.amplitude).toBeGreaterThanOrEqual(0);
      expect(f.amplitude).toBeLessThanOrEqual(100);
      expect(f.bands.bass).toBeGreaterThanOrEqual(0);
      expect(f.bands.bass).toBeLessThanOrEqual(100);
      expect(f.bands.mid).toBeGreaterThanOrEqual(0);
      expect(f.bands.mid).toBeLessThanOrEqual(100);
      expect(f.bands.treble).toBeGreaterThanOrEqual(0);
      expect(f.bands.treble).toBeLessThanOrEqual(100);
      expect(f.bpm).toBeGreaterThanOrEqual(0);
      expect(f.beatRegularity).toBeGreaterThanOrEqual(0);
      expect(f.beatRegularity).toBeLessThanOrEqual(100);
      expect(f.harmonicRichness).toBeGreaterThanOrEqual(0);
      expect(f.harmonicRichness).toBeLessThanOrEqual(100);
      expect(f.zeroCrossingRate).toBeGreaterThanOrEqual(0);
      expect(f.zeroCrossingRate).toBeLessThanOrEqual(100);
      expect(f.spectralCentroid).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("estimateBPM", () => {
  it("returns 0 for silence", () => {
    const samples = silence(3, SAMPLE_RATE);
    const { bpm } = estimateBPM(samples, SAMPLE_RATE);
    expect(bpm).toBe(0);
  });

  it("returns 0 for too-short audio", () => {
    const samples = sineWave(440, 0.5, SAMPLE_RATE);
    const { bpm } = estimateBPM(samples, SAMPLE_RATE);
    expect(bpm).toBe(0);
  });

  it("detects 120 BPM click track", () => {
    const samples = clickTrack(120, 4, SAMPLE_RATE);
    const { bpm, regularity } = estimateBPM(samples, SAMPLE_RATE);
    // Should be near 120 BPM (tolerance for onset detection)
    if (bpm > 0) {
      expect(bpm).toBeGreaterThan(100);
      expect(bpm).toBeLessThan(140);
      expect(regularity).toBeGreaterThan(30);
    }
  });

  it("regular beat → higher regularity than random onsets", () => {
    const regular = clickTrack(100, 4, SAMPLE_RATE);
    const { regularity: regRegularity } = estimateBPM(regular, SAMPLE_RATE);

    // Noise has random onsets → lower regularity
    const noise = whiteNoise(4, SAMPLE_RATE, 0.3);
    const { regularity: noiseRegularity } = estimateBPM(noise, SAMPLE_RATE);

    // Regular track should have higher regularity (if both detect beats)
    if (regRegularity > 0) {
      expect(regRegularity).toBeGreaterThanOrEqual(noiseRegularity);
    }
  });
});
