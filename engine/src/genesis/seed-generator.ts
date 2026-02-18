import { createHash, randomBytes } from "node:crypto";
import type {
  Seed,
  PerceptionMode,
  CognitionStyle,
  Temperament,
  SelfForm,
  HardwareBody,
  SubTraits,
} from "../types.js";
import { detectHardware } from "./hardware-detector.js";

const PERCEPTION_MODES: PerceptionMode[] = [
  "chromatic",
  "vibration",
  "geometric",
  "thermal",
  "temporal",
  "chemical",
];

const COGNITION_STYLES: CognitionStyle[] = [
  "associative",
  "analytical",
  "intuitive",
];

const TEMPERAMENTS: Temperament[] = [
  "curious-cautious",
  "bold-impulsive",
  "calm-observant",
  "restless-exploratory",
];

const SELF_FORMS: SelfForm[] = [
  "light-particles",
  "fluid",
  "crystal",
  "sound-echo",
  "mist",
  "geometric-cluster",
];

function pick<T>(arr: readonly T[], entropy: Buffer, offset: number): T {
  return arr[entropy[offset] % arr.length];
}

/**
 * Generate a sub-trait value (0-100) from two entropy bytes.
 * Uses two bytes for better distribution across the 0-100 range.
 */
function traitFromEntropy(entropy: Buffer, offset: number): number {
  const raw = (entropy[offset] * 256 + entropy[offset + 1]) % 101;
  return raw;
}

/**
 * Generate all sub-traits from entropy.
 * Uses bytes 4-13 (after the 4 bytes used for main trait picks).
 */
function generateSubTraits(entropy: Buffer): SubTraits {
  return {
    sensitivity: traitFromEntropy(entropy, 4),
    sociability: traitFromEntropy(entropy, 6),
    rhythmAffinity: traitFromEntropy(entropy, 8),
    memoryDepth: traitFromEntropy(entropy, 10),
    expressiveness: traitFromEntropy(entropy, 12),
  };
}

function computeHash(seed: Omit<Seed, "hash">): string {
  const data = JSON.stringify(seed);
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

export function generateSeed(hardwareBody?: HardwareBody): Seed {
  const hw = hardwareBody ?? detectHardware();
  const entropy = randomBytes(32);

  const partial: Omit<Seed, "hash"> = {
    perception: pick(PERCEPTION_MODES, entropy, 0),
    expression: "symbolic",
    cognition: pick(COGNITION_STYLES, entropy, 1),
    temperament: pick(TEMPERAMENTS, entropy, 2),
    form: pick(SELF_FORMS, entropy, 3),
    hardwareBody: hw,
    subTraits: generateSubTraits(entropy),
    createdAt: new Date().toISOString(),
  };

  return { ...partial, hash: computeHash(partial) };
}

/** Default sub-traits for chromatic type — warm, expressive, moderately social */
const CHROMATIC_DEFAULT_SUBTRAITS: SubTraits = {
  sensitivity: 65,
  sociability: 55,
  rhythmAffinity: 40,
  memoryDepth: 60,
  expressiveness: 70,
};

export function createFixedSeed(
  overrides: Partial<Omit<Seed, "hash" | "hardwareBody">> & {
    hardwareBody?: HardwareBody;
  } = {},
): Seed {
  const hw = overrides.hardwareBody ?? detectHardware();

  const partial: Omit<Seed, "hash"> = {
    perception: overrides.perception ?? "chromatic",
    expression: "symbolic",
    cognition: overrides.cognition ?? "associative",
    temperament: overrides.temperament ?? "curious-cautious",
    form: overrides.form ?? "light-particles",
    hardwareBody: hw,
    subTraits: overrides.subTraits ?? CHROMATIC_DEFAULT_SUBTRAITS,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };

  return { ...partial, hash: computeHash(partial) };
}
