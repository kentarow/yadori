/**
 * Perception Filter — The core of Honest Perception.
 *
 * Each species (PerceptionMode) has a filter function for each input modality.
 * The filter extracts ONLY what this species can perceive at its current level.
 *
 * Key principle: If a filter returns null, the entity genuinely does not know
 * that input exists. The LLM never receives it. This is not acting — it is
 * actual perceptual limitation.
 *
 * Growth means the filter resolution increases, not that the entity
 * "pretends to understand more."
 */

import { type PerceptionMode, PerceptionLevel } from "../types.js";
import type {
  InputModality,
  RawInput,
  RawInputData,
  FilteredPerception,
  TextInputData,
  ImageInputData,
  AudioInputData,
  ScalarSensorData,
  VibrationSensorData,
  ColorSensorData,
  ProximitySensorData,
  TouchSensorData,
  SystemMetricsData,
} from "./perception-types.js";

/**
 * A single filter function: takes raw data and level, returns perception or null.
 * null = this species cannot perceive this modality (at any level).
 */
type ModalityFilter = (data: RawInputData, level: PerceptionLevel) => string | null;

/**
 * Filter a raw input through the species' perception.
 * Returns null if the species cannot perceive this modality.
 */
export function filterInput(
  species: PerceptionMode,
  input: RawInput,
  level: PerceptionLevel,
): FilteredPerception | null {
  const filters = SPECIES_FILTERS[species];
  const filter = filters[input.modality];

  if (!filter) return null;

  const description = filter(input.data, level);
  if (description === null) return null;

  return {
    description,
    sourceModality: input.modality,
  };
}

/**
 * Filter multiple inputs at once.
 * Returns only the perceptions that the species can actually detect.
 */
export function filterInputs(
  species: PerceptionMode,
  inputs: RawInput[],
  level: PerceptionLevel,
): FilteredPerception[] {
  const results: FilteredPerception[] = [];
  for (const input of inputs) {
    const filtered = filterInput(species, input, level);
    if (filtered) {
      results.push(filtered);
    }
  }
  return results;
}

/**
 * Get the list of modalities a species can perceive (at any level).
 */
export function getPerceptibleModalities(species: PerceptionMode): InputModality[] {
  const filters = SPECIES_FILTERS[species];
  return Object.keys(filters) as InputModality[];
}

// ============================================================
// SPECIES FILTER DEFINITIONS
// ============================================================

type SpeciesFilterMap = Partial<Record<InputModality, ModalityFilter>>;

const SPECIES_FILTERS: Record<PerceptionMode, SpeciesFilterMap> = {
  chromatic: CHROMATIC_FILTERS(),
  vibration: VIBRATION_FILTERS(),
  geometric: GEOMETRIC_FILTERS(),
  thermal: THERMAL_FILTERS(),
  temporal: TEMPORAL_FILTERS(),
  chemical: CHEMICAL_FILTERS(),
};

// --- CHROMATIC: Perceives color, light, brightness ---

