/**
 * YADORI Heartbeat Runner
 *
 * Usage:  node --import tsx scripts/heartbeat.ts
 * Or:     npm run heartbeat
 *
 * Runs a persistent process that:
 *   - Calls processHeartbeat() every 30 minutes during active hours (7:00-23:00)
 *   - Writes updated state to the workspace (.md files + __state.json)
 *   - Generates diary entries in the evening
 *   - Consolidates memory on Sunday nights
 *   - Manages sulk mode (SOUL_EVIL.md switching)
 *   - Logs activity to stdout
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  processHeartbeat,
  serializeState,
  type EntityState,
} from "../engine/src/status/status-manager.js";
import { isActiveHours, shouldPulse } from "../engine/src/rhythm/rhythm-system.js";
import { formatDiaryMd } from "../engine/src/diary/diary-engine.js";

// --- Config ---
const WORKSPACE_ROOT = process.env.YADORI_WORKSPACE ?? join(homedir(), ".openclaw", "workspace");
const STATE_PATH = join(WORKSPACE_ROOT, "state.json");
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const CHECK_INTERVAL_MS = 60 * 1000; // Check every 1 minute if we should pulse

// --- State persistence ---

async function loadState(): Promise<EntityState> {
  // Try state.json first, then __state.json (setup writes __state.json)
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

async function saveState(state: EntityState): Promise<void> {
  // Write JSON state
  await writeFile(
    join(WORKSPACE_ROOT, "state.json"),
    JSON.stringify(state, null, 2),
    "utf-8",
  );

  // Write human-readable .md files
  const serialized = serializeState(state);
  await writeFile(join(WORKSPACE_ROOT, "STATUS.md"), serialized.statusMd, "utf-8");
  await writeFile(join(WORKSPACE_ROOT, "MEMORY.md"), serialized.memoryMd, "utf-8");
  await writeFile(join(WORKSPACE_ROOT, "LANGUAGE.md"), serialized.languageMd, "utf-8");
  await writeFile(join(WORKSPACE_ROOT, "growth", "milestones.md"), serialized.milestonesMd, "utf-8");
}

// --- Logging ---

function log(msg: string) {
  const ts = new Date().toLocaleTimeString("ja-JP", { hour12: false });
  console.log(`  [${ts}] ${msg}`);
}

// --- Main loop ---

let lastPulseTime: Date | null = null;

async function tick(): Promise<void> {
  const now = new Date();

  // Only pulse during active hours
  if (!isActiveHours(now)) {
    return;
  }

  // Check if enough time has passed since last pulse
  if (!shouldPulse(lastPulseTime, now, 30)) {
    return;
  }

  try {
    // Load current state
    const state = await loadState();

    // Process heartbeat
    const result = processHeartbeat(state, now);
    const { updatedState } = result;

    // Save updated state
    await saveState(updatedState);
    lastPulseTime = now;

    // Log what happened
    const s = updatedState.status;
    log(
      `Heartbeat — mood:${s.mood} energy:${s.energy} curiosity:${s.curiosity} comfort:${s.comfort} day:${s.growthDay}`,
    );

    // Write diary if generated
    if (result.diary) {
      const diaryPath = join(WORKSPACE_ROOT, "diary", `${result.diary.date}.md`);
      await writeFile(diaryPath, formatDiaryMd(result.diary), "utf-8");
      log(`Diary written: ${result.diary.date}`);
    }

    // Update SOUL_EVIL.md if sulking
    if (result.soulEvilMd) {
      await writeFile(join(WORKSPACE_ROOT, "SOUL_EVIL.md"), result.soulEvilMd, "utf-8");
      log(`Sulking (${updatedState.sulk.severity}) — SOUL_EVIL.md updated`);
    }

    // Log milestones
    for (const m of result.newMilestones) {
      log(`Milestone: ${m.label}`);
    }

    // Log memory consolidation
    if (result.memoryConsolidated) {
      log(`Memory consolidated (weekly summary created)`);
    }

    // Log form state
    const f = updatedState.form;
    log(`Form: ${f.baseForm} density:${f.density} complexity:${f.complexity} stability:${f.stability}`);
  } catch (err) {
    log(`Error: ${(err as Error).message}`);
  }
}

function printBanner() {
  console.log("");
  console.log("  ╭──────────────────────────────────╮");
  console.log("  │       YADORI  Heartbeat           │");
  console.log("  │    Pulse every 30 minutes         │");
  console.log("  │    Active hours: 07:00 - 23:00    │");
  console.log("  ╰──────────────────────────────────╯");
  console.log("");
  console.log(`  Workspace: ${WORKSPACE_ROOT}`);
  console.log(`  Press Ctrl+C to stop`);
  console.log("");
}

async function main() {
  printBanner();

  // Verify state exists
  try {
    await loadState();
    log("Entity state loaded");
  } catch (err) {
    console.error(`\n  ${(err as Error).message}`);
    process.exit(1);
  }

  // Run first tick immediately
  await tick();

  // Set up periodic check (every 1 minute, pulses every 30 minutes)
  setInterval(tick, CHECK_INTERVAL_MS);

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    log("Heartbeat stopping...");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    log("Heartbeat stopping...");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("\n  Heartbeat failed:", err.message);
  process.exit(1);
});
