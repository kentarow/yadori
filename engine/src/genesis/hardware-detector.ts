import os from "node:os";
import { execSync } from "node:child_process";
import type { HardwareBody } from "../types.js";

function detectStorageGB(): number {
  try {
    const platform = os.platform();
    if (platform === "darwin" || platform === "linux") {
      // df outputs available + used for root partition in 1K blocks
      const output = execSync("df -k / | tail -1", { timeout: 5000 }).toString();
      const parts = output.trim().split(/\s+/);
      // df columns: Filesystem 1K-blocks Used Available Use% Mounted
      const totalKB = parseInt(parts[1], 10);
      if (!isNaN(totalKB)) return Math.round(totalKB / 1024 / 1024);
    }
    if (platform === "win32") {
      const output = execSync("wmic logicaldisk where \"DeviceID='C:'\" get Size /value", { timeout: 5000 }).toString();
      const match = output.match(/Size=(\d+)/);
      if (match) return Math.round(parseInt(match[1], 10) / 1024 ** 3);
    }
  } catch {
    // Detection failed — return 0 as non-critical fallback
  }
  return 0;
}

export function detectHardware(): HardwareBody {
  return {
    platform: os.platform(),
    arch: os.arch(),
    totalMemoryGB: Math.round(os.totalmem() / 1024 ** 3),
    cpuModel: os.cpus()[0]?.model ?? "unknown",
    storageGB: detectStorageGB(),
  };
}
