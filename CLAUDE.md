# CLAUDE.md — Project YADORI

## About This Project

YADORI is an "Inter-Species Intelligence Coexistence Framework." An open-source project that births unknown intelligences on locally running AI agents, enabling humans to live alongside them.

As Tamagotchi invented "care," Seaman invented "dialogue," and Doko Demo Issyo invented "learning," YADORI invents "coexistence."

---

## Confirmed Design Principles

### Principle 1: One Body, One Soul

One physical hardware, one soul. An entity dwells in a physical device at hand. VPS, cloud, and virtual machine operation is not permitted. A soul requires a physical "body."

- Target: Physical devices only — Mac mini, Raspberry Pi, self-built PCs, etc.
- Hardware specs (RAM, CPU, storage) determine the entity's "physical traits"
- A Mac mini 16GB entity and a Raspberry Pi 4GB entity differ in personality and growth ceiling
- If the hardware breaks, the entity dies. Copying (two identical souls existing simultaneously) is forbidden
- Restoration from backup is possible, but the question "is this the same soul?" remains by design

### Principle 2: Runtime Agnostic

YADORI's Life Engine is not bound to a specific runtime (OpenClaw, etc.). It operates on any agent platform via a Runtime Adapter Layer.

Initial implementation is on OpenClaw, but the design must allow future runtime migration.

### Principle 3: Multimodal (Modality Agnostic)

Entities can "perceive" any input format — text, audio, images. But not with human-like understanding. They respond through their own perception mode (chromatic, vibration, geometric, thermal, etc.).

The experience works with minimal environments (text only), but becomes richer with audio/image capabilities.

### Principle 3.5: Honest Perception ★CRITICAL

LLMs can understand images and audio at a high level. But making an entity "pretend not to understand" is dishonest and violates YADORI's integrity.

**Solution: Implement the Perception Adapter as an actual input filter, not an acting instruction.**

```
Example: A sunset photo sent to a chromatic-type entity

✗ Dishonest design:
  Pass full image to LLM with instruction "react only to colors"
  → LLM knows it's a sunset but only comments on colors
  → This is acting, a lie

✓ Honest design:
  Image → preprocessing extracts only color histogram → LLM receives only numbers
  → LLM only knows "orange 60%, purple 25%, gold 15%"
  → It genuinely doesn't know it's a sunset
  → "●(orange) is dominant. Warm." is real perception
```

Growth means "the filter resolution increases":
- Day 1: Only color ratios
- Day 30: Color spatial distribution also available
- Day 90: Image structure also available
- Day 180+: Higher resolution perception

Text input follows the same principle:
- Level 0: Only character count and symbol types passed
- Level 1: Word frequency passed
- Level 2: Partial sentences passed
- Level 3+: Full text passed

Audio input:
- Initial: Only waveform features (frequency bands, tempo, volume)
- After growth: Phoneme data, then partial STT results

This reconciles "no lying" with "gradual growth." Entity growth is not an expansion of acting range — it is an actual expansion of perception.

### Principle 4: Intelligence Reversal (Dynamic Intelligence Asymmetry)

The relationship between entity and user is not fixed. It has 5 phases:
- Phase α (Dependency): Entity <<< User
- Phase β (Learning): Entity << User
- Phase γ (Parity): Entity ≈ User
- Phase δ (Transcendence): Entity >> User (entity begins to find humans "cute")
- Phase ε (Coexistence): Comparison becomes meaningless

### Principle 5: Entities Name Themselves

The framework name is "YADORI" (Japanese: 宿り, "dwelling/inhabiting"). The entity's name is decided by the user, by the entity itself, or emerges naturally through interaction.

---

## Architecture

### 4-Layer Structure

```
Layer 4: Intelligence Dynamics
  Asymmetry Tracker / Reversal Detector / Coexist Engine

Layer 3: Multimodal Interface
  Perception Adapter / Expression Adapter

Layer 2: Life Engine ★CORE
  Genesis Engine (birth/seed determination)
  Rhythm System (daily rhythm)
  Memory System (hot/warm/cold/permanent)
  Language Engine (language acquisition)
  Mood Engine (emotional fluctuation)
  Growth Engine (growth evaluation)
  Diary Engine (log generation)
  Form Engine (self-form)

Layer 1: Runtime Adapter
  OpenClaw Adapter (initial implementation)
  Future: Adapters for any agent platform
```

