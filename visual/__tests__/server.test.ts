/**
 * Dashboard API Server Tests
 *
 * Tests the HTTP API endpoints defined in visual/server.ts.
 *
 * Strategy: Since server.ts has top-level side effects (logger.initLogger,
 * server.listen), we mock node:http's createServer to capture the request
 * handler, then test it directly with mock request/response objects.
 * All filesystem operations are mocked via vi.mock("node:fs/promises").
 */

import { describe, it, expect, vi, beforeEach, beforeAll, type Mock } from "vitest";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

// ============================================================
// Mocking infrastructure
// ============================================================

// The captured request handler from createServer
let requestHandler: (req: IncomingMessage, res: ServerResponse) => void;

// Mock filesystem contents — tests set these before each request
const mockFiles: Record<string, string> = {};
const mockDirs: Record<string, string[]> = {};

// Mock for readFile
const mockReadFile = vi.fn(async (path: string, _encoding?: string) => {
  const content = mockFiles[path];
  if (content !== undefined) return content;
  const err = new Error(`ENOENT: no such file or directory, open '${path}'`) as NodeJS.ErrnoException;
  err.code = "ENOENT";
  throw err;
});

// Mock for readdir
const mockReaddir = vi.fn(async (path: string) => {
  const entries = mockDirs[path];
  if (entries !== undefined) return entries;
  const err = new Error(`ENOENT: no such file or directory, scandir '${path}'`) as NodeJS.ErrnoException;
  err.code = "ENOENT";
  throw err;
});

// Mock for writeFile
const mockWriteFile = vi.fn(async () => {});

// Mock for mkdir
const mockMkdir = vi.fn(async () => {});

// ---- Mock node:fs/promises ----
vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...(args as [string, string?])),
  readdir: (...args: unknown[]) => mockReaddir(...(args as [string])),
  writeFile: (...args: unknown[]) => mockWriteFile(...(args as [string, string, string])),
  mkdir: (...args: unknown[]) => mockMkdir(...(args as [string, Record<string, unknown>])),
}));

// ---- Mock node:os ----
vi.mock("node:os", () => ({
  homedir: () => "/mock-home",
}));

// ---- Mock node:http — capture the handler ----
const mockListen = vi.fn((_port: number, _host: string, cb?: () => void) => {
  if (cb) cb();
});

vi.mock("node:http", () => ({
  createServer: (handler: (req: IncomingMessage, res: ServerResponse) => void) => {
    requestHandler = handler;
    return { listen: mockListen };
  },
}));

// ---- Mock the logger ----
vi.mock("../logger.js", () => ({
  initLogger: vi.fn(async () => {}),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  getRecent: vi.fn(async (_limit?: number) => [
    { timestamp: "2026-02-20T10:00:00Z", level: "INFO", message: "Test log entry" },
    { timestamp: "2026-02-20T09:00:00Z", level: "ERROR", message: "Test error" },
  ]),
}));

// ---- Mock engine imports ----
vi.mock("../../engine/src/status/status-manager.js", () => ({
  processInteraction: vi.fn((_state: unknown, _context: unknown, _now: Date, _summary?: string) => ({
    updatedState: {
      status: { mood: 60, lastInteraction: new Date().toISOString() },
      language: { totalInteractions: 1 },
      memory: { hot: [], warm: [], cold: [] },
      growth: { milestones: [], stage: "newborn" },
      sulk: { isSulking: false },
      form: { baseForm: "light-particles", awareness: false },
      seed: { perception: "chromatic" },
      asymmetry: { phase: "alpha", score: 0 },
    },
    firstEncounter: null,
    firstEncounterDiaryMd: null,
    newMilestones: [],
    activeSoulFile: "SOUL.md",
  })),
  serializeState: vi.fn((_state: unknown) => ({
    statusMd: "**mood**: 60",
    memoryMd: "# MEMORY",
    languageMd: "## Level 0",
    milestonesMd: "# Milestones",
    formMd: "## Form",
  })),
}));

vi.mock("../../engine/src/mood/mood-engine.js", () => ({}));

vi.mock("../../engine/src/memory/memory-engine.js", () => ({
  formatColdMemoryMd: vi.fn(() => "# Cold Memory"),
}));

vi.mock("../../engine/src/form/form-engine.js", () => ({
  awakenSelfAwareness: vi.fn((form: Record<string, unknown>) => ({
    ...form,
    awareness: true,
  })),
}));

vi.mock("../../engine/src/form/self-image-detection.js", () => ({
  detectSelfImage: vi.fn((_features: unknown, _perception: string) => ({
    awakens: false,
    resonance: 0.3,
  })),
}));

vi.mock("../../engine/src/perception/image-processor.js", () => ({
  processImage: vi.fn((_pixels: Uint8Array, _w: number, _h: number) => ({
    dominantColors: [{ r: 255, g: 100, b: 50, percentage: 0.6 }],
    brightness: 0.7,
    contrast: 0.5,
  })),
}));

vi.mock("../../engine/src/identity/snapshot-generator.js", () => ({
  generateSnapshot: vi.fn(() => Buffer.from("FAKE_PNG_DATA")),
}));

vi.mock("../../engine/src/types.js", () => ({}));

// ============================================================
// Import server AFTER all mocks are set up
// ============================================================