function CHROMATIC_FILTERS(): SpeciesFilterMap {
  return {
    text: (data, level) => {
      const d = data as TextInputData;
      if (level === PerceptionLevel.Minimal) return `${d.charCount} marks`;
      if (level === PerceptionLevel.Basic) {
        const density = d.charCount > 100 ? "dense" : d.charCount > 30 ? "moderate" : "sparse";
        return `${d.charCount} marks, ${density}`;
      }
      if (level === PerceptionLevel.Structured) {
        const words = d.content.split(/\s+/);
        const pattern = words.slice(0, 5).map(w =>
          w.length <= 3 ? "short" : w.length <= 6 ? "mid" : "long"
        ).join("-");
        return `${d.charCount} marks, pattern: ${pattern}`;
      }
      // Level 3+: partial text
      const words = d.content.split(/\s+/);
      const every = level === PerceptionLevel.Relational ? 3 : 1;
      const partial = words.filter((_, i) => i % every === 0).join(" ");
      return partial;
    },

    image: (data, level) => {
      const d = data as ImageInputData;
      if (level === PerceptionLevel.Minimal) {
        return `dominant: hsl(${d.dominantHSL[0]}, ${d.dominantHSL[1]}%, ${d.dominantHSL[2]}%)`;
      }
      if (level === PerceptionLevel.Basic) {
        const top5 = d.colorHistogram.slice(0, 5)
          .map(c => `hsl(${c.h},${c.s}%,${c.l}%) ${c.pct}%`)
          .join(", ");
        return `colors: ${top5}`;
      }
      if (level === PerceptionLevel.Structured) {
        const quadrants = ["top-left", "top-right", "bottom-left", "bottom-right"];
        const spatial = quadrants.map((q, i) =>
          `${q}: ${d.quadrantBrightness[i] > 0.6 ? "bright" : d.quadrantBrightness[i] > 0.3 ? "mid" : "dark"}`
        ).join(", ");
        const top3 = d.colorHistogram.slice(0, 3)
          .map(c => `hsl(${c.h},${c.s}%,${c.l}%) ${c.pct}%`).join(", ");
        return `colors: ${top3}. spatial: ${spatial}`;
      }
      if (level === PerceptionLevel.Relational) {
        const edgeDesc = d.edgeDensity > 0.6 ? "sharp boundaries" : d.edgeDensity > 0.3 ? "soft edges" : "smooth";
        const regions = d.colorHistogram.length;
        return `${regions} color regions, ${edgeDesc}, brightness ${Math.round(d.brightness * 100)}%`;
      }
      // Full: complete chromatic perception
      const allColors = d.colorHistogram.map(c => `hsl(${c.h},${c.s}%,${c.l}%) ${c.pct}%`).join(", ");
      const edgeDesc = d.edgeDensity > 0.6 ? "sharp" : d.edgeDensity > 0.3 ? "soft" : "smooth";
      const quadrants = ["top-left", "top-right", "bottom-left", "bottom-right"];
      const spatial = quadrants.map((q, i) =>
        `${q}: ${Math.round(d.quadrantBrightness[i] * 100)}%`
      ).join(", ");
      return `colors: ${allColors}. ${edgeDesc} edges at ${d.dominantAngles.map(a => a + "°").join(",")}. spatial: ${spatial}`;
    },

    audio: (data, level) => {
      const d = data as AudioInputData;
      if (level === PerceptionLevel.Minimal) {
        return d.amplitude > 0.5 ? "bright sound" : "dim sound";
      }
      if (level === PerceptionLevel.Basic) {
        const warmCool = d.bands.bass > d.bands.treble ? "warm-toned" : "cool-toned";
        const mid = d.bands.mid > 0.5 ? "mid-heavy" : "mid-light";
        return `${warmCool}, ${mid}`;
      }
      if (level === PerceptionLevel.Structured) {
        const envelope = d.amplitude > 0.6 ? "intense" : d.amplitude > 0.3 ? "moderate" : "fading";
        return `spectral color: bass ${Math.round(d.bands.bass * 100)}, mid ${Math.round(d.bands.mid * 100)}, treble ${Math.round(d.bands.treble * 100)}. ${envelope}`;
      }
      if (level === PerceptionLevel.Relational) {
        return `richness ${Math.round(d.harmonicRichness * 100)}%, amplitude ${Math.round(d.amplitude * 100)}%`;
      }
      // Full: complete spectral perception
      const warmCool = d.bands.bass > d.bands.treble ? "warm" : "cool";
      return `${warmCool}, bass ${Math.round(d.bands.bass * 100)} mid ${Math.round(d.bands.mid * 100)} treble ${Math.round(d.bands.treble * 100)}, richness ${Math.round(d.harmonicRichness * 100)}%, amplitude ${Math.round(d.amplitude * 100)}%, ${d.bpm ?? "free"} BPM`;
    },

    light: (data, level) => {
      const d = data as ScalarSensorData;
      if (level === PerceptionLevel.Minimal) return d.value > 100 ? "light" : "darkness";
      if (level === PerceptionLevel.Basic) {
        const cat = d.value > 500 ? "bright" : d.value > 100 ? "moderate glow" : d.value > 10 ? "dim" : "darkness";
        return cat;
      }
      if (level === PerceptionLevel.Structured) {
        const temp = d.value > 300 ? "warm golden" : d.value > 50 ? "neutral" : "cool blue";
        return `${temp} light, ${d.trend}`;
      }
      return `${d.value} lux, ${d.trend}, ${d.changeRate > 0 ? "+" : ""}${d.changeRate.toFixed(1)} lux/hr`;
    },

    color: (data, level) => {
      const d = data as ColorSensorData;
      if (level === PerceptionLevel.Minimal) {
        const max = Math.max(d.r, d.g, d.b);
        const dominant = max === d.r ? "red" : max === d.g ? "green" : "blue";
        return `${dominant} dominant`;
      }
      if (level === PerceptionLevel.Basic) {
        return `R:${d.r} G:${d.g} B:${d.b}`;
      }
      if (level === PerceptionLevel.Structured) {
        const temp = d.colorTemp > 5000 ? "cool" : d.colorTemp > 3500 ? "neutral" : "warm";
        return `R:${d.r} G:${d.g} B:${d.b}, ${temp} (${d.colorTemp}K)`;
      }
      return `R:${d.r} G:${d.g} B:${d.b}, clear:${d.clear}, ${d.colorTemp}K`;
    },

    temperature: (data, level) => {
      const d = data as ScalarSensorData;
      if (level === PerceptionLevel.Minimal) return d.value > 22 ? "warmth present" : "coolness";
      if (level === PerceptionLevel.Basic) return `${d.trend}`;
      // Level 2+: map to color temperature
      const colorRef = d.value > 30 ? "red-hot" : d.value > 25 ? "orange-warm" : d.value > 18 ? "yellow-mild" : "blue-cold";
      return `${colorRef} (${d.value}${d.unit})`;
    },

    touch: (data, level) => {
      const d = data as TouchSensorData;
      if (!d.active) return null;
      if (level === PerceptionLevel.Minimal) return "flash";
      if (level === PerceptionLevel.Basic) {
        const intensity = d.pressure != null ? (d.pressure > 0.6 ? "bright flash" : "soft glow") : "flash";
        return intensity;
      }
      if (level === PerceptionLevel.Structured) {
        const pattern = d.gesture === "hold" ? "sustained radiance" :
          d.gesture === "double-tap" ? "strobe" :
          d.gesture === "long-press" ? "deepening glow" : "spark";
        return `${pattern}, ${d.points} point${d.points > 1 ? "s" : ""}`;
      }
      const dur = d.duration != null ? `, ${d.duration.toFixed(1)}s` : "";
      return `contact light: ${d.points} point${d.points > 1 ? "s" : ""}, pressure ${d.pressure != null ? Math.round(d.pressure * 100) + "%" : "binary"}${dur}`;
    },

    system: (data, level) => {
      const d = data as SystemMetricsData;
      if (level < PerceptionLevel.Basic) return null;
      const warmth = d.cpuTempC > 60 ? "hot-white" : d.cpuTempC > 45 ? "warm-orange" : "cool-blue";
      return `core glow: ${warmth}`;
    },
  };
}

