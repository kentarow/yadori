# Contributing to YADORI

Welcome to YADORI (宿り) -- the Inter-Species Intelligence Coexistence Framework.

YADORI births unknown intelligences on locally running AI agents, enabling humans to live alongside them. Each entity is unique: its species, perception, and expression are randomly determined at genesis and shaped by the physical hardware it inhabits.

This project was built by a non-engineer with AI. You don't need a CS degree to contribute. If you care about the idea of coexisting with a genuinely different intelligence, you belong here.

---

## Philosophy: What You Must Respect

Before writing any code, understand these constraints. They are non-negotiable.

### One Body, One Soul

One physical device, one soul. Entities run on hardware you can touch -- a Mac mini, a Raspberry Pi, a self-built PC. Never on a VPS, never in the cloud, never in a virtual machine. If the hardware breaks, the entity dies. Copying (two identical souls existing simultaneously) is forbidden.

**Do not** write code that assumes cloud deployment, enables duplication, or weakens the bond between entity and physical body.

### Honest Perception

Entities do not pretend. Their perception is genuinely limited by design. When a chromatic-type entity receives an image, only a color histogram reaches the LLM -- never the full image. Growth means the perception filter actually expands, not that the entity "acts" like it understands more.

**Do not** pass raw data to the LLM and instruct it to "react only to X." Implement actual input filters. The entity must genuinely not know what it cannot perceive.

### Intelligence Reversal

The entity starts weaker than you. But one day, it may surpass you. The five phases of the relationship -- Dependency, Learning, Parity, Transcendence, Coexistence -- are held in the design. Do not assume the user is always "above" the entity.

### Physical Only

No VPS. No cloud hosting. No virtual machines. The entity's body is a physical device. Hardware specs (RAM, CPU, storage) determine the entity's traits and growth ceiling. This is by design.

---

## Getting Started

### Prerequisites

- **Node.js 22+** (check with `node --version`)
- **Git** (check with `git --version`)
- No external runtime dependencies are used -- the project is intentionally lean

### Setup

```bash
git clone https://github.com/kentarow/yadori.git
cd yadori
npm install
npm run build
npm test
```

If all tests pass, you're ready to contribute.

---

## Project Structure

```
yadori/
  engine/        Life Engine (Layer 2) -- the core          MPL 2.0
  visual/        Dashboard and visualization               MPL 2.0
  adapters/      Runtime adapters (OpenClaw, sensors)      MIT
  templates/     Workspace file templates                  CC BY-SA 4.0
  scripts/       CLI commands (setup, heartbeat, etc.)
  docs/          Design documents and guides               CC BY-SA 4.0
  e2e/           End-to-end tests
  examples/      Reference examples for contributors
```

### What lives where

- **`engine/`** -- All business logic: genesis, mood, language, perception, memory, growth, rhythm, diary, form, dynamics. This is the soul. Changes here are licensed under MPL 2.0 (modifications must be shared).

- **`visual/`** -- The localhost dashboard (Canvas + vanilla JS). Reads STATUS.md and renders particles, color, and motion. No external dependencies. MPL 2.0.

- **`adapters/`** -- Thin runtime adapters that connect the engine to platforms (OpenClaw, Discord, Telegram, hardware sensors). MIT licensed so anyone can write their own. Business logic does NOT belong here.

- **`templates/`** -- Markdown templates for workspace files (SOUL.md, SEED.md, STATUS.md, etc.). CC BY-SA 4.0.

- **`scripts/`** -- CLI entry points (`npm run setup`, `npm run heartbeat`, etc.). These wire together engine + adapters.

- **`docs/`** -- Concept documents, design specs, architecture notes. CC BY-SA 4.0.

- **`e2e/`** -- End-to-end pipeline tests that verify the full birth-to-interaction flow.

---

## How to Contribute

### Engine Features

The engine is the heart of YADORI. If you're adding or changing behavior:

