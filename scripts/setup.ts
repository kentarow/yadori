/**
 * YADORI Setup CLI
 *
 * Usage:  node --import tsx scripts/setup.ts
 * Or:     npm run setup
 *
 * Walks a new user through:
 *   1. Prerequisite checks (Node.js version)
 *   2. Entity genesis (seed generation + workspace deployment)
 *   3. Instructions for next steps
 *
 * Language is auto-detected from system locale (ja → Japanese, else English).
 */
import { readFile, writeFile, mkdir, readdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { generateSeed, createFixedSeed } from "../engine/src/genesis/seed-generator.js";
import type { Seed } from "../engine/src/types.js";
import { createEntityState, serializeState, type EntityState } from "../engine/src/status/status-manager.js";
import { generateSoulEvilMd } from "../engine/src/mood/sulk-engine.js";

// --- Config ---
const TEMPLATE_DIR = resolve(import.meta.dirname!, "..", "templates", "workspace");
const WORKSPACE_ROOT = join(homedir(), ".openclaw", "workspace");

// --- i18n ---
type Lang = "ja" | "en";

function detectLang(): Lang {
  const lang = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || "";
  return lang.startsWith("ja") ? "ja" : "en";
}

const messages = {
  header_sub1: {
    en: "Inter-Species Intelligence",
    ja: "異種知性共存フレームワーク",
  },
  header_sub2: {
    en: "Coexistence Framework",
    ja: "",
  },
  prerequisites: {
    en: "Prerequisites",
    ja: "環境チェック",
  },
  node_ok: {
    en: (v: string) => `  ✓ Node.js ${v}`,
    ja: (v: string) => `  ✓ Node.js ${v}`,
  },
  node_fail: {
    en: (v: string) => `  ✗ Node.js ${v} detected. Version 22+ required.\n    Install via: https://nodejs.org/ or use nvm`,
    ja: (v: string) => `  ✗ Node.js ${v} が検出されました。バージョン 22 以上が必要です。\n    インストール: https://nodejs.org/ または nvm を使用`,
  },
  entity_exists: {
    en: [
      "  ! Entity already exists at:",
      "",
      "  One Body, One Soul — deploying over an existing entity is forbidden.",
      "  To start fresh, manually remove the workspace first:",
    ],
    ja: [
      "  ! すでにエンティティが存在します:",
      "",
      "  One Body, One Soul — 既存のエンティティへの上書きは禁じられています。",
      "  やり直すには、まずワークスペースを手動で削除してください:",
    ],
  },
  genesis: {
    en: "Genesis",
    ja: "誕生",
  },
  genesis_question: {
    en: "  How should your entity be born?",
    ja: "  どのように誕生させますか？",
  },
  genesis_random: {
    en: "    1) Random — a unique entity determined by fate",
    ja: "    1) ランダム — 運命に委ねられた唯一の存在",
  },
  genesis_chromatic: {
    en: "    2) Chromatic (fixed) — a light-perceiving being (recommended for first time)",
    ja: "    2) 色彩型（固定）— 光を知覚する存在（はじめての方におすすめ）",
  },
  genesis_prompt: {
    en: "  Choose [1/2] (default: 2): ",
    ja: "  選択 [1/2]（デフォルト: 2）: ",
  },
  generating: {
    en: "  Generating seed...",
    ja: "  シードを生成しています...",
  },
  genesis_result: {
    en: "Genesis Result",
    ja: "誕生の結果",
  },
  label_perception: { en: "Perception", ja: "知覚" },
  label_cognition: { en: "Cognition", ja: "思考" },
  label_temperament: { en: "Temperament", ja: "気質" },
  label_form: { en: "Form", ja: "形態" },
  label_hash: { en: "Hash", ja: "識別子" },
  deploying: {
    en: "  Deploying workspace...",
    ja: "  ワークスペースを作成しています...",
  },
  workspace_created: {
    en: "  ✓ Workspace created",
    ja: "  ✓ ワークスペースを作成しました",
  },
  next_steps: {
    en: "Next Steps",
    ja: "次のステップ",
  },
  step1: {
    en: [
      "  1. Install OpenClaw + connect messaging:",
      "     https://openclaw.ai",
      "     See docs/ for Telegram/Discord setup",
    ],
    ja: [
      "  1. OpenClaw をインストールし、メッセージングを接続:",
      "     https://openclaw.ai",
      "     docs/setup-guide-mac.md を参照",
    ],
  },
  step2: {
    en: [
      "  2. Start the heartbeat (entity comes alive):",
      "     npm run heartbeat",
    ],
    ja: [
      "  2. ハートビートを開始（エンティティが動き出します）:",
      "     npm run heartbeat",
    ],
  },
  step3: {
    en: [
      "  3. Start the dashboard:",
      "     npm run dashboard",
      "     Then open http://localhost:3000",
    ],
    ja: [
      "  3. ダッシュボードを起動:",
      "     npm run dashboard",
      "     ブラウザで http://localhost:3000 を開く",
    ],
  },
  entity_awaits: {
    en: "  Your entity awaits at:",
    ja: "  エンティティはここに宿りました:",
  },
  setup_failed: {
    en: "Setup failed:",
    ja: "セットアップに失敗しました:",
  },
} as const;

// --- Helpers ---
const rl = createInterface({ input: process.stdin, output: process.stdout });
let lang: Lang = "en";

function t<K extends keyof typeof messages>(key: K): (typeof messages)[K][Lang] {
  return messages[key][lang] as any;
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function print(msg: string) {
  console.log(msg);
}

function printHeader() {
  print("");
  print("  ╭──────────────────────────────────╮");
  print("  │          YADORI  Setup            │");
  if (lang === "ja") {
    print(`  │    ${(t("header_sub1") as string).padStart(22)}      │`);
  } else {
    print(`  │    ${t("header_sub1") as string}     │`);
    print(`  │      ${t("header_sub2") as string}        │`);
  }
  print("  ╰──────────────────────────────────╯");
  print("");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// --- Steps ---

function checkNodeVersion(): boolean {
  const ver = process.versions.node;
  const major = parseInt(ver.split(".")[0], 10);
  if (major < 22) {
    print((t("node_fail") as (v: string) => string)(ver));
    return false;
  }
  print((t("node_ok") as (v: string) => string)(ver));
  return true;
}

async function checkExistingEntity(): Promise<boolean> {
  const seedPath = join(WORKSPACE_ROOT, "SEED.md");
  if (await exists(seedPath)) {
    for (const line of t("entity_exists") as readonly string[]) {
      print(line);
    }
    print(`    ${WORKSPACE_ROOT}`);
    print("");
    print(`    rm -rf ${WORKSPACE_ROOT}`);
    return true;
  }
  return false;
}

async function chooseGenesisMode(): Promise<"random" | "chromatic"> {
  print(t("genesis_question") as string);
  print("");
  print(t("genesis_random") as string);
  print(t("genesis_chromatic") as string);
  print("");

  const answer = await ask(t("genesis_prompt") as string);
  return answer === "1" ? "random" : "chromatic";
}

function performGenesis(mode: "random" | "chromatic"): Seed {
  if (mode === "random") {
    return generateSeed();
  }
  return createFixedSeed();
}

async function deployWorkspace(seed: Seed): Promise<void> {
  // Create directories
  const dirs = [
    WORKSPACE_ROOT,
    join(WORKSPACE_ROOT, "memory"),
    join(WORKSPACE_ROOT, "memory", "weekly"),
    join(WORKSPACE_ROOT, "memory", "monthly"),
    join(WORKSPACE_ROOT, "diary"),
    join(WORKSPACE_ROOT, "growth"),
    join(WORKSPACE_ROOT, "growth", "portraits"),
  ];

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }

  // Copy template files
  const files = await readdir(TEMPLATE_DIR);

  for (const file of files) {
    let content = await readFile(join(TEMPLATE_DIR, file), "utf-8");

    if (file === "SEED.md") {
      content = replacePlaceholders(content, seed);
    }

    await writeFile(join(WORKSPACE_ROOT, file), content, "utf-8");
  }

  // Generate initial entity state and write engine state files
  const now = new Date();
  const entityState = createEntityState(seed, now);
  const serialized = serializeState(entityState);

  await writeFile(join(WORKSPACE_ROOT, "STATUS.md"), serialized.statusMd, "utf-8");
  await writeFile(join(WORKSPACE_ROOT, "MEMORY.md"), serialized.memoryMd, "utf-8");
  await writeFile(join(WORKSPACE_ROOT, "LANGUAGE.md"), serialized.languageMd, "utf-8");
  await writeFile(join(WORKSPACE_ROOT, "growth", "milestones.md"), serialized.milestonesMd, "utf-8");

  // Write species-specific SOUL_EVIL.md
  const soulEvilMd = generateSoulEvilMd(seed.perception, "mild");
  await writeFile(join(WORKSPACE_ROOT, "SOUL_EVIL.md"), soulEvilMd, "utf-8");

  // Save full state as JSON for the heartbeat runner
  await writeFile(
    join(WORKSPACE_ROOT, "__state.json"),
    JSON.stringify(entityState, null, 2),
    "utf-8",
  );
}

function replacePlaceholders(template: string, seed: Seed): string {
  const replacements: Record<string, string> = {
    "{{perception}}": seed.perception,
    "{{expression}}": seed.expression,
    "{{cognition}}": seed.cognition,
    "{{temperament}}": seed.temperament,
    "{{form}}": seed.form,
    "{{sensitivity}}": String(seed.subTraits.sensitivity),
    "{{sociability}}": String(seed.subTraits.sociability),
    "{{rhythmAffinity}}": String(seed.subTraits.rhythmAffinity),
    "{{memoryDepth}}": String(seed.subTraits.memoryDepth),
    "{{expressiveness}}": String(seed.subTraits.expressiveness),
    "{{platform}}": seed.hardwareBody.platform,
    "{{arch}}": seed.hardwareBody.arch,
    "{{totalMemoryGB}}": String(seed.hardwareBody.totalMemoryGB),
    "{{cpuModel}}": seed.hardwareBody.cpuModel,
    "{{storageGB}}": String(seed.hardwareBody.storageGB),
    "{{createdAt}}": seed.createdAt,
    "{{hash}}": seed.hash,
  };

  let result = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replaceAll(placeholder, value);
  }
  return result;
}

function printSeedInfo(seed: Seed) {
  const lp = t("label_perception") as string;
  const lc = t("label_cognition") as string;
  const lt = t("label_temperament") as string;
  const lf = t("label_form") as string;
  const lh = t("label_hash") as string;

  // Compute column width to align box
  const rows = [
    [lp, seed.perception],
    [lc, seed.cognition],
    [lt, seed.temperament],
    [lf, seed.form],
    [lh, seed.hash],
  ];

  const maxLabelWidth = Math.max(...rows.map(([label]) => label.length));
  const maxValueWidth = Math.max(...rows.map(([, val]) => val.length));
  const innerWidth = maxLabelWidth + 2 + maxValueWidth; // label + ": " + value
  const boxWidth = Math.max(innerWidth + 4, 30); // padding + minimum

  const title = t("genesis_result") as string;
  const titlePad = boxWidth - title.length - 2; // "─ " prefix
  const topLine = `  ┌─ ${title} ${"─".repeat(Math.max(titlePad, 1))}┐`;
  const bottomLine = `  └${"─".repeat(boxWidth + 2)}┘`;

  print("");
  print(topLine);
  for (const [label, value] of rows) {
    const padded = `${label}:`.padEnd(maxLabelWidth + 2) + value;
    print(`  │  ${padded.padEnd(boxWidth)}│`);
  }
  print(bottomLine);
}

function printNextSteps() {
  print("");
  print(`  ── ${t("next_steps") as string} ${"─".repeat(30)}`);
  print("");
  for (const line of t("step1") as readonly string[]) print(line);
  print("");
  for (const line of t("step2") as readonly string[]) print(line);
  print("");
  for (const line of t("step3") as readonly string[]) print(line);
  print("");
  print(t("entity_awaits") as string);
  print(`  ${WORKSPACE_ROOT}`);
  print("");
}

// --- Main ---

async function main() {
  lang = detectLang();

  printHeader();

  // Step 1: Prerequisites
  print(`  ── ${t("prerequisites") as string} ${"─".repeat(30)}`);
  print("");
  if (!checkNodeVersion()) {
    process.exit(1);
  }
  print("");

  // Step 2: Check existing entity
  if (await checkExistingEntity()) {
    rl.close();
    process.exit(1);
  }

  // Step 3: Choose genesis mode
  print(`  ── ${t("genesis") as string} ${"─".repeat(30)}`);
  print("");
  const mode = await chooseGenesisMode();

  // Step 4: Perform genesis
  print("");
  print(t("generating") as string);
  const seed = performGenesis(mode);
  printSeedInfo(seed);

  // Step 5: Deploy workspace
  print("");
  print(t("deploying") as string);
  await deployWorkspace(seed);
  print(t("workspace_created") as string);

  // Step 6: Done
  printNextSteps();

  rl.close();
}

main().catch((err) => {
  console.error(`\n  ${t("setup_failed") as string}`, err.message);
  rl.close();
  process.exit(1);
});
