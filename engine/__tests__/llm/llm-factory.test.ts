import { describe, it, expect, vi } from "vitest";
import type { HardwareBody } from "../../src/types.js";
import type { LLMAdapter, LLMAdapterConfig } from "../../src/llm/llm-adapter.js";

/**
 * Helper: create a minimal mock LLMAdapter with the given name and provider type.
 */
function makeMockAdapter(name: string, providerType: "cloud" | "local"): LLMAdapter {
  return {
    name,
    providerType,
    getCapabilities: () => ({
      maxContextTokens: 4096,
      maxOutputTokens: 1024,
      supportsVision: false,
      supportsToolUse: false,
      supportsStreaming: false,
      estimatedTokensPerSecond: providerType === "local" ? 20 : null,
      providerType,
    }),
    complete: async () => ({
      content: "mock",
      inputTokens: 10,
      outputTokens: 5,
      model: "mock-model",
      truncated: false,
    }),
    checkHealth: async () => ({
      available: true,
      provider: name,
      model: "mock-model",
      providerType,
    }),
    estimateTokens: (text: string) => Math.ceil(text.length / 4),
  };
}

// Mock the adapter modules before importing the factory
vi.mock("../../src/llm/claude-adapter.js", () => ({
  createClaudeAdapter: (config: LLMAdapterConfig) =>
    makeMockAdapter(`Claude API (${config.model})`, "cloud"),
}));

vi.mock("../../src/llm/ollama-adapter.js", () => ({
  createOllamaAdapter: (config: LLMAdapterConfig) =>
    makeMockAdapter(`Ollama (${config.model})`, "local"),
}));

// Import the factory after mocks are set up
import {
  createLLMAdapter,
  detectRecommendedConfig,
  validateConfig,
} from "../../src/llm/llm-factory.js";

/**
 * Helper: create a HardwareBody with the given RAM size.
 */
function makeHardware(
  ramGB: number,
  platform = "darwin",
  arch = "arm64",
): HardwareBody {
  return {
    platform,
    arch,
    totalMemoryGB: ramGB,
    cpuModel: "Test CPU",
    storageGB: 256,
  };
}