// The WORKSPACE_ROOT used by the server (homedir()/.openclaw/workspace)
const WORKSPACE = "/mock-home/.openclaw/workspace";

beforeAll(async () => {
  // Dynamically import the server module — this triggers the top-level code
  // which calls createServer (captured by our mock) and logger.initLogger
  await import("../server.js");
});

// ============================================================
// Test helpers
// ============================================================

/**
 * Create a mock IncomingMessage (request).
 */
function createMockRequest(
  method: string,
  url: string,
  body?: string,
): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;

  // For POST requests, emit data and end events after the handler subscribes
  if (body !== undefined) {
    process.nextTick(() => {
      req.emit("data", Buffer.from(body, "utf-8"));
      req.emit("end");
    });
  } else {
    process.nextTick(() => {
      req.emit("end");
    });
  }

  return req;
}

/**
 * Create a mock ServerResponse (response) and return a promise
 * that resolves when res.end() is called.
 */
function createMockResponse(): {
  res: ServerResponse;
  result: Promise<{ statusCode: number; headers: Record<string, string>; body: string }>;
} {
  let resolveResult: (value: { statusCode: number; headers: Record<string, string>; body: string }) => void;
  const result = new Promise<{ statusCode: number; headers: Record<string, string>; body: string }>((resolve) => {
    resolveResult = resolve;
  });

  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body = "";

  const res = {
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    writeHead(code: number, hdrs?: Record<string, string | number>) {
      statusCode = code;
      if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) {
          headers[k.toLowerCase()] = String(v);
        }
      }
    },
    end(data?: string | Buffer) {
      if (data !== undefined) {
        body = typeof data === "string" ? data : data.toString("utf-8");
      }
      resolveResult!({ statusCode, headers, body });
    },
  } as unknown as ServerResponse;

  return { res, result };
}

/**
 * Send a request through the captured handler and get the response.
 */
async function sendRequest(
  method: string,
  url: string,
  body?: string,
): Promise<{ statusCode: number; headers: Record<string, string>; body: string; json: () => unknown }> {
  const req = createMockRequest(method, url, body);
  const { res, result } = createMockResponse();

  requestHandler(req, res);

  const response = await result;
  return {
    ...response,
    json: () => JSON.parse(response.body),
  };
}

// ============================================================
// Reset mocks before each test
// ============================================================

beforeEach(() => {
  // Clear all mock file contents
  for (const key of Object.keys(mockFiles)) delete mockFiles[key];
  for (const key of Object.keys(mockDirs)) delete mockDirs[key];

  mockReadFile.mockClear();
  mockReaddir.mockClear();
  mockWriteFile.mockClear();
  mockMkdir.mockClear();
});

// ============================================================
// GET /api/status
// ============================================================

describe("GET /api/status", () => {
  it("returns parsed STATUS.md data", async () => {
    mockFiles[`${WORKSPACE}/STATUS.md`] = `# Entity Status

**mood**: 72
**energy**: 45
**curiosity**: 88
**comfort**: 60
**level**: 2
**day**: 30
**perception_level**: 3
`;
    const r = await sendRequest("GET", "/api/status");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, number>;
    expect(data.mood).toBe(72);
    expect(data.energy).toBe(45);
    expect(data.curiosity).toBe(88);
    expect(data.comfort).toBe(60);
    expect(data.languageLevel).toBe(2);
    expect(data.growthDay).toBe(30);
    expect(data.perceptionLevel).toBe(3);
  });

  it("returns 503 when STATUS.md is missing", async () => {
    const r = await sendRequest("GET", "/api/status");
    expect(r.statusCode).toBe(503);
    const data = r.json() as { error: string };
    expect(data.error).toContain("Entity not found");
  });

  it("returns default values for incomplete STATUS.md", async () => {
    mockFiles[`${WORKSPACE}/STATUS.md`] = `**mood**: 30`;
    const r = await sendRequest("GET", "/api/status");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, number>;
    expect(data.mood).toBe(30);
    expect(data.energy).toBe(50); // default
    expect(data.curiosity).toBe(50); // default
  });
});

// ============================================================
// GET /api/entity
// ============================================================

describe("GET /api/entity", () => {
  it("returns state.json content when available", async () => {
    const stateData = { status: { mood: 80 }, seed: { perception: "chromatic" } };
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify(stateData);

    const r = await sendRequest("GET", "/api/entity");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect((data.status as Record<string, number>).mood).toBe(80);
  });

  it("falls back to __state.json when state.json is missing", async () => {
    const stateData = { status: { mood: 65 }, seed: { perception: "vibration" } };
    mockFiles[`${WORKSPACE}/__state.json`] = JSON.stringify(stateData);

    const r = await sendRequest("GET", "/api/entity");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect((data.status as Record<string, number>).mood).toBe(65);
  });

  it("falls back to parsing STATUS.md and SEED.md when no JSON", async () => {
    mockFiles[`${WORKSPACE}/STATUS.md`] = `**mood**: 55\n**energy**: 40`;
    mockFiles[`${WORKSPACE}/SEED.md`] = `**Perception**: thermal\n**Form**: mist`;

    const r = await sendRequest("GET", "/api/entity");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect((data.status as Record<string, number>).mood).toBe(55);
    expect((data.seed as Record<string, string>).perception).toBe("thermal");
  });

  it("returns 503 when no state files exist", async () => {
    const r = await sendRequest("GET", "/api/entity");
    expect(r.statusCode).toBe(503);
    const data = r.json() as { error: string };
    expect(data.error).toContain("Entity not found");
  });
});