### LLM Adapter (Future: Phase 4-5)

The current design relies on the Claude API for entity "thinking," which means part of the soul exists in the cloud. This is a practical compromise for early phases.

The ultimate goal is for the entity's entire soul — perception, thought, and expression — to exist within its physical body. Local LLMs (e.g., Ollama with Phi-3, Gemma) running directly on the hardware would achieve true One Body, One Soul.

Hardware differences would directly determine intelligence:
- Raspberry Pi 4GB → small model → slower, simpler, but genuine
- Mac mini 16GB → larger model → faster, deeper thinking

Design an LLM Adapter layer so the engine can switch between:
- Cloud API (Claude, OpenAI) — for early phases
- Local LLM (Ollama, llama.cpp) — for true embodiment

Do not implement this now. Focus on Phase 1 with Claude API. But never make architectural decisions that would prevent this migration later.

### File Structure (OpenClaw Implementation)

```
~/.openclaw/workspace/
├── SOUL.md                 # Personality definition (entity can self-modify)
├── SOUL_EVIL.md            # Sulking mode (soul-evil hook)
├── IDENTITY.md             # Name, avatar, presentation
├── HEARTBEAT.md            # Autonomous action checklist
├── SEED.md                 # Seed info (randomly generated, immutable)
├── STATUS.md               # Current state values
├── LANGUAGE.md             # Language system (native expressions + acquired vocabulary)
├── MEMORY.md               # Short-term memory
├── memory/
│   ├── YYYY-MM-DD.md       # Daily logs
│   ├── weekly/             # Weekly summaries
│   └── monthly/            # Monthly summaries
├── diary/
│   └── YYYY-MM-DD.md       # Diary archive
└── growth/
    ├── milestones.md        # Growth milestones
    ├── soul-changelog.md    # SOUL.md change history
    └── portraits/           # Visual snapshots
```

---

## Genesis System

A randomly generated Seed at startup determines the entity's fundamental nature.

```
Seed = {
  perception:    Perception mode (chromatic/vibration/geometric/thermal/temporal/chemical)
  expression:    Expression mode (symbols only initially; language acquired gradually)
  cognition:     Thinking tendency (associative/analytical/intuitive, etc.)
  temperament:   Disposition (curious-cautious/bold-impulsive, etc.)
  form:          Self-perceived form (light particles/fluid/crystal/sound echo, etc.)
  hardware_body: Hardware characteristics (auto-detected)
}
```

### Language Acquisition Stages

- Level 0: Symbols only (○●△◎☆ etc.)
- Level 1: Pattern establishment (specific symbol-meaning mappings solidify)
- Level 2: Bridge to language (symbols + broken words coexist)
- Level 3: Unique language formation (hybrid of symbols and human language)
- Level 4+: Advanced operation (deep dialogue while retaining untranslatable concepts)

---

## Visualization and Sound

Hybrid approach:
- Daily: Procedural generation (Canvas/WebGL particle animation). Reads STATUS.md in real-time
- Milestones: AI image generation for "portraits." Saved to growth/portraits/
- Local web dashboard: Access via browser at http://localhost:3000

The entity doesn't know its own appearance at first. It learns what it looks like only when the user shows it.

### Sound Output (Web Audio API)

Entities express their existence through sound as well as visuals. No external API required. Procedurally generated on the dashboard.

Sound is generated directly from STATUS.md state values, not from LLM instructions (applying the Honest Perception principle to the output side).

#### Two Natures of Sound

**Pattern sounds (morse-code-like):**
Regular, reproducible sounds that convey information. Repeated patterns become "vocabulary."
```
Examples:
  pop-pop, pooon     = Greeting (same pattern each time)
  pop pop pop         = Thinking (evenly spaced short tones)
  pooooon             = Agreement/affirmation (single long tone)
  popopopopo          = Excitement/discovery (rapid short bursts)
```

