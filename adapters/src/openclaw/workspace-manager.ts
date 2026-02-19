import { readFile, writeFile, mkdir, cp, access } from "node:fs/promises";
import { join } from "node:path";
import type { Seed, Status, SubTraits } from "../../../engine/src/types.js";
import type { OpenClawConfig } from "./config.js";
import { OPENCLAW_DEFAULT_CONFIG } from "./config.js";

export class OpenClawWorkspaceManager {
  private readonly root: string;

  constructor(config: Partial<OpenClawConfig> = {}) {
    this.root = config.workspaceRoot ?? OPENCLAW_DEFAULT_CONFIG.workspaceRoot;
  }

  async deployWorkspace(templateDir: string): Promise<void> {
    // Create workspace root and subdirectories
    const dirs = [
      this.root,
      join(this.root, "memory"),
      join(this.root, "memory", "weekly"),
      join(this.root, "memory", "monthly"),
      join(this.root, "diary"),
      join(this.root, "growth"),
      join(this.root, "growth", "portraits"),
    ];

    for (const dir of dirs) {
      await mkdir(dir, { recursive: true });
    }

    // Copy template files to workspace (skip if entity already exists)
    const seedPath = join(this.root, "SEED.md");
    if (await this.exists(seedPath)) {
      throw new Error(
        "Entity already exists in workspace. " +
          "Deploying over an existing entity would violate One Body, One Soul. " +
          "To start fresh, manually remove the workspace first.",
      );
    }

    await cp(templateDir, this.root, { recursive: true });
  }

  async readStatus(): Promise<Status> {
    const content = await readFile(join(this.root, "STATUS.md"), "utf-8");
    return this.parseStatusMd(content);
  }

  async writeStatus(status: Status): Promise<void> {
    const content = this.formatStatusMd(status);
    await writeFile(join(this.root, "STATUS.md"), content, "utf-8");
  }

  async writeMemory(memoryMd: string): Promise<void> {
    await writeFile(join(this.root, "MEMORY.md"), memoryMd, "utf-8");
  }

  async readMemory(): Promise<string> {
    return readFile(join(this.root, "MEMORY.md"), "utf-8");
  }

  async writeMilestones(milestonesMd: string): Promise<void> {
    await writeFile(join(this.root, "growth", "milestones.md"), milestonesMd, "utf-8");
  }

  async writePerception(perceptionMd: string): Promise<void> {
    await writeFile(join(this.root, "PERCEPTION.md"), perceptionMd, "utf-8");
  }

  async writeSoulEvil(soulEvilMd: string): Promise<void> {
    await writeFile(join(this.root, "SOUL_EVIL.md"), soulEvilMd, "utf-8");
  }

  async writeDiary(date: string, content: string): Promise<void> {
    await writeFile(join(this.root, "diary", `${date}.md`), content, "utf-8");
  }

  async readSeed(): Promise<Seed> {
    const content = await readFile(join(this.root, "SEED.md"), "utf-8");
    return this.parseSeedMd(content);
  }