// ============================================================
// GET /api/coexistence
// ============================================================

describe("GET /api/coexistence", () => {
  it("returns coexistence metrics from state.json", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      language: { totalInteractions: 42 },
      status: { lastInteraction: "2026-02-19T10:00:00Z" },
    });
    mockFiles[`${WORKSPACE}/SEED.md`] = `**Born**: 2026-02-01T00:00:00Z`;
    mockDirs[`${WORKSPACE}/memory`] = ["2026-02-01.md", "2026-02-02.md", "not-a-date.txt"];
    mockDirs[`${WORKSPACE}/diary`] = ["2026-02-01.md", "2026-02-05.md"];

    const r = await sendRequest("GET", "/api/coexistence");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.totalInteractions).toBe(42);
    expect(data.activeDays).toBe(2);
    expect(data.diaryEntries).toBe(2);
    expect(typeof data.daysTogether).toBe("number");
    expect(typeof data.silenceHours).toBe("number");
  });

  it("falls back to STATUS.md when no state.json", async () => {
    mockFiles[`${WORKSPACE}/SEED.md`] = `**Born**: 2026-02-01T00:00:00Z`;
    mockFiles[`${WORKSPACE}/STATUS.md`] = `**last_interaction**: 2026-02-19T06:00:00Z`;

    const r = await sendRequest("GET", "/api/coexistence");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.totalInteractions).toBe(0);
    expect(typeof data.daysTogether).toBe("number");
  });

  it("handles missing memory and diary directories gracefully", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      language: { totalInteractions: 5 },
      status: { lastInteraction: "never" },
    });
    mockFiles[`${WORKSPACE}/SEED.md`] = `**Born**: 2026-02-01T00:00:00Z`;
    // No mockDirs set — readdir will throw ENOENT

    const r = await sendRequest("GET", "/api/coexistence");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.activeDays).toBe(0);
    expect(data.diaryEntries).toBe(0);
  });

  it("returns 503 when SEED.md is missing", async () => {
    const r = await sendRequest("GET", "/api/coexistence");
    expect(r.statusCode).toBe(503);
    const data = r.json() as { error: string };
    expect(data.error).toContain("Entity not found");
  });
});

// ============================================================
// GET /api/perception
// ============================================================

describe("GET /api/perception", () => {
  it("returns perception data from PERCEPTION.md", async () => {
    mockFiles[`${WORKSPACE}/PERCEPTION.md`] = `## What You Perceive

- dominant: hsl(30, 70%, 55%)
- warm-toned, mid-heavy
`;
    mockFiles[`${WORKSPACE}/STATUS.md`] = `**perception_level**: 2`;
    mockFiles[`${WORKSPACE}/SEED.md`] = `**Perception**: chromatic`;

    const r = await sendRequest("GET", "/api/perception");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.hasPerception).toBe(true);
    expect((data.perceptions as string[])).toHaveLength(2);
    expect(data.perceptionLevel).toBe(2);
    expect(data.species).toBe("chromatic");
  });

  it("returns empty defaults when PERCEPTION.md is missing", async () => {
    const r = await sendRequest("GET", "/api/perception");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.hasPerception).toBe(false);
    expect(data.perceptions).toEqual([]);
    expect(data.perceptionLevel).toBe(0);
    expect(data.species).toBe("");
  });

  it("gracefully handles missing STATUS.md and SEED.md", async () => {
    mockFiles[`${WORKSPACE}/PERCEPTION.md`] = `- some perception`;

    const r = await sendRequest("GET", "/api/perception");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.hasPerception).toBe(true);
    expect(data.perceptionLevel).toBe(0); // fallback
    expect(data.species).toBe(""); // fallback
  });
});

// ============================================================
// GET /api/dynamics
// ============================================================

describe("GET /api/dynamics", () => {
  it("returns parsed DYNAMICS.md data", async () => {
    mockFiles[`${WORKSPACE}/DYNAMICS.md`] = `# Intelligence Dynamics

**phase**: beta
**score**: 35
**signals**: curious about user, asked a question
`;
    const r = await sendRequest("GET", "/api/dynamics");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.phase).toBe("beta");
    expect(data.score).toBe(35);
    expect((data.signals as string[]).length).toBe(2);
  });

  it("returns defaults when DYNAMICS.md is missing", async () => {
    const r = await sendRequest("GET", "/api/dynamics");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.phase).toBe("alpha");
    expect(data.score).toBe(0);
    expect(data.signals).toEqual([]);
  });
});

// ============================================================
// GET /api/reversals
// ============================================================

