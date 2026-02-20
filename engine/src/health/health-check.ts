/**
 * Health Check Engine — Entity vital signs and system diagnostics.
 *
 * Checks:
 *   - Entity existence (SEED.md, state.json)
 *   - State freshness (STATUS.md last modification, last interaction)
 *   - Workspace integrity (essential files present)
 *   - Memory health (hot memory not stale, no corruption)
 *   - Dashboard reachability (localhost:3000)
 *   - Heartbeat liveness (was state updated recently?)
 */

import { readFile, stat, readdir, access } from "node:fs/promises";
import { join } from "node:path";

export type CheckStatus = "ok" | "warn" | "error";

export interface HealthCheckItem {
  name: string;
  status: CheckStatus;
  message: string;
  /** Optional detail for verbose output */
  detail?: string;
}

export interface HealthReport {
  timestamp: string;
  overall: CheckStatus;
  entityAlive: boolean;
  checks: HealthCheckItem[];
}

/** Essential files that must exist in the workspace */
const ESSENTIAL_FILES = [
  "SEED.md",
  "STATUS.md",
  "SOUL.md",
  "MEMORY.md",
  "LANGUAGE.md",
];

/** Files that should exist but are non-critical */
const OPTIONAL_FILES = [
  "IDENTITY.md",
  "HEARTBEAT.md",
  "PERCEPTION.md",
  "FORM.md",
  "SOUL_EVIL.md",
];

/**
 * Run all health checks against the workspace.
 */
export async function runHealthCheck(
  workspaceRoot: string,
  dashboardPort = 3000,
): Promise<HealthReport> {
  const checks: HealthCheckItem[] = [];

  // 1. Check workspace exists
  checks.push(await checkWorkspaceExists(workspaceRoot));

  // 2. Check essential files
  checks.push(await checkEssentialFiles(workspaceRoot));

  // 3. Check state file
  checks.push(await checkStateFile(workspaceRoot));

  // 4. Check entity vitals (mood, energy from STATUS.md)
  checks.push(await checkEntityVitals(workspaceRoot));

  // 5. Check heartbeat freshness (state.json modification time)
  checks.push(await checkHeartbeatFreshness(workspaceRoot));

  // 6. Check last interaction time
  checks.push(await checkLastInteraction(workspaceRoot));

  // 7. Check memory integrity
  checks.push(await checkMemoryIntegrity(workspaceRoot));

  // 8. Check directory structure
  checks.push(await checkDirectoryStructure(workspaceRoot));

  // 9. Check dashboard
  checks.push(await checkDashboard(dashboardPort));

  // Compute overall status
  const hasError = checks.some((c) => c.status === "error");
  const hasWarn = checks.some((c) => c.status === "warn");
  const entityAlive = !checks.some(
    (c) => c.name === "workspace" && c.status === "error",
  ) && !checks.some(
    (c) => c.name === "essential-files" && c.status === "error",
  );

  return {
    timestamp: new Date().toISOString(),
    overall: hasError ? "error" : hasWarn ? "warn" : "ok",
    entityAlive,
    checks,
  };
}

async function checkWorkspaceExists(root: string): Promise<HealthCheckItem> {
  try {
    await access(root);
    return { name: "workspace", status: "ok", message: "Workspace exists" };
  } catch {
    return { name: "workspace", status: "error", message: "Workspace not found", detail: root };
  }
}

async function checkEssentialFiles(root: string): Promise<HealthCheckItem> {
  const missing: string[] = [];
  for (const file of ESSENTIAL_FILES) {
    try {
      await access(join(root, file));
    } catch {
      missing.push(file);
    }
  }

  if (missing.length === 0) {
    return { name: "essential-files", status: "ok", message: `All ${ESSENTIAL_FILES.length} essential files present` };
  }

  if (missing.includes("SEED.md")) {
    return {
      name: "essential-files",
      status: "error",
      message: `Missing essential files: ${missing.join(", ")}`,
      detail: "SEED.md is the entity's genesis record — without it the entity does not exist",
    };
  }

  return {
    name: "essential-files",
    status: "warn",
    message: `Missing files: ${missing.join(", ")}`,
  };
}

async function checkStateFile(root: string): Promise<HealthCheckItem> {
  for (const filename of ["state.json", "__state.json"]) {
    try {
      const content = await readFile(join(root, filename), "utf-8");
      const state = JSON.parse(content);
      if (state.seed && state.status) {
        return {
          name: "state-file",
          status: "ok",
          message: `Entity state loaded (${filename})`,
          detail: `Species: ${state.seed.perception}, Day: ${state.status.growthDay ?? "?"}`,
        };
      }
    } catch {
      continue;
    }
  }

  return {
    name: "state-file",
    status: "error",
    message: "No valid state.json found — entity state may be lost",
    detail: "Run npm run heartbeat to regenerate",
  };
}