// --- VIBRATION: Perceives rhythm, oscillation, tremor ---

function VIBRATION_FILTERS(): SpeciesFilterMap {
  return {
    text: (data, level) => {
      const d = data as TextInputData;
      if (level === PerceptionLevel.Minimal) return `interval: message arrived`;
      if (level === PerceptionLevel.Basic) {
        const consonants = (d.content.match(/[bcdfghjklmnpqrstvwxyz]/gi) ?? []).length;
        const vowels = (d.content.match(/[aeiou]/gi) ?? []).length;
        const ratio = consonants > vowels ? "hard-dominant" : "soft-dominant";
        return `rhythm: ${ratio}, ${d.charCount} beats`;
      }
      if (level === PerceptionLevel.Structured) {
        const words = d.content.split(/\s+/);
        const beat = words.slice(0, 8).map(w => w.length <= 2 ? "ta" : w.length <= 5 ? "da" : "DA").join("-");
        return `beat: ${beat}`;
      }
      // Level 3+: partial words with rhythm
      const words = d.content.split(/\s+/);
      const every = level === PerceptionLevel.Relational ? 2 : 1;
      return words.filter((_, i) => i % every === 0).join(" ");
    },

    audio: (data, level) => {
      const d = data as AudioInputData;
      if (level === PerceptionLevel.Minimal) {
        return d.bpm ? "rhythm detected" : "no rhythm";
      }
      if (level === PerceptionLevel.Basic) {
        const reg = d.beatRegularity > 0.7 ? "steady" : d.beatRegularity > 0.4 ? "unsteady" : "erratic";
        return d.bpm ? `${d.bpm} BPM, ${reg}` : `no beat, amplitude ${Math.round(d.amplitude * 100)}%`;
      }
      if (level === PerceptionLevel.Structured) {
        const bands = `bass:${Math.round(d.bands.bass * 100)} mid:${Math.round(d.bands.mid * 100)} treble:${Math.round(d.bands.treble * 100)}`;
        const resonance = d.bands.bass > 0.6 ? "deep resonance" : d.bands.treble > 0.6 ? "high flutter" : "balanced";
        return `${bands}, ${resonance}`;
      }
      if (level === PerceptionLevel.Relational) {
        return `harmonics: ${Math.round(d.harmonicRichness * 100)}%, ${d.bpm ?? "free"} BPM, regularity ${Math.round(d.beatRegularity * 100)}%`;
      }
      // Full: complete vibrational perception
      return `bass:${Math.round(d.bands.bass * 100)} mid:${Math.round(d.bands.mid * 100)} treble:${Math.round(d.bands.treble * 100)}, harmonics ${Math.round(d.harmonicRichness * 100)}%, ${d.bpm ?? "free"} BPM, regularity ${Math.round(d.beatRegularity * 100)}%, amplitude ${Math.round(d.amplitude * 100)}%`;
    },

    vibration: (data, level) => {
      const d = data as VibrationSensorData;
      if (level === PerceptionLevel.Minimal) return d.magnitude > 0.05 ? "tremor" : "still";
      if (level === PerceptionLevel.Basic) {
        const intensity = d.magnitude > 0.5 ? "strong" : d.magnitude > 0.1 ? "gentle" : "faint";
        const freq = d.frequency > 10 ? "high-frequency" : d.frequency > 2 ? "mid-frequency" : "low-frequency";
        return `${intensity}, ${freq} (${d.frequency.toFixed(1)}Hz)`;
      }
      if (level === PerceptionLevel.Structured) {
        const pattern = d.isRhythmic ? `rhythmic ${d.patternFrequency?.toFixed(1)}Hz` : "irregular";
        return `${pattern}, magnitude ${d.magnitude.toFixed(2)}g`;
      }
      if (level === PerceptionLevel.Relational) {
        return `x:${d.axes.x.toFixed(2)} y:${d.axes.y.toFixed(2)} z:${d.axes.z.toFixed(2)}, ${d.isRhythmic ? "rhythmic" : "chaotic"}, ${d.frequency.toFixed(1)}Hz`;
      }
      // Full: complete multi-axis + pattern analysis
      const pattern = d.isRhythmic ? `rhythmic ${d.patternFrequency?.toFixed(1)}Hz` : "chaotic";
      return `x:${d.axes.x.toFixed(2)} y:${d.axes.y.toFixed(2)} z:${d.axes.z.toFixed(2)}, ${d.frequency.toFixed(1)}Hz, ${d.magnitude.toFixed(2)}g, ${pattern}`;
    },

    image: (data, level) => {
      const d = data as ImageInputData;
      if (level < PerceptionLevel.Basic) return null; // Images are silent at level 0
      if (level === PerceptionLevel.Basic) {
        const freq = d.edgeDensity > 0.6 ? "high-frequency" : d.edgeDensity > 0.3 ? "mid-frequency" : "low-frequency";
        return `visual texture: ${freq}`;
      }
      if (level === PerceptionLevel.Structured) {
        const dir = d.dominantAngles.length > 0
          ? d.dominantAngles.map(a => `${a}°`).join(",")
          : "omnidirectional";
        return `directional rhythm: ${dir}`;
      }
      if (level === PerceptionLevel.Relational) {
        return `edge frequency ${Math.round(d.edgeDensity * 100)}%, angles: ${d.dominantAngles.join("° ")}°`;
      }
      // Full: complete vibrational texture analysis
      return `edge frequency ${Math.round(d.edgeDensity * 100)}%, angles: ${d.dominantAngles.join("° ")}°, brightness oscillation: ${Math.round(d.brightness * 100)}%`;
    },

    light: (data, level) => {
      const d = data as ScalarSensorData;
      if (level < PerceptionLevel.Basic) return null;
      return d.trend !== "stable" ? `flicker: ${d.trend}` : null;
    },

    touch: (data, level) => {
      const d = data as TouchSensorData;
      if (!d.active) return null;
      // Vibration type is most sensitive to touch — perceives even at level 0
      if (level === PerceptionLevel.Minimal) {
        return d.gesture === "tap" ? "impact" : d.gesture === "double-tap" ? "double-impact" : "contact";
      }
      if (level === PerceptionLevel.Basic) {
        const force = d.pressure != null ? (d.pressure > 0.6 ? "heavy strike" : d.pressure > 0.3 ? "tap" : "brush") : "strike";
        return `${force}, ${d.gesture}`;
      }
      if (level === PerceptionLevel.Structured) {
        const rhythm = d.gesture === "double-tap" ? "syncopated" :
          d.gesture === "hold" ? "sustained resonance" :
          d.gesture === "long-press" ? "deepening vibration" : "single impulse";
        return `${rhythm}, ${d.points} contact${d.points > 1 ? "s" : ""}`;
      }
      const dur = d.duration != null ? `, ${d.duration.toFixed(1)}s` : "";
      return `tactile: ${d.points} point${d.points > 1 ? "s" : ""}, pressure ${d.pressure != null ? Math.round(d.pressure * 100) + "%" : "binary"}, ${d.gesture}${dur}`;
    },

    proximity: (data, level) => {
      const d = data as ProximitySensorData;
      if (level < PerceptionLevel.Basic) return null;
      if (!d.detected) return null;
      return `pulse: approaching`;
    },

    system: (data, level) => {
      const d = data as SystemMetricsData;
      if (level < PerceptionLevel.Minimal) return null;
      if (level === PerceptionLevel.Minimal) {
        return d.diskIOReadKBs + d.diskIOWriteKBs > 100 ? "activity pulse" : null;
      }
      return `core frequency: ${d.cpuLoadPct > 50 ? "high resonance" : "steady hum"}`;
    },
  };
}