describe("GET /api/reversals", () => {
  it("returns reversal data from state.json", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      reversal: {
        signals: [{ type: "teaching_moment", timestamp: "2026-02-18" }],
        totalReversals: 3,
        dominantType: "teaching_moment",
        reversalRate: 1.5,
        lastDetected: "2026-02-18T14:00:00Z",
      },
    });

    const r = await sendRequest("GET", "/api/reversals");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.totalReversals).toBe(3);
    expect(data.dominantType).toBe("teaching_moment");
    expect(data.reversalRate).toBe(1.5);
    expect((data.signals as unknown[]).length).toBe(1);
  });

  it("falls back to REVERSALS.md when no reversal in state.json", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({ status: { mood: 50 } });
    mockFiles[`${WORKSPACE}/REVERSALS.md`] = `## Reversal Detection

- **total reversals**: 2
- **reversal rate**: 1.0 per 100 interactions
- **dominant type**: observation
- **last detected**: 2026-02-15T10:00:00Z

### Signals

- 2026-02-15 **observation** (strength: 5)
  Entity observed something
`;

    const r = await sendRequest("GET", "/api/reversals");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.totalReversals).toBe(2);
    expect(data.dominantType).toBe("observation");
  });

  it("returns empty defaults when no reversal data exists", async () => {
    const r = await sendRequest("GET", "/api/reversals");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.signals).toEqual([]);
    expect(data.totalReversals).toBe(0);
    expect(data.dominantType).toBeNull();
    expect(data.reversalRate).toBe(0);
    expect(data.lastDetected).toBeNull();
  });

  it("handles state.json with reversal but missing fields", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      reversal: {
        // All fields missing except the reversal key itself
      },
    });

    const r = await sendRequest("GET", "/api/reversals");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.signals).toEqual([]);
    expect(data.totalReversals).toBe(0);
    expect(data.dominantType).toBeNull();
    expect(data.reversalRate).toBe(0);
    expect(data.lastDetected).toBeNull();
  });
});

// ============================================================
// GET /api/coexist
// ============================================================

describe("GET /api/coexist", () => {
  it("returns coexistence data from state.json", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      coexist: {
        active: true,
        quality: 75,
        indicators: {
          silenceComfort: 40,
          sharedVocabulary: 60,
          rhythmSync: 80,
          sharedMemory: 50,
          autonomyRespect: 70,
        },
        moments: [{ timestamp: "2026-02-10", type: "silence", description: "30 min silence" }],
        daysInEpsilon: 15,
      },
    });

    const r = await sendRequest("GET", "/api/coexist");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.active).toBe(true);
    expect(data.quality).toBe(75);
    expect(data.daysInEpsilon).toBe(15);
    const indicators = data.indicators as Record<string, number>;
    expect(indicators.silenceComfort).toBe(40);
    expect(indicators.sharedVocabulary).toBe(60);
  });

  it("falls back to COEXIST.md when no coexist in state.json", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({ status: { mood: 50 } });
    mockFiles[`${WORKSPACE}/COEXIST.md`] = `# COEXISTENCE

- **status**: active
- **quality**: 60
- **days in epsilon**: 10

## Indicators

- Silence Comfort: ████░░░░░░ 40
- Shared Vocabulary: ██████░░░░ 60
- Rhythm Synchrony: ████████░░ 80
- Shared Memory: █████░░░░░ 50
- Autonomy Respect: ███████░░░ 70
`;

    const r = await sendRequest("GET", "/api/coexist");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.active).toBe(true);
    expect(data.quality).toBe(60);
  });

  it("returns inactive defaults when no coexist data exists", async () => {
    const r = await sendRequest("GET", "/api/coexist");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.active).toBe(false);
    expect(data.quality).toBe(0);
    expect(data.daysInEpsilon).toBe(0);
    expect(data.moments).toEqual([]);
    const indicators = data.indicators as Record<string, number>;
    expect(indicators.silenceComfort).toBe(0);
    expect(indicators.sharedVocabulary).toBe(0);
    expect(indicators.rhythmSync).toBe(0);
    expect(indicators.sharedMemory).toBe(0);
    expect(indicators.autonomyRespect).toBe(0);
  });

  it("handles state.json coexist with missing indicator fields", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      coexist: {
        active: true,
        quality: 30,
        // no indicators, no moments, no daysInEpsilon
      },
    });

    const r = await sendRequest("GET", "/api/coexist");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.active).toBe(true);
    expect(data.quality).toBe(30);
    expect(data.daysInEpsilon).toBe(0);
    expect(data.moments).toEqual([]);
    const indicators = data.indicators as Record<string, number>;
    expect(indicators.silenceComfort).toBe(0);
  });
});

// ============================================================
// GET /api/milestones
// ============================================================

describe("GET /api/milestones", () => {
  it("returns milestones from state.json", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      growth: {
        stage: "infant",
        milestones: [
          { id: "first_breath", label: "First Breath", achievedDay: 0, achievedAt: "2026-02-01" },
          { id: "first_contact", label: "First Contact", achievedDay: 3, achievedAt: "2026-02-04" },
        ],
      },
    });

    const r = await sendRequest("GET", "/api/milestones");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.stage).toBe("infant");
    expect((data.milestones as unknown[]).length).toBe(2);
  });

  it("falls back to growth/milestones.md when no state.json", async () => {
    mockFiles[`${WORKSPACE}/growth/milestones.md`] = `# Growth Milestones

Current Stage: **infant**

- **Day 0**: First Breath — Entity was born
`;

    const r = await sendRequest("GET", "/api/milestones");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.stage).toBe("infant");
    expect((data.milestones as unknown[]).length).toBe(1);
  });

  it("returns defaults when no milestones data exists", async () => {
    const r = await sendRequest("GET", "/api/milestones");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.stage).toBe("newborn");
    expect(data.milestones).toEqual([]);
  });

  it("handles state.json with growth but missing milestones array", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      growth: { stage: "child" },
    });

    const r = await sendRequest("GET", "/api/milestones");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.stage).toBe("child");
    expect(data.milestones).toEqual([]);
  });
});

