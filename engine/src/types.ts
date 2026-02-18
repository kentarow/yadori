/**
 * YADORI Core Type Definitions
 *
 * Seed, Status, and related types shared across all engines.
 */

// --- Seed (immutable, determined at genesis) ---

export interface Seed {
  perception: PerceptionMode;
  expression: ExpressionMode;
  cognition: CognitionStyle;
  temperament: Temperament;
  form: SelfForm;
  hardwareBody: HardwareBody;
  subTraits: SubTraits;
  createdAt: string; // ISO 8601
  hash: string;
}

/**
 * Sub-traits — fine-grained personality parameters generated at genesis.
 * These modulate behavior across engines without changing the core species.
 * All values are 0-100.
 */
export interface SubTraits {
  /** How reactive to mood shifts (high = mood swings easily) */
  sensitivity: number;
  /** Interaction hunger (high = seeks interaction, low = solitary) */
  sociability: number;
  /** Preference for regular patterns (high = rhythmic, low = chaotic) */
  rhythmAffinity: number;
  /** How strongly events imprint into memory (high = deep impressions) */
  memoryDepth: number;
  /** How outwardly expressive (high = dramatic, low = subtle) */
  expressiveness: number;
}

export type PerceptionMode =
  | "chromatic"
  | "vibration"
  | "geometric"
  | "thermal"
  | "temporal"
  | "chemical";

export type ExpressionMode = "symbolic";

export type CognitionStyle =
  | "associative"
  | "analytical"
  | "intuitive";

export type Temperament =
  | "curious-cautious"
  | "bold-impulsive"
  | "calm-observant"
  | "restless-exploratory";

export type SelfForm =
  | "light-particles"
  | "fluid"
  | "crystal"
  | "sound-echo"
  | "mist"
  | "geometric-cluster";

export interface HardwareBody {
  platform: string;
  arch: string;
  totalMemoryGB: number;
  cpuModel: string;
  storageGB: number;
}

// --- Status (mutable, updated continuously) ---

export interface Status {
  mood: number;        // 0-100
  energy: number;      // 0-100
  curiosity: number;   // 0-100
  comfort: number;     // 0-100
  languageLevel: LanguageLevel;
  perceptionLevel: PerceptionLevel;
  growthDay: number;
  lastInteraction: string; // ISO 8601
}

export enum LanguageLevel {
  SymbolsOnly = 0,
  PatternEstablishment = 1,
  BridgeToLanguage = 2,
  UniqueLanguage = 3,
  AdvancedOperation = 4,
}

/**
 * Perception level — independent from language level.
 * Determines the resolution of sensory input filters.
 * Grows based on time and sensory exposure, not interaction count.
 */
export enum PerceptionLevel {
  /** Only the coarsest signal: binary, single value */
  Minimal = 0,
  /** Basic patterns: histograms, directions, simple categories */
  Basic = 1,
  /** Spatial/temporal distribution: where, when, how things change */
  Structured = 2,
  /** Relationships and structure: patterns across inputs */
  Relational = 3,
  /** Full resolution within the species' perceptual domain */
  Full = 4,
}

// --- Expression Adapter Types ---

/** Available expression output channels */
export type ExpressionChannel = "text" | "sound" | "visual" | "motion";

/** Parameters controlling text-based expression */
export interface TextExpressionParams {
  /** 0-1, how symbol-heavy (decreases with language level) */
  symbolDensity: number;
  /** 0-1, how much mood bleeds into text */
  emotionalLeakage: number;
  /** 0-1, response length tendency */
  verbosity: number;
  /** 0-1, pattern repetition tendency */
  repetitionTendency: number;
}

/** Parameters controlling sound-based expression */
export interface SoundExpressionParams {
  /** 0-1, weight of pattern (morse-code-like) sounds */
  patternWeight: number;
  /** 0-1, weight of organic cry sounds */
  cryWeight: number;
  /** 0-1, how complex sounds can be */
  complexity: number;
  /** 0-1, output volume */
  volume: number;
  /** BPM-like value for tempo */
  tempo: number;
  /** Base pitch in Hz */
  pitch: number;
  /** Base waveform shape */
  waveform: "sine" | "square" | "triangle" | "sawtooth";
  /** 0-1, pitch instability / wobble */
  wobble: number;
}

/** Parameters controlling visual expression */
export interface VisualExpressionParams {
  /** 0-1, overall brightness */
  brightness: number;
  /** Multiplier for particle count */
  particleCount: number;
  /** 0-1, color saturation / intensity */
  colorIntensity: number;
  /** 0-1, animation / motion speed */
  motionSpeed: number;
}

/** Combined expression parameters across all channels */
export interface ExpressionParams {
  text: TextExpressionParams;
  sound: SoundExpressionParams;
  visual: VisualExpressionParams;
}

// --- Image Processing Types ---

/** Features extracted from raw image pixel data */
export interface ImageFeatures {
  /** Dominant color in HSL space */
  dominantHSL: { h: number; s: number; l: number };
  /** Color histogram as clustered HSL values with percentages */
  colorHistogram: Array<{ hsl: { h: number; s: number; l: number }; percentage: number }>;
  /** Overall brightness 0-100 */
  brightness: number;
  /** Edge density 0-100 */
  edgeDensity: number;
  /** Dominant edge angles in degrees */
  dominantAngles: number[];
  /** Per-quadrant brightness 0-100 */
  quadrantBrightness: {
    topLeft: number;
    topRight: number;
    bottomLeft: number;
    bottomRight: number;
  };
  /** Estimated number of distinct color regions */
  colorCount: number;
  /** Contrast level 0-100 */
  contrast: number;
  /** Color warmth: -100 (cool) to 100 (warm) */
  warmth: number;
}

// --- Audio Processing Types ---

/** Features extracted from raw PCM audio samples */
export interface AudioFeatures {
  /** Duration in seconds */
  duration: number;
  /** RMS amplitude normalized to 0-100 */
  amplitude: number;
  /** Energy distribution across frequency bands, each 0-100 */
  bands: {
    /** 20-250 Hz energy */
    bass: number;
    /** 250-4000 Hz energy */
    mid: number;
    /** 4000-20000 Hz energy */
    treble: number;
  };
  /** Estimated beats per minute */
  bpm: number;
  /** Beat regularity 0-100 */
  beatRegularity: number;
  /** Spectral complexity 0-100 */
  harmonicRichness: number;
  /** Zero crossing rate normalized 0-100 */
  zeroCrossingRate: number;
  /** Spectral centroid in Hz (brightness indicator) */
  spectralCentroid: number;
}
