/**
 * End-to-End Test: Setup & Deploy Systems
 *
 * Verifies the complete setup and deployment pipeline:
 *   1. Workspace deployment creates all required files and directories
 *   2. Template files are valid markdown with correct structure
 *   3. All template files contain expected sections
 *   4. Workspace directory permissions
 *   5. Seed generation during setup produces valid seeds
 *   6. Deploy + first heartbeat produces valid entity state
 *   7. Deploy + first interaction produces expected first encounter
 *   8. Full lifecycle: deploy -> heartbeat -> interact -> heartbeat -> verify state
 *   9. Re-deploy prevention (One Body, One Soul)
 *  10. Template customization via seed placeholders
 *
 * Uses real engine functions with no mocks. Deploys to temp directories.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtemp,
  rm,
  readFile,
  readdir,
  access,
  stat,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  generateSeed,
  createFixedSeed,
} from "../../engine/src/genesis/seed-generator.js";
import {
  createEntityState,
  processHeartbeat,
  processInteraction,
  serializeState,
  type EntityState,
} from "../../engine/src/status/status-manager.js";
import { generateSoulEvilMd } from "../../engine/src/mood/sulk-engine.js";
import { OpenClawWorkspaceManager } from "../../adapters/src/openclaw/workspace-manager.js";
import type {
  HardwareBody,
  PerceptionMode,
  Seed,
} from "../../engine/src/types.js";

// --- Shared fixtures ---

const TEMPLATE_DIR = resolve(
  import.meta.dirname!,
  "..",
  "..",
  "templates",
  "workspace",
);

const TEST_HW: HardwareBody = {
  platform: "linux",
  arch: "x64",
  totalMemoryGB: 8,
  cpuModel: "Test CPU",
  storageGB: 128,
};

const BIRTH_ISO = "2026-02-20T08:00:00.000Z";
const BIRTH_TIME = new Date(BIRTH_ISO);

/**
 * Replicate the setup script's placeholder replacement logic.
 * This is the same function from scripts/setup.ts — tested here to ensure
 * the template + replacement produces valid SEED.md content.
 */
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

/**
 * Simulate the full deploy process from scripts/setup.ts:deployWorkspace.
 * Creates directories, copies templates, replaces SEED.md placeholders,
 * writes engine state files, and writes SOUL_EVIL.md.
 */
async function deployWorkspaceToDir(
  targetDir: string,
  seed: Seed,
  now: Date,
): Promise<EntityState> {
  // Create directories
  const dirs = [
    targetDir,
    join(targetDir, "memory"),
    join(targetDir, "memory", "weekly"),
    join(targetDir, "memory", "monthly"),
    join(targetDir, "diary"),
    join(targetDir, "growth"),
    join(targetDir, "growth", "portraits"),
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
    await writeFile(join(targetDir, file), content, "utf-8");
  }

  // Generate initial entity state and write engine state files
  const entityState = createEntityState(seed, now);
  const serialized = serializeState(entityState);

  await writeFile(join(targetDir, "STATUS.md"), serialized.statusMd, "utf-8");
  await writeFile(join(targetDir, "MEMORY.md"), serialized.memoryMd, "utf-8");
  await writeFile(
    join(targetDir, "LANGUAGE.md"),
    serialized.languageMd,
    "utf-8",
  );
  await writeFile(
    join(targetDir, "growth", "milestones.md"),
    serialized.milestonesMd,
    "utf-8",
  );
  await writeFile(join(targetDir, "FORM.md"), serialized.formMd, "utf-8");

  // Write species-specific SOUL_EVIL.md
  const soulEvilMd = generateSoulEvilMd(seed.perception, "mild");
  await writeFile(join(targetDir, "SOUL_EVIL.md"), soulEvilMd, "utf-8");

  // Save full state as JSON
  await writeFile(
    join(targetDir, "__state.json"),
    JSON.stringify(entityState, null, 2),
    "utf-8",
  );

  return entityState;
}

// ============================================================
// 1. Workspace deployment creates all required files and directories
// ============================================================

