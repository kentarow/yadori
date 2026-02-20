/**
 * YADORI Webhook Setup
 *
 * Interactive wizard to configure the Discord Webhook for daily snapshots.
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

async function main() {
  const lang = detectLang();

  console.log("");
  console.log("  ╭──────────────────────────────────╮");
  console.log("  │    YADORI  Webhook Setup          │");
  console.log("  ╰──────────────────────────────────╯");
  console.log("");

  // Check existing config
  try {
    const existing = await readFile(WEBHOOK_PATH, "utf-8");
    const config = JSON.parse(existing);
    if (config.discord) {
      const masked = config.discord.slice(0, 45) + "...";
      if (lang === "ja") {
        console.log(`  現在の設定: ${masked}`);
        console.log("");
        const confirm = await ask("  上書きしますか？ [y/N]: ");
        if (confirm.toLowerCase() !== "y") {
          console.log("  中止しました。");
          console.log("");
          rl.close();
          return;
        }
      } else {
        console.log(`  Current config: ${masked}`);
        console.log("");
        const confirm = await ask("  Overwrite? [y/N]: ");
        if (confirm.toLowerCase() !== "y") {
          console.log("  Aborted.");
          console.log("");
          rl.close();
          return;
        }
      }
    }
  } catch { /* no existing config */ }

  if (lang === "ja") {
    console.log("  毎晩、エンティティのスナップショット画像を");
    console.log("  Discord チャンネルに自動送信できます。");
    console.log("");
    console.log("  Discord の Webhook URL が必要です:");
    console.log("  チャンネル設定 → 連携サービス → ウェブフック → 新しいウェブフック → URL をコピー");
  } else {
    console.log("  Send a daily snapshot of your entity to a Discord channel.");
    console.log("");
    console.log("  You need a Discord Webhook URL:");
    console.log("  Channel Settings → Integrations → Webhooks → New Webhook → Copy URL");
  }
  console.log("");

  const url = await ask(lang === "ja"
    ? "  Discord Webhook URL: "
    : "  Discord Webhook URL: ",
  );

  if (!url.startsWith("https://discord.com/api/webhooks/")) {
    console.log(lang === "ja"
      ? "\n  ✗ URL が正しくありません。https://discord.com/api/webhooks/ で始まる必要があります。\n"
      : "\n  ✗ Invalid URL. Must start with https://discord.com/api/webhooks/\n",
    );
    rl.close();
    process.exit(1);
  }

  await writeFile(WEBHOOK_PATH, JSON.stringify({ discord: url }, null, 2), "utf-8");

  console.log(lang === "ja"
    ? "\n  ✓ 設定しました。次の夜 22:00 のハートビートからスナップショットが送信されます。"
    : "\n  ✓ Configured. Snapshots will be sent starting at the next evening heartbeat.",
  );
  console.log(lang === "ja"
    ? "  すぐに確認: npm run snapshot -- --send\n"
    : "  Test now: npm run snapshot -- --send\n",
  );

  rl.close();
}

main().catch((err) => {
  console.error(`\n  Error: ${err.message}\n`);
  rl.close();
  process.exit(1);
});
