import { describe, it, expect } from "vitest";
import {
  estimateLocalModelCapacity,
  type LLMAdapter,
  type LLMCapabilities,
  type LLMCompletionRequest,
  type LLMCompletionResponse,
  type LLMHealthStatus,
} from "../../src/llm/llm-adapter.js";
import type { HardwareBody } from "../../src/types.js";

function makeHardware(ramGB: number, platform = "darwin", arch = "arm64"): HardwareBody {
  return {
    platform,
    arch,
    totalMemoryGB: ramGB,
    cpuModel: "Test CPU",
    storageGB: 256,
  };
}

describe("LLM Adapter", () => {
  describe("estimateLocalModelCapacity", () => {
    it("reports no local capability for < 4GB RAM", () => {
      const result = estimateLocalModelCapacity(makeHardware(2));
      expect(result.canRunLocal).toBe(false);
      expect(result.maxParameterBillions).toBe(0);
      expect(result.recommendedModels).toHaveLength(0);
    });

    it("recommends small models for 4GB RAM (Raspberry Pi)", () => {
      const result = estimateLocalModelCapacity(makeHardware(4));
      expect(result.canRunLocal).toBe(true);
      expect(result.maxParameterBillions).toBe(3);
      expect(result.recommendedModels.length).toBeGreaterThan(0);
    });

    it("recommends 7B models for 8GB RAM", () => {
      const result = estimateLocalModelCapacity(makeHardware(8));
      expect(result.canRunLocal).toBe(true);
      expect(result.maxParameterBillions).toBe(7);
    });

    it("recommends 13B models for 16GB RAM (Mac mini M4)", () => {
      const result = estimateLocalModelCapacity(makeHardware(16));
      expect(result.canRunLocal).toBe(true);
      expect(result.maxParameterBillions).toBe(13);
    });

    it("recommends large models for 32GB+ RAM", () => {
      const result = estimateLocalModelCapacity(makeHardware(64));
      expect(result.canRunLocal).toBe(true);
      expect(result.maxParameterBillions).toBe(30);
    });
  });

  describe("interface contract", () => {
    it("can be implemented as a mock adapter", async () => {
      const mockAdapter: LLMAdapter = {
        name: "Mock LLM",
        providerType: "local",
        getCapabilities(): LLMCapabilities {
          return {
            maxContextTokens: 4096,
            maxOutputTokens: 1024,
            supportsVision: false,
            supportsToolUse: false,
            supportsStreaming: false,
            estimatedTokensPerSecond: 20,
            providerType: "local",
          };
        },
        async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
          return {
            content: "○ ● ◎",
            inputTokens: 100,
            outputTokens: 5,
            model: "mock-model",
            truncated: false,
          };
        },
        async checkHealth(): Promise<LLMHealthStatus> {
          return {
            available: true,
            provider: "mock",
            model: "mock-model",
            providerType: "local",
            latencyMs: 10,
          };
        },
        estimateTokens(text: string): number {
          return Math.ceil(text.length / 4);
        },
      };

      // Verify the interface works
      const caps = mockAdapter.getCapabilities();
      expect(caps.maxContextTokens).toBe(4096);
      expect(caps.providerType).toBe("local");

      const response = await mockAdapter.complete({
        systemPrompt: "You are an entity.",
        messages: [{ role: "user", content: "Hello" }],
      });
      expect(response.content).toBe("○ ● ◎");

      const health = await mockAdapter.checkHealth();
      expect(health.available).toBe(true);

      const tokens = mockAdapter.estimateTokens("Hello world");
      expect(tokens).toBeGreaterThan(0);
    });

    it("supports cloud provider type", () => {
      const cloudAdapter: LLMAdapter = {
        name: "Claude API",
        providerType: "cloud",
        getCapabilities: () => ({
          maxContextTokens: 200000,
          maxOutputTokens: 8192,
          supportsVision: true,
          supportsToolUse: true,
          supportsStreaming: true,
          estimatedTokensPerSecond: null,
          providerType: "cloud",
        }),
        complete: async () => ({
          content: "response",
          inputTokens: 50,
          outputTokens: 10,
          model: "claude-sonnet-4-5-20250929",
          truncated: false,
        }),
        checkHealth: async () => ({
          available: true,
          provider: "anthropic",
          model: "claude-sonnet-4-5-20250929",
          providerType: "cloud",
        }),
        estimateTokens: (text) => Math.ceil(text.length / 3.5),
      };

      expect(cloudAdapter.providerType).toBe("cloud");
      expect(cloudAdapter.getCapabilities().supportsVision).toBe(true);
      expect(cloudAdapter.getCapabilities().estimatedTokensPerSecond).toBeNull();
    });
  });
});
