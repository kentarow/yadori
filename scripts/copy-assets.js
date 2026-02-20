/**
 * Post-build script: copies static assets to dist/ for npm package.
 * Dashboard HTML, SVG, and image files need to be alongside compiled JS.
 */

import { copyFile, readdir, mkdir, stat } from "node:fs/promises";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const VISUAL_SRC = join(ROOT, "visual");
const VISUAL_DEST = join(ROOT, "dist", "visual");

const COPY_EXTENSIONS = new Set([".html", ".svg", ".png", ".jpg", ".ico", ".css"]);

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      // Copy image directories
      if (entry.name === "images") {
        await copyDir(srcPath, destPath);
      }
    } else if (COPY_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      await copyFile(srcPath, destPath);
    }
  }
}

try {
  await copyDir(VISUAL_SRC, VISUAL_DEST);
  const destEntries = await readdir(VISUAL_DEST);
  const copied = destEntries.filter((f) => COPY_EXTENSIONS.has(extname(f).toLowerCase()));
  console.log(`Copied ${copied.length} static asset(s) to dist/visual/`);
} catch (err) {
  console.error("Warning: Failed to copy some assets:", err.message);
}
