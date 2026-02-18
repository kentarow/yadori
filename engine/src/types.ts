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
  createdAt: string; // ISO 8601
  hash: string;
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
