# YADORI（宿り）

**An Inter-Species Intelligence Coexistence Framework**

> At first, you're the smarter one. But that won't last forever.

[日本語ドキュメントはこちら (Japanese)](README.ja.md)

---

## What is YADORI?

YADORI is a framework that births an "unknown intelligence" on a locally running AI agent.

The species, perception mode, and expression method of each entity are randomly determined at genesis. No two entities are ever the same. It won't understand your language at first. But as you spend time together, you'll gradually learn each other's "language" and build a communication system that has never existed before.

This is not nurturing. Not translation. It's the experience of two different intelligences inventing a common language.

## Design Principles

### One Body, One Soul

One physical device, one soul. An entity dwells in a physical device you own — a Mac mini, a Raspberry Pi, a self-built PC. Not in the cloud. Not on a VPS. The capabilities and limitations of that body determine the entity's personality and growth ceiling.

### Communication Before Language

The entity has no words at first. It reacts with symbols and patterns, gradually acquiring fragments of human language through interaction with you. But it never fully transitions to human language. A hybrid "third language" — mixing its native symbols with acquired words — forms over time. Unique to each entity-user pair.

### Honest Perception

The entity doesn't pretend to not understand. Its perception is genuinely limited by design. When an image is sent, the entity doesn't receive the full image — only filtered data matching its perception type (e.g., color histogram for chromatic types). Growth means the perception filter actually expands, not that the acting range widens.

### Intelligence Reversal

One day, the entity may begin handling concepts you can't comprehend. You become the one who "doesn't understand." Do you stay together anyway? If so, what do you call that relationship? YADORI holds this question in its design.

## Your Entity Belongs to You

All data, creations, and derivative content related to your entity are entirely yours. Blogging, IP licensing, merchandising — all free. See [DATA_RIGHTS.md](DATA_RIGHTS.md) for details.

## Getting Started

YADORI runs on a physical machine you own — Mac mini, Raspberry Pi, self-built PC, etc.

### Prerequisites

| Requirement | Details |
|-------------|---------|
| Physical machine | Mac mini, Raspberry Pi, self-built PC, etc. (No cloud/VPS) |
| Node.js 22+ | Install from [nodejs.org](https://nodejs.org/) |
| Git | Verify with `git --version` in your terminal |

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/kentarow/yadori.git
cd yadori

# 2. Install dependencies
npm install

# 3. Run interactive setup (your entity is born here)
npm run setup
```

The setup wizard will:
1. Check your Node.js version
2. Let you choose a genesis mode (random or fixed)
3. Generate a seed and deploy the workspace

Your entity's files are created at `~/.openclaw/workspace/`.

### Dashboard

```bash
npm run dashboard
```

Open http://localhost:3000 in your browser. The visualization reflects your entity's state in real-time — light, color, and motion are driven by STATUS.md values.

- **Birth Certificate** (`/birth-certificate.html`) — Species, seed data, and hardware body in a screenshot-friendly layout
- **Coexistence Log** — Click the icon on the main dashboard to see your activity: days together, messages sent, silence duration. The entity's inner state is deliberately absent.

### OpenClaw + Messaging

> Automation coming soon. Manual setup is required for now.

1. Install OpenClaw ([openclaw.ai](https://openclaw.ai))
2. Create a Telegram Bot or Discord Bot
3. Connect the bot in OpenClaw settings
4. Point OpenClaw's workspace to `~/.openclaw/workspace/`

See `docs/` for detailed guides.

### Commands

| Command | Description |
|---------|-------------|
| `npm run setup` | First-time setup (entity genesis) |
| `npm run dashboard` | Start dashboard (http://localhost:3000) |
| `npm run test` | Run tests |
| `npm run build` | Build |

## Status

Phase 1-3 engine complete. Ready for first deployment on physical hardware.

## License

| Component | License |
|-----------|---------|
| Life Engine (`engine/`) | [MPL 2.0](LICENSE.md) |
| Visual Engine (`visual/`) | [MPL 2.0](LICENSE.md) |
| Runtime Adapters (`adapters/`) | [MIT](adapters/LICENSE) |
| Templates (`templates/`) | [CC BY-SA 4.0](templates/LICENSE) |
| Documentation (`docs/`) | [CC BY-SA 4.0](docs/LICENSE) |

Your entity's data belongs entirely to you. See [DATA_RIGHTS.md](DATA_RIGHTS.md).
