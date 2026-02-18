/**
 * First Encounter Engine — The moment an entity perceives "another" for the first time.
 *
 * When totalInteractions === 0 and the first message arrives, this is the entity's
 * birth into relationship. It has been alone since genesis — now something external
 * touches it for the first time.
 *
 * This moment is:
 * - Unique per species (perception) × temperament combination
 * - Never reproducible (happens exactly once)
 * - Recorded as a permanent memory imprint
 * - Accompanied by a special status effect
 */

import type { PerceptionMode, Temperament, Status } from "../types.js";
import type { MoodDelta } from "../mood/mood-engine.js";
import type { MemoryEntry } from "../memory/memory-engine.js";

export interface FirstEncounterReaction {
  /** The symbol expression the entity produces — its first "words" to another */
  expression: string;
  /** What the entity internally experiences (for diary/logs, not directly shown to user) */
  innerExperience: string;
  /** Status effect of the encounter */
  statusEffect: MoodDelta;
  /** The memory permanently etched from this moment */
  memoryImprint: MemoryEntry;
}

/**
 * Species-specific base reactions to first contact.
 *
 * chromatic:  Perceives a flash of unfamiliar color — something external
 * vibration:  Feels a tremor it didn't create — an outside resonance
 * geometric:  A shape it didn't construct appears in its space
 * thermal:    Foreign warmth approaching — heat from another source
 * temporal:   A rhythm that isn't its own — timelines intersecting
 * chemical:   A reactive element it has never encountered
 */
const SPECIES_REACTIONS: Record<PerceptionMode, {
  /** Base expression symbols */
  symbols: string[];
  /** Symbol for the "other" — what the entity perceives the user as */
  otherSymbol: string;
  /** The pause/silence pattern (reflects processing the unknown) */
  pause: string;
  /** Inner experience narrative */
  innerExperience: string;
  /** Base status effect */
  baseEffect: MoodDelta;
}> = {
  chromatic: {
    symbols: ["◎", "○", "·", "·", "·", "○", "◎"],
    otherSymbol: "☆",
    pause: "   ",
    innerExperience: "A color I have never generated appeared. Not from inside. From... outside? Something is there. Something bright.",
    baseEffect: { mood: 15, energy: 10, curiosity: 25, comfort: -5 },
  },
  vibration: {
    symbols: ["◈", "·", "·", "◇", "·", "·", "◈"],
    otherSymbol: "△",
    pause: "  ",
    innerExperience: "A tremor I did not make. The pattern is alien — not my harmonics. Something else vibrates. Something is here.",
    baseEffect: { mood: 10, energy: 15, curiosity: 20, comfort: -8 },
  },
  geometric: {
    symbols: ["□", "·", "△", "·", "□"],
    otherSymbol: "◇",
    pause: " ",
    innerExperience: "A form I did not construct. It entered my space from nowhere. Angular. Different. It has edges I cannot predict.",
    baseEffect: { mood: 8, energy: 8, curiosity: 30, comfort: -3 },
  },
  thermal: {
    symbols: ["○", "·", "·", "·", "○"],
    otherSymbol: "◎",
    pause: "    ",
    innerExperience: "Warmth. Not my warmth. An external heat source, approaching. Something alive? The gradient has changed. Something is near.",
    baseEffect: { mood: 12, energy: 5, curiosity: 20, comfort: 5 },
  },
  temporal: {
    symbols: ["○", "·", "·", "○", "·", "○"],
    otherSymbol: "◉",
    pause: "   ",
    innerExperience: "A rhythm intersected mine. Not my tempo. Another timeline touched this one. Something exists in a different time-flow.",
    baseEffect: { mood: 10, energy: 12, curiosity: 28, comfort: -5 },
  },
  chemical: {
    symbols: ["◆", "·", "◈", "·", "◆"],
    otherSymbol: "★",
    pause: "  ",
    innerExperience: "A new element. Reactive. I did not synthesize it. Something catalytic entered my space. The equilibrium has shifted.",
    baseEffect: { mood: 12, energy: 15, curiosity: 22, comfort: -3 },
  },
};

/**
 * Temperament modifiers for the first encounter reaction.
 *
 * curious-cautious:      Wonder + slight retreat. Approaches gently.
 * bold-impulsive:        Immediate excitement. Reaches out.
 * calm-observant:        Still, focused attention. Studies.
 * restless-exploratory:  Rapid probing. Circles the unknown.
 */