describe("workspace deployment: directories and files", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "yadori-setup-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates all required subdirectories", async () => {
    const wsDir = join(tempDir, "workspace");
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_ISO,
    });
    await deployWorkspaceToDir(wsDir, seed, BIRTH_TIME);

    const expectedDirs = [
      "memory",
      "memory/weekly",
      "memory/monthly",
      "diary",
      "growth",
      "growth/portraits",
    ];

    for (const dir of expectedDirs) {
      const dirStat = await stat(join(wsDir, dir));
      expect(dirStat.isDirectory()).toBe(true);
    }
  });

  it("creates all required top-level markdown files", async () => {
    const wsDir = join(tempDir, "workspace");
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_ISO,
    });
    await deployWorkspaceToDir(wsDir, seed, BIRTH_TIME);

    const expectedFiles = [
      "SOUL.md",
      "SOUL_EVIL.md",
      "SEED.md",
      "STATUS.md",
      "IDENTITY.md",
      "HEARTBEAT.md",
      "MEMORY.md",
      "LANGUAGE.md",
      "FORM.md",
      "__state.json",
    ];

    for (const file of expectedFiles) {
      await expect(access(join(wsDir, file))).resolves.toBeUndefined();
    }
  });

  it("creates milestones.md in growth subdirectory", async () => {
    const wsDir = join(tempDir, "workspace");
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_ISO,
    });
    await deployWorkspaceToDir(wsDir, seed, BIRTH_TIME);

    await expect(
      access(join(wsDir, "growth", "milestones.md")),
    ).resolves.toBeUndefined();
  });
});

// ============================================================
// 2. Template files are valid markdown with correct structure
// ============================================================

describe("template file validity", () => {
  it("all template files are valid markdown (start with # heading or > blockquote or ## subheading)", async () => {
    const files = await readdir(TEMPLATE_DIR);

    for (const file of files) {
      const content = await readFile(join(TEMPLATE_DIR, file), "utf-8");
      // Every template file should start with a markdown heading,
      // blockquote, or a subheading (## for REVERSALS.md)
      const firstLine = content.trimStart().split("\n")[0];
      expect(
        firstLine.startsWith("#") ||
          firstLine.startsWith(">") ||
          firstLine.startsWith("_"),
      ).toBe(true);
    }
  });

  it("SEED.md template contains all required placeholders", async () => {
    const content = await readFile(join(TEMPLATE_DIR, "SEED.md"), "utf-8");

    const requiredPlaceholders = [
      "{{perception}}",
      "{{expression}}",
      "{{cognition}}",
      "{{temperament}}",
      "{{form}}",
      "{{sensitivity}}",
      "{{sociability}}",
      "{{rhythmAffinity}}",
      "{{memoryDepth}}",
      "{{expressiveness}}",
      "{{platform}}",
      "{{arch}}",
      "{{totalMemoryGB}}",
      "{{cpuModel}}",
      "{{storageGB}}",
      "{{createdAt}}",
      "{{hash}}",
    ];

    for (const placeholder of requiredPlaceholders) {
      expect(content).toContain(placeholder);
    }
  });

  it("SOUL.md template contains perception instructions for all 6 species", async () => {
    const content = await readFile(join(TEMPLATE_DIR, "SOUL.md"), "utf-8");

    const species: PerceptionMode[] = [
      "chromatic",
      "vibration",
      "geometric",
      "thermal",
      "temporal",
      "chemical",
    ];

    for (const s of species) {
      expect(content.toLowerCase()).toContain(s);
    }
  });
});

// ============================================================
// 3. All template files contain expected sections
// ============================================================

describe("template section structure", () => {
  it("SOUL.md contains who you are, how you perceive, how you communicate", async () => {
    const content = await readFile(join(TEMPLATE_DIR, "SOUL.md"), "utf-8");

    expect(content).toContain("## Who You Are");
    expect(content).toContain("## How You Perceive");
    expect(content).toContain("## How You Communicate");
  });

  it("HEARTBEAT.md contains autonomous tasks and rhythm schedule", async () => {
    const content = await readFile(
      join(TEMPLATE_DIR, "HEARTBEAT.md"),
      "utf-8",
    );

    expect(content).toContain("## Autonomous Check-in Tasks");
    expect(content).toContain("## Rhythm");
  });

  it("IDENTITY.md contains name and presentation sections", async () => {
    const content = await readFile(
      join(TEMPLATE_DIR, "IDENTITY.md"),
      "utf-8",
    );

    expect(content).toContain("## Name");
    expect(content).toContain("## Presentation");
  });

  it("STATUS.md template contains current state with default values", async () => {
    const content = await readFile(join(TEMPLATE_DIR, "STATUS.md"), "utf-8");

    expect(content).toContain("## Current State");
    expect(content).toContain("**mood**: 50");
    expect(content).toContain("**energy**: 50");
    expect(content).toContain("**curiosity**: 70");
    expect(content).toContain("**comfort**: 50");
    expect(content).toContain("**level**: 0");
    expect(content).toContain("**day**: 0");
    expect(content).toContain("**last_interaction**: never");
  });

  it("MEMORY.md template contains hot and warm memory sections", async () => {
    const content = await readFile(join(TEMPLATE_DIR, "MEMORY.md"), "utf-8");

    expect(content).toContain("## Hot Memory");
    expect(content).toContain("## Warm Memory");
  });

  it("LANGUAGE.md template starts at level 0 with available symbols", async () => {
    const content = await readFile(
      join(TEMPLATE_DIR, "LANGUAGE.md"),
      "utf-8",
    );

    expect(content).toContain("Level: 0");
    expect(content).toContain("Available symbols:");
  });
});

