/**
 * Exec Helper — Runs external commands for sensor drivers.
 *
 * Used to call Python helper scripts, system commands, etc.
 * All calls have timeouts to prevent hanging.
 */

import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HELPERS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "helpers");

/**
 * Run a command and return stdout. Rejects on timeout or non-zero exit.
 */
export function exec(
  cmd: string,
  args: string[],
  timeoutMs = 5000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} failed: ${err.message}${stderr ? ` — ${stderr.trim()}` : ""}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Run a command and return stdout as Buffer.
 */
export function execBuffer(
  cmd: string,
  args: string[],
  timeoutMs = 10000,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      cmd,
      args,
      { timeout: timeoutMs, encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          reject(new Error(`${cmd} failed: ${err.message}`));
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

/**
 * Run a Python helper script. Returns parsed JSON.
 */
export async function runPythonHelper<T>(scriptName: string, args: string[] = [], timeoutMs = 5000): Promise<T> {
  const scriptPath = resolve(HELPERS_DIR, scriptName);
  const stdout = await exec("python3", [scriptPath, ...args], timeoutMs);
  return JSON.parse(stdout) as T;
}

/**
 * Check if a command exists on the system.
 */
export async function commandExists(cmd: string): Promise<boolean> {
  try {
    await exec("which", [cmd], 2000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a file/device exists and is readable.
 */
export async function deviceExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Python3 is available with a specific module.
 */
export async function pythonModuleExists(moduleName: string): Promise<boolean> {
  try {
    await exec("python3", ["-c", `import ${moduleName}`], 3000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the helpers directory path.
 */
export function getHelpersDir(): string {
  return HELPERS_DIR;
}
