/**
 * Apply Entity Identity to Bot Profile
 *
 * Usage:
 *   DISCORD_BOT_TOKEN=xxx npm run apply-identity
 *   — or —
 *   npm run apply-identity           (prompts for token)
 *
 * Reads the entity's SEED.md from the workspace, generates a species-specific
 * avatar and display name, then applies them to the Discord bot.
 *
 * The entity doesn't "choose" a name — its native symbols become its identifier.
 * The avatar is a procedurally generated glow matching the dashboard visualization.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { generateAvatar, generateBotName } from "../engine/src/identity/avatar-generator.js";
import { updateDiscordBotProfile } from "../adapters/src/discord/bot-profile.js";
import type { PerceptionMode, SelfForm } from "../engine/src/types.js";

const WORKSPACE_ROOT = join(homedir(), ".openclaw", "workspace");

// --- i18n ---
type Lang = "ja" | "en";

function detectLang(): Lang {
  const lang = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || "";
  return lang.startsWith("ja") ? "ja" : "en";
}

const msg = {
  header: {
    en: "  YADORI — Apply Entity Identity",
    ja: "  YADORI — エンティティのアイデンティティを適用",
  },
  reading_seed: {
    en: "  Reading entity seed...",
    ja: "  エンティティのシードを読み込み中...",
  },
  no_seed: {
    en: "  ✗ No entity found. Run 'npm run setup' first.",
    ja: "  ✗ エンティティが見つかりません。先に 'npm run setup' を実行してください。",
  },
  species: {
    en: (p: string) => `  Species: ${p}`,
    ja: (p: string) => `  種族: ${p}`,
  },
  generating: {
    en: "  Generating avatar and name...",
    ja: "  アバターと名前を生成中...",
  },
  name_preview: {
    en: (name: string) => `  Bot name: ${name}`,
    ja: (name: string) => `  Bot名: ${name}`,
  },
  avatar_generated: {
    en: (bytes: number) => `  Avatar: ${bytes} bytes PNG`,
    ja: (bytes: number) => `  アバター: ${bytes} バイト PNG`,
  },
  token_prompt: {
    en: "  Enter Discord Bot Token: ",
    ja: "  Discord Bot Token を入力: ",
  },
  token_hint: {
    en: "  (or set DISCORD_BOT_TOKEN environment variable)",
    ja: "  (環境変数 DISCORD_BOT_TOKEN でも設定可)",
  },
  applying: {
    en: "  Applying to Discord...",
    ja: "  Discordに適用中...",
  },
  success: {
    en: (name: string) => `  ✓ Bot profile updated: ${name}`,
    ja: (name: string) => `  ✓ Botプロフィールを更新しました: ${name}`,
  },
  failed: {
    en: (err: string) => `  ✗ Failed: ${err}`,
    ja: (err: string) => `  ✗ 失敗: ${err}`,
  },
  skipped: {
    en: "  Skipped — no bot token provided.",
    ja: "  スキップ — Bot Token が入力されませんでした。",
  },
} as const;

// --- Seed parser (minimal, reads only what we need) ---

function parseSeedFields(content: string): { perception: PerceptionMode; form: SelfForm } | null {
  const getField = (key: string): string => {
    const match = content.match(new RegExp(`\\*\\*${key}\\*\\*:\\s*(.+)`));
    return match?.[1]?.trim() ?? "";
  };

  const perception = getField("Perception");
  const form = getField("Form");

  const VALID_PERCEPTIONS = ["chromatic", "vibration", "geometric", "thermal", "temporal", "chemical"];
  const VALID_FORMS = ["light-particles", "fluid", "crystal", "sound-echo", "mist", "geometric-cluster"];

  if (!VALID_PERCEPTIONS.includes(perception) || !VALID_FORMS.includes(form)) {
    return null;
  }

  return {
    perception: perception as PerceptionMode,
    form: form as SelfForm,
  };
}

// --- Main ---

export async function applyIdentity(botToken?: string): Promise<boolean> {
  const lang = detectLang();
  const t = <K extends keyof typeof msg>(key: K) => msg[key][lang];

  console.log("");
  console.log(t("header"));
  console.log("");

  // Read seed
  console.log(t("reading_seed"));
  let seedContent: string;
  try {
    seedContent = await readFile(join(WORKSPACE_ROOT, "SEED.md"), "utf-8");
  } catch {
    console.log(t("no_seed"));
    return false;
  }

  const seed = parseSeedFields(seedContent);
  if (!seed) {
    console.log(t("no_seed"));
    return false;
  }

  console.log((t("species") as (p: string) => string)(seed.perception));
  console.log("");

  // Generate avatar and name
  console.log(t("generating"));
  const avatarPng = generateAvatar(seed.perception, seed.form);
  const botName = generateBotName(seed.perception);

  console.log((t("name_preview") as (n: string) => string)(botName));
  console.log((t("avatar_generated") as (n: number) => string)(avatarPng.length));
  console.log("");

  // Get token
  let token = botToken || process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    console.log((t("token_hint")));
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    token = await new Promise<string>((resolve) => {
      rl.question(t("token_prompt") as string, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  if (!token) {
    console.log(t("skipped"));
    console.log("");
    return false;
  }

  // Apply
  console.log(t("applying"));
  const result = await updateDiscordBotProfile(token, {
    username: botName,
    avatarPng,
  });

  if (result.success) {
    console.log((t("success") as (n: string) => string)(result.username ?? botName));
    console.log("");
    return true;
  } else {
    console.log((t("failed") as (e: string) => string)(result.error ?? "Unknown error"));
    console.log("");
    return false;
  }
}

// Run as standalone script
if (import.meta.url === `file://${process.argv[1]}`) {
  applyIdentity().then((ok) => process.exit(ok ? 0 : 1));
}