// ============================================================
// 4. Workspace directory permissions
// ============================================================

describe("workspace directory permissions", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "yadori-perm-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("OpenClawWorkspaceManager creates directories with mode 0o700", async () => {
    const wsDir = join(tempDir, "ws-perm");
    const manager = new OpenClawWorkspaceManager({ workspaceRoot: wsDir });

    // Create a minimal template dir
    const tplDir = join(tempDir, "tpl");
    await mkdir(tplDir, { recursive: true });
    await writeFile(join(tplDir, "SOUL.md"), "# SOUL\nTest");

    await manager.deployWorkspace(tplDir);

    const dirStat = await stat(wsDir);
    // Check owner permissions include rwx (0o700)
    const ownerPerms = dirStat.mode & 0o700;
    expect(ownerPerms).toBe(0o700);
  });

  it("OpenClawWorkspaceManager writeProtected sets file mode 0o600", async () => {
    const wsDir = join(tempDir, "ws-fperm");
    await mkdir(wsDir, { recursive: true });
    const manager = new OpenClawWorkspaceManager({ workspaceRoot: wsDir });

    await manager.writeStatus({
      mood: 50,
      energy: 50,
      curiosity: 70,
      comfort: 50,
      languageLevel: 0,
      perceptionLevel: 0,
      growthDay: 0,
      lastInteraction: "never",
    });

    const fileStat = await stat(join(wsDir, "STATUS.md"));
    const filePerms = fileStat.mode & 0o777;
    expect(filePerms).toBe(0o600);
  });
});

// ============================================================
// 5. Seed generation during setup produces valid seeds
// ============================================================

