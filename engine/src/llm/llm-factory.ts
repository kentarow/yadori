/**
 * LLM Factory — Creates the right LLM adapter based on user configuration.
 *
 * This is the entry point for the engine to obtain an LLM adapter.
 * It reads the configuration and returns the appropriate adapter instance,
 * whether that's a cloud provider (Claude, OpenAI) or a local one (Ollama, llama.cpp).
 *
 * Design:
 *   - No external npm dependencies
 *   - Static imports for implemented adapters (claude, ollama)
 *   - detectRecommendedConfig provides a starting point based on hardware
 *   - validateConfig catches misconfigurations before adapter creation
 */

import type { HardwareBody } from "../types.js";
import {
  estimateLocalModelCapacity,
  type LLMAdapter,
  type LLMAdapterConfig,
} from "./llm-adapter.js";
import { createClaudeAdapter } from "./claude-adapter.js";
import { createOllamaAdapter } from "./ollama-adapter.js";

/**
 * Factory function — creates the right LLM adapter for the given configuration.
 *
 * For cloud providers (claude, openai), this returns an adapter that calls
 * external APIs. For local providers (ollama, llamacpp), the adapter communicates
 * with a locally running inference server.
 *
 * Throws if the provider is unimplemented or invalid.
 */
export function createLLMAdapter(config: LLMAdapterConfig): LLMAdapter {
  switch (config.provider) {
    case "claude":
      return createClaudeAdapter(config);

    case "openai":
      throw new Error("OpenAI adapter not yet implemented");

    case "ollama":
      return createOllamaAdapter(config);

    case "llamacpp":
      throw new Error("llama.cpp adapter not yet implemented");

    default:
      throw new Error(
        `Unknown LLM provider: "${(config as LLMAdapterConfig).provider}". ` +
          `Supported providers: claude, openai, ollama, llamacpp`,
      );
  }
}

/**
 * Auto-detect the best LLM configuration based on hardware capabilities.
 *
 * Uses estimateLocalModelCapacity to determine if the hardware can run
 * a local model. If so, recommends Ollama with the first recommended model.
 * Otherwise, falls back to Claude API (apiKey must be set by the user later).
 *
 * This is a hint/recommendation, not a final decision. The user can always
 * override the configuration.
 */
export function detectRecommendedConfig(hardware: HardwareBody): LLMAdapterConfig {
  const capacity = estimateLocalModelCapacity(hardware);

  if (capacity.canRunLocal && capacity.recommendedModels.length > 0) {
    return {
      provider: "ollama",
      model: capacity.recommendedModels[0],
      ollamaHost: "http://localhost:11434",
    };
  }

  // Fall back to cloud — apiKey must be provided by the user
  return {
    provider: "claude",
    model: "claude-sonnet-4-5-20250929",
  };
}

/**
 * Validate an LLM adapter configuration before attempting to create an adapter.
 *
 * Checks required fields per provider type and returns specific error messages.
 * A valid configuration does not guarantee the provider is reachable — only
 * that the configuration is structurally correct.
 */
export function validateConfig(
  config: LLMAdapterConfig,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.provider) {
    errors.push("provider is required");
    return { valid: false, errors };
  }

  const validProviders = ["claude", "openai", "ollama", "llamacpp"];
  if (!validProviders.includes(config.provider)) {
    errors.push(
      `Unknown provider "${config.provider}". Supported: ${validProviders.join(", ")}`,
    );
    return { valid: false, errors };
  }

  switch (config.provider) {
    case "claude":
      if (!config.apiKey) {
        errors.push("apiKey is required for Claude provider");
      }
      if (!config.model) {
        errors.push("model is required for Claude provider");
      }
      break;

    case "openai":
      if (!config.apiKey) {
        errors.push("apiKey is required for OpenAI provider");
      }
      if (!config.model) {
        errors.push("model is required for OpenAI provider");
      }
      break;

    case "ollama":
      if (!config.model) {
        errors.push("model is required for Ollama provider");
      }
      // ollamaHost defaults to localhost:11434, so not required
      break;

    case "llamacpp":
      if (!config.model) {
        errors.push("model is required for llama.cpp provider");
      }
      // llamaCppHost defaults to localhost:8080, so not required
      break;
  }

  return { valid: errors.length === 0, errors };
}
