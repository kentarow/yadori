import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OpenClawWorkspaceManager } from "../../src/openclaw/workspace-manager.js";
import type { Status, Seed } from "../../../engine/src/types.js";

const TEST_SEED: Seed = {
  perception: "chromatic",
  expression: "symbolic",
  cognition: "associative",
  temperament: "curious-cautious",
  form: "light-particles",
  hardwareBody: {
    platform: "darwin",
    arch: "arm64",
    totalMemoryGB: 16,
    cpuModel: "Apple M4",
    storageGB: 256,
  },
  subTraits: {
    sensitivity: 65,
    sociability: 55,
    rhythmAffinity: 40,
    memoryDepth: 60,
    expressiveness: 70,
  },
  createdAt: "2026-02-18T00:00:00.000Z",
  hash: "abc123def456",
};

const TEST_STATUS: Status = {
  mood: 72,
  energy: 45,
  curiosity: 88,
  comfort: 60,
  languageLevel: 1,
  perceptionLevel: 0,
  growthDay: 7,
  lastInteraction: "2026-02-18T12:00:00.000Z",
};

describe("OpenClawWorkspaceManager", () => {
  let tempDir: string;
  let manager: OpenClawWorkspaceManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "yadori-test-"));
    manager = new OpenClawWorkspaceManager({ workspaceRoot: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("writeStatus / readStatus", () => {
    it("round-trips status values correctly", async () => {
      await manager.writeStatus(TEST_STATUS);
      const read = await manager.readStatus();

      expect(read.mood).toBe(72);
      expect(read.energy).toBe(45);
      expect(read.curiosity).toBe(88);
      expect(read.comfort).toBe(60);
      expect(read.languageLevel).toBe(1);
      expect(read.growthDay).toBe(7);
      expect(read.lastInteraction).toBe("2026-02-18T12:00:00.000Z");
    });

    it("writes valid markdown format", async () => {
      await manager.writeStatus(TEST_STATUS);
      const content = await readFile(join(tempDir, "STATUS.md"), "utf-8");

      expect(content).toContain("# STATUS");
      expect(content).toContain("**mood**: 72");
      expect(content).toContain("**energy**: 45");
    });

    it("throws when STATUS.md does not exist", async () => {
      await expect(manager.readStatus()).rejects.toThrow();
    });
  });

  describe("writeSeed / readSeed", () => {
    it("round-trips seed values correctly", async () => {
      await manager.writeSeed(TEST_SEED);
      const read = await manager.readSeed();

      expect(read.perception).toBe("chromatic");
      expect(read.cognition).toBe("associative");
      expect(read.temperament).toBe("curious-cautious");
      expect(read.form).toBe("light-particles");
      expect(read.hardwareBody.platform).toBe("darwin");
      expect(read.hardwareBody.arch).toBe("arm64");
      expect(read.hardwareBody.totalMemoryGB).toBe(16);
      expect(read.hash).toBe("abc123def456");
    });

    it("refuses to overwrite existing seed (One Body, One Soul)", async () => {
      await manager.writeSeed(TEST_SEED);
      await expect(manager.writeSeed(TEST_SEED)).rejects.toThrow(/One Body, One Soul/);
    });

    it("throws when SEED.md does not exist", async () => {
      await expect(manager.readSeed()).rejects.toThrow();
    });
  });

  describe("writeMemory / readMemory", () => {
    it("writes and reads MEMORY.md", async () => {
      const memoryMd = "# MEMORY\n\n## Hot Memory (Recent)\n\nNo recent memories.\n";
      await manager.writeMemory(memoryMd);
      const read = await manager.readMemory();
      expect(read).toContain("# MEMORY");
    });
  });

  describe("writeMilestones", () => {
    it("writes to growth/milestones.md", async () => {
      await mkdir(join(tempDir, "growth"), { recursive: true });
      const md = "# Growth Milestones\n\n- **Day 0**: First Breath\n";
      await manager.writeMilestones(md);
      const read = await readFile(join(tempDir, "growth", "milestones.md"), "utf-8");
      expect(read).toContain("First Breath");
    });
  });

  describe("writeSoulEvil", () => {
    it("writes SOUL_EVIL.md", async () => {
      const md = "# SOUL (Sulking Mode)\n\nYou are upset.\n";
      await manager.writeSoulEvil(md);
      const read = await readFile(join(tempDir, "SOUL_EVIL.md"), "utf-8");
      expect(read).toContain("Sulking Mode");
    });
  });

  describe("writeDiary", () => {
    it("writes diary entry to diary/YYYY-MM-DD.md", async () => {
      await mkdir(join(tempDir, "diary"), { recursive: true });
      await manager.writeDiary("2026-02-18", "# 2026-02-18\n\n◎◎◎");
      const read = await readFile(join(tempDir, "diary", "2026-02-18.md"), "utf-8");
      expect(read).toContain("◎◎◎");
    });
  });

  describe("deployWorkspace", () => {
    let templateDir: string;

    beforeEach(async () => {
      // Create a minimal template directory
      templateDir = await mkdtemp(join(tmpdir(), "yadori-tpl-"));
      await writeFile(join(templateDir, "SOUL.md"), "# SOUL\nTest soul");
      await writeFile(join(templateDir, "STATUS.md"), "# STATUS\n- **mood**: 50");
    });

    afterEach(async () => {
      await rm(templateDir, { recursive: true, force: true });
    });

    it("creates workspace directories", async () => {
      const wsDir = join(tempDir, "fresh");
      const mgr = new OpenClawWorkspaceManager({ workspaceRoot: wsDir });
      await mgr.deployWorkspace(templateDir);

      const { access } = await import("node:fs/promises");
      await expect(access(join(wsDir, "memory"))).resolves.toBeUndefined();
      await expect(access(join(wsDir, "diary"))).resolves.toBeUndefined();
      await expect(access(join(wsDir, "growth"))).resolves.toBeUndefined();
      await expect(access(join(wsDir, "growth", "portraits"))).resolves.toBeUndefined();
    });

    it("copies template files to workspace", async () => {
      const wsDir = join(tempDir, "fresh2");
      const mgr = new OpenClawWorkspaceManager({ workspaceRoot: wsDir });
      await mgr.deployWorkspace(templateDir);

      const soul = await readFile(join(wsDir, "SOUL.md"), "utf-8");
      expect(soul).toContain("# SOUL");
    });

    it("refuses to deploy over existing entity (One Body, One Soul)", async () => {
      const wsDir = join(tempDir, "fresh3");
      const mgr = new OpenClawWorkspaceManager({ workspaceRoot: wsDir });
      await mkdir(wsDir, { recursive: true });
      await writeFile(join(wsDir, "SEED.md"), "# existing entity");

      await expect(mgr.deployWorkspace(templateDir)).rejects.toThrow(/One Body, One Soul/);
    });
  });
});
