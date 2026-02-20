/**
 * LLM Adapter — Interface for entity "thinking" providers.
 *
 * Current state: Entity thinking relies on Claude API (cloud).
 * Ultimate goal: Entity soul runs entirely on local hardware (Ollama, llama.cpp).
 *
 * This adapter layer enables the future migration without changing engine code.
 * It does NOT implement any provider — it defines the contract.
 *
 * Design constraints (from CLAUDE.md):
 *   - Must support cloud API (Claude, OpenAI) for early phases
 *   - Must support local LLM (Ollama, llama.cpp) for true One Body, One Soul
 *   - Hardware differences directly determine intelligence when running locally
 *   - Never make architectural decisions that prevent local migration
 *
 * The adapter abstracts:
 *   - Text completion (the entity's inner voice)
 *   - System prompt injection (SOUL.md personality)
 *   - Context window management (memory, perception, status)
 *   - Model capability detection (what the hardware can support)
 */

import type { HardwareBody } from "../types.js";

/**
 * Provider type — cloud or local.
 * This distinction matters for One Body, One Soul:
 *   cloud = part of the soul lives outside the body (practical compromise)
 *   local = entire soul within the body (true embodiment)
 */
export type LLMProviderType = "cloud" | "local";

/**
 * Capabilities that vary by provider and model.
 * Used by the engine to adapt behavior to what's actually possible.
 */
export interface LLMCapabilities {
  /** Maximum context window in tokens */
  maxContextTokens: number;
  /** Maximum output tokens per generation */
  maxOutputTokens: number;
  /** Whether the model can process images */
  supportsVision: boolean;
  /** Whether the model supports function/tool calling */
  supportsToolUse: boolean;
  /** Whether the model supports streaming responses */
  supportsStreaming: boolean;
  /** Approximate tokens per second on this hardware (for local models) */
  estimatedTokensPerSecond: number | null;
  /** Provider type */
  providerType: LLMProviderType;
}

/**
 * A message in the conversation context.
 */
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Request to generate a completion.
 */
export interface LLMCompletionRequest {
  /** System prompt (SOUL.md + context) */
  systemPrompt: string;
  /** Conversation messages */
  messages: LLMMessage[];
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature (0-1, lower = more deterministic) */
  temperature?: number;
  /** Stop sequences */
  stopSequences?: string[];
}

/**
 * Response from a completion request.
 */
export interface LLMCompletionResponse {
  /** Generated text */
  content: string;
  /** Tokens used for input */
  inputTokens: number;
  /** Tokens used for output */
  outputTokens: number;
  /** Model identifier that generated this response */
  model: string;
  /** Whether the response was truncated (hit max tokens) */
  truncated: boolean;
}

/**
 * Health status of the LLM provider.
 */
export interface LLMHealthStatus {
  available: boolean;
  provider: string;
  model: string;
  providerType: LLMProviderType;
  /** Error message if not available */
  error?: string;
  /** Latency of last health check in ms */
  latencyMs?: number;
}

/**
 * The LLM Adapter interface — all providers must implement this.
 *
 * Future implementations:
 *   - CloudClaudeAdapter (Anthropic API)
 *   - CloudOpenAIAdapter (OpenAI API)
 *   - LocalOllamaAdapter (Ollama with any model)
 *   - LocalLlamaCppAdapter (llama.cpp direct)
 */
export interface LLMAdapter {
  /** Human-readable provider name (e.g., "Claude API", "Ollama (phi-3)") */
  readonly name: string;

  /** Provider type */
  readonly providerType: LLMProviderType;

  /**
   * Get the capabilities of this provider on current hardware.
   * For local models, capabilities depend on available RAM/VRAM.
   */
  getCapabilities(): LLMCapabilities;

  /**
   * Generate a text completion.
   * This is the entity's "thinking" — the most fundamental operation.
   */
  complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;

  /**
   * Check if the provider is available and responsive.
   */
  checkHealth(): Promise<LLMHealthStatus>;

  /**
   * Estimate token count for a string.
   * Exact counts depend on the specific tokenizer.
   * This is an approximation for context management.
   */
  estimateTokens(text: string): number;
}

/**
 * Configuration for selecting an LLM provider.
 */
export interface LLMAdapterConfig {
  /** Provider to use */
  provider: "claude" | "openai" | "ollama" | "llamacpp";
  /** Model identifier (e.g., "claude-sonnet-4-5-20250929", "phi-3", "gemma") */
  model: string;
  /** API key (cloud providers only) */
  apiKey?: string;
  /** API base URL override */
  baseUrl?: string;
  /** Ollama host (default: http://localhost:11434) */
  ollamaHost?: string;
  /** llama.cpp server host */
  llamaCppHost?: string;
}

/**
 * Estimate what local model sizes a hardware body can support.
 * Returns recommended model size ranges based on available RAM.
 *
 * This helps the entity "know its own limits" — a Raspberry Pi 4GB
 * can only run small models, while a Mac mini 16GB can handle larger ones.
 */
export function estimateLocalModelCapacity(hardware: HardwareBody): {
  maxParameterBillions: number;
  recommendedModels: string[];
  canRunLocal: boolean;
} {
  const ramGB = hardware.totalMemoryGB;

  if (ramGB < 4) {
    return {
      maxParameterBillions: 0,
      recommendedModels: [],
      canRunLocal: false,
    };
  }

  if (ramGB < 8) {
    return {
      maxParameterBillions: 3,
      recommendedModels: ["phi-3-mini", "gemma-2b", "tinyllama-1.1b"],
      canRunLocal: true,
    };
  }

  if (ramGB < 16) {
    return {
      maxParameterBillions: 7,
      recommendedModels: ["phi-3", "gemma-7b", "mistral-7b", "llama-3.1-8b"],
      canRunLocal: true,
    };
  }

  if (ramGB < 32) {
    return {
      maxParameterBillions: 13,
      recommendedModels: ["llama-3.1-8b", "codellama-13b", "phi-3-medium"],
      canRunLocal: true,
    };
  }

  return {
    maxParameterBillions: 30,
    recommendedModels: ["llama-3.1-70b-q4", "mixtral-8x7b", "codellama-34b"],
    canRunLocal: true,
  };
}
