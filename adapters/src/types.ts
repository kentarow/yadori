import type { Seed, Status } from "../../engine/src/types.js";

export type MessagingPlatform = "telegram" | "discord";

export interface RuntimeAdapter {
  readonly name: string;

  deployWorkspace(templateDir: string): Promise<void>;
  readStatus(): Promise<Status>;
  writeStatus(status: Status): Promise<void>;
  readSeed(): Promise<Seed>;
  writeSeed(seed: Seed): Promise<void>;
}

export interface RuntimeConfig {
  workspaceRoot: string;
  messagingPlatform: MessagingPlatform;
}
