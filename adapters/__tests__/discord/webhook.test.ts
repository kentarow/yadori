/**
 * Tests for the Discord webhook adapter.
 *
 * All HTTP calls are mocked — no real Discord requests are made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage } from "node:http";
import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Mock node:https — must come before the import of the module under test.
// ---------------------------------------------------------------------------

/** Captured options from the most recent `request()` call. */
let lastRequestOptions: Record<string, unknown> | null = null;
/** Captured body written to the most recent request. */
let lastRequestBody: Buffer | null = null;
/** The response callback provided to `request()`. */
let responseCallback: ((res: IncomingMessage) => void) | null = null;
/** Fake ClientRequest returned by `request()`. */
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
      write: vi.fn((data: Buffer | string) => {
        lastRequestBody = Buffer.isBuffer(data) ? data : Buffer.from(data);
      }),
      end: vi.fn(),
    });

    return fakeRequest;
  },
}));

// Import the module under test *after* the mock is registered.
import {
  sendWebhookMessage,
  type WebhookMessage,
} from "../../src/discord/webhook.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulate a response from Discord with the given status code and body.
 * This calls the stored response callback and emits data/end events.
 */
function resolveResponse(statusCode: number, body = "") {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  res.statusCode = statusCode;
  responseCallback!(res as unknown as IncomingMessage);
  res.emit("data", body);
  res.emit("end");
}

/** Simulate a network-level error on the request. */
function rejectRequest(message: string) {
  fakeRequest.emit("error", new Error(message));
}