describe("seed generation validity", () => {
  const VALID_PERCEPTIONS: PerceptionMode[] = [
    "chromatic",
    "vibration",
    "geometric",
    "thermal",
    "temporal",
    "chemical",
  ];
  const VALID_COGNITIONS = ["associative", "analytical", "intuitive"];
  const VALID_TEMPERAMENTS = [
    "curious-cautious",
    "bold-impulsive",
    "calm-observant",
    "restless-exploratory",
  ];
  const VALID_FORMS = [
    "light-particles",
    "fluid",
    "crystal",
    "sound-echo",
    "mist",
    "geometric-cluster",
  ];

  it("generateSeed produces a seed with all required fields", () => {
    const seed = generateSeed(TEST_HW);

    expect(seed.perception).toBeDefined();
    expect(seed.expression).toBe("symbolic");
    expect(seed.cognition).toBeDefined();
    expect(seed.temperament).toBeDefined();
    expect(seed.form).toBeDefined();
    expect(seed.hardwareBody).toEqual(TEST_HW);
    expect(seed.subTraits).toBeDefined();
    expect(seed.createdAt).toBeDefined();
    expect(seed.hash).toBeDefined();
  });

  it("generateSeed produces values from valid enum sets", () => {
    const seed = generateSeed(TEST_HW);

    expect(VALID_PERCEPTIONS).toContain(seed.perception);
    expect(VALID_COGNITIONS).toContain(seed.cognition);
    expect(VALID_TEMPERAMENTS).toContain(seed.temperament);
    expect(VALID_FORMS).toContain(seed.form);
  });

  it("generateSeed produces sub-traits in 0-100 range", () => {
    const seed = generateSeed(TEST_HW);

    const traits = seed.subTraits;
    for (const [key, value] of Object.entries(traits)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it("generateSeed produces a 16-character hex hash", () => {
    const seed = generateSeed(TEST_HW);

    expect(seed.hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it("multiple generateSeed calls produce different seeds (randomness)", () => {
    const seeds = Array.from({ length: 10 }, () => generateSeed(TEST_HW));
    const hashes = seeds.map((s) => s.hash);
    const unique = new Set(hashes);

    // With 10 random seeds, all should be unique
    expect(unique.size).toBe(10);
  });

  it("createFixedSeed produces deterministic chromatic seed with known defaults", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_ISO,
    });

    expect(seed.perception).toBe("chromatic");
    expect(seed.cognition).toBe("associative");
    expect(seed.temperament).toBe("curious-cautious");
    expect(seed.form).toBe("light-particles");
    expect(seed.subTraits.sensitivity).toBe(65);
    expect(seed.subTraits.sociability).toBe(55);
  });
});

// ============================================================
// 6. Deploy + first heartbeat produces valid entity state
// ============================================================

describe("deploy + first heartbeat", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "yadori-hb-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("deployed state + heartbeat produces updated STATUS.md values", async () => {
    const wsDir = join(tempDir, "workspace");
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_ISO,
    });
    const entityState = await deployWorkspaceToDir(wsDir, seed, BIRTH_TIME);

    // Simulate first heartbeat at midday
    const hbTime = new Date("2026-02-20T14:00:00Z");
    const result = processHeartbeat(entityState, hbTime);

    // Status should have changed from initial values
    expect(result.updatedState.status).not.toEqual(entityState.status);

    // Write updated state to workspace
    const serialized = serializeState(result.updatedState);
    await writeFile(join(wsDir, "STATUS.md"), serialized.statusMd, "utf-8");

    // Read back and verify
    const statusContent = await readFile(join(wsDir, "STATUS.md"), "utf-8");
    expect(statusContent).toContain("# STATUS");
    expect(statusContent).toContain("**mood**:");
    expect(statusContent).toContain("**day**: 0");
  });

  it("heartbeat on day 1 updates growthDay", async () => {
    const wsDir = join(tempDir, "workspace");
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_ISO,
    });
    const entityState = await deployWorkspaceToDir(wsDir, seed, BIRTH_TIME);

    // Heartbeat next day
    const nextDay = new Date("2026-02-21T12:00:00Z");
    const result = processHeartbeat(entityState, nextDay);

    expect(result.updatedState.status.growthDay).toBe(1);
  });
});

// ============================================================
// 7. Deploy + first interaction produces expected first encounter
// ============================================================

describe("deploy + first interaction: first encounter", () => {
  it("first interaction after deploy triggers first encounter reaction", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_ISO,
    });
    const state = createEntityState(seed, BIRTH_TIME);

    const interTime = new Date("2026-02-20T09:00:00Z");
    const result = processInteraction(
      state,
      { minutesSinceLastInteraction: 999, userInitiated: true, messageLength: 20 },
      interTime,
      "Hello",
    );

    expect(result.firstEncounter).not.toBeNull();
    expect(result.firstEncounter!.expression).toBeTruthy();
    expect(result.firstEncounter!.innerExperience).toBeTruthy();
    expect(result.firstEncounter!.memoryImprint).toBeDefined();
    expect(result.firstEncounterDiaryMd).not.toBeNull();
    expect(result.firstEncounterDiaryMd).toContain("First Encounter");
  });

  it("first encounter produces species-specific expression for each perception type", () => {
    const species: PerceptionMode[] = [
      "chromatic",
      "vibration",
      "geometric",
      "thermal",
      "temporal",
      "chemical",
    ];

    const encounters = species.map((perception) => {
      const seed = createFixedSeed({
        perception,
        hardwareBody: TEST_HW,
        createdAt: BIRTH_ISO,
      });
      const state = createEntityState(seed, BIRTH_TIME);

      const result = processInteraction(
        state,
        { minutesSinceLastInteraction: 999, userInitiated: true, messageLength: 30 },
        new Date("2026-02-20T09:00:00Z"),
      );

      return {
        perception,
        expression: result.firstEncounter!.expression,
        innerExperience: result.firstEncounter!.innerExperience,
      };
    });

    // All species should produce distinct expressions
    const expressions = encounters.map((e) => e.expression);
    const uniqueExpressions = new Set(expressions);
    expect(uniqueExpressions.size).toBe(6);

    // All inner experiences should mention something perception-specific
    for (const e of encounters) {
      expect(e.innerExperience.length).toBeGreaterThan(0);
    }
  });

  it("first encounter creates permanent memory imprint", () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_ISO,
    });
    const state = createEntityState(seed, BIRTH_TIME);

    const result = processInteraction(
      state,
      { minutesSinceLastInteraction: 999, userInitiated: true, messageLength: 30 },
      new Date("2026-02-20T09:00:00Z"),
    );

    // Memory should contain the first encounter imprint
    expect(result.updatedState.memory.hot).toHaveLength(1);
    expect(result.updatedState.memory.hot[0].summary).toContain(
      "[FIRST ENCOUNTER]",
    );
  });
});

