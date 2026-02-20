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
} from "./llm-adapter.js";

export { createClaudeAdapter, ClaudeAdapterError } from "./claude-adapter.js";
export { createOllamaAdapter } from "./ollama-adapter.js";
export {
  createLLMAdapter,
  detectRecommendedConfig,
  validateConfig,
} from "./llm-factory.js";
