/**
 * Ollama Adapter — Local LLM provider for YADORI entities.
 *
 * Implements the LLMAdapter interface using Ollama's REST API.
 * No external dependencies — uses native fetch().
 *
 * This adapter enables true One Body, One Soul: the entity's entire
 * thinking process runs on the physical hardware it inhabits.
 *
 * Usage:
 *   const adapter = createOllamaAdapter({ provider: "ollama", model: "phi-3" });
 *   const response = await adapter.complete({ systemPrompt: "...", messages: [...] });
 */

import type {
  LLMAdapter,
  LLMAdapterConfig,
  LLMCapabilities,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMHealthStatus,
} from "./llm-adapter.js";

/** Ollama /api/chat request body */
interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream: false;
  options?: OllamaOptions;
}

/** Ollama message format (compatible with LLMMessage) */
interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Ollama generation options */
interface OllamaOptions {
  num_predict?: number;
  temperature?: number;
  stop?: string[];
}

/** Ollama /api/chat response (non-streaming) */
interface OllamaChatResponse {
  model: string;
  message: OllamaChatMessage;
  done: true;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
}

/** Ollama /api/tags response */
interface OllamaTagsResponse {
  models: OllamaModelInfo[];
}

/** Ollama model info from /api/tags */
interface OllamaModelInfo {
  name: string;
  modified_at: string;
  size: number;
}

/** Default Ollama host */
const DEFAULT_OLLAMA_HOST = "http://localhost:11434";

/** Default model for lightweight local inference */
const DEFAULT_MODEL = "phi-3";

/**
 * Known model capability profiles.
 * Maps model name patterns to their known capabilities.
 */
interface ModelProfile {
  pattern: RegExp;
  maxContextTokens: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  supportsToolUse: boolean;
}

const MODEL_PROFILES: ModelProfile[] = [
  {
    pattern: /^llama[- _]?3\.1/i,
    maxContextTokens: 8192,
    maxOutputTokens: 2048,
    supportsVision: false,
    supportsToolUse: false,
  },
  {
    pattern: /^phi[- _]?3/i,
    maxContextTokens: 4096,
    maxOutputTokens: 1024,
    supportsVision: false,
    supportsToolUse: false,
  },
  {
    pattern: /^gemma/i,
    maxContextTokens: 4096,
    maxOutputTokens: 1024,
    supportsVision: false,
    supportsToolUse: false,
  },
];

/** Default capabilities for unknown models */
const DEFAULT_PROFILE: Omit<ModelProfile, "pattern"> = {
  maxContextTokens: 4096,
  maxOutputTokens: 1024,
  supportsVision: false,
  supportsToolUse: false,
};

/**
 * Look up capabilities for a model by name.
 */
function getModelProfile(model: string): Omit<ModelProfile, "pattern"> {
  for (const profile of MODEL_PROFILES) {
    if (profile.pattern.test(model)) {
      return profile;
    }
  }
  return DEFAULT_PROFILE;
}

/**
 * Normalize the Ollama host URL: ensure protocol and strip trailing slash.
 */
function normalizeHost(host: string): string {
  let normalized = host.trim();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = `http://${normalized}`;
  }
  return normalized.replace(/\/+$/, "");
}

/**
 * Create an Ollama adapter instance.
 *
 * @param config - LLM adapter configuration. Uses `ollamaHost` and `model`.
 * @returns An LLMAdapter connected to the local Ollama instance.
 */
