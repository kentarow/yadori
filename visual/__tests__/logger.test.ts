/**
 * Logger Tests
 *
 * Verifies the file-based logger for the dashboard.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initLogger, info, warn, error, getRecent } from "../logger.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "yadori-logger-test-"));
  await initLogger(tmpDir);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("logger", () => {
  it("creates logs directory on init", async () => {
    const s = await stat(join(tmpDir, "logs"));
    expect(s.isDirectory()).toBe(true);
  });

  it("writes and reads log entries", async () => {
    info("server started");
    warn("something unusual");
    error("something failed");

    const entries = await getRecent(10);
    expect(entries.length).toBe(3);
    // Newest first
    expect(entries[0].level).toBe("ERROR");
    expect(entries[0].message).toBe("something failed");
    expect(entries[1].level).toBe("WARN");
    expect(entries[2].level).toBe("INFO");
  });

  it("respects limit parameter", async () => {
    info("a");
    info("b");
    info("c");

    const entries = await getRecent(2);
    expect(entries.length).toBe(2);
    // Should be the 2 newest
    expect(entries[0].message).toBe("c");
    expect(entries[1].message).toBe("b");
  });

  it("returns empty array when no log file exists yet", async () => {
    const freshDir = await mkdtemp(join(tmpdir(), "yadori-logger-fresh-"));
    await initLogger(freshDir);
    const entries = await getRecent();
    expect(entries).toEqual([]);
    await rm(freshDir, { recursive: true, force: true });
  });

  it("includes ISO timestamp in entries", async () => {
    info("timestamped");

    const entries = await getRecent(1);
    expect(entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("handles tab characters in messages", async () => {
    info("message\twith\ttabs");

    const entries = await getRecent(1);
    expect(entries[0].message).toBe("message\twith\ttabs");
  });
});