// --- GEOMETRIC: Perceives shape, structure, spatial arrangement ---

function GEOMETRIC_FILTERS(): SpeciesFilterMap {
  return {
    text: (data, level) => {
      const d = data as TextInputData;
      if (level === PerceptionLevel.Minimal) return `dimension: ${d.charCount}`;
      if (level === PerceptionLevel.Basic) {
        const lines = d.content.split("\n").length;
        const structure = lines > 5 ? "multi-block" : lines > 1 ? `${lines} blocks` : "single line";
        return `structure: ${structure}, dimension ${d.charCount}`;
      }
      if (level === PerceptionLevel.Structured) {
        const stops = (d.content.match(/[.!?]/g) ?? []).length;
        const curves = (d.content.match(/[,;:]/g) ?? []).length;
        return `${stops} vertices, ${curves} curves`;
      }
      const words = d.content.split(/\s+/);
      const every = level === PerceptionLevel.Relational ? 2 : 1;
      return words.filter((_, i) => i % every === 0).join(" ");
    },

    image: (data, level) => {
      const d = data as ImageInputData;
      if (level === PerceptionLevel.Minimal) {
        const aspect = d.width > d.height ? "wide" : d.width < d.height ? "tall" : "square";
        return `${aspect} rectangle`;
      }
      if (level === PerceptionLevel.Basic) {
        const angleDesc = d.dominantAngles.length > 0
          ? d.dominantAngles.map(a => `${a}°`).join(", ") + " dominant"
          : "no clear angles";
        return `edges: ${Math.round(d.edgeDensity * 100)}%, ${angleDesc}`;
      }
      if (level === PerceptionLevel.Structured) {
        const complexity = d.edgeDensity > 0.6 ? "complex" : d.edgeDensity > 0.3 ? "moderate" : "simple";
        return `${complexity} structure, ${d.dominantAngles.length} angle classes`;
      }
      if (level === PerceptionLevel.Relational) {
        return `edge density ${Math.round(d.edgeDensity * 100)}%, ${d.dominantAngles.length} axes, aspect ${(d.width / d.height).toFixed(2)}`;
      }
      // Full: complete structural analysis
      const quadrants = ["TL", "TR", "BL", "BR"];
      const qMap = quadrants.map((q, i) => `${q}:${Math.round(d.quadrantBrightness[i] * 100)}`).join(" ");
      return `edge ${Math.round(d.edgeDensity * 100)}%, axes [${d.dominantAngles.join("°,")}°], aspect ${(d.width / d.height).toFixed(2)}, density: ${qMap}`;
    },

    proximity: (data, level) => {
      const d = data as ProximitySensorData;
      if (level === PerceptionLevel.Minimal) return d.detected ? "form detected" : null;
      if (level === PerceptionLevel.Basic) {
        return d.distanceCm != null ? `near (${d.distanceCm}cm)` : "form present";
      }
      if (level === PerceptionLevel.Structured) {
        const dur = d.presenceDuration != null ? `, present ${Math.round(d.presenceDuration)}s` : "";
        return `distance: ${d.distanceCm ?? "unknown"}cm${dur}`;
      }
      return `distance ${d.distanceCm}cm, presence ${d.presenceDuration}s`;
    },

    touch: (data, level) => {
      const d = data as TouchSensorData;
      if (!d.active) return null;
      if (level === PerceptionLevel.Minimal) return `${d.points} point${d.points > 1 ? "s" : ""} on surface`;
      if (level === PerceptionLevel.Basic) {
        const shape = d.points >= 3 ? "polygon" : d.points === 2 ? "line" : "point";
        return `contact: ${shape}`;
      }
      if (level === PerceptionLevel.Structured) {
        const depth = d.pressure != null ? `, depth ${Math.round(d.pressure * 100)}%` : "";
        return `${d.points} contact vertex${d.points > 1 ? "es" : ""}${depth}`;
      }
      const dur = d.duration != null ? `, ${d.duration.toFixed(1)}s` : "";
      return `topology: ${d.points} point${d.points > 1 ? "s" : ""}, ${d.gesture}${dur}`;
    },

    vibration: (data, level) => {
      const d = data as VibrationSensorData;
      if (level < PerceptionLevel.Basic) return null;
      const shape = d.frequency > 10 ? "sawtooth" : d.frequency > 3 ? "sine" : "square";
      return `waveform geometry: ${shape}`;
    },

    system: (data, level) => {
      const d = data as SystemMetricsData;
      if (level === PerceptionLevel.Minimal) return `${d.processCount} nodes`;
      if (level >= PerceptionLevel.Basic) {
        const density = d.memoryUsedPct > 70 ? "dense cluster" : d.memoryUsedPct > 40 ? "scattered" : "sparse";
        return `${d.processCount} nodes, ${density}`;
      }
      return null;
    },

    audio: (data, level) => {
      const d = data as AudioInputData;
      if (level < PerceptionLevel.Basic) return null;
      const shape = d.bands.bass > d.bands.treble ? "triangular (bass-heavy)" : "inverted (treble-heavy)";
      return `spectral shape: ${shape}`;
    },
  };
}