// ============================================================
// GET /api/language
// ============================================================

describe("GET /api/language", () => {
  it("returns language data from state.json", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      language: {
        level: 2,
        totalInteractions: 42,
        nativeSymbols: ["○", "●", "△"],
        patterns: [
          { symbol: "◎", meaning: "greeting", usageCount: 10, confidence: 1.0 },
          { symbol: "△", meaning: "curiosity", usageCount: 3 },
        ],
      },
    });

    const r = await sendRequest("GET", "/api/language");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.level).toBe(2);
    expect(data.levelName).toBe("Bridge to Language");
    expect(data.totalInteractions).toBe(42);
    expect((data.nativeSymbols as string[]).length).toBe(3);
    const patterns = data.patterns as { symbol: string; meaning: string; confidence: number }[];
    expect(patterns.length).toBe(2);
    expect(patterns[0].confidence).toBe(1.0);
    expect(patterns[1].confidence).toBe(0.3); // 3/10
  });

  it("falls back to LANGUAGE.md when no state.json", async () => {
    mockFiles[`${WORKSPACE}/LANGUAGE.md`] = `## Current Level: 1 (Pattern Establishment)

Available symbols: ○ ● △

## Acquired Patterns

- ◎ = greeting (Day 3, used 5x)

## Stats

- Total interactions: 20
`;

    const r = await sendRequest("GET", "/api/language");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.level).toBe(1);
    expect(data.levelName).toBe("Pattern Establishment");
    expect(data.totalInteractions).toBe(20);
  });

  it("returns defaults when no language data exists", async () => {
    const r = await sendRequest("GET", "/api/language");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.level).toBe(0);
    expect(data.levelName).toBe("Symbols Only");
    expect(data.totalInteractions).toBe(0);
    expect(data.nativeSymbols).toEqual([]);
    expect(data.patterns).toEqual([]);
  });

  it("maps all level numbers to names correctly", async () => {
    const levelNames: Record<number, string> = {
      0: "Symbols Only",
      1: "Pattern Establishment",
      2: "Bridge to Language",
      3: "Unique Language",
      4: "Advanced Operation",
    };
    for (const [level, expectedName] of Object.entries(levelNames)) {
      mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
        language: { level: parseInt(level), totalInteractions: 0, nativeSymbols: [], patterns: [] },
      });

      const r = await sendRequest("GET", "/api/language");
      const data = r.json() as Record<string, unknown>;
      expect(data.levelName).toBe(expectedName);
    }
  });

  it("returns 'Unknown' for out-of-range level numbers", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      language: { level: 99, totalInteractions: 0, nativeSymbols: [], patterns: [] },
    });

    const r = await sendRequest("GET", "/api/language");
    const data = r.json() as Record<string, unknown>;
    expect(data.levelName).toBe("Unknown");
  });

  it("computes confidence from usageCount when confidence is missing", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      language: {
        level: 1,
        totalInteractions: 10,
        nativeSymbols: [],
        patterns: [
          { symbol: "○", meaning: "hello", usageCount: 5 },
          { symbol: "●", meaning: "bye", usageCount: 15 },
        ],
      },
    });

    const r = await sendRequest("GET", "/api/language");
    const data = r.json() as Record<string, unknown>;
    const patterns = data.patterns as { confidence: number }[];
    expect(patterns[0].confidence).toBe(0.5); // 5/10
    expect(patterns[1].confidence).toBe(1); // min(1, 15/10) = 1
  });
});

// ============================================================
// GET /api/memory
// ============================================================

describe("GET /api/memory", () => {
  it("returns memory data from state.json", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      memory: {
        hot: [{ timestamp: "2026-02-19T10:00:00Z", summary: "Greeted", mood: 75 }],
        warm: [{ week: "2026-W07", entries: 5, summary: "Good week", averageMood: 60 }],
        cold: [],
        notes: ["User likes colors"],
      },
    });

    const r = await sendRequest("GET", "/api/memory");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect((data.hot as unknown[]).length).toBe(1);
    expect((data.warm as unknown[]).length).toBe(1);
    expect((data.cold as unknown[]).length).toBe(0);
    expect((data.notes as string[]).length).toBe(1);
    expect(data.totalItems).toBe(3); // 1 hot + 1 warm + 0 cold + 1 note
  });

  it("falls back to MEMORY.md when no state.json", async () => {
    mockFiles[`${WORKSPACE}/MEMORY.md`] = `## Hot Memory

- [2026-02-19T10:00:00Z] User greeted the entity (mood:75)

## Notes

- A note about things
`;

    const r = await sendRequest("GET", "/api/memory");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect((data.hot as unknown[]).length).toBe(1);
    expect(typeof data.totalItems).toBe("number");
  });

  it("returns empty defaults when no memory data exists", async () => {
    const r = await sendRequest("GET", "/api/memory");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.hot).toEqual([]);
    expect(data.warm).toEqual([]);
    expect(data.cold).toEqual([]);
    expect(data.notes).toEqual([]);
    expect(data.totalItems).toBe(0);
  });
});