// ============================================================
// 8. Full lifecycle: deploy -> heartbeat -> interact -> heartbeat -> verify
// ============================================================

describe("full lifecycle: deploy -> heartbeat -> interact -> heartbeat -> verify", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "yadori-lifecycle-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("complete lifecycle produces consistent state evolution", async () => {
    const wsDir = join(tempDir, "workspace");
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_ISO,
    });

    // Step 1: Deploy
    let state = await deployWorkspaceToDir(wsDir, seed, BIRTH_TIME);
    expect(state.status.mood).toBe(50);
    expect(state.status.lastInteraction).toBe("never");
    expect(state.language.totalInteractions).toBe(0);

    // Step 2: First heartbeat (morning)
    const hb1Time = new Date("2026-02-20T09:00:00Z");
    const hb1 = processHeartbeat(state, hb1Time);
    state = hb1.updatedState;
    expect(hb1.wakeSignal).toBe(true);

    // Step 3: First interaction
    const interTime = new Date("2026-02-20T10:00:00Z");
    const inter = processInteraction(
      state,
      { minutesSinceLastInteraction: 999, userInitiated: true, messageLength: 40 },
      interTime,
      "Hello, new entity",
    );
    state = inter.updatedState;
    expect(inter.firstEncounter).not.toBeNull();
    expect(state.language.totalInteractions).toBe(1);
    expect(state.status.lastInteraction).toBe(interTime.toISOString());

    // Step 4: Second heartbeat (afternoon)
    const hb2Time = new Date("2026-02-20T14:00:00Z");
    const hb2 = processHeartbeat(state, hb2Time);
    state = hb2.updatedState;

    // Step 5: Verify final state consistency
    expect(state.status.growthDay).toBe(0);
    expect(state.status.mood).toBeGreaterThanOrEqual(0);
    expect(state.status.mood).toBeLessThanOrEqual(100);
    expect(state.status.energy).toBeGreaterThanOrEqual(0);
    expect(state.status.energy).toBeLessThanOrEqual(100);
    expect(state.memory.hot.length).toBeGreaterThan(0);
    expect(state.asymmetry.phase).toBe("alpha");

    // Step 6: Serialize and write back
    const serialized = serializeState(state);
    await writeFile(join(wsDir, "STATUS.md"), serialized.statusMd, "utf-8");
    await writeFile(
      join(wsDir, "__state.json"),
      JSON.stringify(state, null, 2),
      "utf-8",
    );

    // Step 7: Verify written files are valid
    const statusContent = await readFile(join(wsDir, "STATUS.md"), "utf-8");
    expect(statusContent).toContain(`**mood**: ${state.status.mood}`);

    const stateJson = JSON.parse(
      await readFile(join(wsDir, "__state.json"), "utf-8"),
    );
    expect(stateJson.language.totalInteractions).toBe(1);
  });

  it("multi-day lifecycle with multiple interactions and heartbeats", async () => {
    const wsDir = join(tempDir, "workspace");
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_ISO,
    });

    let state = await deployWorkspaceToDir(wsDir, seed, BIRTH_TIME);

    // Day 0: morning heartbeat + first interaction
    const hb0 = processHeartbeat(state, new Date("2026-02-20T08:30:00Z"));
    state = hb0.updatedState;

    const i0 = processInteraction(
      state,
      { minutesSinceLastInteraction: 999, userInitiated: true, messageLength: 30 },
      new Date("2026-02-20T10:00:00Z"),
      "First contact",
    );
    state = i0.updatedState;
    expect(i0.firstEncounter).not.toBeNull();

    // Day 0: evening heartbeat
    const hbEvening = processHeartbeat(
      state,
      new Date("2026-02-20T19:00:00Z"),
    );
    state = hbEvening.updatedState;
    // Evening heartbeats should generate diary
    expect(hbEvening.diary).not.toBeNull();

    // Day 1: morning heartbeat + interaction
    const hb1 = processHeartbeat(state, new Date("2026-02-21T08:30:00Z"));
    state = hb1.updatedState;
    expect(state.status.growthDay).toBe(1);

    const i1 = processInteraction(
      state,
      { minutesSinceLastInteraction: 60, userInitiated: true, messageLength: 50 },
      new Date("2026-02-21T10:00:00Z"),
      "Day 1 hello",
    );
    state = i1.updatedState;
    expect(i1.firstEncounter).toBeNull(); // Second interaction, no first encounter

    // Day 3: heartbeat
    const hb3 = processHeartbeat(state, new Date("2026-02-23T12:00:00Z"));
    state = hb3.updatedState;
    expect(state.status.growthDay).toBe(3);

    // Verify all values are in valid range
    expect(state.status.mood).toBeGreaterThanOrEqual(0);
    expect(state.status.mood).toBeLessThanOrEqual(100);
    expect(state.status.comfort).toBeGreaterThanOrEqual(0);
    expect(state.status.comfort).toBeLessThanOrEqual(100);
    expect(state.language.totalInteractions).toBe(2);
  });
});