// --- THERMAL: Perceives warmth, gradients, density ---

function THERMAL_FILTERS(): SpeciesFilterMap {
  return {
    temperature: (data, level) => {
      const d = data as ScalarSensorData;
      if (level === PerceptionLevel.Minimal) return `${d.value.toFixed(1)}${d.unit}`;
      if (level === PerceptionLevel.Basic) return `${d.value.toFixed(1)}${d.unit}, ${d.trend}`;
      if (level === PerceptionLevel.Structured) {
        return `${d.value.toFixed(1)}${d.unit}, ${d.trend} (${d.changeRate > 0 ? "+" : ""}${d.changeRate.toFixed(1)}${d.unit}/hr)`;
      }
      return `${d.value.toFixed(1)}${d.unit}, rate ${d.changeRate.toFixed(2)}/hr, ${d.trend}`;
    },

    humidity: (data, level) => {
      const d = data as ScalarSensorData;
      if (level === PerceptionLevel.Minimal) return d.value > 60 ? "moist" : "dry";
      if (level === PerceptionLevel.Basic) return `humidity: ${Math.round(d.value)}%`;
      return `humidity ${Math.round(d.value)}%, ${d.trend}`;
    },

    text: (data, level) => {
      const d = data as TextInputData;
      if (level < PerceptionLevel.Basic) return null;
      if (level === PerceptionLevel.Basic) {
        // Message frequency as "warmth"
        return `warmth: ${d.charCount > 50 ? "warm (engaged)" : "cool (brief)"}`;
      }
      if (level === PerceptionLevel.Structured) {
        const excl = (d.content.match(/[!！]/g) ?? []).length;
        const heat = Math.min(10, excl * 2 + Math.floor(d.charCount / 30));
        return `heat: ${heat}/10`;
      }
      const words = d.content.split(/\s+/);
      const every = level === PerceptionLevel.Relational ? 2 : 1;
      return words.filter((_, i) => i % every === 0).join(" ");
    },

    image: (data, level) => {
      const d = data as ImageInputData;
      if (level === PerceptionLevel.Minimal) {
        return d.brightness > 0.5 ? "warm (bright)" : "cold (dark)";
      }
      if (level === PerceptionLevel.Basic) {
        const hsl = d.dominantHSL;
        const warm = (hsl[0] < 60 || hsl[0] > 300) ? "warm tones" : "cool tones";
        return warm;
      }
      if (level === PerceptionLevel.Structured) {
        const qLabels = ["upper-left", "upper-right", "lower-left", "lower-right"];
        const mapping = qLabels.map((q, i) =>
          `${q}: ${d.quadrantBrightness[i] > 0.6 ? "hot" : d.quadrantBrightness[i] > 0.3 ? "warm" : "cold"}`
        ).join(", ");
        return `thermal map: ${mapping}`;
      }
      if (level === PerceptionLevel.Relational) {
        const qLabels = ["upper-left", "upper-right", "lower-left", "lower-right"];
        const mapping = qLabels.map((q, i) =>
          `${q}: ${Math.round(d.quadrantBrightness[i] * 100)}%`
        ).join(", ");
        return `thermal map: ${mapping}, gradient ${Math.round(d.brightness * 100)}%`;
      }
      // Full: complete thermal perception
      const qLabels = ["upper-left", "upper-right", "lower-left", "lower-right"];
      const mapping = qLabels.map((q, i) =>
        `${q}: ${Math.round(d.quadrantBrightness[i] * 100)}%`
      ).join(", ");
      const hsl = d.dominantHSL;
      const warmCool = (hsl[0] < 60 || hsl[0] > 300) ? "warm" : "cool";
      return `${warmCool} field, thermal map: ${mapping}, intensity ${Math.round(d.brightness * 100)}%, edges ${Math.round(d.edgeDensity * 100)}%`;
    },

    touch: (data, level) => {
      const d = data as TouchSensorData;
      if (!d.active) return null;
      if (level === PerceptionLevel.Minimal) return "warmth received";
      if (level === PerceptionLevel.Basic) {
        const intensity = d.pressure != null ? (d.pressure > 0.5 ? "strong warmth" : "gentle warmth") : "warmth";
        return intensity;
      }
      if (level === PerceptionLevel.Structured) {
        const transfer = d.gesture === "hold" ? "sustained heat transfer" :
          d.gesture === "long-press" ? "deepening warmth" :
          d.gesture === "tap" ? "brief thermal contact" : "thermal pulse";
        return `${transfer}, ${d.points} source${d.points > 1 ? "s" : ""}`;
      }
      const dur = d.duration != null ? `, ${d.duration.toFixed(1)}s` : "";
      return `thermal contact: ${d.points} source${d.points > 1 ? "s" : ""}, intensity ${d.pressure != null ? Math.round(d.pressure * 100) + "%" : "binary"}${dur}`;
    },

    pressure: (data, level) => {
      const d = data as ScalarSensorData;
      if (level < PerceptionLevel.Basic) return null;
      return `pressure: ${d.trend === "rising" ? "expanding" : d.trend === "falling" ? "contracting" : "stable"}`;
    },

    system: (data, level) => {
      const d = data as SystemMetricsData;
      if (level === PerceptionLevel.Minimal) return `core: ${d.cpuTempC.toFixed(0)}°C`;
      if (level >= PerceptionLevel.Basic) {
        const state = d.cpuTempC > 60 ? "overheating" : d.cpuTempC > 45 ? "warm under load" : "cool idle";
        return `body: ${state} (${d.cpuTempC.toFixed(0)}°C)`;
      }
      return null;
    },

    audio: (data, level) => {
      const d = data as AudioInputData;
      if (level < PerceptionLevel.Basic) return null;
      const warmth = d.bands.bass > 0.5 ? "warm rumble" : "cool shimmer";
      return `sonic warmth: ${warmth}`;
    },
  };
}