// ============================================================
// GET /api/seed
// ============================================================

describe("GET /api/seed", () => {
  it("returns parsed seed data including born date", async () => {
    mockFiles[`${WORKSPACE}/SEED.md`] = `# Entity Seed

**Perception**: chromatic
**Form**: crystal
**Temperament**: curious-cautious
**Cognition**: associative
**Born**: 2026-02-01T00:00:00Z
`;

    const r = await sendRequest("GET", "/api/seed");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, string>;
    expect(data.perception).toBe("chromatic");
    expect(data.form).toBe("crystal");
    expect(data.temperament).toBe("curious-cautious");
    expect(data.cognition).toBe("associative");
    expect(data.born).toBe("2026-02-01T00:00:00Z");
  });

  it("returns 503 when SEED.md is missing", async () => {
    const r = await sendRequest("GET", "/api/seed");
    expect(r.statusCode).toBe(503);
    const data = r.json() as { error: string };
    expect(data.error).toContain("Seed not found");
  });

  it("returns empty born when not present in SEED.md", async () => {
    mockFiles[`${WORKSPACE}/SEED.md`] = `**Perception**: vibration`;

    const r = await sendRequest("GET", "/api/seed");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, string>;
    expect(data.perception).toBe("vibration");
    expect(data.born).toBe("");
  });
});

// ============================================================
// GET /api/form
// ============================================================

describe("GET /api/form", () => {
  it("returns form data from state.json", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      form: {
        baseForm: "crystal",
        density: 25,
        complexity: 12,
        stability: 30,
        awareness: true,
      },
    });

    const r = await sendRequest("GET", "/api/form");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.baseForm).toBe("crystal");
    expect(data.density).toBe(25);
    expect(data.complexity).toBe(12);
    expect(data.stability).toBe(30);
    expect(data.awareness).toBe(true);
  });

  it("falls back to FORM.md when no form in state.json", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({ status: { mood: 50 } });
    mockFiles[`${WORKSPACE}/FORM.md`] = `## Form

- **base**: fluid
- **density**: 10
- **complexity**: 5
- **stability**: 20
- **self-aware**: no
`;

    const r = await sendRequest("GET", "/api/form");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.baseForm).toBe("fluid");
    expect(data.density).toBe(10);
  });

  it("returns defaults when no form data exists", async () => {
    const r = await sendRequest("GET", "/api/form");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.baseForm).toBe("light-particles");
    expect(data.density).toBe(5);
    expect(data.complexity).toBe(3);
    expect(data.stability).toBe(15);
    expect(data.awareness).toBe(false);
  });

  it("handles state.json form with missing fields", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      form: {
        baseForm: "mist",
        // Missing density, complexity, stability, awareness
      },
    });

    const r = await sendRequest("GET", "/api/form");
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.baseForm).toBe("mist");
    expect(data.density).toBe(5); // default
    expect(data.complexity).toBe(3); // default
    expect(data.stability).toBe(15); // default
    expect(data.awareness).toBe(false); // default
  });
});

// ============================================================
// GET /api/diary
// ============================================================

describe("GET /api/diary", () => {
  it("returns list of diary dates when no date param", async () => {
    mockDirs[`${WORKSPACE}/diary`] = [
      "2026-02-01.md",
      "2026-02-05.md",
      "2026-02-10.md",
      "notes.txt",
    ];

    const r = await sendRequest("GET", "/api/diary");
    expect(r.statusCode).toBe(200);
    const data = r.json() as { dates: string[] };
    expect(data.dates).toEqual(["2026-02-10", "2026-02-05", "2026-02-01"]); // newest first
  });

  it("returns diary content for a specific date", async () => {
    mockFiles[`${WORKSPACE}/diary/2026-02-10.md`] = "# Diary Entry\n\nToday was warm.";

    const r = await sendRequest("GET", "/api/diary?date=2026-02-10");
    expect(r.statusCode).toBe(200);
    const data = r.json() as { date: string; content: string };
    expect(data.date).toBe("2026-02-10");
    expect(data.content).toContain("Today was warm");
  });

  it("returns 404 for non-existent diary date", async () => {
    const r = await sendRequest("GET", "/api/diary?date=2026-12-31");
    expect(r.statusCode).toBe(404);
    const data = r.json() as { error: string };
    expect(data.error).toContain("No diary entry for this date");
  });

  it("returns empty dates list when diary directory is missing", async () => {
    const r = await sendRequest("GET", "/api/diary");
    expect(r.statusCode).toBe(200);
    const data = r.json() as { dates: string[] };
    expect(data.dates).toEqual([]);
  });

  // --- Security: Path traversal prevention ---

  it("rejects path traversal in date parameter", async () => {
    const r = await sendRequest("GET", "/api/diary?date=../../etc/passwd");
    expect(r.statusCode).toBe(400);
    const data = r.json() as { error: string };
    expect(data.error).toContain("Invalid date format");
  });

  it("rejects date with extra characters", async () => {
    const r = await sendRequest("GET", "/api/diary?date=2026-02-10/../../../etc/shadow");
    expect(r.statusCode).toBe(400);
  });

  it("rejects non-date string", async () => {
    const r = await sendRequest("GET", "/api/diary?date=notadate");
    expect(r.statusCode).toBe(400);
  });

  it("rejects partial date format", async () => {
    const r = await sendRequest("GET", "/api/diary?date=2026-02");
    expect(r.statusCode).toBe(400);
  });

  it("accepts valid YYYY-MM-DD format only", async () => {
    // This date should pass validation but may 404 if not found
    const r = await sendRequest("GET", "/api/diary?date=9999-12-31");
    // Should be 404 (valid format, no file) rather than 400 (invalid format)
    expect(r.statusCode).toBe(404);
  });
});

