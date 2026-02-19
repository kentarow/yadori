import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { parseStatusMd, parseSeedMd, parsePerceptionMd, computeCoexistenceMetrics } from "./parsers.js";

const PORT = parseInt(process.env.YADORI_PORT ?? "3000", 10);
const WORKSPACE_ROOT = process.env.YADORI_WORKSPACE ?? join(homedir(), ".openclaw", "workspace");
const VISUAL_DIR = resolve(import.meta.dirname!, ".");

async function readJsonState(): Promise<Record<string, unknown> | null> {
  for (const filename of ["state.json", "__state.json"]) {
    try {
      const content = await readFile(join(WORKSPACE_ROOT, filename), "utf-8");
      return JSON.parse(content);
    } catch {
      continue;
    }
  }
  return null;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/api/status") {
    try {
      const md = await readFile(join(WORKSPACE_ROOT, "STATUS.md"), "utf-8");
      const status = parseStatusMd(md);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status));
    } catch {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Entity not found. Run 'npm run setup' first." }));
    }
    return;
  }

  if (req.url === "/api/entity") {
    try {
      const state = await readJsonState();
      if (state) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(state));
      } else {
        // Fallback: build from individual files
        const statusMd = await readFile(join(WORKSPACE_ROOT, "STATUS.md"), "utf-8");
        const seedMd = await readFile(join(WORKSPACE_ROOT, "SEED.md"), "utf-8");
        const status = parseStatusMd(statusMd);
        const seed = parseSeedMd(seedMd);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status, seed }));
      }
    } catch {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Entity not found. Run 'npm run setup' first." }));
    }
    return;
  }

  if (req.url === "/api/coexistence") {
    try {
      const state = await readJsonState();
      const seedMd = await readFile(join(WORKSPACE_ROOT, "SEED.md"), "utf-8");
      const born = seedMd.match(/\*\*Born\*\*:\s*(.+)/)?.[1]?.trim() ?? "";

      let totalInteractions = 0;
      let lastInteraction = "never";
      let daysTogether = 0;

      if (state) {
        const s = state as Record<string, Record<string, unknown>>;
        totalInteractions = s.language?.totalInteractions as number ?? 0;
        lastInteraction = s.status?.lastInteraction as string ?? "never";
      } else {
        const statusMd = await readFile(join(WORKSPACE_ROOT, "STATUS.md"), "utf-8");
        lastInteraction = statusMd.match(/\*\*last_interaction\*\*:\s*(.+)/)?.[1]?.trim() ?? "never";
      }

      const metrics = computeCoexistenceMetrics({
        bornDate: born,
        lastInteraction,
        totalInteractions,
      });
      daysTogether = metrics.daysTogether;
      let silenceHours = metrics.silenceHours;

      let activeDays = 0;
      try {
        const files = await readdir(join(WORKSPACE_ROOT, "memory"));
        activeDays = files.filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).length;
      } catch { /* no memory dir yet */ }

      let diaryEntries = 0;
      try {
        const files = await readdir(join(WORKSPACE_ROOT, "diary"));
        diaryEntries = files.filter(f => f.endsWith(".md")).length;
      } catch { /* no diary dir yet */ }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        daysTogether,
        totalInteractions,
        lastInteraction,
        silenceHours,
        activeDays,
        diaryEntries,
      }));
    } catch {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Entity not found." }));
    }
    return;
  }

  if (req.url === "/api/perception") {
    try {
      const md = await readFile(join(WORKSPACE_ROOT, "PERCEPTION.md"), "utf-8");
      const { perceptions: lines, hasPerception } = parsePerceptionMd(md);

      // Read sensors.json for sensor list
      let sensors: string[] = [];
      try {
        const sensorsJson = await readFile(join(WORKSPACE_ROOT, "sensors.json"), "utf-8");
        const config = JSON.parse(sensorsJson);
        // sensors.json has a disable list — active sensors are those NOT disabled
        sensors = []; // We don't know active sensors from config alone
      } catch { /* no config */ }

      // Get perception level from status
      let perceptionLevel = 0;
      try {
        const statusMd = await readFile(join(WORKSPACE_ROOT, "STATUS.md"), "utf-8");
        perceptionLevel = parseStatusMd(statusMd).perceptionLevel;
      } catch { /* ok */ }

      // Get species from seed
      let species = "";
      try {
        const seedMd = await readFile(join(WORKSPACE_ROOT, "SEED.md"), "utf-8");
        species = parseSeedMd(seedMd).perception;
      } catch { /* ok */ }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        raw: md,
        perceptions: lines,
        hasPerception,
        perceptionLevel,
        species,
      }));
    } catch {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        raw: "",
        perceptions: [],
        hasPerception: false,
        perceptionLevel: 0,
        species: "",
      }));
    }
    return;
  }

  // Serve static files from visual/
  const filePath = req.url === "/" ? "/index.html" : req.url!;
  const ext = filePath.substring(filePath.lastIndexOf("."));
  const fullPath = resolve(join(VISUAL_DIR, filePath));

  // Prevent path traversal — resolved path must stay within VISUAL_DIR
  const safeRoot = resolve(VISUAL_DIR);
  if (!fullPath.startsWith(safeRoot + "/") && fullPath !== safeRoot) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(fullPath);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\nYADORI Dashboard — http://localhost:${PORT}`);
  console.log(`Reading entity state from: ${WORKSPACE_ROOT}\n`);
});