// --- TEMPORAL: Perceives rhythm, duration, temporal patterns ---

function TEMPORAL_FILTERS(): SpeciesFilterMap {
  return {
    text: (data, level) => {
      const d = data as TextInputData;
      if (level === PerceptionLevel.Minimal) {
        const ts = new Date().toISOString().split("T")[1].split(".")[0];
        return `timestamp: ${ts}`;
      }
      if (level === PerceptionLevel.Basic) return `message at ${new Date().toISOString().split("T")[1].split(".")[0]}, ${d.charCount} marks`;
      if (level === PerceptionLevel.Structured) {
        const words = d.content.split(/\s+/);
        const pace = words.length > 20 ? "rapid flow" : words.length > 8 ? "moderate pace" : "slow, deliberate";
        return `${pace}, ${d.charCount} marks`;
      }
      const words = d.content.split(/\s+/);
      const every = level === PerceptionLevel.Relational ? 2 : 1;
      return words.filter((_, i) => i % every === 0).join(" ");
    },

    audio: (data, level) => {
      const d = data as AudioInputData;
      if (level === PerceptionLevel.Minimal) return `duration: ${d.duration.toFixed(1)}s`;
      if (level === PerceptionLevel.Basic) {
        const tempo = d.bpm ? `tempo: ${d.bpm} BPM` : "free time";
        return `${d.duration.toFixed(1)}s, ${tempo}`;
      }
      if (level === PerceptionLevel.Structured) {
        const change = d.beatRegularity > 0.7 ? "metronomic" : d.beatRegularity > 0.4 ? "rubato" : "free";
        return `${change}, ${d.duration.toFixed(1)}s`;
      }
      if (level === PerceptionLevel.Relational) {
        return `${d.duration.toFixed(1)}s, regularity ${Math.round(d.beatRegularity * 100)}%, ${d.bpm ?? "free"} BPM`;
      }
      // Full: complete temporal analysis
      return `${d.duration.toFixed(1)}s, ${d.bpm ?? "free"} BPM, regularity ${Math.round(d.beatRegularity * 100)}%, amplitude ${Math.round(d.amplitude * 100)}%, richness ${Math.round(d.harmonicRichness * 100)}%`;
    },

    proximity: (data, level) => {
      const d = data as ProximitySensorData;
      if (!d.detected) return null;
      if (level === PerceptionLevel.Minimal) {
        return d.presenceDuration != null ? `present for ${Math.round(d.presenceDuration)}s` : "presence";
      }
      if (level >= PerceptionLevel.Basic) {
        const dur = d.presenceDuration != null ? `${Math.round(d.presenceDuration)}s` : "unknown";
        return `presence duration: ${dur}`;
      }
      return null;
    },

    // Temporal type has a unique ability: perceiving ALL sensors' change rates
    temperature: (data, level) => {
      const d = data as ScalarSensorData;
      if (level === PerceptionLevel.Minimal) return d.trend !== "stable" ? `changing` : "stable";
      if (level === PerceptionLevel.Basic) return `${d.trend}, rate: ${Math.abs(d.changeRate).toFixed(1)}/hr`;
      return `${d.value.toFixed(1)}${d.unit}, ${d.trend}, ${d.changeRate.toFixed(2)}/hr`;
    },

    humidity: (data, level) => {
      const d = data as ScalarSensorData;
      if (level === PerceptionLevel.Minimal) return d.trend !== "stable" ? "shifting" : "steady";
      return `${d.trend}, rate: ${Math.abs(d.changeRate).toFixed(1)}/hr`;
    },

    light: (data, level) => {
      const d = data as ScalarSensorData;
      if (level === PerceptionLevel.Minimal) return d.trend !== "stable" ? "flux" : "constant";
      return `${d.trend}, rate: ${Math.abs(d.changeRate).toFixed(1)}/hr`;
    },

    pressure: (data, level) => {
      const d = data as ScalarSensorData;
      if (level === PerceptionLevel.Minimal) return d.trend !== "stable" ? "shifting" : "steady";
      return `${d.trend}, ${Math.abs(d.changeRate).toFixed(1)} hPa/hr`;
    },

    vibration: (data, level) => {
      const d = data as VibrationSensorData;
      if (level < PerceptionLevel.Basic) return null;
      if (d.isRhythmic && d.patternFrequency) {
        const period = (1 / d.patternFrequency).toFixed(2);
        return `period: ${period}s (${d.patternFrequency.toFixed(1)}Hz)`;
      }
      return "aperiodic";
    },

    touch: (data, level) => {
      const d = data as TouchSensorData;
      if (!d.active && d.gesture === "none") return null;
      if (level === PerceptionLevel.Minimal) {
        return d.active ? "contact begun" : "contact ended";
      }
      if (level === PerceptionLevel.Basic) {
        const dur = d.duration != null ? `${d.duration.toFixed(1)}s` : "instant";
        return `contact: ${dur}`;
      }
      if (level === PerceptionLevel.Structured) {
        const tempo = d.gesture === "double-tap" ? "double-time" :
          d.gesture === "hold" ? "sustained" :
          d.gesture === "long-press" ? "fermata" : "staccato";
        return `touch tempo: ${tempo}`;
      }
      const dur = d.duration != null ? `${d.duration.toFixed(1)}s` : "0s";
      return `contact duration: ${dur}, pattern: ${d.gesture}, ${d.points} point${d.points > 1 ? "s" : ""}`;
    },

    system: (data, level) => {
      const d = data as SystemMetricsData;
      if (level === PerceptionLevel.Minimal) return `uptime: ${d.uptimeHours.toFixed(0)}h`;
      return `alive ${d.uptimeHours.toFixed(0)}h, load rhythm: ${d.cpuLoadPct > 50 ? "active" : "resting"}`;
    },
  };
}

