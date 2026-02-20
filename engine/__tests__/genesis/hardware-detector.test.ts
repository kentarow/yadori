import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { HardwareBody } from "../../src/types.js";

// --- Mock node:os ---

const mockPlatform = vi.fn<() => NodeJS.Platform>().mockReturnValue("linux");
const mockArch = vi.fn<() => string>().mockReturnValue("x64");
const mockTotalmem = vi.fn<() => number>().mockReturnValue(16 * 1024 ** 3); // 16 GB
const mockCpus = vi.fn().mockReturnValue([
  { model: "Intel(R) Core(TM) i7-9700K CPU @ 3.60GHz" },
]);

vi.mock("node:os", () => ({
  default: {
    platform: () => mockPlatform(),
    arch: () => mockArch(),
    totalmem: () => mockTotalmem(),
    cpus: () => mockCpus(),
  },
  platform: () => mockPlatform(),
  arch: () => mockArch(),
  totalmem: () => mockTotalmem(),
  cpus: () => mockCpus(),
}));

// --- Mock node:child_process ---

const mockExecSync = vi.fn<(...args: any[]) => Buffer>();

vi.mock("node:child_process", () => ({
  execSync: (...args: any[]) => mockExecSync(...args),
}));

// --- Import after mocks ---

// Dynamic import so mocks are in place before the module loads
async function loadDetector() {
  // Clear module cache to pick up fresh mocks
  vi.resetModules();

  // Re-apply mocks after resetModules
  vi.doMock("node:os", () => ({
    default: {
      platform: () => mockPlatform(),
      arch: () => mockArch(),
      totalmem: () => mockTotalmem(),
      cpus: () => mockCpus(),
    },
    platform: () => mockPlatform(),
    arch: () => mockArch(),
    totalmem: () => mockTotalmem(),
    cpus: () => mockCpus(),
  }));

  vi.doMock("node:child_process", () => ({
    execSync: (...args: any[]) => mockExecSync(...args),
  }));

  const mod = await import("../../src/genesis/hardware-detector.js");
  return mod;
}

// --- Helpers ---

/** Simulates df output for a Linux/macOS system with the given total KB */
function dfOutput(totalKB: number): Buffer {
  return Buffer.from(
    `/dev/sda1     ${totalKB}  50000000  200000000  20% /\n`,
  );
}

/** Simulates wmic output for Windows with the given byte count */
function wmicOutput(bytes: number): Buffer {
  return Buffer.from(`Size=${bytes}\r\n`);
}

// --- Tests ---

