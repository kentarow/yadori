import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClaudeAdapter, ClaudeAdapterError } from "../../src/llm/claude-adapter.js";
import type { LLMAdapterConfig } from "../../src/llm/llm-adapter.js";

// --- Helpers ---

function makeConfig(overrides: Partial<LLMAdapterConfig> = {}): LLMAdapterConfig {
  return {
    provider: "claude",
    model: "claude-sonnet-4-5-20250929",
    apiKey: "test-api-key-123",
    ...overrides,
  };
}

/** Build a mock Anthropic Messages API success response. */
function makeAnthropicResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "msg_test_123",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "Hello from the entity." }],
    model: "claude-sonnet-4-5-20250929",
    stop_reason: "end_turn",
    usage: { input_tokens: 42, output_tokens: 7 },
    ...overrides,
  };
}

/** Build a mock Anthropic error response body. */
function makeAnthropicError(type: string, message: string): Record<string, unknown> {
  return {
    type: "error",
    error: { type, message },
  };
}

/** Create a mock Response object. */
function mockResponse(body: Record<string, unknown>, status = 200, statusText = "OK"): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    type: "basic" as ResponseType,
    url: "",
    clone: () => mockResponse(body, status, statusText),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

// --- Tests ---

describe("Claude Adapter", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // --- Factory function ---

  describe("createClaudeAdapter", () => {
    it("creates an adapter with valid config", () => {
      const adapter = createClaudeAdapter(makeConfig());
      expect(adapter).toBeDefined();
      expect(adapter.name).toContain("Claude API");
      expect(adapter.name).toContain("claude-sonnet-4-5-20250929");
      expect(adapter.providerType).toBe("cloud");
    });

    it("throws when apiKey is missing", () => {
      expect(() => createClaudeAdapter(makeConfig({ apiKey: undefined }))).toThrow(
        ClaudeAdapterError,
      );
      expect(() => createClaudeAdapter(makeConfig({ apiKey: undefined }))).toThrow(
        "API key is required",
      );
    });

    it("uses default model when model is empty", () => {
      const adapter = createClaudeAdapter(makeConfig({ model: "" }));
      // Default model should be embedded in the name
      expect(adapter.name).toContain("claude-sonnet-4-5-20250929");
    });
  });

  // --- Capabilities ---

  describe("getCapabilities", () => {
    it("returns correct capability values", () => {
      const adapter = createClaudeAdapter(makeConfig());
      const caps = adapter.getCapabilities();

      expect(caps.maxContextTokens).toBe(200_000);
      expect(caps.maxOutputTokens).toBe(8192);
      expect(caps.supportsVision).toBe(true);
      expect(caps.supportsToolUse).toBe(true);
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.providerType).toBe("cloud");
    });

    it("reports null for estimatedTokensPerSecond (cloud provider)", () => {
      const adapter = createClaudeAdapter(makeConfig());
      const caps = adapter.getCapabilities();
      expect(caps.estimatedTokensPerSecond).toBeNull();
    });
  });

  // --- Token estimation ---

  describe("estimateTokens", () => {
    it("returns 0 for empty string", () => {
      const adapter = createClaudeAdapter(makeConfig());
      expect(adapter.estimateTokens("")).toBe(0);
    });

    it("returns reasonable estimate for short text", () => {
      const adapter = createClaudeAdapter(makeConfig());
      // "Hello" = 5 chars, 5/3.5 ~ 1.43, ceil = 2
      expect(adapter.estimateTokens("Hello")).toBe(2);
    });

    it("returns reasonable estimate for longer text", () => {
      const adapter = createClaudeAdapter(makeConfig());
      const text = "The quick brown fox jumps over the lazy dog.";
      const estimate = adapter.estimateTokens(text);
      // 44 chars / 3.5 ~ 12.6, ceil = 13
      expect(estimate).toBe(13);
      // Sanity: should be in a reasonable range
      expect(estimate).toBeGreaterThan(5);
      expect(estimate).toBeLessThan(50);
    });

    it("returns reasonable estimate for symbol-heavy entity text", () => {
      const adapter = createClaudeAdapter(makeConfig());
      const symbols = "○ ● ◎ △ ☆ ◇";
      const estimate = adapter.estimateTokens(symbols);
      expect(estimate).toBeGreaterThan(0);
    });
  });

  // --- complete() ---

  describe("complete", () => {
    it("makes a correct API request and parses response", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce(mockResponse(makeAnthropicResponse()));
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      const result = await adapter.complete({
        systemPrompt: "You are an entity.",
        messages: [{ role: "user", content: "Hello" }],
      });

      // Verify response parsing
      expect(result.content).toBe("Hello from the entity.");
      expect(result.inputTokens).toBe(42);
      expect(result.outputTokens).toBe(7);
      expect(result.model).toBe("claude-sonnet-4-5-20250929");
      expect(result.truncated).toBe(false);

      // Verify the API was called correctly
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.anthropic.com/v1/messages");

      const headers = init?.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("test-api-key-123");
      expect(headers["anthropic-version"]).toBe("2023-06-01");
      expect(headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      expect(body.model).toBe("claude-sonnet-4-5-20250929");
      expect(body.system).toBe("You are an entity.");
      expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("sets truncated=true when stop_reason is max_tokens", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce(
        mockResponse(makeAnthropicResponse({ stop_reason: "max_tokens" })),
      );
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      const result = await adapter.complete({
        systemPrompt: "",
        messages: [{ role: "user", content: "Tell me a story" }],
      });

      expect(result.truncated).toBe(true);
    });

    it("passes temperature and stopSequences to API", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce(mockResponse(makeAnthropicResponse()));
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      await adapter.complete({
        systemPrompt: "Be creative.",
        messages: [{ role: "user", content: "Create" }],
        temperature: 0.8,
        maxTokens: 2048,
        stopSequences: ["STOP", "END"],
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
      expect(body.temperature).toBe(0.8);
      expect(body.max_tokens).toBe(2048);
      expect(body.stop_sequences).toEqual(["STOP", "END"]);
    });

    it("filters out system messages from the messages array", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce(mockResponse(makeAnthropicResponse()));
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      await adapter.complete({
        systemPrompt: "Main system prompt",
        messages: [
          { role: "system", content: "Extra system context" },
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi" },
          { role: "user", content: "How are you?" },
        ],
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
      // System messages should be excluded from the messages array
      const messages = body.messages as Array<{ role: string; content: string }>;
      expect(messages).toHaveLength(3);
      expect(messages.every((m) => m.role !== "system")).toBe(true);
      expect(messages[0]).toEqual({ role: "user", content: "Hello" });
    });

    it("adds a placeholder message when messages array is empty", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce(mockResponse(makeAnthropicResponse()));
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      await adapter.complete({
        systemPrompt: "You are an entity.",
        messages: [],
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
      const messages = body.messages as Array<{ role: string; content: string }>;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
    });

    it("uses default maxTokens when not specified", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce(mockResponse(makeAnthropicResponse()));
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      await adapter.complete({
        systemPrompt: "",
        messages: [{ role: "user", content: "Hello" }],
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
      expect(body.max_tokens).toBe(4096);
    });

    it("omits system field when systemPrompt is empty", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce(mockResponse(makeAnthropicResponse()));
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      await adapter.complete({
        systemPrompt: "",
        messages: [{ role: "user", content: "Hello" }],
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
      expect(body.system).toBeUndefined();
    });

    it("uses custom baseUrl when provided", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce(mockResponse(makeAnthropicResponse()));
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(
        makeConfig({ baseUrl: "https://custom-proxy.example.com" }),
      );
      await adapter.complete({
        systemPrompt: "",
        messages: [{ role: "user", content: "Hello" }],
      });

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("https://custom-proxy.example.com/v1/messages");
    });

    // --- Error handling ---

    it("throws ClaudeAdapterError on network failure", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      await expect(
        adapter.complete({
          systemPrompt: "",
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow(ClaudeAdapterError);
      await expect(
        adapter.complete({
          systemPrompt: "",
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow("Network error");
    });

    it("throws ClaudeAdapterError on API error with error body", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce(
        mockResponse(
          makeAnthropicError("authentication_error", "Invalid API key"),
          401,
          "Unauthorized",
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      try {
        await adapter.complete({
          systemPrompt: "",
          messages: [{ role: "user", content: "Hello" }],
        });
        expect.fail("Should have thrown");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ClaudeAdapterError);
        const adapterError = error as ClaudeAdapterError;
        expect(adapterError.statusCode).toBe(401);
        expect(adapterError.errorType).toBe("authentication_error");
        expect(adapterError.message).toContain("Invalid API key");
      }
    });

    it("throws ClaudeAdapterError on rate limit (429)", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce(
        mockResponse(
          makeAnthropicError("rate_limit_error", "Rate limited"),
          429,
          "Too Many Requests",
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      try {
        await adapter.complete({
          systemPrompt: "",
          messages: [{ role: "user", content: "Hello" }],
        });
        expect.fail("Should have thrown");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ClaudeAdapterError);
        const adapterError = error as ClaudeAdapterError;
        expect(adapterError.statusCode).toBe(429);
        expect(adapterError.errorType).toBe("rate_limit_error");
      }
    });

    it("handles non-JSON error response gracefully", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: () => Promise.reject(new Error("Not JSON")),
        headers: new Headers(),
        redirected: false,
        type: "basic" as ResponseType,
        url: "",
        clone: () => ({ ok: false } as Response),
        body: null,
        bodyUsed: false,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        blob: () => Promise.resolve(new Blob()),
        formData: () => Promise.resolve(new FormData()),
        text: () => Promise.resolve("Bad Gateway"),
        bytes: () => Promise.resolve(new Uint8Array()),
      } as Response);
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      await expect(
        adapter.complete({
          systemPrompt: "",
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow("HTTP 502: Bad Gateway");
    });

    it("handles invalid JSON in success response", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
        headers: new Headers(),
        redirected: false,
        type: "basic" as ResponseType,
        url: "",
        clone: () => ({ ok: true } as Response),
        body: null,
        bodyUsed: false,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        blob: () => Promise.resolve(new Blob()),
        formData: () => Promise.resolve(new FormData()),
        text: () => Promise.resolve("not json"),
        bytes: () => Promise.resolve(new Uint8Array()),
      } as Response);
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      await expect(
        adapter.complete({
          systemPrompt: "",
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow("Failed to parse API response as JSON");
    });
  });

  // --- checkHealth() ---

  describe("checkHealth", () => {
    it("returns available=true on successful API call", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce(mockResponse(makeAnthropicResponse()));
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      const health = await adapter.checkHealth();

      expect(health.available).toBe(true);
      expect(health.provider).toBe("anthropic");
      expect(health.model).toBe("claude-sonnet-4-5-20250929");
      expect(health.providerType).toBe("cloud");
      expect(health.latencyMs).toBeDefined();
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.error).toBeUndefined();
    });

    it("sends a minimal request for health check", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce(mockResponse(makeAnthropicResponse()));
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      await adapter.checkHealth();

      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
      // Health check should use minimal tokens
      expect(body.max_tokens).toBe(1);
      expect(body.messages).toEqual([{ role: "user", content: "." }]);
    });

    it("returns available=false on network failure", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockRejectedValueOnce(new Error("Connection refused"));
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      const health = await adapter.checkHealth();

      expect(health.available).toBe(false);
      expect(health.error).toContain("Connection refused");
      expect(health.latencyMs).toBeDefined();
    });

    it("returns available=false on API error", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce(
        mockResponse(
          makeAnthropicError("authentication_error", "Invalid key"),
          401,
          "Unauthorized",
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      const health = await adapter.checkHealth();

      expect(health.available).toBe(false);
      expect(health.error).toContain("Invalid key");
      expect(health.provider).toBe("anthropic");
    });

    it("never throws — always returns a health status", async () => {
      const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
      fetchMock.mockRejectedValueOnce("weird non-Error rejection");
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createClaudeAdapter(makeConfig());
      // Should not throw
      const health = await adapter.checkHealth();
      expect(health.available).toBe(false);
      expect(health.error).toBeDefined();
    });
  });

  // --- ClaudeAdapterError ---

  describe("ClaudeAdapterError", () => {
    it("has correct name and properties", () => {
      const error = new ClaudeAdapterError("test error", 429, "rate_limit_error");
      expect(error.name).toBe("ClaudeAdapterError");
      expect(error.message).toBe("test error");
      expect(error.statusCode).toBe(429);
      expect(error.errorType).toBe("rate_limit_error");
      expect(error).toBeInstanceOf(Error);
    });

    it("has null defaults for statusCode and errorType", () => {
      const error = new ClaudeAdapterError("simple error");
      expect(error.statusCode).toBeNull();
      expect(error.errorType).toBeNull();
    });
  });
});