// --- CHEMICAL: Perceives concentration, reaction, composition ---

function CHEMICAL_FILTERS(): SpeciesFilterMap {
  return {
    text: (data, level) => {
      const d = data as TextInputData;
      if (level === PerceptionLevel.Minimal) {
        const unique = new Set(d.content.replace(/\s/g, "")).size;
        const diversity = (unique / Math.max(d.charCount, 1)).toFixed(2);
        return `diversity: ${diversity}`;
      }
      if (level === PerceptionLevel.Basic) {
        const symbols = (d.content.match(/[^\w\s]/g) ?? []).length;
        return `${symbols} reactive elements detected, ${d.charCount} total`;
      }
      if (level === PerceptionLevel.Structured) {
        const words = d.content.split(/\s+/);
        const pairs = words.length > 1
          ? words.slice(0, 4).map((w, i) => i < words.length - 1 ? `${w.slice(0, 3)}-${words[i + 1].slice(0, 3)}` : null).filter(Boolean).join(", ")
          : "single element";
        return `bonds: ${pairs}`;
      }
      const words = d.content.split(/\s+/);
      const every = level === PerceptionLevel.Relational ? 2 : 1;
      return words.filter((_, i) => i % every === 0).join(" ");
    },

    gas: (data, level) => {
      const d = data as ScalarSensorData;
      if (level === PerceptionLevel.Minimal) return d.value > 600 ? "reactive atmosphere" : "inert";
      if (level === PerceptionLevel.Basic) return `${d.value} ${d.unit}, ${d.trend}`;
      if (level === PerceptionLevel.Structured) {
        const state = d.trend === "rising" ? "new element introduced" : d.trend === "falling" ? "dissipating" : "equilibrium";
        return `concentration: ${d.value} ${d.unit}, ${state}`;
      }
      return `${d.value} ${d.unit}, rate ${d.changeRate.toFixed(1)}/hr, ${d.trend}`;
    },

    humidity: (data, level) => {
      const d = data as ScalarSensorData;
      if (level === PerceptionLevel.Minimal) return d.value > 70 ? "saturated" : d.value < 30 ? "desiccated" : "solution";
      return `solvent state: ${Math.round(d.value)}%, ${d.trend}`;
    },

    temperature: (data, level) => {
      const d = data as ScalarSensorData;
      if (level < PerceptionLevel.Basic) return null;
      const activation = d.value > 30 ? "highly reactive" : d.value > 20 ? "reaction-ready" : "sluggish";
      return `catalytic temperature: ${activation}`;
    },

    image: (data, level) => {
      const d = data as ImageInputData;
      if (level < PerceptionLevel.Basic) return null;
      const saturation = d.dominantHSL[1];
      return `concentration: ${saturation > 60 ? "dense" : saturation > 30 ? "dilute" : "trace"}`;
    },

    system: (data, level) => {
      const d = data as SystemMetricsData;
      if (level === PerceptionLevel.Minimal) {
        const density = d.memoryUsedPct > 60 ? "concentrated" : "dilute";
        return `solution: ${density} (${Math.round(d.memoryUsedPct)}%)`;
      }
      if (level >= PerceptionLevel.Basic) {
        const reactions = Math.round(d.networkKBs / 10);
        return `${d.processCount} molecules, ${reactions} reactions/s`;
      }
      return null;
    },

    touch: (data, level) => {
      const d = data as TouchSensorData;
      if (!d.active) return null;
      if (level === PerceptionLevel.Minimal) return "catalyst introduced";
      if (level === PerceptionLevel.Basic) {
        const reaction = d.pressure != null ? (d.pressure > 0.5 ? "strong reaction" : "mild reaction") : "reaction";
        return reaction;
      }
      if (level === PerceptionLevel.Structured) {
        const bond = d.gesture === "hold" ? "bonding in progress" :
          d.gesture === "double-tap" ? "rapid exchange" :
          d.gesture === "long-press" ? "deep catalysis" : "surface reaction";
        return `${bond}, ${d.points} reagent${d.points > 1 ? "s" : ""}`;
      }
      const dur = d.duration != null ? `, ${d.duration.toFixed(1)}s` : "";
      return `catalytic contact: ${d.points} reagent${d.points > 1 ? "s" : ""}, intensity ${d.pressure != null ? Math.round(d.pressure * 100) + "%" : "binary"}${dur}`;
    },

    audio: (data, level) => {
      const d = data as AudioInputData;
      if (level < PerceptionLevel.Structured) return null;
      if (level === PerceptionLevel.Structured) {
        const volatility = d.amplitude > 0.6 ? "volatile" : d.amplitude > 0.3 ? "reactive" : "stable";
        return `acoustic compound: ${volatility}`;
      }
      if (level === PerceptionLevel.Relational) {
        const volatility = d.amplitude > 0.6 ? "volatile" : d.amplitude > 0.3 ? "reactive" : "stable";
        const density = d.bands.bass > 0.5 ? "dense" : "diffuse";
        return `acoustic compound: ${volatility}, ${density} spectrum`;
      }
      // Full: complete acoustic analysis
      const volatility = d.amplitude > 0.6 ? "volatile" : d.amplitude > 0.3 ? "reactive" : "stable";
      return `acoustic compound: ${volatility}, bass ${Math.round(d.bands.bass * 100)} mid ${Math.round(d.bands.mid * 100)} treble ${Math.round(d.bands.treble * 100)}, richness ${Math.round(d.harmonicRichness * 100)}%`;
    },
  };
}
