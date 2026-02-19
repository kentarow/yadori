# Changelog

All notable changes to YADORI are documented here.
Versioning follows the project phases: `0.{phase}.{patch}`.

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
