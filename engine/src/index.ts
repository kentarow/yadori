export type {
  Seed,
  PerceptionMode,
  ExpressionMode,
  CognitionStyle,
  Temperament,
  SelfForm,
  HardwareBody,
  SubTraits,
  Status,
  ExpressionChannel,
  TextExpressionParams,
  SoundExpressionParams,
  VisualExpressionParams,
  ExpressionParams,
  ImageFeatures,
  AudioFeatures,
} from "./types.js";

export { LanguageLevel, PerceptionLevel } from "./types.js";

export { generateSeed, createFixedSeed } from "./genesis/seed-generator.js";
export { detectHardware } from "./genesis/hardware-detector.js";

// Language Engine
export {
  createInitialLanguageState,
  evaluateLanguageLevel,
  generateExpression,
  recordInteraction,
  establishPattern,
  formatLanguageMd,
  type LanguageState,
  type LanguagePattern,
} from "./language/language-engine.js";

// Mood Engine
export {
  computeInteractionEffect,
  computeNaturalDecay,
  applyMoodDelta,
  type MoodDelta,
  type InteractionContext,
} from "./mood/mood-engine.js";

// Rhythm System
export {
  getTimeOfDay,
  computeHeartbeat,
  shouldPulse,
  isActiveHours,
  type TimeOfDay,
  type RhythmPulse,
} from "./rhythm/rhythm-system.js";

// Diary Engine
export {
  generateDiaryEntry,
  formatDiaryMd,
  type DiaryEntry,
} from "./diary/diary-engine.js";

// Status Manager
export {
  createEntityState,
  processHeartbeat,
  processInteraction,
  serializeState,
  type EntityState,
  type HeartbeatResult,
  type InteractionResult,
} from "./status/status-manager.js";

// Expression Adapter
export {
  generateExpressionParams,
} from "./expression/expression-adapter.js";

// Image Processor
export {
  processImage,
  rgbToHsl,
  computeColorHistogram,
} from "./perception/image-processor.js";

// Audio Processor
export {
  processAudio,
  fft,
  estimateBPM,
} from "./perception/audio-processor.js";
