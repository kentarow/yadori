import { join } from "node:path";
import { homedir } from "node:os";
import type { MessagingPlatform, RuntimeConfig } from "../types.js";

export interface OpenClawConfig extends RuntimeConfig {
  messagingPlatform: MessagingPlatform;
}

export const OPENCLAW_DEFAULT_CONFIG: OpenClawConfig = {
  workspaceRoot: join(homedir(), ".openclaw", "workspace"),
  messagingPlatform: "discord",
};