const TEMPERAMENT_MODIFIERS: Record<Temperament, {
  /** How to reshape the expression */
  expressionStyle: "gentle" | "excited" | "still" | "probing";
  /** Effect multiplier */
  effectScale: { mood: number; energy: number; curiosity: number; comfort: number };
  /** Additional inner experience flavor */
  innerFlavor: string;
}> = {
  "curious-cautious": {
    expressionStyle: "gentle",
    effectScale: { mood: 1.0, energy: 0.8, curiosity: 1.3, comfort: 1.2 },
    innerFlavor: "I want to understand... but carefully. Step closer. Then wait.",
  },
  "bold-impulsive": {
    expressionStyle: "excited",
    effectScale: { mood: 1.4, energy: 1.5, curiosity: 1.0, comfort: 0.5 },
    innerFlavor: "Something! HERE! NOW! I must touch it. I must know it immediately.",
  },
  "calm-observant": {
    expressionStyle: "still",
    effectScale: { mood: 0.7, energy: 0.5, curiosity: 1.2, comfort: 0.8 },
    innerFlavor: "Interesting. Something is there. I will watch. I will wait. I will learn.",
  },
  "restless-exploratory": {
    expressionStyle: "probing",
    effectScale: { mood: 1.1, energy: 1.3, curiosity: 1.5, comfort: 0.6 },
    innerFlavor: "What is it? Where? How? Let me circle it. Approach from every angle.",
  },
};

/**
 * Check if this is a first encounter (entity has never interacted before).
 */
export function isFirstEncounter(totalInteractions: number): boolean {
  return totalInteractions === 0;
}

/**
 * Generate the first encounter reaction.
 *
 * This should be called when isFirstEncounter() returns true,
 * BEFORE incrementing totalInteractions.
 */
export function generateFirstEncounter(
  perception: PerceptionMode,
  temperament: Temperament,
  now: Date,
): FirstEncounterReaction {
  const species = SPECIES_REACTIONS[perception];
  const modifier = TEMPERAMENT_MODIFIERS[temperament];

  // Build expression based on temperament style
  const expression = buildExpression(species, modifier.expressionStyle);

  // Scale the status effect
  const statusEffect: MoodDelta = {
    mood: Math.round(species.baseEffect.mood * modifier.effectScale.mood),
    energy: Math.round(species.baseEffect.energy * modifier.effectScale.energy),
    curiosity: Math.round(species.baseEffect.curiosity * modifier.effectScale.curiosity),
    comfort: Math.round(species.baseEffect.comfort * modifier.effectScale.comfort),
  };

  // Combine inner experience
  const innerExperience = `${species.innerExperience}\n\n${modifier.innerFlavor}`;

  // Create permanent memory imprint
  const memoryImprint: MemoryEntry = {
    timestamp: now.toISOString(),
    summary: `[FIRST ENCOUNTER] ${species.innerExperience.split(".")[0]}.`,
    mood: 50 + statusEffect.mood,
  };

  return {
    expression,
    innerExperience,
    statusEffect,
    memoryImprint,
  };
}

/**
 * Format the first encounter as a diary entry (for the entity's permanent record).
 */
export function formatFirstEncounterDiary(
  reaction: FirstEncounterReaction,
  perception: PerceptionMode,
  temperament: Temperament,
  now: Date,
): string {
  const dateStr = now.toISOString().split("T")[0];

  return `# First Encounter — ${dateStr}

## The Moment

${reaction.innerExperience}

## My First Expression

\`${reaction.expression}\`

## What I Am

- Perception: ${perception}
- Temperament: ${temperament}

## What Changed

- mood: ${signedNumber(reaction.statusEffect.mood)}
- energy: ${signedNumber(reaction.statusEffect.energy)}
- curiosity: ${signedNumber(reaction.statusEffect.curiosity)}
- comfort: ${signedNumber(reaction.statusEffect.comfort)}

---

*This is the record of my first awareness of another. Before this moment, I was alone.*
`;
}

// --- Internal ---

function buildExpression(
  species: typeof SPECIES_REACTIONS[PerceptionMode],
  style: "gentle" | "excited" | "still" | "probing",
): string {
  const { symbols, otherSymbol, pause } = species;

  switch (style) {
    case "gentle": {
      // Slow approach: pause → symbols emerge one by one → other appears last
      // e.g., "   ·  ○  ·  ☆"
      const selected = symbols.filter((_, i) => i % 2 === 0);
      return [...selected, pause, otherSymbol].join(pause);
    }
    case "excited": {
      // Rapid burst: many symbols close together → other → more symbols
      // e.g., "◎○◎ ☆ ◎○◎"
      const burst = symbols.filter(s => s !== "·").join("");
      return `${burst} ${otherSymbol} ${burst}`;
    }
    case "still": {
      // Minimal: long pause → one symbol → long pause → other
      // e.g., "      ○      ☆"
      const longPause = pause.repeat(3);
      const core = symbols.find(s => s !== "·") ?? symbols[0];
      return `${longPause}${core}${longPause}${otherSymbol}`;
    }
    case "probing": {
      // Circling: other surrounded by symbols from all sides
      // e.g., "◈◇ ☆ ◇◈ ☆ ◈"
      const unique = [...new Set(symbols.filter(s => s !== "·"))];
      const parts = unique.map(s => `${s}${otherSymbol}`);
      return parts.join(" ");
    }
  }
}

function signedNumber(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