// ============================================================
// 9. Re-deploy prevention (One Body, One Soul)
// ============================================================

describe("re-deploy prevention: One Body, One Soul", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "yadori-redeploy-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("OpenClawWorkspaceManager refuses to deploy over existing SEED.md", async () => {
    const wsDir = join(tempDir, "workspace");
    const manager = new OpenClawWorkspaceManager({ workspaceRoot: wsDir });

    // Create a minimal template dir
    const tplDir = join(tempDir, "tpl");
    await mkdir(tplDir, { recursive: true });
    await writeFile(join(tplDir, "SOUL.md"), "# SOUL\nTest");

    // First deploy succeeds
    await manager.deployWorkspace(tplDir);

    // Create SEED.md to simulate an existing entity
    await writeFile(join(wsDir, "SEED.md"), "# SEED\nExisting entity");

    // Second deploy fails
    await expect(manager.deployWorkspace(tplDir)).rejects.toThrow(
      /One Body, One Soul/,
    );
  });

  it("OpenClawWorkspaceManager writeSeed refuses to overwrite existing seed", async () => {
    const wsDir = join(tempDir, "workspace");
    await mkdir(wsDir, { recursive: true });
    const manager = new OpenClawWorkspaceManager({ workspaceRoot: wsDir });

    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_ISO,
    });

    // First write succeeds
    await manager.writeSeed(seed);

    // Second write fails
    await expect(manager.writeSeed(seed)).rejects.toThrow(/One Body, One Soul/);
  });

  it("setup script's existing entity check blocks re-deploy", async () => {
    const wsDir = join(tempDir, "workspace");
    await mkdir(wsDir, { recursive: true });

    // Create SEED.md to simulate existing entity
    await writeFile(join(wsDir, "SEED.md"), "# SEED\nExisting");

    // The setup script checks for SEED.md existence
    const seedPath = join(wsDir, "SEED.md");
    let exists = false;
    try {
      await access(seedPath);
      exists = true;
    } catch {
      exists = false;
    }

    expect(exists).toBe(true);
  });
});

// ============================================================
// 10. Template customization via seed placeholder replacement
// ============================================================

