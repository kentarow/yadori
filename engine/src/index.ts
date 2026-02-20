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
  PERCEPTION_SYMBOLS,
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

// Heartbeat Messages
export {
  generateHeartbeatMessages,
  generateEveningReflection,
  createInitialMessageState,
  type HeartbeatMessage,
  type HeartbeatMessageTrigger,
  type HeartbeatMessageContext,
  type HeartbeatMessageState,
} from "./expression/heartbeat-messages.js";

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

// Perception Pipeline
export {
  filterInput,
  filterInputs,
  getPerceptibleModalities,
} from "./perception/perception-filter.js";

export {
  buildPerceptionContext,
} from "./perception/perception-context.js";

export {
  evaluatePerceptionLevel,
  recordSensoryInput,
  createInitialPerceptionGrowthState,
  type PerceptionGrowthState,
} from "./perception/perception-growth.js";

export {
  createInputRegistry,
  registerSensor,
  unregisterSensor,
  pushInput,
  drainInputs,
  getAvailableModalities,
  getActiveModalityCount,
  type InputRegistry,
} from "./perception/input-registry.js";

// Sensor Driver Interface
export type {
  SensorDriver,
  SensorDriverConfig,
  SensorDetectionResult,
} from "./perception/sensor-driver.js";

// Sensor Service
export {
  createSensorService,
  addDriver,
  startService,
  stopService,
  collectPerceptions,
  pushDirectInput,
  getModalityCount,
  getRegisteredModalities,
  type SensorServiceState,
} from "./perception/sensor-service.js";

// Perception Types
export type {
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
  SensorRegistration,
} from "./perception/perception-types.js";

// Identity
export {
  generateAvatar,
  generateBotName,
} from "./identity/avatar-generator.js";
