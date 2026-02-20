import { describe, it, expect } from "vitest";
import type { TelegramConfig, TelegramMessage } from "../../src/telegram/bot-api.js";
import { sendTelegramMessage } from "../../src/telegram/bot-api.js";

describe("sendTelegramMessage", () => {
  const config: TelegramConfig = {
    botToken: "123456:ABC-DEF",
    chatId: "789",
  };

  it("returns error when message has no content or image", async () => {
    const msg: TelegramMessage = {};
    const result = await sendTelegramMessage(config, msg);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Nothing to send");
  });
});
