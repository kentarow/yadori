/**
 * YADORI Dashboard Logger
 *
 * File-based logger that writes to workspace/logs/.
 * Provides structured log entries with timestamps and levels.
 * Auto-rotates when the log file exceeds MAX_SIZE_BYTES.
 *
 * Uses synchronous file writes to guarantee ordering and avoid
 * race conditions with fire-and-forget calls.
 */

import { readFile, mkdir } from "node:fs/promises";
import { appendFileSync, statSync, renameSync } from "node:fs";
import { join } from "node:path";

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

const MAX_SIZE_BYTES = 1024 * 1024; // 1MB
const MAX_RECENT = 200; // max entries returned by getRecent

let logFilePath = "";
let initialized = false;

export async function initLogger(workspaceRoot: string): Promise<void> {
  const logsDir = join(workspaceRoot, "logs");
  logFilePath = join(logsDir, "dashboard.log");
  await mkdir(logsDir, { recursive: true });
  initialized = true;
}

function formatEntry(level: LogLevel, message: string): string {
  const ts = new Date().toISOString();
  return `${ts}\t${level}\t${message}\n`;
}

function rotateIfNeeded(): void {
  try {
    const s = statSync(logFilePath);
    if (s.size > MAX_SIZE_BYTES) {
      renameSync(logFilePath, logFilePath + ".old");
    }
  } catch {
    // file doesn't exist yet — nothing to rotate
  }
}

function writeLog(level: LogLevel, message: string): void {
  if (!initialized) return;
  try {
    rotateIfNeeded();
    appendFileSync(logFilePath, formatEntry(level, message), "utf-8");
  } catch {
    // Logging should never crash the server
  }
}

export function info(message: string): void {
  writeLog("INFO", message);
}

export function warn(message: string): void {
  writeLog("WARN", message);
}

export function error(message: string): void {
  writeLog("ERROR", message);
}

/**
 * Read recent log entries (newest first).
 * Returns at most `limit` entries (default 50).
 */
export async function getRecent(limit = 50): Promise<LogEntry[]> {
  if (!initialized) return [];
  try {
    const raw = await readFile(logFilePath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const entries: LogEntry[] = [];
    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length >= 3) {
        entries.push({
          timestamp: parts[0],
          level: parts[1] as LogLevel,
          message: parts.slice(2).join("\t"),
        });
      }
    }
    return entries.slice(-Math.min(limit, MAX_RECENT)).reverse();
  } catch {
    return [];
  }
}
