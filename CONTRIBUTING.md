# Contributing to YADORI

Thank you for your interest in YADORI! This guide will help you get started.

## Before You Start

Please read [CLAUDE.md](CLAUDE.md) — it contains the design principles and architecture that guide all development decisions. In particular:

- **One Body, One Soul** — never introduce cloud dependency or copyable structures
- **Honest Perception** — perception adapters must be actual input filters, not acting instructions
- **Runtime Agnostic** — minimize coupling to any specific runtime (including OpenClaw)

## Development Setup

```bash
git clone https://github.com/kentarow/yadori.git
cd yadori
npm install
```

### Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run tests (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Type check (tsc --noEmit) |
| `npm run build` | Build TypeScript |
| `npm run dashboard` | Start dashboard at localhost:3000 |

## How to Contribute

### Reporting Bugs

Use the [Bug Report](https://github.com/kentarow/yadori/issues/new?template=bug_report.md) issue template. Include:

- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS

### Suggesting Features

Use the [Feature Request](https://github.com/kentarow/yadori/issues/new?template=feature_request.md) issue template. Before submitting, consider whether the feature aligns with YADORI's design principles.

### Pull Requests

1. Fork the repository
2. Create a feature branch from `main` (`git checkout -b feature/your-feature`)
3. Make your changes
4. Ensure all tests pass (`npm test`) and type check succeeds (`npm run lint`)
5. Commit with a clear message (see below)
6. Open a Pull Request using the PR template

### Commit Messages

Use clear, concise commit messages:

```
Add perception filter for thermal type
Fix mood decay calculation when energy is zero
Update SOUL.md template with new symbol set
```

- Start with a verb (Add, Fix, Update, Remove, Refactor)
- Keep the first line under 72 characters
- Add a body for complex changes

## Project Structure

| Directory | License | Purpose |
|-----------|---------|---------|
| `engine/` | MPL 2.0 | Life Engine core (modifications must be shared) |
| `visual/` | MPL 2.0 | Dashboard & visualization |
| `adapters/` | MIT | Runtime adapters (easy to write custom ones) |
| `templates/` | CC BY-SA 4.0 | Workspace templates |
| `docs/` | CC BY-SA 4.0 | Documentation |

Contributions to each directory fall under that directory's license.

## Code Style

- TypeScript with strict mode
- ESM modules (`"type": "module"`)
- Prefer explicit types over `any`
- Tests live in `__tests__/` directories mirroring `src/`

## Questions?

Open a [Discussion](https://github.com/kentarow/yadori/discussions) or an Issue. We're happy to help.