describe("LLM Factory", () => {
  describe("createLLMAdapter", () => {
    it("creates a Claude adapter for provider 'claude'", () => {
      const adapter = createLLMAdapter({
        provider: "claude",
        model: "claude-sonnet-4-5-20250929",
        apiKey: "sk-test-key",
      });

      expect(adapter.name).toBe("Claude API (claude-sonnet-4-5-20250929)");
      expect(adapter.providerType).toBe("cloud");
    });

    it("creates an Ollama adapter for provider 'ollama'", () => {
      const adapter = createLLMAdapter({
        provider: "ollama",
        model: "phi-3",
        ollamaHost: "http://localhost:11434",
      });

      expect(adapter.name).toBe("Ollama (phi-3)");
      expect(adapter.providerType).toBe("local");
    });

    it("throws for unimplemented provider 'openai'", () => {
      expect(() =>
        createLLMAdapter({ provider: "openai", model: "gpt-4o", apiKey: "sk-test" }),
      ).toThrow("OpenAI adapter not yet implemented");
    });

    it("throws for unimplemented provider 'llamacpp'", () => {
      expect(() =>
        createLLMAdapter({ provider: "llamacpp", model: "llama-3.1-8b" }),
      ).toThrow("llama.cpp adapter not yet implemented");
    });

    it("throws for an unknown provider", () => {
      expect(() =>
        createLLMAdapter({
          provider: "unknown" as LLMAdapterConfig["provider"],
          model: "some-model",
        }),
      ).toThrow(/Unknown LLM provider: "unknown"/);
      expect(() =>
        createLLMAdapter({
          provider: "unknown" as LLMAdapterConfig["provider"],
          model: "some-model",
        }),
      ).toThrow(/Supported providers: claude, openai, ollama, llamacpp/);
    });
  });

  describe("detectRecommendedConfig", () => {
    it("recommends Ollama for hardware that can run local models (4GB)", () => {
      const config = detectRecommendedConfig(makeHardware(4));

      expect(config.provider).toBe("ollama");
      expect(config.model).toBe("phi-3-mini");
      expect(config.ollamaHost).toBe("http://localhost:11434");
    });

    it("recommends Ollama with appropriate model for 8GB RAM", () => {
      const config = detectRecommendedConfig(makeHardware(8));

      expect(config.provider).toBe("ollama");
      expect(config.model).toBe("phi-3");
      expect(config.ollamaHost).toBe("http://localhost:11434");
    });

    it("recommends Ollama for Mac mini M4 (16GB)", () => {
      const config = detectRecommendedConfig(makeHardware(16));

      expect(config.provider).toBe("ollama");
      expect(config.model).toBe("llama-3.1-8b");
      expect(config.ollamaHost).toBe("http://localhost:11434");
    });

    it("recommends Ollama for high-RAM hardware (64GB)", () => {
      const config = detectRecommendedConfig(makeHardware(64));

      expect(config.provider).toBe("ollama");
      expect(config.model).toBe("llama-3.1-70b-q4");
    });

    it("falls back to Claude for hardware that cannot run local models (2GB)", () => {
      const config = detectRecommendedConfig(makeHardware(2));

      expect(config.provider).toBe("claude");
      expect(config.model).toBe("claude-sonnet-4-5-20250929");
      expect(config.apiKey).toBeUndefined();
    });
  });

  describe("validateConfig", () => {
    describe("claude provider", () => {
      it("validates a complete Claude config", () => {
        const result = validateConfig({
          provider: "claude",
          model: "claude-sonnet-4-5-20250929",
          apiKey: "sk-ant-test-key",
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("requires apiKey for Claude", () => {
        const result = validateConfig({
          provider: "claude",
          model: "claude-sonnet-4-5-20250929",
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("apiKey is required for Claude provider");
      });

      it("requires model for Claude", () => {
        const result = validateConfig({
          provider: "claude",
          model: "",
          apiKey: "sk-ant-test-key",
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("model is required for Claude provider");
      });

      it("reports multiple errors when both apiKey and model are missing", () => {
        const result = validateConfig({
          provider: "claude",
          model: "",
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(2);
        expect(result.errors).toContain("apiKey is required for Claude provider");
        expect(result.errors).toContain("model is required for Claude provider");
      });
    });

    describe("openai provider", () => {
      it("validates a complete OpenAI config", () => {
        const result = validateConfig({
          provider: "openai",
          model: "gpt-4o",
          apiKey: "sk-test-key",
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("requires apiKey for OpenAI", () => {
        const result = validateConfig({
          provider: "openai",
          model: "gpt-4o",
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("apiKey is required for OpenAI provider");
      });

      it("requires model for OpenAI", () => {
        const result = validateConfig({
          provider: "openai",
          model: "",
          apiKey: "sk-test-key",
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("model is required for OpenAI provider");
      });
    });

    describe("ollama provider", () => {
      it("validates a minimal Ollama config (model only)", () => {
        const result = validateConfig({
          provider: "ollama",
          model: "phi-3",
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("validates Ollama config with optional ollamaHost", () => {
        const result = validateConfig({
          provider: "ollama",
          model: "phi-3",
          ollamaHost: "http://192.168.1.100:11434",
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("requires model for Ollama", () => {
        const result = validateConfig({
          provider: "ollama",
          model: "",
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("model is required for Ollama provider");
      });

      it("does not require apiKey for Ollama", () => {
        const result = validateConfig({
          provider: "ollama",
          model: "phi-3",
        });

        expect(result.valid).toBe(true);
      });
    });

    describe("llamacpp provider", () => {
      it("validates a minimal llama.cpp config (model only)", () => {
        const result = validateConfig({
          provider: "llamacpp",
          model: "llama-3.1-8b",
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("validates llama.cpp config with optional llamaCppHost", () => {
        const result = validateConfig({
          provider: "llamacpp",
          model: "llama-3.1-8b",
          llamaCppHost: "http://localhost:8080",
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("requires model for llama.cpp", () => {
        const result = validateConfig({
          provider: "llamacpp",
          model: "",
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("model is required for llama.cpp provider");
      });
    });

    describe("invalid provider", () => {
      it("rejects an unknown provider", () => {
        const result = validateConfig({
          provider: "unknown" as LLMAdapterConfig["provider"],
          model: "some-model",
        });

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toMatch(/Unknown provider "unknown"/);
      });
    });
  });
});
