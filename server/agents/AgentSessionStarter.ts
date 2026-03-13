import type { McpPolicyEvaluation } from "../mcp/McpPolicyEvaluator.js";
import type { McpSessionBootstrapper } from "../mcp/McpSessionBootstrapper.js";
import type { LoadedSkill } from "../skills/Skill.js";
import type { SkillDependencyResolver } from "../skills/SkillDependencyResolver.js";

export interface AgentSessionPreparation {
  bootstrapResults: Awaited<ReturnType<McpSessionBootstrapper["ensureReady"]>>;
  requiredMcpServers: string[];
}

export class AgentSessionStarter {
  public constructor(
    private readonly bootstrapper: McpSessionBootstrapper,
    private readonly skillDependencyResolver: SkillDependencyResolver,
  ) {}

  public async prepare(
    activeSkill: LoadedSkill | null,
    mcpPolicy: McpPolicyEvaluation,
  ): Promise<AgentSessionPreparation> {
    const skillRequirements = this.skillDependencyResolver.resolveRequiredMcpServers(activeSkill);
    const missingRequirements = skillRequirements.filter((name) => !mcpPolicy.configuredNames.includes(name));
    if (missingRequirements.length > 0) {
      throw new Error(
        `Skill "${activeSkill?.id}" requires MCP integrations not configured in Codex CLI: ${missingRequirements.join(", ")}.`,
      );
    }

    const blockedRequirements = skillRequirements.filter((name) => mcpPolicy.disabledForRun.includes(name));
    if (blockedRequirements.length > 0) {
      throw new Error(
        `Skill "${activeSkill?.id}" requires MCP integrations not allowed for this agent: ${blockedRequirements.join(", ")}.`,
      );
    }

    const requiredMcpServers = [...new Set(skillRequirements)].sort();
    const bootstrapResults = await this.bootstrapper.ensureReady(requiredMcpServers);
    const manualStartRequired = bootstrapResults.filter((result) => result.managed && result.manualStartRequired);
    if (manualStartRequired.length > 0) {
      const instructions = manualStartRequired
        .map((item) => `${item.name}: ${item.startupCommand}`)
        .join("; ");
      throw new Error(`Managed MCP runtimes require manual startup before this skill can run: ${instructions}.`);
    }

    const failed = bootstrapResults.filter((result) => result.managed && !result.healthy && !result.manualStartRequired);
    if (failed.length > 0) {
      throw new Error(
        `Failed to prepare managed MCP runtimes: ${failed.map((item) => item.name).join(", ")}.`,
      );
    }

    return {
      bootstrapResults,
      requiredMcpServers,
    };
  }
}
