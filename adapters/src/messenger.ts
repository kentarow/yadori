/**
 * Unified Messenger — Sends messages and images to configured platforms.
 *
 * Abstracts over Discord webhook and Telegram Bot API.
 * Reads configuration from:
 *   1. Environment variables (YADORI_DISCORD_WEBHOOK, YADORI_TELEGRAM_TOKEN, YADORI_TELEGRAM_CHAT_ID)
 *   2. webhook.json in the workspace
 *
 * webhook.json format:
 * {
 *   "discord": "https://discord.com/api/webhooks/...",
 *   "telegram": { "botToken": "123:ABC...", "chatId": "12345" }
 * }
 *
 * Messages are sent to ALL configured platforms (Discord AND Telegram if both set).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { sendWebhookMessage, type WebhookResult } from "./discord/webhook.js";
import { sendTelegramMessage, type TelegramConfig } from "./telegram/bot-api.js";

export interface MessengerConfig {
  discord: string | null;
  telegram: TelegramConfig | null;
}

export interface OutgoingMessage {
  /** Text content */
  content?: string;
  /** PNG image buffer */
  image?: Buffer;
  /** Filename (Discord) or caption (Telegram) */
  filename?: string;
}

export interface SendResult {
  /** True if at least one platform succeeded */
  success: boolean;
  discord?: WebhookResult;
  telegram?: { success: boolean; error?: string };
}

/**
 * Load messenger configuration from environment variables and webhook.json.
 * Environment variables take precedence.
 */
export async function loadMessengerConfig(workspaceRoot?: string): Promise<MessengerConfig> {
  const root = workspaceRoot ?? join(homedir(), ".openclaw", "workspace");

  let discord: string | null = null;
  let telegram: TelegramConfig | null = null;

  // Environment variables (highest priority)
  if (process.env.YADORI_DISCORD_WEBHOOK) {
    discord = process.env.YADORI_DISCORD_WEBHOOK;
  }
  if (process.env.YADORI_TELEGRAM_TOKEN && process.env.YADORI_TELEGRAM_CHAT_ID) {
    telegram = {
      botToken: process.env.YADORI_TELEGRAM_TOKEN,
      chatId: process.env.YADORI_TELEGRAM_CHAT_ID,
    };
  }

  // webhook.json (fill in any gaps not covered by env vars)
  try {
    const content = await readFile(join(root, "webhook.json"), "utf-8");
    const config = JSON.parse(content);

    if (!discord && config.discord) {
      discord = config.discord as string;
    }
    if (!telegram && config.telegram?.botToken && config.telegram?.chatId) {
      telegram = {
        botToken: config.telegram.botToken as string,
        chatId: config.telegram.chatId as string,
      };
    }
  } catch { /* no config file */ }

  return { discord, telegram };
}

/**
 * Check if any messaging platform is configured.
 */
export function isMessengerConfigured(config: MessengerConfig): boolean {
  return config.discord !== null || config.telegram !== null;
}

/**
 * Send a message to all configured platforms.
 * Returns success:true if at least one platform delivery succeeds.
 */
export async function sendMessage(
  config: MessengerConfig,
  message: OutgoingMessage,
): Promise<SendResult> {
  const result: SendResult = { success: false };

  // Send to Discord
  if (config.discord) {
    result.discord = await sendWebhookMessage(config.discord, {
      content: message.content,
      image: message.image,
      filename: message.filename,
    });
    if (result.discord.success) result.success = true;
  }

  // Send to Telegram
  if (config.telegram) {
    result.telegram = await sendTelegramMessage(config.telegram, {
      content: message.content,
      image: message.image,
      caption: message.content,
    });
    if (result.telegram.success) result.success = true;
  }

  return result;
}