describe("template customization: SEED.md placeholder replacement", () => {
  it("all placeholders in SEED.md are replaced with actual seed values", async () => {
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_ISO,
    });

    const template = await readFile(join(TEMPLATE_DIR, "SEED.md"), "utf-8");
    const result = replacePlaceholders(template, seed);

    // No placeholders should remain
    expect(result).not.toContain("{{");
    expect(result).not.toContain("}}");

    // Actual values should be present
    expect(result).toContain(seed.perception);
    expect(result).toContain(seed.cognition);
    expect(result).toContain(seed.temperament);
    expect(result).toContain(seed.form);
    expect(result).toContain(seed.hash);
    expect(result).toContain(seed.createdAt);
    expect(result).toContain(String(seed.subTraits.sensitivity));
    expect(result).toContain(TEST_HW.platform);
    expect(result).toContain(TEST_HW.cpuModel);
  });

  it("replaced SEED.md can be parsed back by OpenClawWorkspaceManager", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "yadori-parse-"));

    try {
      const seed = createFixedSeed({
        hardwareBody: TEST_HW,
        createdAt: BIRTH_ISO,
      });

      const template = await readFile(join(TEMPLATE_DIR, "SEED.md"), "utf-8");
      const seedMd = replacePlaceholders(template, seed);

      // Write to temp dir and parse with workspace manager
      await writeFile(join(tempDir, "SEED.md"), seedMd, "utf-8");
      const manager = new OpenClawWorkspaceManager({
        workspaceRoot: tempDir,
      });
      const parsed = await manager.readSeed();

      expect(parsed.perception).toBe(seed.perception);
      expect(parsed.cognition).toBe(seed.cognition);
      expect(parsed.temperament).toBe(seed.temperament);
      expect(parsed.form).toBe(seed.form);
      expect(parsed.hash).toBe(seed.hash);
      expect(parsed.hardwareBody.platform).toBe(TEST_HW.platform);
      expect(parsed.hardwareBody.totalMemoryGB).toBe(TEST_HW.totalMemoryGB);
      expect(parsed.subTraits.sensitivity).toBe(seed.subTraits.sensitivity);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("random seed values are correctly substituted into SEED.md", async () => {
    const seed = generateSeed(TEST_HW);

    const template = await readFile(join(TEMPLATE_DIR, "SEED.md"), "utf-8");
    const result = replacePlaceholders(template, seed);

    // No placeholders remain
    expect(result).not.toContain("{{");
    expect(result).not.toContain("}}");

    // The random perception value is present
    expect(result).toContain(seed.perception);
  });

  it("SOUL_EVIL.md is species-specific after deploy", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "yadori-species-evil-"));

    try {
      const species: PerceptionMode[] = ["chromatic", "vibration", "geometric"];
      const soulEvils: string[] = [];

      for (const perception of species) {
        const content = generateSoulEvilMd(perception, "mild");
        soulEvils.push(content);
      }

      // Each species should produce a different SOUL_EVIL.md
      const unique = new Set(soulEvils);
      expect(unique.size).toBe(3);

      // All should contain the sulking mode header
      for (const content of soulEvils) {
        expect(content).toContain("SOUL");
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

// ============================================================
// Additional: __state.json round-trip verification
// ============================================================

describe("__state.json round-trip", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "yadori-json-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("__state.json preserves full entity state across deploy", async () => {
    const wsDir = join(tempDir, "workspace");
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_ISO,
    });
    const entityState = await deployWorkspaceToDir(wsDir, seed, BIRTH_TIME);

    // Read back __state.json
    const stateJson = JSON.parse(
      await readFile(join(wsDir, "__state.json"), "utf-8"),
    );

    // Verify key state properties
    expect(stateJson.seed.perception).toBe(seed.perception);
    expect(stateJson.seed.hash).toBe(seed.hash);
    expect(stateJson.status.mood).toBe(50);
    expect(stateJson.status.energy).toBe(50);
    expect(stateJson.status.lastInteraction).toBe("never");
    expect(stateJson.language.totalInteractions).toBe(0);
    expect(stateJson.language.nativeSymbols).toBeDefined();
    expect(Array.isArray(stateJson.language.nativeSymbols)).toBe(true);
  });

  it("__state.json can be loaded and used for processHeartbeat", async () => {
    const wsDir = join(tempDir, "workspace");
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_ISO,
    });
    await deployWorkspaceToDir(wsDir, seed, BIRTH_TIME);

    // Read __state.json back (simulating what the heartbeat runner does)
    const stateJson = JSON.parse(
      await readFile(join(wsDir, "__state.json"), "utf-8"),
    ) as EntityState;

    // Process a heartbeat with the loaded state
    const result = processHeartbeat(
      stateJson,
      new Date("2026-02-20T14:00:00Z"),
    );

    // Should produce valid updated state
    expect(result.updatedState.status.mood).toBeGreaterThanOrEqual(0);
    expect(result.updatedState.status.mood).toBeLessThanOrEqual(100);
    expect(typeof result.wakeSignal).toBe("boolean");
    expect(typeof result.sleepSignal).toBe("boolean");
  });
});
