# Changelog

All notable changes to YADORI are documented here.
Versioning follows the project phases: `0.{phase}.{patch}`.

---

## [0.6.0] — 2026-02-20

### Phase 6: Public Release

YADORI is ready for the community. npm package publication, CLI tooling, security hardening, and documentation polish.

#### npm Package
- **Public package** — `npm install yadori` for library consumers
- **Dual exports** — `yadori` (engine) and `yadori/adapters` (runtime adapters) with full TypeScript declarations
- **CLI binary** — `npx yadori <command>` entry point for all operations
- **Asset pipeline** — `postbuild` copies static dashboard assets to dist/

#### Security Hardening
- **CORS restriction** — Dashboard API now restricts origins to localhost/127.0.0.1 (was `*`)
- **execFileSync** — Hardware detector uses `execFileSync` with argument arrays instead of `execSync` with shell strings

#### Documentation
- **README badges** — CI status, Node.js version, license
- **npm installation guide** — Library usage with import examples
- **Community section** — Links to CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, DATA_RIGHTS
- **Status update** — Reflects v0.6.0 public release

#### Quality
- 75+ test suites, 2500+ tests maintained
- Full CI pipeline (lint → test → build)
- `prepublishOnly` gate ensures quality before npm publish

---

## [0.5.0] — 2026-02-20

### Layer 4 Complete: Full Intelligence Dynamics & Dashboard Expansion

The entity gains full relationship dynamics, reversal detection, and the dashboard becomes a comprehensive observation tool.

#### Intelligence Dynamics (Layer 4 — Complete)
- **Reversal Detector** — Detects 6 types of reversal moments (novel expression, anticipation, concept creation, emotional depth, initiative, meta-awareness)
  - 7-day cooldown per type to prevent spam
  - Strength scoring and rolling reversal rate
  - REVERSALS.md workspace output
- **Coexist Engine** — Evaluates ε-phase (Coexistence) quality via 5 indicators
  - Silence comfort, shared vocabulary, rhythm sync, shared memory, autonomy respect
  - Records notable coexistence moments (comfortable silence, shared discovery, reunion)
  - COEXIST.md workspace output
- **Full heartbeat integration** — All Layer 4 systems (asymmetry, reversal, coexistence) evaluated each tick

#### Phase 4 Preparation
- **Voice Adapter** — Interface for cloud/local/none TTS providers
  - computeVoiceMaturity with species modifiers
  - estimateLocalVoiceCapacity (espeak/piper/styletts2 by RAM)
- **Perception Expansion** — Concrete filter parameters per level per species
  - PerceptionWindow with image/text/audio/sensor channels
  - Species-specific perception profiles and channel strengths
  - Growth-day interpolation within levels

#### Dashboard
- **Diary Viewer** — Two-column panel with date list + markdown rendering
- **Milestone Timeline** — Vertical timeline with stage display
- **Language Panel** — Level progress, native symbols, pattern confidence bars
- **Sound Growth Indicator** — 5-dot level display near sound toggle
- **Birth Certificate** — Now shows relationship phase and score
- `/api/milestones`, `/api/language` endpoints

