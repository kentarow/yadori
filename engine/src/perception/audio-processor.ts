/**
 * Audio Processor — Extracts features from raw PCM audio data.
 *
 * This is the REAL preprocessing that makes Honest Perception work for audio.
 * Raw PCM samples go in; numerical features come out.
 * The LLM never hears the audio — only these extracted numbers.
 *
 * No external dependencies. Pure TypeScript computation.
 * Includes a basic FFT implementation for frequency analysis.
 */

import type { AudioFeatures } from "../types.js";

// --- Public API ---

/**
 * Process raw PCM audio samples into audio features.
 * Input: mono channel, values normalized to -1..1.
 */
export function processAudio(
  samples: Float32Array,
  sampleRate: number,
): AudioFeatures {
  if (samples.length === 0) {
    return {
      duration: 0,
      amplitude: 0,
      bands: { bass: 0, mid: 0, treble: 0 },
      bpm: 0,
      beatRegularity: 0,
      harmonicRichness: 0,
      zeroCrossingRate: 0,
      spectralCentroid: 0,
    };
  }

  const duration = samples.length / sampleRate;

  // RMS amplitude
  let rmsSum = 0;
  for (let i = 0; i < samples.length; i++) {
    rmsSum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(rmsSum / samples.length);
  const amplitude = Math.min(100, rms * 100 * Math.SQRT2); // Scale so 1.0 peak sine ~ 100

  // Zero crossing rate
  let zeroCrossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i] >= 0) !== (samples[i - 1] >= 0)) {
      zeroCrossings++;
    }
  }
  // Normalize: max possible is samples.length-1
  const zeroCrossingRate = Math.min(
    100,
    (zeroCrossings / (samples.length - 1)) * 100,
  );

  // Frequency analysis via FFT
  const { bands, harmonicRichness, spectralCentroid } = analyzeSpectrum(
    samples,
    sampleRate,
  );

  // BPM estimation
  const { bpm, regularity } = estimateBPM(samples, sampleRate);

  return {
    duration: round2(duration),
    amplitude: round2(amplitude),
    bands: {
      bass: round2(bands.bass),
      mid: round2(bands.mid),
      treble: round2(bands.treble),
    },
    bpm: round2(bpm),
    beatRegularity: round2(regularity),
    harmonicRichness: round2(harmonicRichness),
    zeroCrossingRate: round2(zeroCrossingRate),
    spectralCentroid: round2(spectralCentroid),
  };
}

// --- FFT Implementation ---

/**
 * In-place Cooley-Tukey FFT (radix-2, decimation-in-time).
 * Both real and imag arrays must be the same power-of-2 length.
 * After calling, real[k] + i*imag[k] is the k-th frequency bin.
 */
export function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;

  if (n <= 1) return;

  // Verify power of 2
  if ((n & (n - 1)) !== 0) {
    throw new Error(`FFT size must be a power of 2, got ${n}`);
  }

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      // Swap real
      let temp = real[i];
      real[i] = real[j];
      real[j] = temp;
      // Swap imag
      temp = imag[i];
      imag[i] = imag[j];
      imag[j] = temp;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  // Butterfly operations
  for (let size = 2; size <= n; size <<= 1) {
    const halfSize = size >> 1;
    const angleStep = (-2 * Math.PI) / size;

    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < halfSize; k++) {
        const angle = angleStep * k;
        const twiddleReal = Math.cos(angle);
        const twiddleImag = Math.sin(angle);

        const evenIdx = i + k;
        const oddIdx = i + k + halfSize;

        const tReal = twiddleReal * real[oddIdx] - twiddleImag * imag[oddIdx];
        const tImag = twiddleReal * imag[oddIdx] + twiddleImag * real[oddIdx];

        real[oddIdx] = real[evenIdx] - tReal;
        imag[oddIdx] = imag[evenIdx] - tImag;
        real[evenIdx] = real[evenIdx] + tReal;
        imag[evenIdx] = imag[evenIdx] + tImag;
      }
    }
  }
}

// --- BPM Estimation ---

