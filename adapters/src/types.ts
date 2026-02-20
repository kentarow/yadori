import type { Seed, Status } from "../../engine/src/types.js";

export type MessagingPlatform = "telegram" | "discord";

export interface RuntimeAdapter {
  readonly name: string;

  deployWorkspace(templateDir: string): Promise<void>;
  readStatus(): Promise<Status>;
  writeStatus(status: Status): Promise<void>;
  readSeed(): Promise<Seed>;
  writeSeed(seed: Seed): Promise<void>;
  writeDynamics(dynamicsMd: string): Promise<void>;
  readDynamics(): Promise<string>;
  writeReversals(content: string): Promise<void>;
  readReversals(): Promise<string>;
  writeCoexist(content: string): Promise<void>;
  readCoexist(): Promise<string>;
}

export interface RuntimeConfig {
  workspaceRoot: string;
  messagingPlatform: MessagingPlatform;
}