export function createOllamaAdapter(config: LLMAdapterConfig): LLMAdapter {
  const model = config.model || DEFAULT_MODEL;
  const host = normalizeHost(config.ollamaHost || DEFAULT_OLLAMA_HOST);
  const profile = getModelProfile(model);

  const adapter: LLMAdapter = {
    name: `Ollama (${model})`,
    providerType: "local",

    getCapabilities(): LLMCapabilities {
      return {
        maxContextTokens: profile.maxContextTokens,
        maxOutputTokens: profile.maxOutputTokens,
        supportsVision: profile.supportsVision,
        supportsToolUse: profile.supportsToolUse,
        supportsStreaming: true,
        estimatedTokensPerSecond: null,
        providerType: "local",
      };
    },

    async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
      const messages: OllamaChatMessage[] = [];

      // System prompt goes as the first message with role "system"
      if (request.systemPrompt) {
        messages.push({
          role: "system",
          content: request.systemPrompt,
        });
      }

      // Append conversation messages
      for (const msg of request.messages) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }

      const body: OllamaChatRequest = {
        model,
        messages,
        stream: false,
      };

      // Apply optional generation parameters
      const options: OllamaOptions = {};
      let hasOptions = false;

      if (request.maxTokens !== undefined) {
        options.num_predict = request.maxTokens;
        hasOptions = true;
      }
      if (request.temperature !== undefined) {
        options.temperature = request.temperature;
        hasOptions = true;
      }
      if (request.stopSequences !== undefined && request.stopSequences.length > 0) {
        options.stop = request.stopSequences;
        hasOptions = true;
      }

      if (hasOptions) {
        body.options = options;
      }

      let response: Response;
      try {
        response = await fetch(`${host}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Ollama connection failed: ${message}. Is Ollama running? Start it with: ollama serve`
        );
      }

      if (!response.ok) {
        let errorBody = "";
        try {
          errorBody = await response.text();
        } catch {
          // Ignore read errors on the error response
        }

        if (response.status === 404) {
          throw new Error(
            `Ollama model "${model}" not found. Pull it with: ollama pull ${model}`
          );
        }

        throw new Error(
          `Ollama API error (${response.status}): ${errorBody || response.statusText}`
        );
      }

      let data: OllamaChatResponse;
      try {
        data = (await response.json()) as OllamaChatResponse;
      } catch {
        throw new Error("Ollama returned invalid JSON response");
      }

      const content = data.message?.content ?? "";
      const inputTokens = data.prompt_eval_count ?? adapter.estimateTokens(request.systemPrompt + request.messages.map((m) => m.content).join(""));
      const outputTokens = data.eval_count ?? adapter.estimateTokens(content);

      // Detect truncation: if we requested a max and the output hit it
      const truncated = request.maxTokens !== undefined && outputTokens >= request.maxTokens;

      return {
        content,
        inputTokens,
        outputTokens,
        model: data.model || model,
        truncated,
      };
    },

    async checkHealth(): Promise<LLMHealthStatus> {
      const startTime = Date.now();

      let response: Response;
      try {
        response = await fetch(`${host}/api/tags`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          available: false,
          provider: "ollama",
          model,
          providerType: "local",
          error: `Cannot connect to Ollama at ${host}. Is Ollama running? Start it with: ollama serve`,
          latencyMs: Date.now() - startTime,
        };
      }

      if (!response.ok) {
        return {
          available: false,
          provider: "ollama",
          model,
          providerType: "local",
          error: `Ollama API returned status ${response.status}`,
          latencyMs: Date.now() - startTime,
        };
      }

      let data: OllamaTagsResponse;
      try {
        data = (await response.json()) as OllamaTagsResponse;
      } catch {
        return {
          available: false,
          provider: "ollama",
          model,
          providerType: "local",
          error: "Ollama returned invalid JSON from /api/tags",
          latencyMs: Date.now() - startTime,
        };
      }

      // Check if the requested model is available
      const availableModels = data.models ?? [];
      const modelFound = availableModels.some((m) => {
        const name = m.name.toLowerCase();
        const target = model.toLowerCase();
        // Ollama model names can have ":latest" suffix
        return name === target || name === `${target}:latest` || name.startsWith(`${target}:`);
      });

      if (!modelFound) {
        const modelNames = availableModels.map((m) => m.name).join(", ");
        return {
          available: false,
          provider: "ollama",
          model,
          providerType: "local",
          error: `Model "${model}" not found. Available models: ${modelNames || "(none)"}. Pull it with: ollama pull ${model}`,
          latencyMs: Date.now() - startTime,
        };
      }

      return {
        available: true,
        provider: "ollama",
        model,
        providerType: "local",
        latencyMs: Date.now() - startTime,
      };
    },

    estimateTokens(text: string): number {
      // Rough approximation for most local models: ~4 characters per token
      return Math.ceil(text.length / 4);
    },
  };

  return adapter;
}
