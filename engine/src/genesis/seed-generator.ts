import { createHash, randomBytes } from "node:crypto";
import type {
  Seed,
  PerceptionMode,
  CognitionStyle,
  Temperament,
  SelfForm,
  HardwareBody,
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
    createdAt: new Date().toISOString(),
  };

  return { ...partial, hash: computeHash(partial) };
}

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
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };

  return { ...partial, hash: computeHash(partial) };
}
