import type { RuntimeAdapter } from "../types.js";
import type { Seed, Status } from "../../../engine/src/types.js";
import { OpenClawWorkspaceManager } from "./workspace-manager.js";
import type { OpenClawConfig } from "./config.js";

export class OpenClawAdapter implements RuntimeAdapter {
  readonly name = "openclaw";
  private readonly workspace: OpenClawWorkspaceManager;

  constructor(config: Partial<OpenClawConfig> = {}) {
    this.workspace = new OpenClawWorkspaceManager(config);
  }

  async deployWorkspace(templateDir: string): Promise<void> {
    await this.workspace.deployWorkspace(templateDir);
  }

  async readStatus(): Promise<Status> {
    return this.workspace.readStatus();
  }

  async writeStatus(status: Status): Promise<void> {
    await this.workspace.writeStatus(status);
  }

  async readSeed(): Promise<Seed> {
    return this.workspace.readSeed();
  }

  async writeSeed(seed: Seed): Promise<void> {
    await this.workspace.writeSeed(seed);
  }

  async writeDynamics(dynamicsMd: string): Promise<void> {
    await this.workspace.writeDynamics(dynamicsMd);
  }

  async readDynamics(): Promise<string> {
    return this.workspace.readDynamics();
  }

  async writeReversals(content: string): Promise<void> {
    await this.workspace.writeReversals(content);
  }

  async readReversals(): Promise<string> {
    return this.workspace.readReversals();
  }

  async writeCoexist(content: string): Promise<void> {
    await this.workspace.writeCoexist(content);
  }

  async readCoexist(): Promise<string> {
    return this.workspace.readCoexist();
  }
}
