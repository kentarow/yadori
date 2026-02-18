/**
 * Perception System — Type Definitions
 *
 * Defines the input modalities, raw input format, and filtered output.
 * This is the type contract between sensor drivers and perception filters.
 */

/**
 * All possible input modalities.
 * Each hardware sensor maps to one of these.
 */
export type InputModality =
  | "text"           // User message (always available)
  | "image"          // Camera frame
  | "audio"          // Microphone audio
  | "temperature"    // Temperature sensor (DHT22, BME280, MLX90614, etc.)
  | "humidity"       // Humidity sensor (DHT22, BME280, SHT31)
  | "light"          // Light/lux sensor (TSL2591, BH1750, LDR)
  | "vibration"      // Accelerometer/vibration (MPU6050, ADXL345)
  | "pressure"       // Barometric pressure (BMP280, BME280)
  | "gas"            // Air quality/gas (CCS811, SGP30, MQ series)
  | "color"          // RGB color sensor (TCS34725)
  | "proximity"      // Proximity/motion (PIR, HC-SR04)
  | "system";        // System metrics (CPU temp, memory, always available)

/**
 * Raw input from a sensor or source.
 * Sensor drivers produce these; perception filters consume them.
 */
export interface RawInput {
  modality: InputModality;
  timestamp: string;        // ISO 8601
  source: string;           // e.g. "dht22", "pi-camera", "usb-mic", "system"
  data: RawInputData;
}

/**
 * Union of possible raw data formats.
 */
export type RawInputData =
  | TextInputData
  | ImageInputData
  | AudioInputData
  | ScalarSensorData
  | VibrationSensorData
  | ColorSensorData
  | ProximitySensorData
  | SystemMetricsData;

export interface TextInputData {
  type: "text";
  content: string;
  charCount: number;
}

export interface ImageInputData {
  type: "image";
  width: number;
  height: number;
  /** Average color as HSL */
  dominantHSL: [number, number, number];
  /** Color histogram: array of { hue, saturation, lightness, percentage } */
  colorHistogram: Array<{ h: number; s: number; l: number; pct: number }>;
  /** Edge density: 0-1 */
  edgeDensity: number;
  /** Dominant angles in degrees */
  dominantAngles: number[];
  /** Brightness: 0-1 */
  brightness: number;
  /** Quadrant color temperatures (top-left, top-right, bottom-left, bottom-right) */
  quadrantBrightness: [number, number, number, number];
}

export interface AudioInputData {
  type: "audio";
  /** Duration in seconds */
  duration: number;
  /** Average amplitude: 0-1 */
  amplitude: number;
  /** Frequency bands: bass, mid, treble (0-1 each) */
  bands: { bass: number; mid: number; treble: number };
  /** Detected tempo in BPM (null if no beat) */
  bpm: number | null;
  /** Beat regularity: 0-1 */
  beatRegularity: number;
  /** Harmonic richness: 0-1 (pure tone vs complex) */
  harmonicRichness: number;
}

export interface ScalarSensorData {
  type: "scalar";
  value: number;
  unit: string;             // "°C", "%", "lux", "hPa", "ppm"
  trend: "rising" | "falling" | "stable";
  changeRate: number;       // units per hour
}

export interface VibrationSensorData {
  type: "vibration";
  /** Acceleration magnitude (g) */
  magnitude: number;
  /** Dominant frequency (Hz) */
  frequency: number;
  /** Per-axis values */
  axes: { x: number; y: number; z: number };
  /** Is there a regular pattern? */
  isRhythmic: boolean;
  /** Pattern frequency if rhythmic (Hz) */
  patternFrequency: number | null;
}

export interface ColorSensorData {
  type: "color";
  /** RGB values 0-255 */
  r: number;
  g: number;
  b: number;
  /** Clear light intensity */
  clear: number;
  /** Color temperature in Kelvin */
  colorTemp: number;
}

export interface ProximitySensorData {
  type: "proximity";
  /** Is something detected? */
  detected: boolean;
  /** Distance in cm (null for PIR-type) */
  distanceCm: number | null;
  /** Time since presence began (seconds, null if not detected) */
  presenceDuration: number | null;
}

export interface SystemMetricsData {
  type: "system";
  cpuTempC: number;
  memoryUsedPct: number;
  cpuLoadPct: number;
  uptimeHours: number;
  processCount: number;
  diskIOReadKBs: number;
  diskIOWriteKBs: number;
  networkKBs: number;
}

/**
 * Filtered perception — the only thing the entity actually "knows."
 * This is what gets injected into the LLM context.
 */
export interface FilteredPerception {
  /** Human-readable description for LLM context */
  description: string;
  /** Original modality (for logging/debugging, not exposed to entity) */
  sourceModality: InputModality;
}

/**
 * Sensor registration entry.
 * Each detected sensor registers with these details.
 */
export interface SensorRegistration {
  id: string;                // unique identifier
  modality: InputModality;
  source: string;            // driver name
  available: boolean;
  lastReading: string | null;  // ISO 8601
}
