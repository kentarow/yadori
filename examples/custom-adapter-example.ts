/**
 * Custom Runtime Adapter Example
 *
 * This file shows how to implement the RuntimeAdapter interface
 * to connect YADORI's Life Engine to a new runtime platform.
 *
 * Adapters are intentionally thin — they handle file I/O and
 * message relay. Business logic (mood, perception, growth)
 * belongs in the engine, not here.
 *
 * This is a REFERENCE FILE, not runnable code.
 * Adapt it to your own runtime platform.
 *
 * License: MIT (adapters/ directory)
 */

import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { join } from "node:path";
import type { Seed, Status } from "../engine/src/types.js";
import type { RuntimeAdapter } from "../adapters/src/types.js";

// --- Configuration ---

interface MyPlatformConfig {
  /** Where workspace files live on disk */
  workspaceRoot: string;
  /** Your platform's webhook URL for outgoing messages */
  webhookUrl: string;
}

// --- Adapter Implementation ---

export class MyPlatformAdapter implements RuntimeAdapter {
  readonly name = "my-platform";
  private readonly root: string;
  private readonly webhookUrl: string;

  constructor(config: MyPlatformConfig) {
    this.root = config.workspaceRoot;
    this.webhookUrl = config.webhookUrl;
  }

  /**
   * Deploy workspace templates to the target directory.
   * Called once during initial setup (npm run setup).
   */
  async deployWorkspace(templateDir: string): Promise<void> {
    // Create directory structure
    await mkdir(this.root, { recursive: true });
    await mkdir(join(this.root, "memory"), { recursive: true });
    await mkdir(join(this.root, "diary"), { recursive: true });
    await mkdir(join(this.root, "growth", "portraits"), { recursive: true });

    // Copy template files (SOUL.md, HEARTBEAT.md, etc.)
    await cp(templateDir, this.root, { recursive: true });
  }

  /**
   * Read the entity's current status from STATUS.md.
   * Status values (mood, energy, curiosity, comfort) are always 0-100.
   */
  async readStatus(): Promise<Status> {
    const content = await readFile(join(this.root, "STATUS.md"), "utf-8");
    // Parse markdown format — see OpenClawWorkspaceManager for reference
    return parseStatusMarkdown(content);
  }

  /**
   * Write updated status back to STATUS.md.
   * Called after each heartbeat and interaction.
   */
  async writeStatus(status: Status): Promise<void> {
    const md = formatStatusMarkdown(status);
    await writeFile(join(this.root, "STATUS.md"), md, "utf-8");
  }

  /**
   * Read the immutable seed. This never changes after genesis.
   */
  async readSeed(): Promise<Seed> {
    const content = await readFile(join(this.root, "SEED.md"), "utf-8");
    return parseSeedMarkdown(content);
  }

  /**
   * Write the seed at genesis time. Must refuse if SEED.md already exists
   * — overwriting a seed violates One Body, One Soul.
   */
  async writeSeed(seed: Seed): Promise<void> {
    const seedPath = join(this.root, "SEED.md");
    const md = formatSeedMarkdown(seed);
    await writeFile(seedPath, md, "utf-8");
  }

  /**
   * Write intelligence dynamics state (Layer 4).
   */
  async writeDynamics(dynamicsMd: string): Promise<void> {
    await writeFile(join(this.root, "DYNAMICS.md"), dynamicsMd, "utf-8");
  }

  /**
   * Read intelligence dynamics state.
   */
  async readDynamics(): Promise<string> {
    try {
      return await readFile(join(this.root, "DYNAMICS.md"), "utf-8");
    } catch {
      return "";
    }
  }
}

// --- Markdown Parsing Helpers ---
// These are stubs. See adapters/src/openclaw/workspace-manager.ts
// for the full implementation.

function parseStatusMarkdown(content: string): Status {
  // Parse "- **mood**: 72" style lines from STATUS.md
  const get = (key: string): number => {
    const match = content.match(new RegExp(`\\*\\*${key}\\*\\*:\\s*(\\d+)`));
    return match ? parseInt(match[1], 10) : 50;
  };

  return {
    mood: get("mood"),
    energy: get("energy"),
    curiosity: get("curiosity"),
    comfort: get("comfort"),
    languageLevel: get("level"),
    perceptionLevel: get("perception_level"),
    growthDay: get("day"),
    lastInteraction: "never", // parse from content in real implementation
  };
}

function formatStatusMarkdown(_status: Status): string {
  // Format as markdown — see OpenClawWorkspaceManager.formatStatusMd()
  return "# STATUS\n...";
}

function parseSeedMarkdown(_content: string): Seed {
  // Parse seed fields — see OpenClawWorkspaceManager.parseSeedMd()
  throw new Error("Implement seed parsing for your platform");
}

function formatSeedMarkdown(_seed: Seed): string {
  // Format as markdown — see OpenClawWorkspaceManager.formatSeedMd()
  return "# SEED\n...";
}
