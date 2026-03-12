import type { CodexCliMcpServer, CodexCliStatus } from "../codex/CodexCliService.js";
import { supportedMcpIntegrations } from "./manifest.js";

export interface McpRegistryStatusItem {
  category: "automation" | "finance" | "knowledge";
  configured: boolean;
  configuredServer: CodexCliMcpServer | null;
  managedBy: "codex-cli";
  name: string;
  notes: string;
  recommended: boolean;
  scope: "command" | "url" | "either";
}

export interface McpRegistrySnapshot {
  catalog: McpRegistryStatusItem[];
  configured: CodexCliMcpServer[];
  configuredUnknown: CodexCliMcpServer[];
  recommendedMissing: string[];
}

export class McpRegistryService {
  public getSnapshot(cliStatus: Pick<CodexCliStatus, "mcpServers">): McpRegistrySnapshot {
    const catalog = this.buildCatalog(cliStatus.mcpServers);
    const catalogNames = new Set(catalog.map((integration) => integration.name));

    return {
      catalog,
      configured: cliStatus.mcpServers,
      configuredUnknown: cliStatus.mcpServers.filter((server) => !catalogNames.has(server.name)),
      recommendedMissing: catalog
        .filter((item) => item.recommended && !item.configured)
        .map((item) => item.name),
    };
  }

  private buildCatalog(configuredServers: CodexCliMcpServer[]): McpRegistryStatusItem[] {
    return supportedMcpIntegrations.map((integration) => ({
      category: integration.category,
      configured: configuredServers.some((configured) => configured.name === integration.name),
      configuredServer:
        configuredServers.find((configured) => configured.name === integration.name) ?? null,
      managedBy: integration.managedBy,
      name: integration.name,
      notes: integration.notes,
      recommended: integration.recommended,
      scope: integration.scope,
    }));
  }
}