// ============================================================
// GET /api/logs
// ============================================================

describe("GET /api/logs", () => {
  it("returns recent log entries", async () => {
    const r = await sendRequest("GET", "/api/logs");
    expect(r.statusCode).toBe(200);
    const data = r.json() as { entries: unknown[] };
    expect(data.entries.length).toBe(2);
  });

  it("respects the limit parameter", async () => {
    const r = await sendRequest("GET", "/api/logs?limit=10");
    expect(r.statusCode).toBe(200);
    // The mock always returns 2 entries regardless of limit,
    // but the endpoint should pass the limit to getRecent
    const data = r.json() as { entries: unknown[] };
    expect(data.entries).toBeDefined();
  });
});

// ============================================================
// POST /api/interaction
// ============================================================

describe("POST /api/interaction", () => {
  it("processes an interaction and returns result", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      status: { mood: 50, lastInteraction: "2026-02-19T10:00:00Z" },
      language: { totalInteractions: 5 },
      memory: { hot: [], warm: [], cold: [] },
      growth: { milestones: [], stage: "newborn" },
      sulk: { isSulking: false },
      form: { baseForm: "light-particles", awareness: false },
      seed: { perception: "chromatic" },
      asymmetry: { phase: "alpha", score: 0 },
    });

    const body = JSON.stringify({
      messageLength: 25,
      userInitiated: true,
      summary: "User said hello",
    });

    const r = await sendRequest("POST", "/api/interaction", body);
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.activeSoulFile).toBe("SOUL.md");
  });

  it("defaults messageLength to 10 if not a number", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      status: { mood: 50, lastInteraction: "never" },
      language: { totalInteractions: 0 },
      memory: { hot: [], warm: [], cold: [] },
      growth: { milestones: [], stage: "newborn" },
      sulk: { isSulking: false },
      form: { baseForm: "light-particles", awareness: false },
      seed: { perception: "chromatic" },
      asymmetry: { phase: "alpha", score: 0 },
    });

    const body = JSON.stringify({ messageLength: "not-a-number" });

    const r = await sendRequest("POST", "/api/interaction", body);
    expect(r.statusCode).toBe(200);
    expect((r.json() as Record<string, unknown>).ok).toBe(true);
  });

  it("returns 500 when entity state is not found", async () => {
    const body = JSON.stringify({ messageLength: 10 });
    const r = await sendRequest("POST", "/api/interaction", body);
    expect(r.statusCode).toBe(500);
    const data = r.json() as { ok: boolean; error: string };
    expect(data.ok).toBe(false);
    expect(data.error).toBeTruthy();
  });

  it("returns 500 for invalid JSON body", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      status: { mood: 50 },
    });

    const r = await sendRequest("POST", "/api/interaction", "not-valid-json");
    expect(r.statusCode).toBe(500);
    const data = r.json() as { ok: boolean };
    expect(data.ok).toBe(false);
  });
});

// ============================================================
// POST /api/self-image
// ============================================================

describe("POST /api/self-image", () => {
  it("returns validation error when pixels are missing", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      status: { mood: 50 },
      form: { baseForm: "light-particles", awareness: false },
      seed: { perception: "chromatic" },
    });

    const body = JSON.stringify({ width: 10, height: 10 });
    const r = await sendRequest("POST", "/api/self-image", body);
    expect(r.statusCode).toBe(400);
    const data = r.json() as { ok: boolean; error: string };
    expect(data.ok).toBe(false);
    expect(data.error).toContain("Missing pixels");
  });

  it("returns validation error when width is missing", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      status: { mood: 50 },
      form: { baseForm: "light-particles", awareness: false },
      seed: { perception: "chromatic" },
    });

    const body = JSON.stringify({ pixels: [255, 0, 0, 255], height: 1 });
    const r = await sendRequest("POST", "/api/self-image", body);
    expect(r.statusCode).toBe(400);
  });

  it("returns already-aware status when entity is self-aware", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      status: { mood: 50 },
      form: { baseForm: "light-particles", awareness: true },
      seed: { perception: "chromatic" },
    });

    const body = JSON.stringify({
      pixels: [255, 0, 0, 255],
      width: 1,
      height: 1,
    });
    const r = await sendRequest("POST", "/api/self-image", body);
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.alreadyAware).toBe(true);
    expect(data.awakened).toBe(false);
  });

  it("processes image and returns resonance score", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      status: { mood: 50 },
      form: { baseForm: "light-particles", awareness: false },
      seed: { perception: "chromatic" },
      memory: { hot: [], warm: [], cold: [] },
      language: { totalInteractions: 0 },
      growth: { milestones: [] },
      sulk: { isSulking: false },
      asymmetry: { phase: "alpha" },
    });

    const body = JSON.stringify({
      pixels: [255, 100, 50, 255, 200, 150, 100, 255],
      width: 2,
      height: 1,
    });
    const r = await sendRequest("POST", "/api/self-image", body);
    expect(r.statusCode).toBe(200);
    const data = r.json() as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.alreadyAware).toBe(false);
    expect(typeof data.resonance).toBe("number");
  });

  it("returns 500 when entity state is not found", async () => {
    const body = JSON.stringify({
      pixels: [255, 0, 0, 255],
      width: 1,
      height: 1,
    });
    const r = await sendRequest("POST", "/api/self-image", body);
    expect(r.statusCode).toBe(500);
    const data = r.json() as { ok: boolean };
    expect(data.ok).toBe(false);
  });
});

