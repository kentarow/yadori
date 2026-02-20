/**
 * Tests for the Discord bot profile updater.
 *
 * All HTTP calls are mocked — no real Discord API requests are made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage } from "node:http";
import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Mock node:https
// ---------------------------------------------------------------------------

let lastRequestOptions: Record<string, unknown> | null = null;
let lastRequestBody: string | null = null;
let responseCallback: ((res: IncomingMessage) => void) | null = null;
let fakeRequest: EventEmitter & {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};

vi.mock("node:https", () => ({
  request: (
    options: Record<string, unknown>,
    callback: (res: IncomingMessage) => void,
  ) => {
    lastRequestOptions = options;
    responseCallback = callback;

    fakeRequest = Object.assign(new EventEmitter(), {
      write: vi.fn((data: string | Buffer) => {
        lastRequestBody = typeof data === "string" ? data : data.toString();
      }),
      end: vi.fn(),
    });

    return fakeRequest;
  },
}));

import {
  updateDiscordBotProfile,
  type BotProfileUpdate,
} from "../../src/discord/bot-profile.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveResponse(statusCode: number, body = "") {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  res.statusCode = statusCode;
  responseCallback!(res as unknown as IncomingMessage);
  res.emit("data", body);
  res.emit("end");
}

function rejectRequest(message: string) {
  fakeRequest.emit("error", new Error(message));
}

const FAKE_TOKEN =
  "MTIzNDU2Nzg5MDEyMzQ1Njc4.GabcDE.abcdefghijklmnopqrstuvwxyz";

function makeProfile(overrides?: Partial<BotProfileUpdate>): BotProfileUpdate {
  return {
    username: overrides?.username ?? "TestEntity",
    avatarPng: overrides?.avatarPng ?? Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("updateDiscordBotProfile", () => {
  beforeEach(() => {
    lastRequestOptions = null;
    lastRequestBody = null;
    responseCallback = null;
  });

  // ---- API endpoint ----

  describe("API request configuration", () => {
    it("sends a PATCH request to /api/v10/users/@me", async () => {
      const promise = updateDiscordBotProfile(FAKE_TOKEN, makeProfile());
      resolveResponse(200, JSON.stringify({ username: "TestEntity" }));
      const result = await promise;

      expect(result.success).toBe(true);
      expect(lastRequestOptions).not.toBeNull();
      expect(lastRequestOptions!.method).toBe("PATCH");
      expect(lastRequestOptions!.hostname).toBe("discord.com");
      expect(lastRequestOptions!.path).toBe("/api/v10/users/@me");
    });

    it("sends the bot token in the Authorization header", async () => {
      const promise = updateDiscordBotProfile(FAKE_TOKEN, makeProfile());
      resolveResponse(200, JSON.stringify({ username: "TestEntity" }));
      await promise;

      const headers = lastRequestOptions!.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bot ${FAKE_TOKEN}`);
    });

    it("sets Content-Type to application/json", async () => {
      const promise = updateDiscordBotProfile(FAKE_TOKEN, makeProfile());
      resolveResponse(200, JSON.stringify({ username: "TestEntity" }));
      await promise;

      const headers = lastRequestOptions!.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });

  // ---- Avatar format ----

  describe("avatar data format", () => {
    it("encodes avatar as a base64 data URI with image/png mime type", async () => {
      const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      const promise = updateDiscordBotProfile(
        FAKE_TOKEN,
        makeProfile({ avatarPng: pngBytes }),
      );
      resolveResponse(200, JSON.stringify({ username: "TestEntity" }));
      await promise;

      const body = JSON.parse(lastRequestBody!);
      expect(body.avatar).toMatch(/^data:image\/png;base64,/);
    });

    it("produces correct base64 for known input bytes", async () => {
      const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const expectedBase64 = pngBytes.toString("base64");

      const promise = updateDiscordBotProfile(
        FAKE_TOKEN,
        makeProfile({ avatarPng: pngBytes }),
      );
      resolveResponse(200, JSON.stringify({ username: "TestEntity" }));
      await promise;

      const body = JSON.parse(lastRequestBody!);
      expect(body.avatar).toBe(`data:image/png;base64,${expectedBase64}`);
    });
  });

  // ---- Username / name formatting ----

  describe("username in payload", () => {
    it("sends the username in the JSON body", async () => {
      const promise = updateDiscordBotProfile(
        FAKE_TOKEN,
        makeProfile({ username: "ChromaticEntity" }),
      );
      resolveResponse(200, JSON.stringify({ username: "ChromaticEntity" }));
      await promise;

      const body = JSON.parse(lastRequestBody!);
      expect(body.username).toBe("ChromaticEntity");
    });

    it("preserves special characters in username", async () => {
      const promise = updateDiscordBotProfile(
        FAKE_TOKEN,
        makeProfile({ username: "Entity-01 (alpha)" }),
      );
      resolveResponse(
        200,
        JSON.stringify({ username: "Entity-01 (alpha)" }),
      );
      await promise;

      const body = JSON.parse(lastRequestBody!);
      expect(body.username).toBe("Entity-01 (alpha)");
    });

    it("sends an empty string username when provided", async () => {
      const promise = updateDiscordBotProfile(
        FAKE_TOKEN,
        makeProfile({ username: "" }),
      );
      // Discord will reject empty username with 400.
      resolveResponse(400, '{"message":"Invalid Form Body"}');
      const result = await promise;

      const body = JSON.parse(lastRequestBody!);
      expect(body.username).toBe("");
      expect(result.success).toBe(false);
    });
  });

  // ---- Successful responses ----

  describe("successful profile update", () => {
    it("returns success with the username from Discord's response", async () => {
      const promise = updateDiscordBotProfile(
        FAKE_TOKEN,
        makeProfile({ username: "NewName" }),
      );
      resolveResponse(
        200,
        JSON.stringify({ username: "NewName", id: "12345" }),
      );
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.username).toBe("NewName");
    });

    it("falls back to the input username if Discord response is not valid JSON", async () => {
      const promise = updateDiscordBotProfile(
        FAKE_TOKEN,
        makeProfile({ username: "FallbackName" }),
      );
      resolveResponse(200, "not-json");
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.username).toBe("FallbackName");
    });
  });

  // ---- Rate limiting ----

  describe("rate limiting", () => {
    it("returns a rate-limit error on 429", async () => {
      const promise = updateDiscordBotProfile(FAKE_TOKEN, makeProfile());
      resolveResponse(
        429,
        '{"message":"You are being rate limited.","retry_after":60}',
      );
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("Rate limited");
    });
  });

  // ---- Error handling ----

  describe("error handling", () => {
    it("returns error on 401 (invalid token)", async () => {
      const promise = updateDiscordBotProfile("bad-token", makeProfile());
      resolveResponse(401, '{"message":"401: Unauthorized"}');
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("401");
    });

    it("returns error on 400 (bad payload)", async () => {
      const promise = updateDiscordBotProfile(FAKE_TOKEN, makeProfile());
      resolveResponse(400, '{"message":"Invalid Form Body"}');
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("400");
    });

    it("handles network errors gracefully", async () => {
      const promise = updateDiscordBotProfile(FAKE_TOKEN, makeProfile());
      rejectRequest("ETIMEDOUT");
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("ETIMEDOUT");
    });

    it("includes Discord error message body in the error string", async () => {
      const promise = updateDiscordBotProfile(FAKE_TOKEN, makeProfile());
      resolveResponse(403, '{"message":"Missing Access"}');
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing Access");
    });
  });
});
