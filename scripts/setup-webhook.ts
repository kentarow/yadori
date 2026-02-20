/**
 * YADORI Webhook Setup
 *
 * Interactive wizard to configure messaging platforms for
 * proactive messages, daily snapshots, and entity communication.
 *
 * Supports: Discord (webhook) and Telegram (Bot API).
 * Both can be configured simultaneously.
 *
 * Usage:  npm run setup-webhook
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";

const WORKSPACE_ROOT = process.env.YADORI_WORKSPACE ?? join(homedir(), ".openclaw", "workspace");
const WEBHOOK_PATH = join(WORKSPACE_ROOT, "webhook.json");

type Lang = "ja" | "en";

interface WebhookConfig {
  discord?: string;
  telegram?: { botToken: string; chatId: string };
}

function detectLang(): Lang {
  const lang = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || "";
  return lang.startsWith("ja") ? "ja" : "en";
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

const T = {
  ja: {
    banner: "YADORI  メッセージング設定",
    description: [
      "エンティティからのメッセージ（朝の挨拶、存在信号、",
      "夕方のスナップショット等）をどこに届けるか設定します。",
      "",
      "Discord と Telegram の両方を同時に設定できます。",
    ],
    currentDiscord: "現在のDiscord設定",
    currentTelegram: "現在のTelegram設定",
    setupDiscord: "Discord webhook を設定しますか？",
    setupTelegram: "Telegram Bot を設定しますか？",
    yes: "y",
    yesNo: "[y/N]",
    discordInstructions: [
      "Discord Webhook URL が必要です:",
      "チャンネル設定 → 連携サービス → ウェブフック → 新しいウェブフック → URL をコピー",
    ],
    discordPrompt: "Discord Webhook URL: ",
    discordInvalid: "✗ URL が正しくありません。https://discord.com/api/webhooks/ で始まる必要があります。",
    telegramInstructions: [
      "Telegram Bot Token と Chat ID が必要です:",
      "1. @BotFather に /newbot → Bot Token を取得",
      "2. Botにメッセージを送ってから https://api.telegram.org/bot<TOKEN>/getUpdates で Chat ID を確認",
    ],
    tokenPrompt: "Bot Token: ",
    chatIdPrompt: "Chat ID: ",
    tokenInvalid: "✗ Bot Token の形式が正しくありません（例: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11）",
    chatIdInvalid: "✗ Chat ID が空です。",
    saved: "✓ 設定を保存しました。",
    nothingConfigured: "何も設定されていません。プロアクティブメッセージを受け取るにはDiscordかTelegramの設定が必要です。",
    testHint: "すぐに確認: npm run snapshot -- --send",
  },
  en: {
    banner: "YADORI  Messaging Setup",
    description: [
      "Configure where entity messages are delivered",
      "(morning greeting, presence signal, evening snapshot, etc).",
      "",
      "You can configure both Discord and Telegram simultaneously.",
    ],
    currentDiscord: "Current Discord config",
    currentTelegram: "Current Telegram config",
    setupDiscord: "Set up Discord webhook?",
    setupTelegram: "Set up Telegram Bot?",
    yes: "y",
    yesNo: "[y/N]",
    discordInstructions: [
      "You need a Discord Webhook URL:",
      "Channel Settings → Integrations → Webhooks → New Webhook → Copy URL",
    ],
    discordPrompt: "Discord Webhook URL: ",
    discordInvalid: "✗ Invalid URL. Must start with https://discord.com/api/webhooks/",
    telegramInstructions: [
      "You need a Telegram Bot Token and Chat ID:",
      "1. Talk to @BotFather → /newbot → get Bot Token",
      "2. Send a message to your bot, then check https://api.telegram.org/bot<TOKEN>/getUpdates for chat ID",
    ],
    tokenPrompt: "Bot Token: ",
    chatIdPrompt: "Chat ID: ",
    tokenInvalid: "✗ Invalid Bot Token format (e.g. 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11)",
    chatIdInvalid: "✗ Chat ID is empty.",
    saved: "✓ Configuration saved.",
    nothingConfigured: "Nothing configured. Discord or Telegram setup is required to receive proactive messages.",
    testHint: "Test now: npm run snapshot -- --send",
  },
};

async function main() {
  const lang = detectLang();
  const t = T[lang];

  console.log("");
  console.log("  ╭──────────────────────────────────╮");
  console.log(`  │    ${t.banner.padEnd(30)}│`);
  console.log("  ╰──────────────────────────────────╯");
  console.log("");

  for (const line of t.description) {
    console.log(`  ${line}`);
  }
  console.log("");

  // Load existing config
  let config: WebhookConfig = {};
  try {
    const existing = await readFile(WEBHOOK_PATH, "utf-8");
    config = JSON.parse(existing) as WebhookConfig;
  } catch { /* no existing config */ }

  // Show current state
  if (config.discord) {
    const masked = config.discord.slice(0, 45) + "...";
    console.log(`  ${t.currentDiscord}: ${masked}`);
  }
  if (config.telegram) {
    const masked = config.telegram.botToken.slice(0, 10) + "...";
    console.log(`  ${t.currentTelegram}: ${masked} (chat: ${config.telegram.chatId})`);
  }
  if (config.discord || config.telegram) {
    console.log("");
  }

  // --- Discord ---
  const wantDiscord = await ask(`  ${t.setupDiscord} ${t.yesNo}: `);
  if (wantDiscord.toLowerCase() === t.yes) {
    console.log("");
    for (const line of t.discordInstructions) {
      console.log(`  ${line}`);
    }
    console.log("");

    const url = await ask(`  ${t.discordPrompt}`);
    if (!url.startsWith("https://discord.com/api/webhooks/")) {
      console.log(`\n  ${t.discordInvalid}\n`);
    } else {
      config.discord = url;
      console.log("");
    }
  }

  // --- Telegram ---
  const wantTelegram = await ask(`  ${t.setupTelegram} ${t.yesNo}: `);
  if (wantTelegram.toLowerCase() === t.yes) {
    console.log("");
    for (const line of t.telegramInstructions) {
      console.log(`  ${line}`);
    }
    console.log("");

    const token = await ask(`  ${t.tokenPrompt}`);
    if (!token.includes(":")) {
      console.log(`\n  ${t.tokenInvalid}\n`);
    } else {
      const chatId = await ask(`  ${t.chatIdPrompt}`);
      if (!chatId) {
        console.log(`\n  ${t.chatIdInvalid}\n`);
      } else {
        config.telegram = { botToken: token, chatId };
        console.log("");
      }
    }
  }

  // --- Save ---
  if (!config.discord && !config.telegram) {
    console.log(`\n  ${t.nothingConfigured}\n`);
    rl.close();
    return;
  }

  await writeFile(WEBHOOK_PATH, JSON.stringify(config, null, 2), "utf-8");

  const platforms: string[] = [];
  if (config.discord) platforms.push("Discord");
  if (config.telegram) platforms.push("Telegram");

  console.log(`  ${t.saved} (${platforms.join(" + ")})`);
  console.log(`  ${t.testHint}\n`);

  rl.close();
}

main().catch((err) => {
  console.error(`\n  Error: ${err.message}\n`);
  rl.close();
  process.exit(1);
});
