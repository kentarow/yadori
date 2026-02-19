/**
 * YADORI Snapshot Script
 *
 * Usage:
 *   npm run snapshot                     — save snapshot to stdout info + file
 *   npm run snapshot -- --save path.png  — save to specific file
 *   npm run snapshot -- --send           — send to Discord via webhook
 *   npm run snapshot -- --send --save    — both send and save
 *
 * Environment variables:
 *   YADORI_WORKSPACE          — workspace path (default: ~/.openclaw/workspace)
 *   YADORI_DISCORD_WEBHOOK    — Discord webhook URL for --send
 *
 * The Discord webhook URL can also be stored in the workspace at webhook.json:
 *   { "discord": "https://discord.com/api/webhooks/XXX/YYY" }
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { generateSnapshot } from "../engine/src/identity/snapshot-generator.js";
import { sendWebhookMessage } from "../adapters/src/discord/webhook.js";
import type { EntityState } from "../engine/src/status/status-manager.js";

const WORKSPACE_ROOT = process.env.YADORI_WORKSPACE ?? join(homedir(), ".openclaw", "workspace");

// --- Parse CLI arguments ---

const args = process.argv.slice(2);
const shouldSend = args.includes("--send");
const saveIndex = args.indexOf("--save");
const savePath = saveIndex !== -1
  ? (args[saveIndex + 1] ?? join(WORKSPACE_ROOT, "growth", "portraits", `snapshot-${Date.now()}.png`))
  : null;

// If neither --send nor --save specified, default to saving in portraits/
const defaultSave = !shouldSend && savePath === null;

async function loadState(): Promise<EntityState> {
  for (const filename of ["state.json", "__state.json"]) {
    try {
      const content = await readFile(join(WORKSPACE_ROOT, filename), "utf-8");
      return JSON.parse(content) as EntityState;
    } catch {
      continue;
    }
  }
  throw new Error(
    `No entity state found at ${WORKSPACE_ROOT}.\n` +
    `Run 'npm run setup' first to create an entity.`,
  );
}

async function loadWebhookUrl(): Promise<string | null> {
  // 1. Environment variable
  if (process.env.YADORI_DISCORD_WEBHOOK) {
    return process.env.YADORI_DISCORD_WEBHOOK;
  }
  // 2. webhook.json in workspace
  try {
    const content = await readFile(join(WORKSPACE_ROOT, "webhook.json"), "utf-8");
    const config = JSON.parse(content);
    if (config.discord) return config.discord;
  } catch { /* no config */ }
  return null;
}

function formatCaption(state: EntityState): string {
  const s = state.status;
  const moodBar = barChart(s.mood);
  const energyBar = barChart(s.energy);
  return `mood ${moodBar} ${s.mood}  energy ${energyBar} ${s.energy}  day ${s.growthDay}`;
}

function barChart(value: number): string {
  const filled = Math.round(value / 10);
  return "●".repeat(filled) + "○".repeat(10 - filled);
}

async function main() {
  console.log("\n  YADORI Snapshot\n");

  const state = await loadState();
  const { seed, status, form } = state;

  console.log(`  Species: ${seed.perception} / ${seed.form}`);
  console.log(`  Mood: ${status.mood}  Energy: ${status.energy}  Curiosity: ${status.curiosity}  Comfort: ${status.comfort}`);
  console.log(`  Day: ${status.growthDay}  Form: density=${form.density} complexity=${form.complexity}\n`);

  // Generate snapshot
  const png = generateSnapshot(
    seed.perception,
    seed.form,
    {
      mood: status.mood,
      energy: status.energy,
      curiosity: status.curiosity,
      comfort: status.comfort,
      density: form.density,
      complexity: form.complexity,
    },
  );

  console.log(`  Generated: ${png.length} bytes PNG`);

  // Save to file
  const outputPath = savePath ?? (defaultSave
    ? join(WORKSPACE_ROOT, "growth", "portraits", `snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`)
    : null);

  if (outputPath) {
    await writeFile(outputPath, png);
    console.log(`  Saved: ${outputPath}`);
  }

  // Send to Discord
  if (shouldSend) {
    const webhookUrl = await loadWebhookUrl();
    if (!webhookUrl) {
      console.error("\n  No Discord webhook URL configured.");
      console.error("  Set YADORI_DISCORD_WEBHOOK env var or create webhook.json in workspace.");
      console.error('  Example: { "discord": "https://discord.com/api/webhooks/XXX/YYY" }\n');
      process.exit(1);
    }

    const caption = formatCaption(state);
    console.log(`  Sending to Discord...`);

    const result = await sendWebhookMessage(webhookUrl, {
      content: caption,
      image: png,
      filename: `yadori-${new Date().toISOString().split("T")[0]}.png`,
    });

    if (result.success) {
      console.log("  Sent successfully!\n");
    } else {
      console.error(`  Failed: ${result.error}\n`);
      process.exit(1);
    }
  }

  if (!outputPath && !shouldSend) {
    console.log("  (Use --save or --send to output the snapshot)\n");
  }
}

main().catch((err) => {
  console.error(`\n  Error: ${err.message}\n`);
  process.exit(1);
});
