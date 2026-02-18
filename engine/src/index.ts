export type {
  Seed,
  PerceptionMode,
  ExpressionMode,
  CognitionStyle,
  Temperament,
  SelfForm,
  HardwareBody,
  Status,
} from "./types.js";

export { LanguageLevel } from "./types.js";

export { generateSeed, createFixedSeed } from "./genesis/seed-generator.js";
export { detectHardware } from "./genesis/hardware-detector.js";