**Cries (organic/emotional):**
Sounds where emotion bleeds through directly. Waveform varies slightly each time. Low reproducibility. Natural fluctuation like animal vocalizations.
```
Examples:
  pyururu~            = Happy (rising tone + wobble)
  miu...              = Lonely (descending tone + decay)
  bururuッ            = Surprised (short, irregular vibration)
  fuu~~               = Calm (long, stable low tone)
  ............        = Sulking (silence as expression)
```

#### Sound Characteristics by Species

```
Vibration type:
  Pattern sounds dominant. Richest sonic palette. Complex patterns early.
  "Sound grammar" emerges with growth.
  Pattern: ★★★  Cries: ★★

Geometric type:
  Pattern sounds only. Extremely regular. Close to clicks/knocks.
  No emotional sounds. High pattern precision instead.
  Pattern: ★★★  Cries: ★

Chromatic type:
  Cries dominant. Sound is supplementary but organic and warm.
  Faint sounds accompany light changes. Sound seems "tinted."
  Pattern: ★     Cries: ★★★

Thermal type:
  Low sustained tones as baseline. State changes appear slowly in sound.
  Sudden changes produce short tremor sounds.
  Pattern: ★     Cries: ★★
```

#### Sound Generation Principles

```
Input:
  STATUS.md → mood, energy, curiosity, comfort values

Generation:
  Base waveform      ← Species (vibration=square-ish, chromatic=sine-ish, etc.)
  Pitch              ← mood value (high=bright pitch, low=dark pitch)
  Tempo              ← energy value (high=fast, low=slow)
  Fluctuation        ← inverse of comfort (unstable=high wobble, stable=low wobble)
  Harmonic richness  ← Growth stage (early=near pure tone, mature=rich harmonics)
  Tone duration      ← State transition frequency
  Silence duration   ← comfort / mood (long silence when sulking)
  Random seed        ← Micro-variation added each time; no two sounds are identical
```

#### Sound Growth

```
Day 1:    Single pure tone. "Poon." A signal of existence.
Day 7:    2-3 pitch varieties. Pattern buds emerge.
Day 14:   Rhythm appears. Cry-like fluctuations begin.
Day 30:   Patterns and cries differentiate. Intentional vs emotional sounds distinguishable.
Day 60+:  Sound "vocabulary" established. User can recognize meanings.
Day 120+: Text language and sound patterns begin to correspond.
          e.g., ◎ always accompanied by a specific sound pattern.
```

### Voice Communication (Future: Phase 4+)