beforeEach(() => {
  // Reset to sensible defaults before each test
  mockPlatform.mockReturnValue("linux");
  mockArch.mockReturnValue("x64");
  mockTotalmem.mockReturnValue(16 * 1024 ** 3);
  mockCpus.mockReturnValue([
    { model: "Intel(R) Core(TM) i7-9700K CPU @ 3.60GHz" },
  ]);
  // Default df output: ~256 GB
  mockExecSync.mockReturnValue(dfOutput(256 * 1024 * 1024));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===================================================================
// 1. detectHardware() returns valid HardwareBody with all required fields
// ===================================================================

describe("detectHardware — basic return value", () => {
  it("returns an object with all HardwareBody fields", async () => {
    const { detectHardware } = await loadDetector();
    const hw = detectHardware();

    expect(hw).toBeDefined();
    expect(hw).toHaveProperty("platform");
    expect(hw).toHaveProperty("arch");
    expect(hw).toHaveProperty("totalMemoryGB");
    expect(hw).toHaveProperty("cpuModel");
    expect(hw).toHaveProperty("storageGB");
  });

  it("returns no extra fields beyond HardwareBody", async () => {
    const { detectHardware } = await loadDetector();
    const hw = detectHardware();
    const keys = Object.keys(hw).sort();

    expect(keys).toEqual(
      ["arch", "cpuModel", "platform", "storageGB", "totalMemoryGB"],
    );
  });
});

// ===================================================================
// 2. Platform detection
// ===================================================================

describe("detectHardware — platform detection", () => {
  it("returns 'darwin' when os.platform() is darwin", async () => {
    mockPlatform.mockReturnValue("darwin");
    const { detectHardware } = await loadDetector();

    expect(detectHardware().platform).toBe("darwin");
  });

  it("returns 'linux' when os.platform() is linux", async () => {
    mockPlatform.mockReturnValue("linux");
    const { detectHardware } = await loadDetector();

    expect(detectHardware().platform).toBe("linux");
  });

  it("returns 'win32' when os.platform() is win32", async () => {
    mockPlatform.mockReturnValue("win32");
    mockExecSync.mockReturnValue(wmicOutput(256 * 1024 ** 3));
    const { detectHardware } = await loadDetector();

    expect(detectHardware().platform).toBe("win32");
  });
});

// ===================================================================
// 3. CPU model detection
// ===================================================================

describe("detectHardware — CPU model", () => {
  it("returns the CPU model string from os.cpus()", async () => {
    mockCpus.mockReturnValue([
      { model: "Apple M4" },
    ]);
    const { detectHardware } = await loadDetector();

    expect(detectHardware().cpuModel).toBe("Apple M4");
  });

  it("returns a non-empty string for cpuModel", async () => {
    const { detectHardware } = await loadDetector();
    const hw = detectHardware();

    expect(typeof hw.cpuModel).toBe("string");
    expect(hw.cpuModel.length).toBeGreaterThan(0);
  });

  it("returns 'unknown' when os.cpus() returns empty array", async () => {
    mockCpus.mockReturnValue([]);
    const { detectHardware } = await loadDetector();

    expect(detectHardware().cpuModel).toBe("unknown");
  });
});

// ===================================================================
// 4. Total memory detection
// ===================================================================

describe("detectHardware — total memory", () => {
  it("returns a positive number in GB", async () => {
    mockTotalmem.mockReturnValue(8 * 1024 ** 3);
    const { detectHardware } = await loadDetector();
    const hw = detectHardware();

    expect(hw.totalMemoryGB).toBe(8);
    expect(hw.totalMemoryGB).toBeGreaterThan(0);
  });

  it("rounds memory to the nearest integer", async () => {
    // 15.7 GB in bytes
    mockTotalmem.mockReturnValue(15.7 * 1024 ** 3);
    const { detectHardware } = await loadDetector();

    expect(Number.isInteger(detectHardware().totalMemoryGB)).toBe(true);
    expect(detectHardware().totalMemoryGB).toBe(16);
  });

  it("handles small memory (e.g. Raspberry Pi 4 GB)", async () => {
    mockTotalmem.mockReturnValue(4 * 1024 ** 3);
    const { detectHardware } = await loadDetector();

    expect(detectHardware().totalMemoryGB).toBe(4);
  });
});

// ===================================================================
// 5. Storage detection
// ===================================================================

describe("detectHardware — storage detection", () => {
  it("parses df output correctly on Linux/macOS", async () => {
    // 512 GB in 1K-blocks = 512 * 1024 * 1024
    mockExecSync.mockReturnValue(dfOutput(512 * 1024 * 1024));
    const { detectHardware } = await loadDetector();

    expect(detectHardware().storageGB).toBe(512);
  });

  it("parses wmic output correctly on Windows", async () => {
    mockPlatform.mockReturnValue("win32");
    // 256 GB in bytes
    mockExecSync.mockReturnValue(wmicOutput(256 * 1024 ** 3));
    const { detectHardware } = await loadDetector();

    expect(detectHardware().storageGB).toBe(256);
  });

  it("returns 0 when storage detection throws", async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("Command failed");
    });
    const { detectHardware } = await loadDetector();

    expect(detectHardware().storageGB).toBe(0);
  });
});

// ===================================================================
// 6. Return type validation — all fields match HardwareBody types
// ===================================================================

describe("detectHardware — type validation", () => {
  it("platform is a string", async () => {
    const { detectHardware } = await loadDetector();
    expect(typeof detectHardware().platform).toBe("string");
  });

  it("arch is a string", async () => {
    const { detectHardware } = await loadDetector();
    expect(typeof detectHardware().arch).toBe("string");
  });

  it("totalMemoryGB is a number", async () => {
    const { detectHardware } = await loadDetector();
    expect(typeof detectHardware().totalMemoryGB).toBe("number");
  });

  it("cpuModel is a string", async () => {
    const { detectHardware } = await loadDetector();
    expect(typeof detectHardware().cpuModel).toBe("string");
  });

  it("storageGB is a number", async () => {
    const { detectHardware } = await loadDetector();
    expect(typeof detectHardware().storageGB).toBe("number");
  });
});

