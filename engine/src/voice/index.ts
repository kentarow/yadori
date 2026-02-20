export {
  computeVoiceMaturity,
  estimateLocalVoiceCapacity,
  type VoiceProviderType,
  type VoiceCapabilities,
  type VoiceRequest,
  type VoiceResponse,
  type VoiceAdapter,
  type LocalVoiceCapacity,
} from "./voice-adapter.js";

export {
  SPECIES_VOICE_PROFILES,
  computeVoiceParams,
  type SpeciesVoiceProfile,
  type ComputedVoiceParams,
} from "./voice-params.js";

export {
  createVoiceAdapter,
  NoneVoiceAdapter,
  type VoiceFactoryOptions,
} from "./voice-factory.js";

export { createEspeakAdapter } from "./espeak-adapter.js";
export { createPiperAdapter } from "./piper-adapter.js";