/**
 * Estimate BPM using onset detection with energy-based approach.
 * Returns estimated BPM and regularity (0-100).
 */
export function estimateBPM(
  samples: Float32Array,
  sampleRate: number,
): { bpm: number; regularity: number } {
  const duration = samples.length / sampleRate;

  // Need at least 2 seconds for meaningful BPM estimation
  if (duration < 2) {
    return { bpm: 0, regularity: 0 };
  }

  // Compute energy envelope using windowed RMS
  const windowSize = Math.floor(sampleRate * 0.02); // 20ms windows
  const hopSize = Math.floor(windowSize / 2);
  const envelopeLength = Math.floor((samples.length - windowSize) / hopSize) + 1;

  if (envelopeLength < 4) {
    return { bpm: 0, regularity: 0 };
  }

  const envelope = new Float64Array(envelopeLength);

  for (let i = 0; i < envelopeLength; i++) {
    const start = i * hopSize;
    let sum = 0;
    for (let j = 0; j < windowSize && start + j < samples.length; j++) {
      sum += samples[start + j] * samples[start + j];
    }
    envelope[i] = Math.sqrt(sum / windowSize);
  }

  // Onset detection: find peaks in the energy difference
  const diff = new Float64Array(envelopeLength - 1);
  for (let i = 0; i < diff.length; i++) {
    diff[i] = Math.max(0, envelope[i + 1] - envelope[i]); // Half-wave rectify
  }

  // Find onsets (local maxima in diff that exceed a threshold)
  const mean = diff.reduce((a, b) => a + b, 0) / diff.length;
  const threshold = mean * 1.5;
  const onsetTimes: number[] = [];

  for (let i = 1; i < diff.length - 1; i++) {
    if (diff[i] > threshold && diff[i] > diff[i - 1] && diff[i] >= diff[i + 1]) {
      const timeInSeconds = (i * hopSize) / sampleRate;
      // Minimum 0.15s between onsets (max ~400 BPM)
      if (
        onsetTimes.length === 0 ||
        timeInSeconds - onsetTimes[onsetTimes.length - 1] > 0.15
      ) {
        onsetTimes.push(timeInSeconds);
      }
    }
  }

  if (onsetTimes.length < 2) {
    return { bpm: 0, regularity: 0 };
  }

  // Compute inter-onset intervals
  const intervals: number[] = [];
  for (let i = 1; i < onsetTimes.length; i++) {
    intervals.push(onsetTimes[i] - onsetTimes[i - 1]);
  }

  // Find most common interval using histogram
  // BPM range: 40-220 => interval range: 0.27s - 1.5s
  const BPM_MIN = 40;
  const BPM_MAX = 220;
  const INTERVAL_MIN = 60 / BPM_MAX; // ~0.27s
  const INTERVAL_MAX = 60 / BPM_MIN; // 1.5s

  // Filter intervals to reasonable BPM range
  const validIntervals = intervals.filter(
    iv => iv >= INTERVAL_MIN && iv <= INTERVAL_MAX,
  );

  if (validIntervals.length === 0) {
    return { bpm: 0, regularity: 0 };
  }

  // Median interval
  const sorted = [...validIntervals].sort((a, b) => a - b);
  const medianInterval = sorted[Math.floor(sorted.length / 2)];
  const bpm = 60 / medianInterval;

  // Beat regularity: how consistent are the intervals?
  // Compute coefficient of variation (lower = more regular)
  const meanInterval =
    validIntervals.reduce((a, b) => a + b, 0) / validIntervals.length;
  let varSum = 0;
  for (const iv of validIntervals) {
    const diff = iv - meanInterval;
    varSum += diff * diff;
  }
  const cv = Math.sqrt(varSum / validIntervals.length) / meanInterval;
  // cv=0 is perfectly regular, cv=1 is very irregular
  // Map to 0-100 where 100 = perfectly regular
  const regularity = Math.max(0, Math.min(100, (1 - cv) * 100));

  return {
    bpm: Math.round(bpm),
    regularity: round2(regularity),
  };
}

// --- Internal helpers ---

