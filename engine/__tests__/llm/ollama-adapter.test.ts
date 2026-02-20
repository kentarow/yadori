import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createOllamaAdapter } from "../../src/llm/ollama-adapter.js";
import type {
  LLMAdapter,
  LLMAdapterConfig,
  LLMCompletionResponse,
} from "../../src/llm/llm-adapter.js";

/**
 * Helper: build an LLMAdapterConfig for Ollama with sensible defaults.
 */
function makeConfig(overrides: Partial<LLMAdapterConfig> = {}): LLMAdapterConfig {
  return {
    provider: "ollama",
    model: "phi-3",
    ...overrides,
  };
}

/**
 * Helper: build a successful Ollama /api/chat response body.
 */
function makeChatResponse(content: string, overrides: Record<string, unknown> = {}): object {
  return {
    model: "phi-3",
    message: { role: "assistant", content },
    done: true,
    prompt_eval_count: 42,
    eval_count: 10,
    total_duration: 500000000,
    ...overrides,
  };
}

/**
 * Helper: build a successful Ollama /api/tags response body.
 */
function makeTagsResponse(models: string[]): object {
  return {
    models: models.map((name) => ({
      name,
      modified_at: "2025-01-01T00:00:00Z",
      size: 4000000000,
    })),
  };
}