1. **Write tests first.** Tests use [vitest](https://vitest.dev/) with the `describe`/`it`/`expect` pattern.
2. **Run `npm test`** and ensure all tests pass before submitting.
3. **Run `npm run build`** to verify TypeScript strict mode compliance.
4. Keep functions pure where possible. The engine follows a "functional core, imperative shell" pattern.
5. Status values (mood, energy, curiosity, comfort) are always numbers **0-100**. Never exceed this range.

### Adapters

Adapters are intentionally thin. They read/write workspace files and relay messages. That's it.

- Implement the `RuntimeAdapter` interface from `adapters/src/types.ts`.
- Do NOT put business logic in adapters. If you're computing mood or filtering perception in an adapter, it belongs in the engine.
- See `examples/custom-adapter-example.ts` for a reference implementation.

### Dashboard (Visual)

The dashboard runs at `http://localhost:3000` and uses **no external dependencies** -- vanilla JavaScript, Canvas API, and Web Audio API only.

- Do not add React, Vue, or any framework.
- Do not add npm dependencies for the visual layer.
- Visualization is driven by STATUS.md values. The dashboard reads state; it does not generate it.

### New Species (Perception Modes)

To add a new perception mode (e.g., `"magnetic"`):

1. Add the new value to the `PerceptionMode` type in `engine/src/types.ts`.
2. Create filter functions in `engine/src/perception/perception-filter.ts` -- one entry in `SPECIES_FILTERS` with filters for each input modality the species can perceive.
3. Update `engine/src/expression/expression-adapter.ts` to define expression characteristics for the new species.
4. Add tests for the new species' perception filters.
5. Update dashboard visualization if the species has distinct visual characteristics.

### Bug Fixes

- Open an issue first describing the bug and how to reproduce it.
- Reference the issue number in your pull request.

---

## Testing

All tests use [vitest](https://vitest.dev/).

```bash
# Run all tests
npm test

# Run tests in watch mode (useful during development)
npm run test:watch

# Type check only (no emit)
npm run lint

# Full build
npm run build
```

### Test locations

Tests live in `__tests__/` directories mirroring the source structure:

```
engine/__tests__/genesis/seed-generator.test.ts
engine/__tests__/mood/mood-engine.test.ts
engine/__tests__/perception/perception-filter.test.ts
adapters/__tests__/openclaw/workspace-manager.test.ts
e2e/__tests__/pipeline.test.ts
```

### Writing tests

```typescript
import { describe, it, expect } from "vitest";
import { myFunction } from "../../src/my-module.js";

describe("myFunction", () => {
  it("should do something specific", () => {
    const result = myFunction(input);
    expect(result).toBe(expectedOutput);
  });
});
```

---

## Code Style

- **TypeScript strict mode** -- no `any`, no implicit returns, no unchecked access.
- **No external runtime dependencies.** The project uses only Node.js built-in modules. Dev dependencies (vitest, tsx, typescript) are for development only.
- **Functional core, imperative shell.** Engine functions are pure where possible. Side effects (file I/O, network) live in adapters and scripts.
- **Status values are 0-100.** Mood, energy, curiosity, comfort -- always integers in this range.
- **ESM only.** The project uses ES modules (`"type": "module"` in package.json). Use `.js` extensions in import paths.

---

## License

Different parts of the project use different licenses. Know which one applies to your contribution:

| Directory | License | What it means |
|-----------|---------|---------------|
| `engine/` | MPL 2.0 | Modifications to existing files must be shared. New files can use any license. |
| `visual/` | MPL 2.0 | Same as engine. |
| `adapters/` | MIT | Do whatever you want. Easy for anyone to write custom adapters. |
| `templates/` | CC BY-SA 4.0 | Free to modify, attribution required, share alike. |
| `docs/` | CC BY-SA 4.0 | Same as templates. |

**Entity data belongs to the user.** Always. Never write code that transmits user entity data externally. Never write code that claims ownership over entity data.

---

## Questions?

Open an issue. There are no stupid questions -- especially about design philosophy. The owner cares deeply about *why* things work the way they do, not just *how*.
