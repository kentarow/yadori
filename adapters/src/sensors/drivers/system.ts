/**
 * System Metrics Driver — Always available.
 *
 * Reads CPU temperature, memory usage, load, disk I/O, network stats.
 * Uses /proc filesystem (Linux) or sysctl (macOS).
 */

import { readFile } from "node:fs/promises";
import { platform, totalmem, freemem, cpus, uptime } from "node:os";
import type { SensorDriver, SensorDriverConfig, SensorDetectionResult } from "../../../../engine/src/perception/sensor-driver.js";
import type { RawInput, SystemMetricsData } from "../../../../engine/src/perception/perception-types.js";
import { exec } from "../exec-helper.js";

const DEFAULT_CONFIG: SensorDriverConfig = {
  id: "system-metrics",
  name: "system",
  modality: "system",
  pollIntervalMs: 30000, // Every 30 seconds
  enabled: true,
};

let prevCpuIdle = 0;
let prevCpuTotal = 0;
let prevDiskRead = 0;
let prevDiskWrite = 0;
let prevNetRx = 0;
let prevNetTx = 0;
let prevTimestamp = Date.now();

export function createSystemDriver(config?: Partial<SensorDriverConfig>): SensorDriver {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return {
    config: cfg,

    async detect(): Promise<SensorDetectionResult> {
      // System metrics are always available
      return { available: true, details: `${platform()} ${process.arch}` };
    },

    async start(): Promise<void> {
      // Initialize baseline values
      const cpuInfo = cpus();
      let idle = 0;
      let total = 0;
      for (const cpu of cpuInfo) {
        idle += cpu.times.idle;
        total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
      }
      prevCpuIdle = idle;
      prevCpuTotal = total;
      prevTimestamp = Date.now();

      if (platform() === "linux") {
        try {
          const diskStats = await readFile("/proc/diskstats", "utf-8");
          const parsed = parseDiskStats(diskStats);
          prevDiskRead = parsed.readKBs;
          prevDiskWrite = parsed.writeKBs;
        } catch { /* ok */ }

        try {
          const netStats = await readFile("/proc/net/dev", "utf-8");
          const parsed = parseNetStats(netStats);
          prevNetRx = parsed.rxBytes;
          prevNetTx = parsed.txBytes;
        } catch { /* ok */ }
      }
    },

    async read(): Promise<RawInput | null> {
      const now = Date.now();
      const elapsed = (now - prevTimestamp) / 1000; // seconds
      prevTimestamp = now;

      // CPU load
      const cpuInfo = cpus();
      let idle = 0;
      let total = 0;
      for (const cpu of cpuInfo) {
        idle += cpu.times.idle;
        total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
      }
      const idleDiff = idle - prevCpuIdle;
      const totalDiff = total - prevCpuTotal;
      const cpuLoadPct = totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0;
      prevCpuIdle = idle;
      prevCpuTotal = total;

      // Memory
      const totalMem = totalmem();
      const freeMem = freemem();
      const memoryUsedPct = Math.round(((totalMem - freeMem) / totalMem) * 100);

      // CPU temperature
      const cpuTempC = await getCpuTemp();

      // Uptime
      const uptimeHours = uptime() / 3600;

      // Process count
      const processCount = await getProcessCount();

      // Disk I/O and network (Linux only)
      let diskIOReadKBs = 0;
      let diskIOWriteKBs = 0;
      let networkKBs = 0;

      if (platform() === "linux" && elapsed > 0) {
        try {
          const diskStats = await readFile("/proc/diskstats", "utf-8");
          const parsed = parseDiskStats(diskStats);
          diskIOReadKBs = Math.round((parsed.readKBs - prevDiskRead) / elapsed);
          diskIOWriteKBs = Math.round((parsed.writeKBs - prevDiskWrite) / elapsed);
          prevDiskRead = parsed.readKBs;
          prevDiskWrite = parsed.writeKBs;
        } catch { /* ok */ }

        try {
          const netStats = await readFile("/proc/net/dev", "utf-8");
          const parsed = parseNetStats(netStats);
          networkKBs = Math.round(((parsed.rxBytes - prevNetRx) + (parsed.txBytes - prevNetTx)) / 1024 / elapsed);
          prevNetRx = parsed.rxBytes;
          prevNetTx = parsed.txBytes;
        } catch { /* ok */ }
      }

      const data: SystemMetricsData = {
        type: "system",
        cpuTempC,
        memoryUsedPct,
        cpuLoadPct,
        uptimeHours,
        processCount,
        diskIOReadKBs: Math.max(0, diskIOReadKBs),
        diskIOWriteKBs: Math.max(0, diskIOWriteKBs),
        networkKBs: Math.max(0, networkKBs),
      };

      return {
        modality: "system",
        timestamp: new Date().toISOString(),
        source: "system",
        data,
      };
    },

    async stop(): Promise<void> {
      // Nothing to release
    },
  };
}

async function getCpuTemp(): Promise<number> {
  // Raspberry Pi
  try {
    const temp = await readFile("/sys/class/thermal/thermal_zone0/temp", "utf-8");
    return parseInt(temp.trim(), 10) / 1000;
  } catch { /* not RPi or no thermal zone */ }

  // RPi vcgencmd
  try {
    const out = await exec("vcgencmd", ["measure_temp"], 2000);
    const match = out.match(/temp=([\d.]+)/);
    if (match) return parseFloat(match[1]);
  } catch { /* ok */ }

  return 40; // Default assumption
}

async function getProcessCount(): Promise<number> {
  try {
    const out = await exec("ps", ["-e", "--no-headers"], 3000);
    return out.split("\n").length;
  } catch {
    return 0;
  }
}

function parseDiskStats(content: string): { readKBs: number; writeKBs: number } {
  let readSectors = 0;
  let writeSectors = 0;
  for (const line of content.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 14) {
      // Only count real disks (sda, mmcblk0, nvme0n1), not partitions
      const name = parts[2];
      if (/^(sd[a-z]|mmcblk\d|nvme\d+n\d+)$/.test(name)) {
        readSectors += parseInt(parts[5], 10) || 0;
        writeSectors += parseInt(parts[9], 10) || 0;
      }
    }
  }
  // Sectors are typically 512 bytes
  return { readKBs: readSectors / 2, writeKBs: writeSectors / 2 };
}

function parseNetStats(content: string): { rxBytes: number; txBytes: number } {
  let rx = 0;
  let tx = 0;
  for (const line of content.split("\n")) {
    if (line.includes(":") && !line.includes("lo:")) {
      const parts = line.split(":")[1]?.trim().split(/\s+/);
      if (parts && parts.length >= 10) {
        rx += parseInt(parts[0], 10) || 0;
        tx += parseInt(parts[8], 10) || 0;
      }
    }
  }
  return { rxBytes: rx, txBytes: tx };
}
