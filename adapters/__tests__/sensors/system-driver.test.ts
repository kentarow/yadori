import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

// Mock node:fs/promises (readFile for thermal zone, /proc/diskstats, etc.)
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

// Mock exec-helper (exec used for vcgencmd, ps)
vi.mock("../../src/sensors/exec-helper.js", () => ({
  exec: vi.fn(),
}));

// Mock node:os — provide controllable return values
const mockCpus = vi.fn();
const mockPlatform = vi.fn();
const mockTotalmem = vi.fn();
const mockFreemem = vi.fn();
const mockUptime = vi.fn();

vi.mock("node:os", () => ({
  cpus: (...args: unknown[]) => mockCpus(...args),
  platform: (...args: unknown[]) => mockPlatform(...args),
  totalmem: (...args: unknown[]) => mockTotalmem(...args),
  freemem: (...args: unknown[]) => mockFreemem(...args),
  uptime: (...args: unknown[]) => mockUptime(...args),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { readFile } from "node:fs/promises";
import { exec } from "../../src/sensors/exec-helper.js";
import { createSystemDriver } from "../../src/sensors/drivers/system.js";
import type { SystemMetricsData } from "../../../engine/src/perception/perception-types.js";

const mockedReadFile = vi.mocked(readFile);
const mockedExec = vi.mocked(exec);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake cpus() return value. Each "core" has times summing to `total`,
 *  with `idle` of that being idle time. */
function fakeCpus(cores: number, idle: number, total: number) {
  return Array.from({ length: cores }, () => ({
    model: "Test CPU",
    speed: 3000,
    times: { user: total - idle, nice: 0, sys: 0, idle, irq: 0 },
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SystemDriver", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Sensible defaults — tests can override
    mockPlatform.mockReturnValue("linux");
    mockTotalmem.mockReturnValue(16 * 1024 * 1024 * 1024); // 16 GB
    mockFreemem.mockReturnValue(8 * 1024 * 1024 * 1024);   // 8 GB free
    mockUptime.mockReturnValue(3600);                        // 1 hour
    mockCpus.mockReturnValue(fakeCpus(4, 75, 100));

    // Default: no thermal zone, no vcgencmd, ps returns 100 lines
    mockedReadFile.mockRejectedValue(new Error("not found"));
    mockedExec.mockImplementation(async (cmd: string) => {
      if (cmd === "ps") return Array(100).fill("  PID TTY").join("\n");
      throw new Error(`unknown command: ${cmd}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // config
  // -----------------------------------------------------------------------
  describe("config", () => {
    it("has the correct default configuration", () => {
      const driver = createSystemDriver();
      expect(driver.config.id).toBe("system-metrics");
      expect(driver.config.name).toBe("system");
      expect(driver.config.modality).toBe("system");
      expect(driver.config.pollIntervalMs).toBe(30000);
      expect(driver.config.enabled).toBe(true);
    });

    it("allows partial config overrides", () => {
      const driver = createSystemDriver({ pollIntervalMs: 5000, enabled: false });
      expect(driver.config.pollIntervalMs).toBe(5000);
      expect(driver.config.enabled).toBe(false);
      // Non-overridden fields remain at defaults
      expect(driver.config.id).toBe("system-metrics");
    });
  });

  // -----------------------------------------------------------------------
  // detect()
  // -----------------------------------------------------------------------
  describe("detect()", () => {
    it("always reports available", async () => {
      const driver = createSystemDriver();
      const result = await driver.detect();
      expect(result.available).toBe(true);
    });

    it("includes platform and arch in details", async () => {
      mockPlatform.mockReturnValue("darwin");
      const driver = createSystemDriver();
      const result = await driver.detect();
      expect(result.details).toContain("darwin");
    });
  });

  // -----------------------------------------------------------------------
  // read() — CPU usage
  // -----------------------------------------------------------------------
  describe("CPU usage reading", () => {
    it("returns cpuLoadPct between 0 and 100", async () => {
      const driver = createSystemDriver();
      // First call to start() sets baseline
      await driver.start();

      // Shift idle/total so there is measurable load
      mockCpus.mockReturnValue(fakeCpus(4, 50, 100));
      const result = await driver.read();
      const data = result!.data as SystemMetricsData;

      expect(data.cpuLoadPct).toBeGreaterThanOrEqual(0);
      expect(data.cpuLoadPct).toBeLessThanOrEqual(100);
    });

    it("returns 0 when CPU totals have not changed", async () => {
      // Same values for both start() and read() means totalDiff = 0
      mockCpus.mockReturnValue(fakeCpus(4, 100, 100));
      const driver = createSystemDriver();
      await driver.start();

      // Don't change the mock — totals stay the same
      const result = await driver.read();
      const data = result!.data as SystemMetricsData;
      expect(data.cpuLoadPct).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // read() — Memory usage
  // -----------------------------------------------------------------------
  describe("Memory usage reading", () => {
    it("returns memoryUsedPct as a valid percentage", async () => {
      const driver = createSystemDriver();
      await driver.start();
      const result = await driver.read();
      const data = result!.data as SystemMetricsData;

      expect(data.memoryUsedPct).toBeGreaterThanOrEqual(0);
      expect(data.memoryUsedPct).toBeLessThanOrEqual(100);
    });

    it("calculates correct memory percentage", async () => {
      mockTotalmem.mockReturnValue(1000);
      mockFreemem.mockReturnValue(250);

      const driver = createSystemDriver();
      await driver.start();
      const result = await driver.read();
      const data = result!.data as SystemMetricsData;
      // (1000 - 250) / 1000 * 100 = 75
      expect(data.memoryUsedPct).toBe(75);
    });
  });

  // -----------------------------------------------------------------------
  // read() — CPU temperature
  // -----------------------------------------------------------------------
  describe("CPU temperature", () => {
    it("reads temperature from thermal_zone0 on Linux", async () => {
      mockedReadFile.mockImplementation(async (path: any) => {
        if (String(path) === "/sys/class/thermal/thermal_zone0/temp") return "52000";
        throw new Error("not found");
      });

      const driver = createSystemDriver();
      await driver.start();
      const result = await driver.read();
      const data = result!.data as SystemMetricsData;
      expect(data.cpuTempC).toBe(52);
    });

    it("falls back to vcgencmd when thermal_zone not available", async () => {
      mockedReadFile.mockRejectedValue(new Error("not found"));
      mockedExec.mockImplementation(async (cmd: string) => {
        if (cmd === "vcgencmd") return "temp=48.3'C";
        if (cmd === "ps") return Array(50).fill("line").join("\n");
        throw new Error("unknown");
      });

      const driver = createSystemDriver();
      await driver.start();
      const result = await driver.read();
      const data = result!.data as SystemMetricsData;
      expect(data.cpuTempC).toBe(48.3);
    });

    it("returns default 40 when no temperature source is available", async () => {
      // readFile rejects, exec rejects for vcgencmd
      mockedReadFile.mockRejectedValue(new Error("not found"));
      mockedExec.mockImplementation(async (cmd: string) => {
        if (cmd === "ps") return Array(10).fill("line").join("\n");
        throw new Error("not available");
      });

      const driver = createSystemDriver();
      await driver.start();
      const result = await driver.read();
      const data = result!.data as SystemMetricsData;
      expect(data.cpuTempC).toBe(40);
    });
  });

  // -----------------------------------------------------------------------
  // read() — Platform handling
  // -----------------------------------------------------------------------
  describe("Platform detection", () => {
    it("handles darwin platform", async () => {
      mockPlatform.mockReturnValue("darwin");
      const driver = createSystemDriver();
      await driver.start();
      const result = await driver.read();
      expect(result).not.toBeNull();
      const data = result!.data as SystemMetricsData;
      // On darwin, disk/network I/O should be 0 (only Linux reads /proc)
      expect(data.diskIOReadKBs).toBe(0);
      expect(data.diskIOWriteKBs).toBe(0);
      expect(data.networkKBs).toBe(0);
    });

    it("handles linux platform and reads /proc stats", async () => {
      mockPlatform.mockReturnValue("linux");

      const diskstatsContent = "   8       0 sda 100 0 2000 0 50 0 1000 0 0 0 0 0 0 0 0";
      const netdevContent = [
        "Inter-|   Receive                                                |  Transmit",
        " face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed",
        "    lo: 1000 10 0 0 0 0 0 0 1000 10 0 0 0 0 0 0",
        "  eth0: 50000 100 0 0 0 0 0 0 30000 80 0 0 0 0 0 0",
      ].join("\n");

      mockedReadFile.mockImplementation(async (path: any) => {
        const p = String(path);
        if (p === "/proc/diskstats") return diskstatsContent;
        if (p === "/proc/net/dev") return netdevContent;
        throw new Error("not found");
      });

      const driver = createSystemDriver();
      await driver.start();

      // Change values for the second read to get nonzero rates
      const diskstatsContent2 = "   8       0 sda 100 0 4000 0 50 0 3000 0 0 0 0 0 0 0 0";
      const netdevContent2 = [
        "Inter-|   Receive",
        " face |bytes",
        "    lo: 2000 20 0 0 0 0 0 0 2000 20 0 0 0 0 0 0",
        "  eth0: 60000 200 0 0 0 0 0 0 40000 180 0 0 0 0 0 0",
      ].join("\n");

      mockedReadFile.mockImplementation(async (path: any) => {
        const p = String(path);
        if (p === "/proc/diskstats") return diskstatsContent2;
        if (p === "/proc/net/dev") return netdevContent2;
        throw new Error("not found");
      });

      const result = await driver.read();
      const data = result!.data as SystemMetricsData;
      // We can't assert exact values because elapsed time is tiny, but they should be >= 0
      expect(data.diskIOReadKBs).toBeGreaterThanOrEqual(0);
      expect(data.diskIOWriteKBs).toBeGreaterThanOrEqual(0);
      expect(data.networkKBs).toBeGreaterThanOrEqual(0);
    });

    it("handles win32 platform gracefully", async () => {
      mockPlatform.mockReturnValue("win32");
      const driver = createSystemDriver();
      await driver.start();
      const result = await driver.read();
      expect(result).not.toBeNull();
      const data = result!.data as SystemMetricsData;
      // No /proc on Windows
      expect(data.diskIOReadKBs).toBe(0);
      expect(data.diskIOWriteKBs).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // read() — Error handling
  // -----------------------------------------------------------------------
  describe("Error handling", () => {
    it("returns 0 process count when ps command fails", async () => {
      mockedExec.mockRejectedValue(new Error("ps not found"));

      const driver = createSystemDriver();
      await driver.start();
      const result = await driver.read();
      const data = result!.data as SystemMetricsData;
      expect(data.processCount).toBe(0);
    });

    it("start() does not throw when /proc reads fail on linux", async () => {
      mockPlatform.mockReturnValue("linux");
      mockedReadFile.mockRejectedValue(new Error("permission denied"));

      const driver = createSystemDriver();
      // Should not throw
      await expect(driver.start()).resolves.toBeUndefined();
    });

    it("read() produces valid output even when all optional data sources fail", async () => {
      mockedReadFile.mockRejectedValue(new Error("not found"));
      mockedExec.mockRejectedValue(new Error("not available"));

      const driver = createSystemDriver();
      await driver.start();
      const result = await driver.read();

      expect(result).not.toBeNull();
      const data = result!.data as SystemMetricsData;
      // Fallback defaults
      expect(data.cpuTempC).toBe(40);
      expect(data.processCount).toBe(0);
      // Core values still come from os module mocks
      expect(typeof data.cpuLoadPct).toBe("number");
      expect(typeof data.memoryUsedPct).toBe("number");
    });
  });

  // -----------------------------------------------------------------------
  // readAll() / data structure
  // -----------------------------------------------------------------------
  describe("readAll() returns all expected keys", () => {
    it("returns a RawInput with modality 'system'", async () => {
      const driver = createSystemDriver();
      await driver.start();
      const result = await driver.read();

      expect(result).not.toBeNull();
      expect(result!.modality).toBe("system");
      expect(result!.source).toBe("system");
      expect(result!.timestamp).toBeTruthy();
    });

    it("data object contains all SystemMetricsData keys", async () => {
      const driver = createSystemDriver();
      await driver.start();
      const result = await driver.read();
      const data = result!.data as SystemMetricsData;

      expect(data).toHaveProperty("type", "system");
      expect(data).toHaveProperty("cpuTempC");
      expect(data).toHaveProperty("memoryUsedPct");
      expect(data).toHaveProperty("cpuLoadPct");
      expect(data).toHaveProperty("uptimeHours");
      expect(data).toHaveProperty("processCount");
      expect(data).toHaveProperty("diskIOReadKBs");
      expect(data).toHaveProperty("diskIOWriteKBs");
      expect(data).toHaveProperty("networkKBs");
    });

    it("all numeric fields are finite numbers", async () => {
      const driver = createSystemDriver();
      await driver.start();
      const result = await driver.read();
      const data = result!.data as SystemMetricsData;

      const numericKeys: (keyof SystemMetricsData)[] = [
        "cpuTempC", "memoryUsedPct", "cpuLoadPct", "uptimeHours",
        "processCount", "diskIOReadKBs", "diskIOWriteKBs", "networkKBs",
      ];
      for (const key of numericKeys) {
        expect(Number.isFinite(data[key])).toBe(true);
      }
    });

    it("disk and network values are never negative", async () => {
      const driver = createSystemDriver();
      await driver.start();
      const result = await driver.read();
      const data = result!.data as SystemMetricsData;

      expect(data.diskIOReadKBs).toBeGreaterThanOrEqual(0);
      expect(data.diskIOWriteKBs).toBeGreaterThanOrEqual(0);
      expect(data.networkKBs).toBeGreaterThanOrEqual(0);
    });
  });

  // -----------------------------------------------------------------------
  // stop()
  // -----------------------------------------------------------------------
  describe("stop()", () => {
    it("resolves without error", async () => {
      const driver = createSystemDriver();
      await driver.start();
      await expect(driver.stop()).resolves.toBeUndefined();
    });
  });
});