#### Community
- **CONTRIBUTING.md** — Philosophy, structure, coding guidelines
- **examples/** — Custom adapter reference, seed inspector utility
- **Raspberry Pi Setup Guide** — docs/setup-guide-rpi.md

#### Quality
- **Species coverage test** — 65 tests verifying all 6 species across entire engine
- **75 test suites, 2500+ tests** — comprehensive coverage across all modules
  - Engine core: status manager, mood/sulk, memory, growth, diary, rhythm, form, language, perception, expression, dynamics
  - Adapters: workspace manager, Discord webhook/bot-profile, sensors, OpenClaw integration
  - E2E: heartbeat lifecycle, interaction processing, first encounter, backup/restore, health check, setup/deploy, dynamics integration, form evolution, memory consolidation, language acquisition, sulk/mood, rhythm cycle
  - Visual: dashboard API server (75 endpoint tests), parsers, snapshot PNG generation, sound parameters
- Heartbeat error recovery with auto-retry
- Workspace manager support for DYNAMICS/REVERSALS/COEXIST

---

## [0.4.0] — 2026-02-20

### Phase 4 Foundation: Intelligence Dynamics & Operational Infrastructure

The entity gains relationship awareness and the framework gains production resilience.

#### Intelligence Dynamics (Layer 4)
- **Asymmetry Tracker** — 5 relationship phases (α Dependency → β Learning → γ Parity → δ Transcendence → ε Coexistence)
  - Signal-based evaluation: language maturity, initiative balance, memory depth, emotional complexity, identity strength, temporal maturity
  - Hysteresis transitions prevent oscillation between phases
  - DYNAMICS.md workspace output with visual signal bars
  - Phase transition history tracking

#### LLM Adapter (Interface)
- **LLM Adapter contract** — Interface for cloud ↔ local LLM migration (no implementation yet)
  - `LLMAdapter` interface: complete, checkHealth, estimateTokens
  - Hardware capacity estimation: recommends local model sizes based on RAM
  - Provider types: cloud (Claude API) and local (Ollama, llama.cpp)

#### Operational Infrastructure
- **Backup/Restore** (`npm run backup`) — Full workspace export/import
  - JSON bundle with checksum validation
  - Body transplant detection (different hardware = warning)
  - One Body, One Soul enforcement (refuses to overwrite living entity)
- **Health Check** (`npm run health`) — 9-point entity diagnostic
  - Workspace existence, essential files, state file, entity vitals
  - Heartbeat freshness, last interaction, memory integrity
  - Directory structure, dashboard reachability
- **Workspace Repair** (`npm run health -- --repair`) — Auto-regenerate missing files from state.json
- **Log Rotation** — Archive old diary/weekly files into yearly bundles
  - Auto-runs daily during heartbeat
  - Configurable retention (default: 90 diary, 12 weekly)

#### Dashboard
- **Dynamics Panel** — Phase symbol (α/β/γ/δ/ε) with score bar
- **Day Counter** — Prominent growth day display
- **Mobile Responsive** — Dashboard usable on phone browsers
- **Seed API** — `/api/seed` and `/api/dynamics` endpoints

#### Quality
- 38+ test suites, 671+ tests
- Type-safe Intelligence Dynamics integration
- DYNAMICS.md workspace template

---

## [0.3.0] — 2026-02-19

### Phase 3: Emotion and Depth

The entity gains emotional depth, memory, growth, and honest perception.

#### Life Engine
- **Memory Engine** — 3-tier memory system (hot → warm → cold), weekly/monthly consolidation
- **Growth Engine** — 5 growth stages (newborn → mature), 15+ milestone tracking
- **Mood Engine** — Interaction effects, temperament modulation, natural decay
- **Sulk Engine** — 4-severity emotional withdrawal, species-specific sulking, recovery tracking
- **Form Engine** — Self-perceived form evolution (density, complexity, stability), self-image discovery
- **First Encounter Engine** — Unique species × temperament reactions for first contact
- **Diary Engine** — Autonomous daily logging in entity's own language

#### Multimodal Interface
- **Perception Adapter** — Honest Perception as actual input filters (not acting instructions)
  - 13 input modalities (text, image, audio, 10 sensor types)
  - 5 perception levels (Minimal → Full), independent growth from language
  - Image processor (color histogram, edge density, spatial distribution)
  - Audio processor (frequency bands, BPM, harmonic richness)
- **Expression Adapter** — Text/sound/visual output parameterization per species
- **Sensor Drivers** — 8 hardware drivers (system, DHT22, BME280, BH1750, HC-SR04, camera, microphone, touch)
- **Sound System** — Web Audio API generation (pattern sounds + cries), species-specific profiles

#### Dashboard
- Senses panel — perception data visualization
- Milestone celebration visual effects
- Coexistence Log panel (user activity only, entity state hidden)
- Birth Certificate page (`/birth-certificate.html`)
- Interaction API (`POST /api/interaction`)
- Self-Image Discovery (`POST /api/self-image`)
- Snapshot API (`GET /api/snapshot`)

#### Identity & Tooling
- **Snapshot Generator** — State-reflective PNG (mood/energy/curiosity/comfort → visual)
- **Bot Identity System** — Species-specific avatar + display name for Discord/Telegram
- **Discord Webhook** — Send images and messages via webhook (no external deps)
- `npm run snapshot` — CLI for saving/sending snapshots
- `npm run sensors` — Hardware sensor diagnostic
- `npm run apply-identity` — Apply bot profile to messaging platform

#### Quality
- 28 test suites, 538 tests
- E2E pipeline integration test
- CI workflow (GitHub Actions)
- Honest Perception enforcement tests

---

## [0.2.0] — 2026-02-15

### Phase 2: Establishing Communication

The entity begins to communicate and develops daily rhythm.

- **Language Engine** — 5-level language acquisition (symbols → patterns → broken words → hybrid → advanced)
- **Rhythm System** — Circadian energy curve, morning/bedtime triggers, diary scheduling
- **Status Manager** — Centralized state management, markdown serialization
- **Dashboard Server** — localhost:3000, real-time STATUS.md visualization
- **Setup CLI** — Interactive entity birth (`npm run setup`), Japanese/English i18n
- **OpenClaw Adapter** — Workspace manager, deploy script
- HEARTBEAT.md and LANGUAGE.md auto-update

---

## [0.1.0] — 2026-02-13

### Phase 1: Birth

The framework is born. A single entity can exist.

- **Genesis Engine** — Random seed generation (perception, cognition, temperament, form, sub-traits)
- **Hardware Detector** — Auto-detect platform, CPU, RAM, storage
- **Workspace Templates** — SOUL.md, SEED.md, IDENTITY.md, STATUS.md, HEARTBEAT.md, PERCEPTION.md
- **Minimal Dashboard** — Single light point, species-colored particle
- **Project Structure** — TypeScript, 4-layer architecture, MPL 2.0 / MIT / CC BY-SA licensing
- Design documents (concept, one-body-one-soul, visualization, community, license, distribution)