const VALID_WEBHOOK =
  "https://discord.com/api/webhooks/123456789/abcdefABCDEF";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sendWebhookMessage", () => {
  beforeEach(() => {
    lastRequestOptions = null;
    lastRequestBody = null;
    responseCallback = null;
  });

  // ---- Webhook URL validation ----

  describe("webhook URL validation", () => {
    it("accepts a valid Discord webhook URL", async () => {
      const promise = sendWebhookMessage(VALID_WEBHOOK, { content: "hello" });
      resolveResponse(204);
      const result = await promise;
      expect(result.success).toBe(true);
    });

    it("throws on a completely invalid URL", async () => {
      await expect(
        sendWebhookMessage("not-a-url", { content: "hello" }),
      ).rejects.toThrow();
    });

    it("sends the request to the correct hostname and path", async () => {
      const url =
        "https://discord.com/api/webhooks/111222333/tokenTokenTOKEN";
      const promise = sendWebhookMessage(url, { content: "ping" });
      resolveResponse(204);
      await promise;

      expect(lastRequestOptions).not.toBeNull();
      expect(lastRequestOptions!.hostname).toBe("discord.com");
      expect(lastRequestOptions!.path).toBe(
        "/api/webhooks/111222333/tokenTokenTOKEN",
      );
    });
  });

  // ---- Empty message ----

  describe("empty message handling", () => {
    it("returns an error when message has neither content nor image", async () => {
      const msg: WebhookMessage = {};
      const result = await sendWebhookMessage(VALID_WEBHOOK, msg);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Nothing to send");
    });

    it("returns an error when content is undefined and image is undefined", async () => {
      const result = await sendWebhookMessage(VALID_WEBHOOK, {
        content: undefined,
        image: undefined,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Nothing to send");
    });
  });

  // ---- Text-only message (JSON payload) ----

  describe("text-only message sending", () => {
    it("sends a JSON payload when only content is provided", async () => {
      const promise = sendWebhookMessage(VALID_WEBHOOK, {
        content: "Hello YADORI",
      });
      resolveResponse(200);
      const result = await promise;

      expect(result.success).toBe(true);
      expect(lastRequestOptions!.method).toBe("POST");
      expect(lastRequestOptions!.headers).toMatchObject({
        "Content-Type": "application/json",
      });

      // Verify body is valid JSON with the content field
      const body = JSON.parse(lastRequestBody!.toString());
      expect(body.content).toBe("Hello YADORI");
    });

    it("accepts 204 No Content as success", async () => {
      const promise = sendWebhookMessage(VALID_WEBHOOK, { content: "test" });
      resolveResponse(204);
      const result = await promise;
      expect(result.success).toBe(true);
    });

    it("accepts 200 OK as success", async () => {
      const promise = sendWebhookMessage(VALID_WEBHOOK, { content: "test" });
      resolveResponse(200);
      const result = await promise;
      expect(result.success).toBe(true);
    });
  });

  // ---- Image message (multipart) ----

  describe("image message sending", () => {
    it("sends multipart/form-data when image is provided", async () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
      const promise = sendWebhookMessage(VALID_WEBHOOK, {
        content: "Look at this!",
        image: png,
      });
      resolveResponse(200);
      const result = await promise;

      expect(result.success).toBe(true);
      const contentType = (
        lastRequestOptions!.headers as Record<string, string>
      )["Content-Type"];
      expect(contentType).toContain("multipart/form-data");
      expect(contentType).toContain("boundary=");
    });

    it("includes the PNG data in the multipart body", async () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      const promise = sendWebhookMessage(VALID_WEBHOOK, { image: png });
      resolveResponse(200);
      await promise;

      const body = lastRequestBody!;
      expect(body.includes(png)).toBe(true);
    });

    it("uses the default filename 'snapshot.png' when none is specified", async () => {
      const png = Buffer.from([0x89, 0x50]);
      const promise = sendWebhookMessage(VALID_WEBHOOK, { image: png });
      resolveResponse(200);
      await promise;

      const bodyStr = lastRequestBody!.toString();
      expect(bodyStr).toContain('filename="snapshot.png"');
    });

    it("uses a custom filename when specified", async () => {
      const png = Buffer.from([0x89, 0x50]);
      const promise = sendWebhookMessage(VALID_WEBHOOK, {
        image: png,
        filename: "entity-portrait.png",
      });
      resolveResponse(200);
      await promise;

      const bodyStr = lastRequestBody!.toString();
      expect(bodyStr).toContain('filename="entity-portrait.png"');
    });

    it("includes payload_json part when content accompanies an image", async () => {
      const png = Buffer.from([0x89, 0x50]);
      const promise = sendWebhookMessage(VALID_WEBHOOK, {
        content: "Daily snapshot",
        image: png,
      });
      resolveResponse(200);
      await promise;

      const bodyStr = lastRequestBody!.toString();
      expect(bodyStr).toContain("payload_json");
      expect(bodyStr).toContain("Daily snapshot");
    });

    it("omits payload_json part when image is sent without content", async () => {
      const png = Buffer.from([0x89, 0x50]);
      const promise = sendWebhookMessage(VALID_WEBHOOK, { image: png });
      resolveResponse(200);
      await promise;

      const bodyStr = lastRequestBody!.toString();
      expect(bodyStr).not.toContain("payload_json");
    });

    it("sets Content-Type to image/png for the file part", async () => {
      const png = Buffer.from([0x89, 0x50]);
      const promise = sendWebhookMessage(VALID_WEBHOOK, { image: png });
      resolveResponse(200);
      await promise;

      const bodyStr = lastRequestBody!.toString();
      expect(bodyStr).toContain("Content-Type: image/png");
    });
  });

  // ---- Rate limiting ----

  describe("rate limiting", () => {
    it("returns a descriptive error on 429 for multipart requests", async () => {
      const png = Buffer.from([0x89, 0x50]);
      const promise = sendWebhookMessage(VALID_WEBHOOK, { image: png });
      resolveResponse(
        429,
        '{"message":"You are being rate limited.","retry_after":5}',
      );
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("Rate limited");
    });

    it("returns a failure on 429 for JSON requests", async () => {
      const promise = sendWebhookMessage(VALID_WEBHOOK, { content: "test" });
      resolveResponse(429, '{"message":"You are being rate limited."}');
      const result = await promise;

      // The JSON path goes through the generic error branch.
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ---- Error handling ----

  describe("error handling", () => {
    it("returns error on 400 Bad Request", async () => {
      const promise = sendWebhookMessage(VALID_WEBHOOK, { content: "test" });
      resolveResponse(400, '{"message":"Invalid Form Body"}');
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("400");
    });

    it("returns error on 401 Unauthorized", async () => {
      const promise = sendWebhookMessage(VALID_WEBHOOK, { content: "test" });
      resolveResponse(401, "Unauthorized");
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("401");
    });

    it("returns error on 404 Not Found", async () => {
      const promise = sendWebhookMessage(VALID_WEBHOOK, { content: "test" });
      resolveResponse(404, '{"message":"Unknown Webhook"}');
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("404");
    });

    it("returns error on 500 Internal Server Error", async () => {
      const promise = sendWebhookMessage(VALID_WEBHOOK, { content: "test" });
      resolveResponse(500, "Internal Server Error");
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("500");
    });

    it("handles network errors gracefully", async () => {
      const promise = sendWebhookMessage(VALID_WEBHOOK, { content: "test" });
      rejectRequest("ECONNREFUSED");
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("ECONNREFUSED");
    });

    it("includes the Discord response body in the error message", async () => {
      const promise = sendWebhookMessage(VALID_WEBHOOK, { content: "test" });
      resolveResponse(403, '{"message":"Missing Permissions"}');
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing Permissions");
    });
  });
});