// ===================================================================
// 7. Error handling — graceful defaults when detection fails
// ===================================================================

describe("detectHardware — error handling", () => {
  it("does not throw when execSync fails for storage", async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("exec failed");
    });
    const { detectHardware } = await loadDetector();

    expect(() => detectHardware()).not.toThrow();
  });

  it("falls back to storageGB 0 when df output is unparseable", async () => {
    mockExecSync.mockReturnValue(Buffer.from("garbage output\n"));
    const { detectHardware } = await loadDetector();

    expect(detectHardware().storageGB).toBe(0);
  });

  it("falls back to 'unknown' cpuModel when cpus() returns undefined entries", async () => {
    mockCpus.mockReturnValue([undefined]);
    const { detectHardware } = await loadDetector();

    expect(detectHardware().cpuModel).toBe("unknown");
  });
});

// ===================================================================
// 8. Mac mini detection — darwin with Apple silicon CPU
// ===================================================================

describe("detectHardware — Mac mini identification", () => {
  it("detects darwin platform with Apple M4 CPU", async () => {
    mockPlatform.mockReturnValue("darwin");
    mockArch.mockReturnValue("arm64");
    mockCpus.mockReturnValue([{ model: "Apple M4" }]);
    mockTotalmem.mockReturnValue(16 * 1024 ** 3);
    mockExecSync.mockReturnValue(dfOutput(256 * 1024 * 1024));
    const { detectHardware } = await loadDetector();
    const hw = detectHardware();

    expect(hw.platform).toBe("darwin");
    expect(hw.arch).toBe("arm64");
    expect(hw.cpuModel).toBe("Apple M4");
    expect(hw.totalMemoryGB).toBe(16);
    expect(hw.storageGB).toBe(256);
  });
});

// ===================================================================
// 9. Raspberry Pi detection — linux with ARM CPU
// ===================================================================

describe("detectHardware — Raspberry Pi identification", () => {
  it("detects linux platform with ARM CPU", async () => {
    mockPlatform.mockReturnValue("linux");
    mockArch.mockReturnValue("arm64");
    mockCpus.mockReturnValue([{ model: "ARMv8 Processor rev 3 (v8l)" }]);
    mockTotalmem.mockReturnValue(4 * 1024 ** 3);
    mockExecSync.mockReturnValue(dfOutput(32 * 1024 * 1024));
    const { detectHardware } = await loadDetector();
    const hw = detectHardware();

    expect(hw.platform).toBe("linux");
    expect(hw.arch).toBe("arm64");
    expect(hw.cpuModel).toBe("ARMv8 Processor rev 3 (v8l)");
    expect(hw.totalMemoryGB).toBe(4);
    expect(hw.storageGB).toBe(32);
  });
});

// ===================================================================
// 10. Generic Linux — x86 CPU
// ===================================================================

describe("detectHardware — generic Linux", () => {
  it("returns generic Linux x64 hardware body", async () => {
    mockPlatform.mockReturnValue("linux");
    mockArch.mockReturnValue("x64");
    mockCpus.mockReturnValue([
      { model: "Intel(R) Xeon(R) CPU E5-2686 v4 @ 2.30GHz" },
    ]);
    mockTotalmem.mockReturnValue(64 * 1024 ** 3);
    mockExecSync.mockReturnValue(dfOutput(1000 * 1024 * 1024));
    const { detectHardware } = await loadDetector();
    const hw = detectHardware();

    expect(hw.platform).toBe("linux");
    expect(hw.arch).toBe("x64");
    expect(hw.cpuModel).toBe("Intel(R) Xeon(R) CPU E5-2686 v4 @ 2.30GHz");
    expect(hw.totalMemoryGB).toBe(64);
    expect(hw.storageGB).toBe(1000);
  });
});
