/**
 * Telegram Bot API — Send messages and images to a Telegram chat.
 *
 * Uses the Telegram Bot API (sendMessage / sendPhoto).
 * No external dependencies — raw HTTPS with node:https.
 */

import { request } from "node:https";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface TelegramMessage {
  /** Text content */
  content?: string;
  /** PNG image buffer to attach */
  image?: Buffer;
  /** Caption for the image (optional, used when image is present) */
  caption?: string;
}

export interface TelegramResult {
  success: boolean;
  error?: string;
}

/**
 * Send a text message to a Telegram chat.
 */
export async function sendTelegramMessage(
  config: TelegramConfig,
  message: TelegramMessage,
): Promise<TelegramResult> {
  if (!message.image && !message.content) {
    return { success: false, error: "Nothing to send (no content or image)" };
  }

  if (message.image) {
    return sendPhoto(config, message.image, message.caption ?? message.content);
  }

  return sendText(config, message.content!);
}

function sendText(config: TelegramConfig, text: string): Promise<TelegramResult> {
  const body = JSON.stringify({
    chat_id: config.chatId,
    text,
  });

  return new Promise((resolve) => {
    const req = request(
      {
        hostname: "api.telegram.org",
        path: `/bot${config.botToken}/sendMessage`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true });
          } else if (res.statusCode === 429) {
            resolve({ success: false, error: "Rate limited by Telegram. Try again later." });
          } else {
            resolve({
              success: false,
              error: `Telegram API returned ${res.statusCode}: ${data}`,
            });
          }
        });
      },
    );

    req.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });

    req.write(body);
    req.end();
  });
}

function sendPhoto(
  config: TelegramConfig,
  image: Buffer,
  caption?: string,
): Promise<TelegramResult> {
  const boundary = `----YADORIBoundary${Date.now()}`;
  const parts: Buffer[] = [];

  // chat_id field
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="chat_id"\r\n\r\n` +
    `${config.chatId}\r\n`,
  ));

  // caption field (optional)
  if (caption) {
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="caption"\r\n\r\n` +
      `${caption}\r\n`,
    ));
  }

  // photo file
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="photo"; filename="snapshot.png"\r\n` +
    `Content-Type: image/png\r\n\r\n`,
  ));
  parts.push(image);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  return new Promise((resolve) => {
    const req = request(
      {
        hostname: "api.telegram.org",
        path: `/bot${config.botToken}/sendPhoto`,
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true });
          } else if (res.statusCode === 429) {
            resolve({ success: false, error: "Rate limited by Telegram. Try again later." });
          } else {
            resolve({
              success: false,
              error: `Telegram API returned ${res.statusCode}: ${data}`,
            });
          }
        });
      },
    );

    req.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });

    req.write(body);
    req.end();
  });
}