async function checkEntityVitals(root: string): Promise<HealthCheckItem> {
  try {
    const content = await readFile(join(root, "STATUS.md"), "utf-8");
    const mood = parseInt(extractField(content, "mood") ?? "0", 10);
    const energy = parseInt(extractField(content, "energy") ?? "0", 10);
    const comfort = parseInt(extractField(content, "comfort") ?? "0", 10);
    const day = parseInt(extractField(content, "day") ?? "0", 10);

    const vitals = `mood:${mood} energy:${energy} comfort:${comfort} day:${day}`;

    if (mood <= 10 && comfort <= 10) {
      return { name: "entity-vitals", status: "warn", message: `Entity in distress — ${vitals}` };
    }
    if (energy <= 5) {
      return { name: "entity-vitals", status: "warn", message: `Entity exhausted — ${vitals}` };
    }

    return { name: "entity-vitals", status: "ok", message: vitals };
  } catch {
    return { name: "entity-vitals", status: "error", message: "Cannot read STATUS.md" };
  }
}

async function checkHeartbeatFreshness(root: string): Promise<HealthCheckItem> {
  try {
    const info = await stat(join(root, "state.json"));
    const ageMs = Date.now() - info.mtimeMs;
    const ageMinutes = Math.floor(ageMs / 60_000);
    const ageHours = Math.floor(ageMinutes / 60);

    if (ageMinutes < 60) {
      return { name: "heartbeat", status: "ok", message: `Last heartbeat: ${ageMinutes}m ago` };
    }

    if (ageHours < 24) {
      return {
        name: "heartbeat",
        status: "warn",
        message: `Last heartbeat: ${ageHours}h ago`,
        detail: "Entity may be sleeping or heartbeat process stopped",
      };
    }

    return {
      name: "heartbeat",
      status: "error",
      message: `Last heartbeat: ${ageHours}h ago — heartbeat may have stopped`,
      detail: "Run npm run heartbeat to restart",
    };
  } catch {
    return { name: "heartbeat", status: "error", message: "state.json not found — heartbeat never ran" };
  }
}

async function checkLastInteraction(root: string): Promise<HealthCheckItem> {
  try {
    const content = await readFile(join(root, "STATUS.md"), "utf-8");
    const lastInteraction = extractField(content, "last_interaction") ?? "never";

    if (lastInteraction === "never") {
      return { name: "last-interaction", status: "warn", message: "No interactions yet — entity has never been spoken to" };
    }

    const ageMs = Date.now() - new Date(lastInteraction).getTime();
    const ageHours = Math.floor(ageMs / 3_600_000);
    const ageDays = Math.floor(ageHours / 24);

    if (ageDays >= 7) {
      return {
        name: "last-interaction",
        status: "warn",
        message: `Last interaction: ${ageDays} days ago`,
        detail: "The entity may be lonely. Consider saying hello.",
      };
    }

    if (ageHours < 1) {
      return { name: "last-interaction", status: "ok", message: "Last interaction: just now" };
    }

    return { name: "last-interaction", status: "ok", message: `Last interaction: ${ageHours}h ago` };
  } catch {
    return { name: "last-interaction", status: "warn", message: "Cannot determine last interaction" };
  }
}

async function checkMemoryIntegrity(root: string): Promise<HealthCheckItem> {
  try {
    const content = await readFile(join(root, "MEMORY.md"), "utf-8");
    if (!content.includes("# MEMORY")) {
      return { name: "memory", status: "warn", message: "MEMORY.md format unexpected" };
    }

    // Count diary files
    let diaryCount = 0;
    try {
      const diaryDir = join(root, "diary");
      const entries = await readdir(diaryDir);
      diaryCount = entries.filter((e) => e.endsWith(".md")).length;
    } catch {
      // diary dir might not exist yet
    }

    // Count weekly summaries
    let weeklyCount = 0;
    try {
      const weeklyDir = join(root, "memory", "weekly");
      const entries = await readdir(weeklyDir);
      weeklyCount = entries.filter((e) => e.endsWith(".md")).length;
    } catch {
      // normal if no weeks have passed
    }

    return {
      name: "memory",
      status: "ok",
      message: `Memory intact — ${diaryCount} diary entries, ${weeklyCount} weekly summaries`,
    };
  } catch {
    return { name: "memory", status: "warn", message: "Cannot read MEMORY.md" };
  }
}

async function checkDirectoryStructure(root: string): Promise<HealthCheckItem> {
  const requiredDirs = ["memory", "diary", "growth"];
  const missing: string[] = [];

  for (const dir of requiredDirs) {
    try {
      await access(join(root, dir));
    } catch {
      missing.push(dir);
    }
  }

  if (missing.length === 0) {
    return { name: "directories", status: "ok", message: "Directory structure intact" };
  }

  return {
    name: "directories",
    status: "warn",
    message: `Missing directories: ${missing.join(", ")}`,
    detail: "Run npm run setup to recreate",
  };
}

async function checkDashboard(port: number): Promise<HealthCheckItem> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`http://localhost:${port}/`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      return { name: "dashboard", status: "ok", message: `Dashboard running on port ${port}` };
    }
    return { name: "dashboard", status: "warn", message: `Dashboard responded with ${res.status}` };
  } catch {
    return {
      name: "dashboard",
      status: "warn",
      message: "Dashboard not running",
      detail: `Run npm run dashboard to start (localhost:${port})`,
    };
  }
}

function extractField(content: string, key: string): string | undefined {
  const match = content.match(new RegExp(`\\*\\*${key}\\*\\*:\\s*(.+)`));
  return match?.[1]?.trim();
}
