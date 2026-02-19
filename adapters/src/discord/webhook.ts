/**
 * Discord Webhook — Send images and messages to a Discord channel.
 *
 * Uses Discord's webhook API with multipart/form-data to attach PNG images.
 * No external dependencies — raw HTTPS with node:https.
 */

import { request } from "node:https";

export interface WebhookMessage {
  /** Text content to accompany the image (optional) */
  content?: string;
  /** PNG image buffer to attach */
  image?: Buffer;
  /** Filename for the attached image (default: "snapshot.png") */
  filename?: string;
}

export interface WebhookResult {
  success: boolean;
  error?: string;
}

/**
 * Send a message with an optional image attachment to a Discord webhook.
 *
 * @param webhookUrl - Full Discord webhook URL
 *   (e.g. https://discord.com/api/webhooks/XXXX/YYYY)
 * @param message - Content and/or image to send
 */
export async function sendWebhookMessage(
  webhookUrl: string,
  message: WebhookMessage,
): Promise<WebhookResult> {
  const url = new URL(webhookUrl);

  if (!message.image && !message.content) {
    return { success: false, error: "Nothing to send (no content or image)" };
  }

  // If no image, send a simple JSON payload
  if (!message.image) {
    return sendJsonPayload(url, { content: message.content });
  }

  // With an image: use multipart/form-data
  const boundary = `----YADORIBoundary${Date.now()}`;
  const filename = message.filename ?? "snapshot.png";

  const parts: Buffer[] = [];

  // JSON payload part (for the text content)
  if (message.content) {
    const payloadJson = JSON.stringify({ content: message.content });
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="payload_json"\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${payloadJson}\r\n`,
    ));
  }

  // File part
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="files[0]"; filename="${filename}"\r\n` +
    `Content-Type: image/png\r\n\r\n`,
  ));
  parts.push(message.image);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  return new Promise((resolve) => {
    const req = request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
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
            resolve({ success: false, error: "Rate limited by Discord. Try again later." });
          } else {
            resolve({
              success: false,
              error: `Discord webhook returned ${res.statusCode}: ${data}`,
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

function sendJsonPayload(
  url: URL,
  payload: Record<string, unknown>,
): Promise<WebhookResult> {
  const body = JSON.stringify(payload);

  return new Promise((resolve) => {
    const req = request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
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
          } else {
            resolve({
              success: false,
              error: `Discord webhook returned ${res.statusCode}: ${data}`,
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