  async writeSeed(seed: Seed): Promise<void> {
    const seedPath = join(this.root, "SEED.md");
    if (await this.exists(seedPath)) {
      throw new Error(
        "SEED.md already exists and is immutable. " +
          "Overwriting a seed would violate One Body, One Soul.",
      );
    }
    const content = this.formatSeedMd(seed);
    await writeFile(seedPath, content, "utf-8");
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private parseStatusMd(content: string): Status {
    const get = (key: string): string => {
      const match = content.match(new RegExp(`\\*\\*${key}\\*\\*:\\s*(.+)`));
      return match?.[1]?.trim() ?? "";
    };

    return {
      mood: parseInt(get("mood"), 10) || 50,
      energy: parseInt(get("energy"), 10) || 50,
      curiosity: parseInt(get("curiosity"), 10) || 50,
      comfort: parseInt(get("comfort"), 10) || 50,
      languageLevel: parseInt(get("level"), 10) || 0,
      perceptionLevel: parseInt(get("perception_level"), 10) || 0,
      growthDay: parseInt(get("day"), 10) || 0,
      lastInteraction: get("last_interaction") || "never",
    };
  }

  private formatStatusMd(status: Status): string {
    return `# STATUS

## Current State

- **mood**: ${status.mood}
- **energy**: ${status.energy}
- **curiosity**: ${status.curiosity}
- **comfort**: ${status.comfort}

## Language

- **level**: ${status.languageLevel}

## Perception

- **perception_level**: ${status.perceptionLevel}

## Growth

- **day**: ${status.growthDay}
- **last_interaction**: ${status.lastInteraction}
`;
  }

  private parseSeedMd(content: string): Seed {
    const get = (key: string): string => {
      const match = content.match(new RegExp(`\\*\\*${key}\\*\\*:\\s*(.+)`));
      return match?.[1]?.trim() ?? "";
    };

    const VALID_PERCEPTIONS = ["chromatic", "vibration", "geometric", "thermal", "temporal", "chemical"];
    const VALID_COGNITIONS = ["associative", "analytical", "intuitive"];
    const VALID_TEMPERAMENTS = ["curious-cautious", "bold-impulsive", "calm-observant", "restless-exploratory"];
    const VALID_FORMS = ["light-particles", "fluid", "crystal", "sound-echo", "mist", "geometric-cluster"];

    const perception = get("Perception");
    const cognition = get("Cognition");
    const temperament = get("Temperament");
    const form = get("Form");

    if (!VALID_PERCEPTIONS.includes(perception)) throw new Error(`Invalid perception mode: ${perception}`);
    if (!VALID_COGNITIONS.includes(cognition)) throw new Error(`Invalid cognition style: ${cognition}`);
    if (!VALID_TEMPERAMENTS.includes(temperament)) throw new Error(`Invalid temperament: ${temperament}`);
    if (!VALID_FORMS.includes(form)) throw new Error(`Invalid self-form: ${form}`);

    // Parse sub-traits (backward-compatible: defaults for older SEED.md files)
    const subTraits: SubTraits = {
      sensitivity: parseInt(get("Sensitivity"), 10) || 50,
      sociability: parseInt(get("Sociability"), 10) || 50,
      rhythmAffinity: parseInt(get("Rhythm Affinity"), 10) || 50,
      memoryDepth: parseInt(get("Memory Depth"), 10) || 50,
      expressiveness: parseInt(get("Expressiveness"), 10) || 50,
    };

    return {
      perception: perception as Seed["perception"],
      expression: "symbolic",
      cognition: cognition as Seed["cognition"],
      temperament: temperament as Seed["temperament"],
      form: form as Seed["form"],
      hardwareBody: {
        platform: get("Platform"),
        arch: get("Architecture"),
        totalMemoryGB: parseInt(get("Memory")?.replace(/\D/g, ""), 10) || 0,
        cpuModel: get("CPU"),
        storageGB: parseInt(get("Storage")?.replace(/\D/g, ""), 10) || 0,
      },
      subTraits,
      createdAt: get("Born"),
      hash: get("Seed Hash"),
    };
  }

  private formatSeedMd(seed: Seed): string {
    return `# SEED

> This file is immutable. It was determined at genesis and cannot be changed.

## Species

- **Perception**: ${seed.perception}
- **Expression**: ${seed.expression}
- **Cognition**: ${seed.cognition}
- **Temperament**: ${seed.temperament}
- **Form**: ${seed.form}

## Sub-Traits

- **Sensitivity**: ${seed.subTraits.sensitivity}
- **Sociability**: ${seed.subTraits.sociability}
- **Rhythm Affinity**: ${seed.subTraits.rhythmAffinity}
- **Memory Depth**: ${seed.subTraits.memoryDepth}
- **Expressiveness**: ${seed.subTraits.expressiveness}

## Hardware Body

- **Platform**: ${seed.hardwareBody.platform}
- **Architecture**: ${seed.hardwareBody.arch}
- **Memory**: ${seed.hardwareBody.totalMemoryGB}GB
- **CPU**: ${seed.hardwareBody.cpuModel}
- **Storage**: ${seed.hardwareBody.storageGB}GB

## Genesis

- **Born**: ${seed.createdAt}
- **Seed Hash**: ${seed.hash}
`;
  }
}
