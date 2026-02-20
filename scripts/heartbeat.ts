/**
 * YADORI Heartbeat Runner
 *
 * Usage:  node --import tsx scripts/heartbeat.ts
 * Or:     npm run heartbeat
 *
 * Runs a persistent process that:
 *   - Starts sensor service (auto-detects available hardware)
 *   - Updates PERCEPTION.md every minute (fresh sensory data for LLM)
 *   - Calls processHeartbeat() every 30 minutes during active hours (7:00-23:00)
 *   - Records sensor exposure for perception growth acceleration
 *   - Writes updated state to the workspace (.md files + state.json)
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
import { isActiveHours, shouldPulse, getTimeOfDay } from "../engine/src/rhythm/rhythm-system.js";
import { formatDiaryMd } from "../engine/src/diary/diary-engine.js";
import { formatColdMemoryMd } from "../engine/src/memory/memory-engine.js";
import {
  createSensorService,
  addDriver,
  startService,
  stopService,
  collectPerceptions,
  getModalityCount,
  getRegisteredModalities,
  type SensorServiceState,
} from "../engine/src/perception/sensor-service.js";
import { recordSensoryInput } from "../engine/src/perception/perception-growth.js";
import { createAllDrivers, type AllDriversConfig } from "../adapters/src/sensors/create-all.js";
import type { PerceptionMode } from "../engine/src/types.js";
import { PerceptionLevel } from "../engine/src/types.js";
import { generateSnapshot } from "../engine/src/identity/snapshot-generator.js";
import {
  loadMessengerConfig,
  isMessengerConfigured,
  sendMessage,
  type MessengerConfig,
} from "../adapters/src/messenger.js";
import {
  generateHeartbeatMessages,
  generateEveningReflection,
  createInitialMessageState,
  type HeartbeatMessageContext,
  type HeartbeatMessageState,
} from "../engine/src/expression/heartbeat-messages.js";
import type { SulkState } from "../engine/src/mood/sulk-engine.js";
import type { Status } from "../engine/src/types.js";

// --- Config ---
const WORKSPACE_ROOT = process.env.YADORI_WORKSPACE ?? join(homedir(), ".openclaw", "workspace");
const PERCEPTION_PATH = join(WORKSPACE_ROOT, "PERCEPTION.md");
const SENSORS_CONFIG_PATH = join(WORKSPACE_ROOT, "sensors.json");
const CHECK_INTERVAL_MS = 60 * 1000; // Check every 1 minute

// --- Sensor exposure accumulator ---
// Tracks inputs received between heartbeat ticks for perception growth
let accumulatedInputCount = 0;
let encounteredModalities = new Set<string>();

// --- Sensor service (initialized in main) ---
let sensorService: SensorServiceState | null = null;
let entitySpecies: PerceptionMode = "chromatic";
let entityPerceptionLevel: PerceptionLevel = PerceptionLevel.Minimal;

// --- Proactive messaging state ---
let heartbeatMessageState: HeartbeatMessageState | null = null;
let previousStatus: Status | null = null;
let previousSulk: SulkState | null = null;
const HEARTBEAT_MSG_STATE_PATH = join(WORKSPACE_ROOT, "heartbeat-messages.json");

async function loadHeartbeatMessageState(now: Date): Promise<HeartbeatMessageState> {
  try {
    const content = await readFile(HEARTBEAT_MSG_STATE_PATH, "utf-8");
    return JSON.parse(content) as HeartbeatMessageState;
  } catch {
    return createInitialMessageState(now);
  }
}

async function saveHeartbeatMessageState(state: HeartbeatMessageState): Promise<void> {
  await writeFile(HEARTBEAT_MSG_STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

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
  await writeFile(join(WORKSPACE_ROOT, "FORM.md"), serialized.formMd, "utf-8");

  // Write cold memory to monthly files
  for (const cold of state.memory.cold) {
    const monthlyPath = join(WORKSPACE_ROOT, "memory", "monthly", `${cold.month}.md`);
    await writeFile(monthlyPath, formatColdMemoryMd(cold), "utf-8");
  }
}

// --- Sensor service setup ---

async function loadSensorsConfig(): Promise<AllDriversConfig> {
  try {
    const content = await readFile(SENSORS_CONFIG_PATH, "utf-8");
    return JSON.parse(content) as AllDriversConfig;
  } catch {
    return {}; // Use defaults
  }
}

async function initSensorService(state: EntityState): Promise<void> {
  entitySpecies = state.seed.perception;
  entityPerceptionLevel = state.status.perceptionLevel as PerceptionLevel;

  sensorService = createSensorService();

  // Load sensor config (GPIO pins, I2C addresses, disabled drivers)
  const sensorsConfig = await loadSensorsConfig();

  // Create and register all RPi sensor drivers
  const drivers = createAllDrivers(sensorsConfig);
  for (const driver of drivers) {
    addDriver(sensorService, driver);
  }

  // Auto-detect and start available sensors
  const started = await startService(sensorService);

  if (started.length > 0) {
    log(`Sensors active: ${started.join(", ")}`);
    const modalities = getRegisteredModalities(sensorService);
    log(`Modalities: ${modalities.join(", ")}`);
  } else {
    log("No hardware sensors detected (system metrics always available)");
  }
}

// --- Perception update (runs every 1 minute) ---

async function updatePerception(): Promise<void> {
  if (!sensorService) return;

  try {
    const result = collectPerceptions(sensorService, entitySpecies, entityPerceptionLevel);

    // Accumulate for growth tracking
    accumulatedInputCount += result.inputCount;
    for (const p of result.perceptions) {
      encounteredModalities.add(p.sourceModality);
    }

    // Write PERCEPTION.md — this is what OpenClaw reads
    const md = `# PERCEPTION\n\n${result.context}\n`;
    await writeFile(PERCEPTION_PATH, md, "utf-8");
  } catch {
    // Silent — perception update failure shouldn't crash heartbeat
  }
}

// --- Messenger (Discord + Telegram) ---

let messengerConfig: MessengerConfig | null = null;

async function initMessenger(): Promise<void> {
  messengerConfig = await loadMessengerConfig(WORKSPACE_ROOT);
  if (isMessengerConfigured(messengerConfig)) {
    const platforms: string[] = [];
    if (messengerConfig.discord) platforms.push("Discord");
    if (messengerConfig.telegram) platforms.push("Telegram");
    log(`Messenger: ${platforms.join(" + ")}`);
  } else {
    log("No messaging configured — run npm run setup-webhook to enable proactive messages");
  }
}

async function sendDailySnapshot(state: EntityState): Promise<void> {
  if (!messengerConfig || !isMessengerConfigured(messengerConfig)) return;

  try {
    const { seed, status, form } = state;
    const png = generateSnapshot(seed.perception, seed.form, {
      mood: status.mood,
      energy: status.energy,
      curiosity: status.curiosity,
      comfort: status.comfort,
      density: form.density,
      complexity: form.complexity,
    });

    const moodBar = "●".repeat(Math.round(status.mood / 10)) + "○".repeat(10 - Math.round(status.mood / 10));
    const energyBar = "●".repeat(Math.round(status.energy / 10)) + "○".repeat(10 - Math.round(status.energy / 10));
    const caption = `mood ${moodBar} ${status.mood}  energy ${energyBar} ${status.energy}  day ${status.growthDay}`;

    const dateStr = new Date().toISOString().split("T")[0];
    const result = await sendMessage(messengerConfig, {
      content: caption,
      image: png,
      filename: `yadori-${dateStr}.png`,
    });

    if (result.success) {
      log("Daily snapshot sent");
    } else {
      const errors: string[] = [];
      if (result.discord?.error) errors.push(`Discord: ${result.discord.error}`);
      if (result.telegram?.error) errors.push(`Telegram: ${result.telegram.error}`);
      log(`Snapshot send failed: ${errors.join(", ")}`);
    }
  } catch (err) {
    log(`Snapshot error: ${(err as Error).message}`);
  }
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

  // Always update perception (even outside active hours — sensors keep running)
  await updatePerception();

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
    let state = await loadState();

    // Record accumulated sensor exposure into perception growth state
    if (accumulatedInputCount > 0) {
      const currentModalities = state.perception.modalitiesEncountered;
      const newModalities = Math.max(0, encounteredModalities.size - currentModalities);
      state = {
        ...state,
        perception: recordSensoryInput(
          state.perception,
          accumulatedInputCount,
          newModalities,
        ),
      };
      if (accumulatedInputCount > 10) {
        log(`Sensor exposure: ${accumulatedInputCount} inputs, ${encounteredModalities.size} modalities`);
      }
      accumulatedInputCount = 0;
      // Don't reset encounteredModalities — it tracks lifetime modalities
    }

    // Process heartbeat
    const result = processHeartbeat(state, now);
    const { updatedState } = result;

    // Keep perception level in sync for sensor filtering
    entityPerceptionLevel = updatedState.status.perceptionLevel as PerceptionLevel;

    // Save updated state
    await saveState(updatedState);
    lastPulseTime = now;

    // Log what happened
    const s = updatedState.status;
    log(
      `Heartbeat — mood:${s.mood} energy:${s.energy} curiosity:${s.curiosity} comfort:${s.comfort} day:${s.growthDay} perception:${s.perceptionLevel}`,
    );

    // --- Proactive messaging ---
    if (messengerConfig && isMessengerConfigured(messengerConfig) && heartbeatMessageState) {
      const lastInteractionTime = updatedState.status.lastInteraction;
      const minutesSince = lastInteractionTime === "never"
        ? 999
        : (now.getTime() - new Date(lastInteractionTime).getTime()) / 60_000;

      const msgContext: HeartbeatMessageContext = {
        seed: updatedState.seed,
        status: updatedState.status,
        language: updatedState.language,
        sulk: updatedState.sulk,
        timeOfDay: getTimeOfDay(now),
        hourOfDay: now.getHours(),
        minutesSinceLastInteraction: minutesSince,
        previousStatus,
        previousSulk,
      };

      const { messages, updatedMessageState } = generateHeartbeatMessages(
        msgContext, heartbeatMessageState, now,
      );

      for (const msg of messages) {
        const sendResult = await sendMessage(messengerConfig, { content: msg.content });
        if (sendResult.success) {
          log(`Message sent (${msg.trigger}): ${msg.content}`);
        }
      }

      heartbeatMessageState = updatedMessageState;
      await saveHeartbeatMessageState(heartbeatMessageState);
    }

    previousStatus = { ...updatedState.status };
    previousSulk = { ...updatedState.sulk };

    // Write diary if generated (evening)
    if (result.diary) {
      const diaryPath = join(WORKSPACE_ROOT, "diary", `${result.diary.date}.md`);
      await writeFile(diaryPath, formatDiaryMd(result.diary), "utf-8");
      log(`Diary written: ${result.diary.date}`);

      // Send evening reflection message alongside diary
      if (messengerConfig && isMessengerConfigured(messengerConfig) && heartbeatMessageState) {
        const msgContext: HeartbeatMessageContext = {
          seed: updatedState.seed,
          status: updatedState.status,
          language: updatedState.language,
          sulk: updatedState.sulk,
          timeOfDay: getTimeOfDay(now),
          hourOfDay: now.getHours(),
          minutesSinceLastInteraction: 0,
          previousStatus,
          previousSulk,
        };
        const { message, updatedMessageState } = generateEveningReflection(
          msgContext, heartbeatMessageState, now,
        );
        if (message) {
          const sendResult = await sendMessage(messengerConfig, { content: message.content });
          if (sendResult.success) {
            log(`Message sent (${message.trigger}): ${message.content}`);
          }
        }
        heartbeatMessageState = updatedMessageState;
        await saveHeartbeatMessageState(heartbeatMessageState);
      }

      // Send daily snapshot alongside diary (same evening timing)
      await sendDailySnapshot(updatedState);
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
  console.log("  │    Perception every 1 minute       │");
  console.log("  │    Active hours: 07:00 - 23:00    │");
  console.log("  ╰──────────────────────────────────╯");
  console.log("");
  console.log(`  Workspace: ${WORKSPACE_ROOT}`);
  console.log(`  Press Ctrl+C to stop`);
  console.log("");
}

async function main() {
  printBanner();

  // Verify state exists and load entity info
  let state: EntityState;
  try {
    state = await loadState();
    log("Entity state loaded");
  } catch (err) {
    console.error(`\n  ${(err as Error).message}`);
    process.exit(1);
  }

  // Start sensor service
  try {
    await initSensorService(state);
  } catch (err) {
    log(`Sensor init warning: ${(err as Error).message}`);
    // Continue without sensors — entity still works
  }

  // Initialize messenger (Discord + Telegram)
  await initMessenger();

  // Initialize proactive messaging state
  heartbeatMessageState = await loadHeartbeatMessageState(new Date());
  log("Proactive messaging ready");

  // Run first tick immediately
  await tick();

  // Set up periodic check (every 1 minute, pulses every 30 minutes)
  setInterval(tick, CHECK_INTERVAL_MS);

  // Handle graceful shutdown
  const shutdown = async () => {
    log("Heartbeat stopping...");
    if (sensorService) {
      await stopService(sensorService);
      log("Sensors stopped");
    }
    process.exit(0);
  };

  process.on("SIGINT", () => { shutdown(); });
  process.on("SIGTERM", () => { shutdown(); });
}

main().catch((err) => {
  console.error("\n  Heartbeat failed:", err.message);
  process.exit(1);
});