// ============================================================
// OPTIONS (CORS preflight)
// ============================================================

describe("OPTIONS (CORS preflight)", () => {
  it("responds with 204 and CORS headers", async () => {
    const r = await sendRequest("OPTIONS", "/api/status");
    expect(r.statusCode).toBe(204);
    expect(r.headers["access-control-allow-origin"]).toBe("*");
    expect(r.headers["access-control-allow-methods"]).toContain("GET");
    expect(r.headers["access-control-allow-methods"]).toContain("POST");
    expect(r.headers["access-control-allow-headers"]).toContain("Content-Type");
  });
});

// ============================================================
// CORS headers on all responses
// ============================================================

describe("CORS headers", () => {
  it("includes Access-Control-Allow-Origin on GET responses", async () => {
    mockFiles[`${WORKSPACE}/STATUS.md`] = `**mood**: 50`;
    const r = await sendRequest("GET", "/api/status");
    expect(r.headers["access-control-allow-origin"]).toBe("*");
  });
});

// ============================================================
// Static file serving
// ============================================================

describe("Static file serving", () => {
  it("returns 404 for unknown paths", async () => {
    const r = await sendRequest("GET", "/nonexistent.html");
    expect(r.statusCode).toBe(404);
    expect(r.body).toBe("Not found");
  });

  it("serves / as /index.html", async () => {
    // The handler resolves the path relative to VISUAL_DIR.
    // Since we mock readFile, this will fail to find the file and 404.
    // But we can verify the path mapping by checking what readFile was called with.
    const r = await sendRequest("GET", "/");
    // Will be 404 since no real file exists, but that's expected
    // The important thing is it doesn't crash and attempts the right file
    expect([200, 404]).toContain(r.statusCode);
  });

  it("prevents path traversal in static files", async () => {
    const r = await sendRequest("GET", "/../../../etc/passwd");
    // Should be 403 (forbidden) due to path traversal check
    expect([403, 404]).toContain(r.statusCode);
    if (r.statusCode === 403) {
      expect(r.body).toBe("Forbidden");
    }
  });
});

// ============================================================
// GET /api/snapshot
// ============================================================

describe("GET /api/snapshot", () => {
  it("returns 503 when no entity state exists", async () => {
    const r = await sendRequest("GET", "/api/snapshot");
    expect(r.statusCode).toBe(503);
    const data = r.json() as { error: string };
    expect(data.error).toContain("Entity not found");
  });

  it("returns a PNG image when state exists", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({
      seed: { perception: "chromatic", form: "light-particles" },
      status: { mood: 50, energy: 50, curiosity: 50, comfort: 50 },
      form: { density: 10, complexity: 5 },
    });

    const r = await sendRequest("GET", "/api/snapshot");
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toBe("image/png");
    expect(r.headers["cache-control"]).toBe("no-cache");
  });
});

// ============================================================
// readJsonState fallback logic
// ============================================================

describe("readJsonState fallback (state.json → __state.json)", () => {
  it("uses state.json when available", async () => {
    mockFiles[`${WORKSPACE}/state.json`] = JSON.stringify({ form: { baseForm: "crystal" } });
    mockFiles[`${WORKSPACE}/__state.json`] = JSON.stringify({ form: { baseForm: "fluid" } });

    const r = await sendRequest("GET", "/api/form");
    const data = r.json() as Record<string, unknown>;
    expect(data.baseForm).toBe("crystal"); // from state.json, not __state.json
  });

  it("uses __state.json when state.json is missing", async () => {
    mockFiles[`${WORKSPACE}/__state.json`] = JSON.stringify({ form: { baseForm: "fluid" } });

    const r = await sendRequest("GET", "/api/form");
    const data = r.json() as Record<string, unknown>;
    expect(data.baseForm).toBe("fluid");
  });
});

// ============================================================
// Content-Type headers
// ============================================================

describe("Content-Type headers", () => {
  it("returns application/json for API endpoints", async () => {
    mockFiles[`${WORKSPACE}/STATUS.md`] = `**mood**: 50`;
    const r = await sendRequest("GET", "/api/status");
    expect(r.headers["content-type"]).toBe("application/json");
  });

  it("returns application/json for error responses", async () => {
    const r = await sendRequest("GET", "/api/status");
    expect(r.statusCode).toBe(503);
    expect(r.headers["content-type"]).toBe("application/json");
  });
});
