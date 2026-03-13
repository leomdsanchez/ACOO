import type { AgentRegistryService } from "../agents/AgentRegistryService.js";
import type { AgentMcpProfileRecord, AgentRecord } from "../domain/models.js";
import type { CodexCliService } from "../codex/CodexCliService.js";

export interface McpPolicyEvaluation {
  blockedConfigured: string[];
  configuredOptional: string[];
  configuredRequired: string[];
  missingRequired: string[];
  profile: AgentMcpProfileRecord | null;
}

export class McpPolicyEvaluator {
  public constructor(
    private readonly agentRegistry: AgentRegistryService,
    private readonly codex: CodexCliService,
  ) {}

  public async evaluate(agent: AgentRecord | null): Promise<McpPolicyEvaluation> {
    if (!agent) {
      return emptyEvaluation();
    }

    const profile = await this.agentRegistry.getMcpProfileById(agent.mcpProfileId);
    if (!profile) {
      throw new Error(
        `Agent "${agent.slug}" references missing MCP profile "${agent.mcpProfileId}".`,
      );
    }

    const configuredNames = new Set((await this.codex.listMcpServers()).map((server) => server.name));

    return {
      blockedConfigured: profile.blocked.filter((name) => configuredNames.has(name)).sort(),
      configuredOptional: profile.optional.filter((name) => configuredNames.has(name)).sort(),
      configuredRequired: profile.required.filter((name) => configuredNames.has(name)).sort(),
      missingRequired: profile.required.filter((name) => !configuredNames.has(name)).sort(),
      profile,
    };
  }
}

function emptyEvaluation(): McpPolicyEvaluation {
  return {
    blockedConfigured: [],
    configuredOptional: [],
    configuredRequired: [],
    missingRequired: [],
    profile: null,
  };
}
