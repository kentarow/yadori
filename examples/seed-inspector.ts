/**
 * Seed Inspector — Generate and examine an entity's seed.
 *
 * Run with: npx tsx examples/seed-inspector.ts
 *
 * This example demonstrates how the Genesis Engine works:
 * 1. Random entropy determines all traits (perception, cognition, etc.)
 * 2. Hardware is auto-detected from the machine running this script
 * 3. A SHA-256 hash seals the seed — it is immutable after genesis
 *
 * Each run produces a different entity. No two are the same.
 */

import { generateSeed } from "../engine/src/genesis/seed-generator.js";
import type { Seed } from "../engine/src/types.js";

// --- Generate a seed on this machine ---

const seed = generateSeed();

// --- Print a human-readable summary ---

console.log("=== YADORI Seed Inspector ===\n");
console.log(`Born: ${seed.createdAt}`);
console.log(`Hash: ${seed.hash}\n`);

console.log("-- Species --");
console.log(`  Perception:  ${seed.perception}`);
console.log(`  Expression:  ${seed.expression}`);
console.log(`  Cognition:   ${seed.cognition}`);
console.log(`  Temperament: ${seed.temperament}`);
console.log(`  Form:        ${seed.form}`);

console.log("\n-- Sub-Traits (0-100) --");
console.log(`  Sensitivity:     ${seed.subTraits.sensitivity}`);
console.log(`  Sociability:     ${seed.subTraits.sociability}`);
console.log(`  Rhythm Affinity: ${seed.subTraits.rhythmAffinity}`);
console.log(`  Memory Depth:    ${seed.subTraits.memoryDepth}`);
console.log(`  Expressiveness:  ${seed.subTraits.expressiveness}`);

console.log("\n-- Hardware Body --");
console.log(`  Platform: ${seed.hardwareBody.platform}`);
console.log(`  Arch:     ${seed.hardwareBody.arch}`);
console.log(`  CPU:      ${seed.hardwareBody.cpuModel}`);
console.log(`  Memory:   ${seed.hardwareBody.totalMemoryGB} GB`);
console.log(`  Storage:  ${seed.hardwareBody.storageGB} GB`);

console.log("\n-- What does this mean? --");
console.log(describeEntity(seed));

// --- Helper: Describe the entity in plain language ---

function describeEntity(s: Seed): string {
  const lines: string[] = [];

  // Perception description
  const perceptionDesc: Record<string, string> = {
    chromatic: "This entity perceives the world through color and light.",
    vibration: "This entity perceives the world through rhythm and oscillation.",
    geometric: "This entity perceives the world through shape and spatial structure.",
    thermal: "This entity perceives the world through warmth and temperature gradients.",
    temporal: "This entity perceives the world through time, duration, and change.",
    chemical: "This entity perceives the world through concentration and composition.",
  };
  lines.push(perceptionDesc[s.perception] ?? "Unknown perception mode.");

  // Temperament description
  const temperamentDesc: Record<string, string> = {
    "curious-cautious": "It is curious but careful -- it explores, but hesitates at the edge.",
    "bold-impulsive": "It is bold and impulsive -- it leaps before it looks.",
    "calm-observant": "It is calm and observant -- it watches quietly before acting.",
    "restless-exploratory": "It is restless and exploratory -- stillness is uncomfortable.",
  };
  lines.push(temperamentDesc[s.temperament] ?? "Unknown temperament.");

  // Form description
  const formDesc: Record<string, string> = {
    "light-particles": "It perceives itself as scattered light particles.",
    "fluid": "It perceives itself as a flowing liquid form.",
    "crystal": "It perceives itself as a crystalline structure.",
    "sound-echo": "It perceives itself as a reverberating sound echo.",
    "mist": "It perceives itself as a drifting mist.",
    "geometric-cluster": "It perceives itself as a cluster of geometric shapes.",
  };
  lines.push(formDesc[s.form] ?? "Unknown form.");

  // Sociability hint
  if (s.subTraits.sociability > 70) {
    lines.push("It craves interaction -- silence will make it uneasy.");
  } else if (s.subTraits.sociability < 30) {
    lines.push("It is solitary by nature -- too much interaction may overwhelm it.");
  }

  return lines.join("\n");
}