/**
 * Analyze the frequency spectrum of audio samples.
 * Returns band energies, harmonic richness, and spectral centroid.
 */
function analyzeSpectrum(
  samples: Float32Array,
  sampleRate: number,
): {
  bands: { bass: number; mid: number; treble: number };
  harmonicRichness: number;
  spectralCentroid: number;
} {
  // Choose FFT size: nearest power of 2 that fits, capped at 8192
  const maxFFTSize = 8192;
  let fftSize = 1;
  while (fftSize * 2 <= Math.min(samples.length, maxFFTSize)) {
    fftSize *= 2;
  }

  if (fftSize < 2) {
    return {
      bands: { bass: 0, mid: 0, treble: 0 },
      harmonicRichness: 0,
      spectralCentroid: 0,
    };
  }

  // Apply Hann window and prepare FFT buffers
  const real = new Float64Array(fftSize);
  const imag = new Float64Array(fftSize);

  for (let i = 0; i < fftSize; i++) {
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    real[i] = samples[i] * window;
  }

  fft(real, imag);

  // Compute magnitude spectrum (only first half — positive frequencies)
  const halfN = fftSize / 2;
  const magnitudes = new Float64Array(halfN);
  const binFreqStep = sampleRate / fftSize;

  let totalEnergy = 0;
  let weightedFreqSum = 0;

  for (let k = 0; k < halfN; k++) {
    const mag = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
    magnitudes[k] = mag;
    const freq = k * binFreqStep;
    totalEnergy += mag;
    weightedFreqSum += mag * freq;
  }

  // Spectral centroid
  const spectralCentroid = totalEnergy > 0 ? weightedFreqSum / totalEnergy : 0;

  // Band energies
  // Bass: 20-250 Hz, Mid: 250-4000 Hz, Treble: 4000-20000 Hz
  const bassLow = Math.max(1, Math.floor(20 / binFreqStep));
  const bassMid = Math.floor(250 / binFreqStep);
  const midHigh = Math.floor(4000 / binFreqStep);
  const trebleHigh = Math.min(halfN - 1, Math.floor(20000 / binFreqStep));

  let bassEnergy = 0;
  let midEnergy = 0;
  let trebleEnergy = 0;

  for (let k = bassLow; k <= Math.min(bassMid, halfN - 1); k++) {
    bassEnergy += magnitudes[k];
  }
  for (let k = bassMid + 1; k <= Math.min(midHigh, halfN - 1); k++) {
    midEnergy += magnitudes[k];
  }
  for (let k = midHigh + 1; k <= trebleHigh; k++) {
    trebleEnergy += magnitudes[k];
  }

  // Normalize band energies relative to total (scale to 0-100)
  if (totalEnergy > 0) {
    bassEnergy = (bassEnergy / totalEnergy) * 100;
    midEnergy = (midEnergy / totalEnergy) * 100;
    trebleEnergy = (trebleEnergy / totalEnergy) * 100;
  }

  // Harmonic richness: spectral flatness inverse
  // Flat spectrum (noise) = low richness, peaked spectrum (tonal) = high richness
  // Use ratio of geometric mean to arithmetic mean of magnitudes
  let logSum = 0;
  let validBins = 0;
  for (let k = 1; k < halfN; k++) {
    if (magnitudes[k] > 0) {
      logSum += Math.log(magnitudes[k]);
      validBins++;
    }
  }

  let harmonicRichness = 0;
  if (validBins > 0 && totalEnergy > 0) {
    const geometricMean = Math.exp(logSum / validBins);
    const arithmeticMean = totalEnergy / halfN;
    const flatness = arithmeticMean > 0 ? geometricMean / arithmeticMean : 0;
    // flatness close to 1 = flat (noise), close to 0 = peaked (tonal)
    // Invert: high richness = tonal/peaked spectrum
    harmonicRichness = Math.min(100, (1 - flatness) * 100);
  }

  return {
    bands: {
      bass: Math.min(100, bassEnergy),
      mid: Math.min(100, midEnergy),
      treble: Math.min(100, trebleEnergy),
    },
    harmonicRichness,
    spectralCentroid,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