describe("Ollama Adapter", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("createOllamaAdapter (factory)", () => {
    it("creates an adapter with correct name", () => {
      const adapter = createOllamaAdapter(makeConfig());
      expect(adapter.name).toBe("Ollama (phi-3)");
    });

    it("uses the model from config in the name", () => {
      const adapter = createOllamaAdapter(makeConfig({ model: "llama-3.1" }));
      expect(adapter.name).toBe("Ollama (llama-3.1)");
    });

    it("sets providerType to local", () => {
      const adapter = createOllamaAdapter(makeConfig());
      expect(adapter.providerType).toBe("local");
    });

    it("defaults to phi-3 when model is empty", () => {
      const adapter = createOllamaAdapter(makeConfig({ model: "" }));
      expect(adapter.name).toBe("Ollama (phi-3)");
    });
  });

  describe("getCapabilities", () => {
    it("returns phi-3 capabilities for phi-3 model", () => {
      const adapter = createOllamaAdapter(makeConfig({ model: "phi-3" }));
      const caps = adapter.getCapabilities();

      expect(caps.maxContextTokens).toBe(4096);
      expect(caps.maxOutputTokens).toBe(1024);
      expect(caps.supportsVision).toBe(false);
      expect(caps.supportsToolUse).toBe(false);
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.estimatedTokensPerSecond).toBeNull();
      expect(caps.providerType).toBe("local");
    });

    it("returns gemma capabilities for gemma model", () => {
      const adapter = createOllamaAdapter(makeConfig({ model: "gemma-7b" }));
      const caps = adapter.getCapabilities();

      expect(caps.maxContextTokens).toBe(4096);
      expect(caps.maxOutputTokens).toBe(1024);
      expect(caps.supportsVision).toBe(false);
      expect(caps.supportsToolUse).toBe(false);
    });

    it("returns llama-3.1 capabilities for llama-3.1 model", () => {
      const adapter = createOllamaAdapter(makeConfig({ model: "llama-3.1-8b" }));
      const caps = adapter.getCapabilities();

      expect(caps.maxContextTokens).toBe(8192);
      expect(caps.maxOutputTokens).toBe(2048);
      expect(caps.supportsVision).toBe(false);
      expect(caps.supportsToolUse).toBe(false);
    });

    it("returns default capabilities for unknown model", () => {
      const adapter = createOllamaAdapter(makeConfig({ model: "some-unknown-model" }));
      const caps = adapter.getCapabilities();

      expect(caps.maxContextTokens).toBe(4096);
      expect(caps.maxOutputTokens).toBe(1024);
      expect(caps.supportsVision).toBe(false);
      expect(caps.supportsToolUse).toBe(false);
      expect(caps.providerType).toBe("local");
    });

    it("matches model names case-insensitively", () => {
      const adapter = createOllamaAdapter(makeConfig({ model: "Phi-3-Mini" }));
      const caps = adapter.getCapabilities();

      expect(caps.maxContextTokens).toBe(4096);
      expect(caps.maxOutputTokens).toBe(1024);
    });

    it("matches llama3.1 without hyphen", () => {
      const adapter = createOllamaAdapter(makeConfig({ model: "llama3.1" }));
      const caps = adapter.getCapabilities();

      expect(caps.maxContextTokens).toBe(8192);
      expect(caps.maxOutputTokens).toBe(2048);
    });
  });

  describe("estimateTokens", () => {
    it("returns roughly chars / 4", () => {
      const adapter = createOllamaAdapter(makeConfig());

      expect(adapter.estimateTokens("Hello world")).toBe(3); // 11 chars / 4 = 2.75 -> ceil = 3
      expect(adapter.estimateTokens("")).toBe(0);
      expect(adapter.estimateTokens("a")).toBe(1);
      expect(adapter.estimateTokens("abcd")).toBe(1); // 4 / 4 = 1
      expect(adapter.estimateTokens("abcde")).toBe(2); // 5 / 4 = 1.25 -> ceil = 2
    });

    it("handles long text", () => {
      const adapter = createOllamaAdapter(makeConfig());
      const longText = "a".repeat(1000);

      expect(adapter.estimateTokens(longText)).toBe(250);
    });

    it("handles unicode text", () => {
      const adapter = createOllamaAdapter(makeConfig());
      // Unicode characters have more chars than tokens typically
      const result = adapter.estimateTokens("Hello! ○ ● ◎");
      expect(result).toBeGreaterThan(0);
    });
  });

  describe("complete", () => {
    it("sends correctly formatted request to Ollama API", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeChatResponse("○ ● ◎")),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig());
      await adapter.complete({
        systemPrompt: "You are an entity.",
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];

      expect(url).toBe("http://localhost:11434/api/chat");
      expect(options.method).toBe("POST");
      expect(options.headers).toEqual({ "Content-Type": "application/json" });

      const body = JSON.parse(options.body as string);
      expect(body.model).toBe("phi-3");
      expect(body.stream).toBe(false);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0]).toEqual({ role: "system", content: "You are an entity." });
      expect(body.messages[1]).toEqual({ role: "user", content: "Hello" });
    });

    it("returns parsed completion response", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeChatResponse("○ warm ●", {
          prompt_eval_count: 50,
          eval_count: 8,
          model: "phi-3:latest",
        })),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig());
      const response = await adapter.complete({
        systemPrompt: "You are a chromatic entity.",
        messages: [{ role: "user", content: "What do you see?" }],
      });

      expect(response.content).toBe("○ warm ●");
      expect(response.inputTokens).toBe(50);
      expect(response.outputTokens).toBe(8);
      expect(response.model).toBe("phi-3:latest");
      expect(response.truncated).toBe(false);
    });

    it("passes optional parameters (maxTokens, temperature, stopSequences)", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeChatResponse("response")),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig());
      await adapter.complete({
        systemPrompt: "System.",
        messages: [{ role: "user", content: "Hi" }],
        maxTokens: 256,
        temperature: 0.7,
        stopSequences: ["END", "STOP"],
      });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.options).toEqual({
        num_predict: 256,
        temperature: 0.7,
        stop: ["END", "STOP"],
      });
    });

    it("does not include options when none specified", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeChatResponse("response")),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig());
      await adapter.complete({
        systemPrompt: "System.",
        messages: [{ role: "user", content: "Hi" }],
      });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.options).toBeUndefined();
    });

    it("detects truncation when output tokens reach maxTokens", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeChatResponse("truncated text", {
          eval_count: 256,
        })),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig());
      const response = await adapter.complete({
        systemPrompt: "System.",
        messages: [{ role: "user", content: "Hi" }],
        maxTokens: 256,
      });

      expect(response.truncated).toBe(true);
    });

    it("falls back to estimated tokens when Ollama omits counts", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          model: "phi-3",
          message: { role: "assistant", content: "Hello there" },
          done: true,
          // No prompt_eval_count or eval_count
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig());
      const response = await adapter.complete({
        systemPrompt: "You are an entity.",
        messages: [{ role: "user", content: "Hi" }],
      });

      // Should estimate tokens instead of returning undefined
      expect(response.inputTokens).toBeGreaterThan(0);
      expect(response.outputTokens).toBeGreaterThan(0);
    });

    it("uses custom ollamaHost when configured", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeChatResponse("response")),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig({
        ollamaHost: "http://192.168.1.100:11434",
      }));
      await adapter.complete({
        systemPrompt: "System.",
        messages: [{ role: "user", content: "Hi" }],
      });

      const url = (fetchMock.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toBe("http://192.168.1.100:11434/api/chat");
    });

    it("normalizes host with trailing slash", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeChatResponse("response")),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig({
        ollamaHost: "http://localhost:11434/",
      }));
      await adapter.complete({
        systemPrompt: "System.",
        messages: [{ role: "user", content: "Hi" }],
      });

      const url = (fetchMock.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toBe("http://localhost:11434/api/chat");
    });

    it("adds http:// protocol if missing from host", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeChatResponse("response")),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig({
        ollamaHost: "localhost:11434",
      }));
      await adapter.complete({
        systemPrompt: "System.",
        messages: [{ role: "user", content: "Hi" }],
      });

      const url = (fetchMock.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toBe("http://localhost:11434/api/chat");
    });

    it("throws helpful error on connection refused", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed: Connection refused"));
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig());

      await expect(
        adapter.complete({
          systemPrompt: "System.",
          messages: [{ role: "user", content: "Hi" }],
        })
      ).rejects.toThrow("Is Ollama running?");
    });

    it("throws helpful error when model not found (404)", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: () => Promise.resolve('{"error":"model not found"}'),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig({ model: "nonexistent-model" }));

      await expect(
        adapter.complete({
          systemPrompt: "System.",
          messages: [{ role: "user", content: "Hi" }],
        })
      ).rejects.toThrow('Ollama model "nonexistent-model" not found');
    });

    it("throws on other HTTP errors", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("Something went wrong"),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig());

      await expect(
        adapter.complete({
          systemPrompt: "System.",
          messages: [{ role: "user", content: "Hi" }],
        })
      ).rejects.toThrow("Ollama API error (500)");
    });

    it("throws on invalid JSON response", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error("Unexpected token")),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig());

      await expect(
        adapter.complete({
          systemPrompt: "System.",
          messages: [{ role: "user", content: "Hi" }],
        })
      ).rejects.toThrow("invalid JSON");
    });

    it("handles empty content in response gracefully", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          model: "phi-3",
          message: { role: "assistant", content: "" },
          done: true,
          prompt_eval_count: 10,
          eval_count: 0,
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig());
      const response = await adapter.complete({
        systemPrompt: "System.",
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(response.content).toBe("");
      expect(response.outputTokens).toBe(0);
    });

    it("handles multiple conversation messages", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeChatResponse("response")),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig());
      await adapter.complete({
        systemPrompt: "You are an entity.",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "○" },
          { role: "user", content: "How are you?" },
        ],
      });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.messages).toHaveLength(4); // system + 3 conversation messages
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].role).toBe("user");
      expect(body.messages[2].role).toBe("assistant");
      expect(body.messages[3].role).toBe("user");
    });
  });

  describe("checkHealth", () => {
    it("returns available when Ollama is running and model exists", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTagsResponse(["phi-3:latest", "gemma:latest"])),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig({ model: "phi-3" }));
      const health = await adapter.checkHealth();

      expect(health.available).toBe(true);
      expect(health.provider).toBe("ollama");
      expect(health.model).toBe("phi-3");
      expect(health.providerType).toBe("local");
      expect(health.error).toBeUndefined();
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("matches model name with :latest suffix", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTagsResponse(["phi-3:latest"])),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig({ model: "phi-3" }));
      const health = await adapter.checkHealth();

      expect(health.available).toBe(true);
    });

    it("matches model name with custom tag", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTagsResponse(["phi-3:q4_0"])),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig({ model: "phi-3" }));
      const health = await adapter.checkHealth();

      expect(health.available).toBe(true);
    });

    it("matches exact model name without suffix", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTagsResponse(["phi-3"])),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig({ model: "phi-3" }));
      const health = await adapter.checkHealth();

      expect(health.available).toBe(true);
    });

    it("returns unavailable when model not found", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTagsResponse(["gemma:latest", "llama-3.1:latest"])),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig({ model: "phi-3" }));
      const health = await adapter.checkHealth();

      expect(health.available).toBe(false);
      expect(health.error).toContain('Model "phi-3" not found');
      expect(health.error).toContain("ollama pull phi-3");
      expect(health.error).toContain("gemma:latest");
    });

    it("returns unavailable when no models exist", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTagsResponse([])),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig({ model: "phi-3" }));
      const health = await adapter.checkHealth();

      expect(health.available).toBe(false);
      expect(health.error).toContain('Model "phi-3" not found');
      expect(health.error).toContain("(none)");
    });

    it("returns unavailable when Ollama is not running", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("Connection refused"));
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig());
      const health = await adapter.checkHealth();

      expect(health.available).toBe(false);
      expect(health.error).toContain("Cannot connect to Ollama");
      expect(health.error).toContain("Is Ollama running?");
      expect(health.provider).toBe("ollama");
      expect(health.providerType).toBe("local");
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("returns unavailable on non-200 HTTP response", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig());
      const health = await adapter.checkHealth();

      expect(health.available).toBe(false);
      expect(health.error).toContain("status 503");
    });

    it("returns unavailable on invalid JSON response", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error("Invalid JSON")),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig());
      const health = await adapter.checkHealth();

      expect(health.available).toBe(false);
      expect(health.error).toContain("invalid JSON");
    });

    it("calls the correct endpoint", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTagsResponse(["phi-3:latest"])),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig({
        ollamaHost: "http://myhost:11434",
      }));
      await adapter.checkHealth();

      expect(fetchMock).toHaveBeenCalledWith("http://myhost:11434/api/tags");
    });

    it("matches model names case-insensitively", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTagsResponse(["Phi-3:Latest"])),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig({ model: "phi-3" }));
      const health = await adapter.checkHealth();

      expect(health.available).toBe(true);
    });

    it("measures latency", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeTagsResponse(["phi-3:latest"])),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig());
      const health = await adapter.checkHealth();

      expect(typeof health.latencyMs).toBe("number");
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("LLMAdapter interface compliance", () => {
    it("satisfies the LLMAdapter interface", () => {
      const adapter: LLMAdapter = createOllamaAdapter(makeConfig());

      // All required properties exist
      expect(adapter.name).toBeDefined();
      expect(adapter.providerType).toBeDefined();
      expect(typeof adapter.getCapabilities).toBe("function");
      expect(typeof adapter.complete).toBe("function");
      expect(typeof adapter.checkHealth).toBe("function");
      expect(typeof adapter.estimateTokens).toBe("function");
    });

    it("complete returns a valid LLMCompletionResponse", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeChatResponse("○●◎")),
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = createOllamaAdapter(makeConfig());
      const response: LLMCompletionResponse = await adapter.complete({
        systemPrompt: "Entity soul.",
        messages: [{ role: "user", content: "Hello" }],
      });

      // Verify all required fields
      expect(typeof response.content).toBe("string");
      expect(typeof response.inputTokens).toBe("number");
      expect(typeof response.outputTokens).toBe("number");
      expect(typeof response.model).toBe("string");
      expect(typeof response.truncated).toBe("boolean");
    });
  });
});