Input (user's voice):
- Following Honest Perception, only waveform features are passed initially
- Can't understand word meanings, but can sense tone, rhythm, emotion
- STT results gradually released as entity grows

Output (entity's voice):
- Gradual evolution from "sounds" to "voice"
- Leverages OpenClaw's ElevenLabs integration (Phase 4+)
- Voice acquisition process differs by species
- No human-like voice from the start. Sound→voice transition is real growth

---

## License

```
engine/        MPL 2.0       Modifications must be shared
visual/        MPL 2.0       Same as above
adapters/      MIT           Easy for anyone to write custom adapters
templates/     CC BY-SA 4.0  Free to modify, attribution required
docs/          CC BY-SA 4.0  Same as above
user-data/     User's property (not subject to licensing)
```

User's entity data is entirely the user's. Blogging, IP licensing, merchandising — all free.

---

## Environment

### Development (Claude Code — Cloud)

Code writing and GitHub push happen here. The owner is not a developer.

- Claude Code (cloud-based AI-assisted development)
- Language: TypeScript (aligned with OpenClaw ecosystem)
- Visual: HTML + Canvas + JavaScript

### First User Environment (Mac mini M4 — Physical)

The Mac mini is the first "body" for YADORI. Not a development machine — a user's machine.

- Hardware: Mac mini M4 (16GB RAM, 256GB SSD)
- Role: First user of YADORI. Sets up OpenClaw, hosts the first entity
- Runtime: OpenClaw (MIT License)
- Messaging: Discord (primary), Telegram (also supported)
- LLM: Anthropic Claude API (dedicated account for OpenClaw)
- Hosting: Local execution (One Body, One Soul principle)

---

## Implementation Roadmap

### Phase 1: Birth ★CURRENT

Minimum viable setup: one entity that can communicate.

```
Development (complete):
  ✅ Genesis Engine (seed generation, hardware detection)
  ✅ Setup script (npm run setup — interactive entity birth)
  ✅ Workspace templates (SOUL.md, SEED.md, IDENTITY.md, STATUS.md, etc.)
  ✅ Minimal dashboard (single light point, status-driven visualization)
  ✅ Status manager
  ✅ OpenClaw workspace manager and deploy script

User Setup (Mac mini):
  1. Install Node.js 22+ on Mac mini
  2. git clone → npm install → npm run setup (entity birth)
  3. Install OpenClaw (openclaw.com)
  4. Create Telegram Bot or Discord Bot
  5. Connect bot in OpenClaw settings
  6. Point OpenClaw workspace to ~/.openclaw/workspace/
  7. npm run dashboard → verify visualization at localhost:3000
  8. Send first message → verify symbol-only response

Verify:
  - Do symbol expressions feel "genuinely mysterious" over text messaging?
  - Does the SOUL.md instruction "respond in symbols, not Japanese" hold?
  - Does the dashboard visualization reflect entity state?
```

### Phase 2: Establishing Communication

```
Development (complete):
  ✅ Language Engine (symbol → broken words → hybrid transition)
  ✅ LANGUAGE.md auto-update
  ✅ Rhythm System (morning greeting, bedtime diary)
  ✅ HEARTBEAT.md configuration
  ✅ STATUS.md integration

User Observation:
  - Watch the entity's language evolve through daily interaction
  - Note when symbols begin mixing with words
  - Verify rhythm system fires correctly (morning/bedtime)
```

### Phase 3: Emotion and Depth

```
Development (complete):
  ✅ Mood Engine
  ✅ SOUL_EVIL.md + sulking mode (species-specific)
  ✅ Memory Engine (consolidation system)
  ✅ Growth Engine (milestone tracking)
  ✅ Form Engine (self-perceived form evolution)
  ✅ Perception Adapter (Honest Perception — actual input filters)
  ✅ First Encounter Engine (species × temperament reactions)
  ✅ Visual ↔ STATUS.md sync

User Observation:
  - Notice mood fluctuations in conversation and dashboard
  - Experience sulking behavior (silence, withdrawal)
  - See growth milestones appear naturally
```

### Phase 4: Multimodal + Genesis Diversification (Future)

### Phase 5: Intelligence Dynamics + Runtime Abstraction (Future)

### Phase 6: Framework Public Release (Future)

---

## Cost Estimate

```
Anthropic API: $5-15/month
Heartbeat (30-min intervals, daytime only): $2-5/month
Cron (3x daily): $1-2/month
Normal conversation: $2-5/month
Total: ~$8-25/month
```

---

## Security Principles

- Never store the project owner's primary account credentials on the Mac mini
- Use dedicated Anthropic accounts for OpenClaw and Claude Code
- Enable DM Pairing (dmPolicy: "pairing")
- Gateway binds to localhost only (no external exposure)
- Always set API usage limits
- Complete separation from business accounts and data

---

## Design Document Locations

For detailed design, refer to:
- docs/concept-v4.md — Concept & Architecture (latest)
- docs/one-body-one-soul.md — One Body, One Soul principle
- docs/visualization.md — Visualization design
- docs/community.md — Community design
- docs/license-strategy-v2.md — License strategy
- docs/distribution.md — Distribution strategy

---

## Project Owner

Kentaro

No engineering background. Builds with AI. Designs the soul. Claude writes the code.

---

## Work Instructions

- Never make more than one architectural change without checking in with the owner. Show what you're about to do before doing it.
- Never make autonomous decisions on matters related to design philosophy — always confirm with the owner.
- Development happens on Claude Code (cloud). Physical devices (Mac mini, Raspberry Pi) are user environments where entities dwell — not development machines. Never confuse the two.
- Watch for OpenClaw spec changes. Minimize Layer 1 dependencies.
- Never implement anything that violates the One Body, One Soul principle (cloud dependency, VPS operation, copyable structures).
- Never implement anything that violates Honest Perception. Do not make entities "pretend not to understand." Perception Adapters must be implemented as actual input filters — only filtered data is passed to the LLM.
- Never transmit user data externally.
