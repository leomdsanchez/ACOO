import type { PlaywrightMcpRuntimeConfig } from "../config/AppConfig.js";

export interface ManagedMcpRuntimeDefinition {
  autostart: boolean;
  healthcheckUrl: string;
  name: string;
  startupCommand: string;
}

export class McpRuntimeCatalog {
  private readonly managed = new Map<string, ManagedMcpRuntimeDefinition>();

  public constructor(playwright: PlaywrightMcpRuntimeConfig) {
    this.managed.set("playwright", {
      autostart: playwright.autostart,
      healthcheckUrl: playwright.healthcheckUrl,
      name: "playwright",
      startupCommand: playwright.startupCommand,
    });
  }

  public get(name: string): ManagedMcpRuntimeDefinition | null {
    return this.managed.get(name) ?? null;
  }

  public list(): ManagedMcpRuntimeDefinition[] {
    return [...this.managed.values()];
  }
}
