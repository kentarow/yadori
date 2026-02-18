import os from "node:os";
import type { HardwareBody } from "../types.js";

export function detectHardware(): HardwareBody {
  return {
    platform: os.platform(),
    arch: os.arch(),
    totalMemoryGB: Math.round(os.totalmem() / 1024 ** 3),
    cpuModel: os.cpus()[0]?.model ?? "unknown",
    storageGB: 0, // TODO: Phase 2 - fs-based detection
  };
}
