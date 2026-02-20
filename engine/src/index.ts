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

// Perception Params (filter parameter evolution)
export {
  computePerceptionWindow,
  getSpeciesPerceptionProfile,
  type PerceptionWindow,
  type SpeciesPerceptionProfile,
} from "./perception/perception-params.js";

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

// Health Check
export {
  runHealthCheck,
  type HealthReport,
  type HealthCheckItem,
  type CheckStatus,
} from "./health/health-check.js";

// Backup
export {
  createBackup,
  serializeBackup,
  deserializeBackup,
  validateBackup,
  restoreBackup,
  generateBackupFilename,
  type BackupManifest,
  type BackupBundle,
  type RestoreValidation,
} from "./backup/backup-engine.js";

// Workspace Repair
export {
  repairWorkspace,
  type RepairResult,
  type RepairAction,
} from "./health/workspace-repair.js";

// Log Rotation
export {
  rotateWorkspaceLogs,
  estimateWorkspaceSize,
  type RotationConfig,
  type RotationResult,
} from "./memory/log-rotation.js";

// Intelligence Dynamics (Layer 4)
export {
  createInitialAsymmetryState,
  evaluateAsymmetry,
  getPhaseLabel,
  getPhaseSymbol,
  formatAsymmetryMd,
  type RelationPhase,
  type AsymmetryState,
  type AsymmetrySignals,
  type PhaseTransition,
} from "./dynamics/asymmetry-tracker.js";

// Reversal Detector (Layer 4)
export {
  createInitialReversalState,
  detectReversals,
  computeReversalMetrics,
  formatReversalMd,
  type ReversalSignal,
  type ReversalType,
  type ReversalState,
  type ReversalContext,
  type ReversalDetectionResult,
  type ReversalMetrics,
} from "./dynamics/reversal-detector.js";

// Coexist Engine (Layer 4)
export {
  createInitialCoexistState,
  evaluateCoexistence,
  computeCoexistQuality,
  formatCoexistMd,
  type CoexistState,
  type CoexistIndicators,
  type CoexistMoment,
  type CoexistMomentType,
  type CoexistContext,
} from "./dynamics/coexist-engine.js";

// LLM Adapter
export {
  estimateLocalModelCapacity,
  type LLMAdapter,
  type LLMAdapterConfig,
  type LLMProviderType,
  type LLMCapabilities,
  type LLMMessage,
  type LLMCompletionRequest,
  type LLMCompletionResponse,
  type LLMHealthStatus,
} from "./llm/llm-adapter.js";

export { createClaudeAdapter, ClaudeAdapterError } from "./llm/claude-adapter.js";
export { createOllamaAdapter } from "./llm/ollama-adapter.js";
export {
  createLLMAdapter,
  detectRecommendedConfig,
  validateConfig,
} from "./llm/llm-factory.js";

// Voice Adapter
export {
  computeVoiceMaturity,
  estimateLocalVoiceCapacity,
  type VoiceProviderType,
  type VoiceCapabilities,
  type VoiceRequest,
  type VoiceResponse,
  type VoiceAdapter,
  type LocalVoiceCapacity,
} from "./voice/voice-adapter.js";

export { createEspeakAdapter } from "./voice/espeak-adapter.js";
export { createPiperAdapter } from "./voice/piper-adapter.js";
export {
  SPECIES_VOICE_PROFILES,
  computeVoiceParams,
  type SpeciesVoiceProfile,
  type ComputedVoiceParams,
} from "./voice/voice-params.js";
export {
  createVoiceAdapter,
  NoneVoiceAdapter,
  type VoiceFactoryOptions,
} from "./voice/voice-factory.js";

// Perception Pipeline (unified)
export {
  processPerceptionPipeline,
  describePerceptionState,
  type PerceptionPipelineInput,
  type PerceptionPipelineOutput,
} from "./perception/perception-pipeline.js";
