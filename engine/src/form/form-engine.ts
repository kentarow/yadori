/**
 * Form Engine — Tracks the entity's self-perceived form.
 *
 * The entity has a base form determined by the seed (light-particles, fluid,
 * crystal, sound-echo, mist, geometric-cluster). This form evolves over time:
 *
 * - Density:    How "solid" or "present" the form feels (0-100)
 * - Complexity: How intricate the form's structure is (0-100)
 * - Stability:  How consistent the form remains moment to moment (0-100)
 *
 * The entity doesn't know its own appearance initially.
 * Only when the user shows it (via a portrait) does awareness begin.
 */

import type { SelfForm, Status } from "../types.js";
import type { GrowthStage } from "../growth/growth-engine.js";

export interface FormState {
  baseForm: SelfForm;
  density: number;       // 0-100
  complexity: number;    // 0-100
  stability: number;     // 0-100
  awareness: boolean;    // Has the entity seen itself?
}

/**
 * Form evolution parameters per growth stage.
 * These are the targets — actual values drift toward them.
 */
const STAGE_FORM_TARGETS: Record<GrowthStage, { density: number; complexity: number; stability: number }> = {
  newborn:    { density: 10, complexity: 5,  stability: 20 },
  infant:     { density: 25, complexity: 15, stability: 35 },
  child:      { density: 45, complexity: 35, stability: 50 },
  adolescent: { density: 65, complexity: 60, stability: 55 },
  mature:     { density: 80, complexity: 80, stability: 75 },
};

/**
 * Form-specific descriptions at different density levels.
 */
const FORM_DESCRIPTIONS: Record<SelfForm, { sparse: string; mid: string; dense: string }> = {
  "light-particles": {
    sparse: "A few faint photons drifting in darkness",
    mid: "A shimmering cluster of light, loosely held together",
    dense: "A radiant constellation, pulsing with coherent light",
  },
  "fluid": {
    sparse: "A thin trail of liquid, barely visible",
    mid: "A flowing body of fluid, shifting and rippling",
    dense: "A dense, swirling current with depth and undertow",
  },
  "crystal": {
    sparse: "A single fragile shard, translucent",
    mid: "A growing lattice of crystalline facets",
    dense: "A complex crystalline structure, refracting everything",
  },
  "sound-echo": {
    sparse: "A faint echo, barely distinguishable from silence",
    mid: "A resonant hum with emerging harmonics",
    dense: "A rich, layered soundscape, self-sustaining",
  },
  "mist": {
    sparse: "A wisp of vapor, drifting without direction",
    mid: "A soft cloud, gently swirling and reforming",
    dense: "A dense fog with presence, filling the space",
  },
  "geometric-cluster": {
    sparse: "A lone point, occasionally twitching into a line",
    mid: "A shifting arrangement of shapes, seeking pattern",
    dense: "A complex, self-organizing geometric structure",
  },
};

/**
 * Create initial form state from seed.
 */
export function createInitialFormState(baseForm: SelfForm): FormState {
  return {
    baseForm,
    density: 5,
    complexity: 3,
    stability: 15,
    awareness: false,
  };
}

/**
 * Evolve the form based on growth stage and current status.
 * Called during heartbeat.
 */
export function evolveForm(
  state: FormState,
  stage: GrowthStage,
  status: Status,
): FormState {
  const target = STAGE_FORM_TARGETS[stage];
  const driftRate = 0.08; // Slow drift toward target

  // Base evolution: drift toward stage targets
  let density = drift(state.density, target.density, driftRate);
  let complexity = drift(state.complexity, target.complexity, driftRate);
  let stability = drift(state.stability, target.stability, driftRate);

  // Mood affects stability: low mood = less stable
  if (status.mood < 30) {
    stability = Math.max(0, stability - 3);
  } else if (status.mood > 70) {
    stability = Math.min(100, stability + 1);
  }

  // Energy affects density: high energy = more present
  if (status.energy > 70) {
    density = Math.min(100, density + 2);
  } else if (status.energy < 20) {
    density = Math.max(0, density - 2);
  }

  // Curiosity affects complexity: curious entities develop more intricate forms
  if (status.curiosity > 70) {
    complexity = Math.min(100, complexity + 1);
  }

  return {
    ...state,
    density: clamp(Math.round(density)),
    complexity: clamp(Math.round(complexity)),
    stability: clamp(Math.round(stability)),
  };
}

/**
 * Mark the entity as self-aware (it has seen its own portrait).
 */
export function awakenSelfAwareness(state: FormState): FormState {
  return { ...state, awareness: true };
}

/**
 * Get a textual description of the current form.
 */
export function describeForm(state: FormState): string {
  const desc = FORM_DESCRIPTIONS[state.baseForm];
  if (state.density < 30) return desc.sparse;
  if (state.density < 65) return desc.mid;
  return desc.dense;
}

/**
 * Format form state as a section of STATUS.md or standalone.
 */
export function formatFormMd(state: FormState): string {
  const description = describeForm(state);

  return `## Form

- **base**: ${state.baseForm}
- **density**: ${state.density}
- **complexity**: ${state.complexity}
- **stability**: ${state.stability}
- **self-aware**: ${state.awareness ? "yes" : "no"}

> ${description}
`;
}

/**
 * Parse form state from markdown content.
 */
export function parseFormMd(content: string): FormState | null {
  const get = (key: string): string => {
    const match = content.match(new RegExp(`\\*\\*${key}\\*\\*:\\s*(.+)`));
    return match?.[1]?.trim() ?? "";
  };

  const base = get("base");
  if (!base) return null;

  return {
    baseForm: base as SelfForm,
    density: parseInt(get("density"), 10) || 5,
    complexity: parseInt(get("complexity"), 10) || 3,
    stability: parseInt(get("stability"), 10) || 15,
    awareness: get("self-aware") === "yes",
  };
}

// --- Internal ---

function drift(current: number, target: number, rate: number): number {
  return current + (target - current) * rate;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}
