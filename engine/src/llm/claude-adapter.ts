/**
 * Claude API Adapter — Cloud LLM provider for entity "thinking."
 *
 * Implements the LLMAdapter interface using the Anthropic Messages API.
 * Uses native fetch() (Node.js 22+) — no external dependencies.
 *
 * This is a practical compromise for early phases: part of the entity's soul
 * lives in the cloud (Anthropic's servers). The LLM Adapter layer ensures
 * future migration to local models (Ollama, llama.cpp) without engine changes.
 *
 * Design constraints:
 *   - No @anthropic-ai/sdk or other npm packages
 *   - All errors are catchable (never crash the entity)
 *   - Clean TypeScript, no `any` types
 */

import type {
  LLMAdapter,
  LLMAdapterConfig,
  LLMCapabilities,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMHealthStatus,
  LLMMessage,
} from "./llm-adapter.js";

// --- Anthropic API types (only what we need) ---

/** Message role as accepted by the Anthropic Messages API. */
type AnthropicRole = "user" | "assistant";

/** A single message in the Anthropic Messages API request. */
interface AnthropicMessage {
  role: AnthropicRole;
  content: string;
}

/** The request body for the Anthropic Messages API. */
interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  temperature?: number;
  stop_sequences?: string[];
}

/** A content block in the Anthropic Messages API response. */
interface AnthropicContentBlock {
  type: "text";
  text: string;
}

/** Token usage reported by the Anthropic Messages API. */
interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

/** The response body from the Anthropic Messages API. */
interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | null;
  usage: AnthropicUsage;
}

/** Error response from the Anthropic API. */
interface AnthropicErrorResponse {
  type: "error";
  error: {
    type: string;
    message: string;
  };
}

// --- Constants ---

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const DEFAULT_BASE_URL = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;
const HEALTH_CHECK_MAX_TOKENS = 1;

/** Approximate characters per token for Claude models. */
const CHARS_PER_TOKEN = 3.5;

// --- Error class ---

/**
 * Error thrown when the Claude API returns an error or is unreachable.
 * Always catchable — the entity should handle this gracefully.
 */
export class ClaudeAdapterError extends Error {
  readonly statusCode: number | null;
  readonly errorType: string | null;

  constructor(message: string, statusCode: number | null = null, errorType: string | null = null) {
    super(message);
    this.name = "ClaudeAdapterError";
    this.statusCode = statusCode;
    this.errorType = errorType;
  }
}

// --- Adapter implementation ---

class ClaudeAdapter implements LLMAdapter {
  readonly name: string;
  readonly providerType = "cloud" as const;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: LLMAdapterConfig) {
    if (!config.apiKey) {
      throw new ClaudeAdapterError("API key is required for Claude adapter");
    }

    this.apiKey = config.apiKey;
    this.model = config.model || DEFAULT_MODEL;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.name = `Claude API (${this.model})`;
  }

  getCapabilities(): LLMCapabilities {
    return {
      maxContextTokens: 200_000,
      maxOutputTokens: 8192,
      supportsVision: true,
      supportsToolUse: true,
      supportsStreaming: true,
      estimatedTokensPerSecond: null, // Cloud — latency varies
      providerType: "cloud",
    };
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const anthropicMessages = this.convertMessages(request.messages);

    const body: AnthropicRequest = {
      model: this.model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: anthropicMessages,
    };

    // System prompt goes in the dedicated `system` field (not as a message)
    if (request.systemPrompt) {
      body.system = request.systemPrompt;
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.stopSequences && request.stopSequences.length > 0) {
      body.stop_sequences = request.stopSequences;
    }

    const responseData = await this.callApi(body);

    // Extract text from content blocks
    const content = responseData.content
      .filter((block): block is AnthropicContentBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      content,
      inputTokens: responseData.usage.input_tokens,
      outputTokens: responseData.usage.output_tokens,
      model: responseData.model,
      truncated: responseData.stop_reason === "max_tokens",
    };
  }

  async checkHealth(): Promise<LLMHealthStatus> {
    const startTime = Date.now();

    try {
      const body: AnthropicRequest = {
        model: this.model,
        max_tokens: HEALTH_CHECK_MAX_TOKENS,
        messages: [{ role: "user", content: "." }],
      };

      await this.callApi(body);
      const latencyMs = Date.now() - startTime;

      return {
        available: true,
        provider: "anthropic",
        model: this.model,
        providerType: "cloud",
        latencyMs,
      };
    } catch (error: unknown) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        available: false,
        provider: "anthropic",
        model: this.model,
        providerType: "cloud",
        error: errorMessage,
        latencyMs,
      };
    }
  }

  estimateTokens(text: string): number {
    if (text.length === 0) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  // --- Private methods ---

  /**
   * Convert LLMMessage[] to Anthropic's message format.
   * Anthropic API does not accept "system" role in messages —
   * system prompts are passed via the separate `system` field.
   * Messages must alternate between user and assistant roles.
   */
  private convertMessages(messages: LLMMessage[]): AnthropicMessage[] {
    const converted: AnthropicMessage[] = [];

    for (const msg of messages) {
      // Skip system messages — they are handled via the system field
      if (msg.role === "system") {
        continue;
      }

      converted.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // Anthropic requires at least one message and the first must be from user
    if (converted.length === 0) {
      converted.push({ role: "user", content: "." });
    }

    return converted;
  }

  /**
   * Make a request to the Anthropic Messages API.
   * Handles network errors, HTTP errors, and API error responses.
   */
  private async callApi(body: AnthropicRequest): Promise<AnthropicResponse> {
    const url = `${this.baseUrl}/v1/messages`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify(body),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ClaudeAdapterError(`Network error: ${message}`);
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      let errorType: string | null = null;

      try {
        const errorBody = (await response.json()) as AnthropicErrorResponse;
        if (errorBody.error) {
          errorMessage = `${errorBody.error.type}: ${errorBody.error.message}`;
          errorType = errorBody.error.type;
        }
      } catch {
        // Could not parse error body — use status code only
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }

      throw new ClaudeAdapterError(errorMessage, response.status, errorType);
    }

    let data: AnthropicResponse;
    try {
      data = (await response.json()) as AnthropicResponse;
    } catch {
      throw new ClaudeAdapterError("Failed to parse API response as JSON");
    }

    return data;
  }
}

// --- Factory function ---

/**
 * Create a Claude API adapter.
 *
 * @param config - Adapter configuration. Must include `apiKey` and optionally `model`.
 * @returns An LLMAdapter backed by the Anthropic Claude API.
 * @throws ClaudeAdapterError if apiKey is missing.
 *
 * @example
 * ```ts
 * const adapter = createClaudeAdapter({
 *   provider: "claude",
 *   model: "claude-sonnet-4-5-20250929",
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 * });
 *
 * const response = await adapter.complete({
 *   systemPrompt: soulMd,
 *   messages: [{ role: "user", content: "Hello" }],
 * });
 * ```
 */
export function createClaudeAdapter(config: LLMAdapterConfig): LLMAdapter {
  return new ClaudeAdapter(config);
}
