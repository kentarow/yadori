import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadMessengerConfig,
  isMessengerConfigured,
} from "../src/messenger.js";

describe("loadMessengerConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "yadori-messenger-test-"));
    // Clear env vars
    delete process.env.YADORI_DISCORD_WEBHOOK;
    delete process.env.YADORI_TELEGRAM_TOKEN;
    delete process.env.YADORI_TELEGRAM_CHAT_ID;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
    delete process.env.YADORI_DISCORD_WEBHOOK;
    delete process.env.YADORI_TELEGRAM_TOKEN;
    delete process.env.YADORI_TELEGRAM_CHAT_ID;
  });

  it("returns empty config when no webhook.json and no env vars", async () => {
    const config = await loadMessengerConfig(tmpDir);
    expect(config.discord).toBeNull();
    expect(config.telegram).toBeNull();
  });

  it("reads discord from webhook.json", async () => {
    await writeFile(
      join(tmpDir, "webhook.json"),
      JSON.stringify({ discord: "https://discord.com/api/webhooks/123/abc" }),
      "utf-8",
    );
    const config = await loadMessengerConfig(tmpDir);
    expect(config.discord).toBe("https://discord.com/api/webhooks/123/abc");
    expect(config.telegram).toBeNull();
  });

  it("reads telegram from webhook.json", async () => {
    await writeFile(
      join(tmpDir, "webhook.json"),
      JSON.stringify({ telegram: { botToken: "123:ABC", chatId: "456" } }),
      "utf-8",
    );
    const config = await loadMessengerConfig(tmpDir);
    expect(config.discord).toBeNull();
    expect(config.telegram).toEqual({ botToken: "123:ABC", chatId: "456" });
  });

  it("reads both platforms from webhook.json", async () => {
    await writeFile(
      join(tmpDir, "webhook.json"),
      JSON.stringify({
        discord: "https://discord.com/api/webhooks/123/abc",
        telegram: { botToken: "123:ABC", chatId: "456" },
      }),
      "utf-8",
    );
    const config = await loadMessengerConfig(tmpDir);
    expect(config.discord).toBe("https://discord.com/api/webhooks/123/abc");
    expect(config.telegram).toEqual({ botToken: "123:ABC", chatId: "456" });
  });

  it("environment variables take precedence over webhook.json", async () => {
    await writeFile(
      join(tmpDir, "webhook.json"),
      JSON.stringify({ discord: "https://discord.com/api/webhooks/old/url" }),
      "utf-8",
    );
    process.env.YADORI_DISCORD_WEBHOOK = "https://discord.com/api/webhooks/new/url";

    const config = await loadMessengerConfig(tmpDir);
    expect(config.discord).toBe("https://discord.com/api/webhooks/new/url");
  });

  it("reads telegram from environment variables", async () => {
    process.env.YADORI_TELEGRAM_TOKEN = "999:XYZ";
    process.env.YADORI_TELEGRAM_CHAT_ID = "777";

    const config = await loadMessengerConfig(tmpDir);
    expect(config.telegram).toEqual({ botToken: "999:XYZ", chatId: "777" });
  });

  it("ignores incomplete telegram env vars (token only)", async () => {
    process.env.YADORI_TELEGRAM_TOKEN = "999:XYZ";
    // No YADORI_TELEGRAM_CHAT_ID

    const config = await loadMessengerConfig(tmpDir);
    expect(config.telegram).toBeNull();
  });

  it("ignores incomplete telegram in webhook.json (missing chatId)", async () => {
    await writeFile(
      join(tmpDir, "webhook.json"),
      JSON.stringify({ telegram: { botToken: "123:ABC" } }),
      "utf-8",
    );
    const config = await loadMessengerConfig(tmpDir);
    expect(config.telegram).toBeNull();
  });

  it("fills gaps: env has discord, webhook.json has telegram", async () => {
    process.env.YADORI_DISCORD_WEBHOOK = "https://discord.com/api/webhooks/env/url";
    await writeFile(
      join(tmpDir, "webhook.json"),
      JSON.stringify({ telegram: { botToken: "123:ABC", chatId: "456" } }),
      "utf-8",
    );

    const config = await loadMessengerConfig(tmpDir);
    expect(config.discord).toBe("https://discord.com/api/webhooks/env/url");
    expect(config.telegram).toEqual({ botToken: "123:ABC", chatId: "456" });
  });
});

describe("isMessengerConfigured", () => {
  it("returns false when nothing configured", () => {
    expect(isMessengerConfigured({ discord: null, telegram: null })).toBe(false);
  });

  it("returns true when discord configured", () => {
    expect(isMessengerConfigured({ discord: "https://...", telegram: null })).toBe(true);
  });

  it("returns true when telegram configured", () => {
    expect(
      isMessengerConfigured({
        discord: null,
        telegram: { botToken: "123:ABC", chatId: "456" },
      }),
    ).toBe(true);
  });

  it("returns true when both configured", () => {
    expect(
      isMessengerConfigured({
        discord: "https://...",
        telegram: { botToken: "123:ABC", chatId: "456" },
      }),
    ).toBe(true);
  });
});
