import type { McpPolicyEvaluation } from "../mcp/McpPolicyEvaluator.js";
import type { McpSessionBootstrapper } from "../mcp/McpSessionBootstrapper.js";
import { getManagedRuntimeDoctorCommand } from "../mcp/ManagedRuntimeDoctor.js";
import { ManagedRuntimeUnavailableError } from "../mcp/ManagedRuntimeUnavailableError.js";
import type { LoadedSkill } from "../skills/Skill.js";
import type { SkillDependencyResolver } from "../skills/SkillDependencyResolver.js";
import type { McpBootstrapResult } from "../mcp/McpSessionBootstrapper.js";

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
    prompt?: string,
  ): Promise<AgentSessionPreparation> {
    const skillRequirements = this.skillDependencyResolver.resolveRequiredMcpServers(
      activeSkill,
      prompt,
    );
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
        .map((item) => {
          const doctorCommand = getManagedRuntimeDoctorCommand(item.name);
          const doctorStep = doctorCommand ? `diagnostique com "${doctorCommand}"` : "diagnostique o runtime";
          return `${item.name}: ${doctorStep}; se a sessão operacional realmente estiver ausente, inicie com "${item.startupCommand}"`;
        })
        .join("; ");
      throw new ManagedRuntimeUnavailableError(
        `Managed MCP runtimes require manual startup before this skill can run: ${instructions}.`,
        buildPublicMessage(manualStartRequired, { includeStartup: true }),
        manualStartRequired.map((item) => item.name),
      );
    }

    const failed = bootstrapResults.filter((result) => result.managed && !result.healthy && !result.manualStartRequired);
    if (failed.length > 0) {
      const instructions = failed
        .map((item) => {
          const doctorCommand = getManagedRuntimeDoctorCommand(item.name);
          return doctorCommand ? `${item.name}: ${doctorCommand}` : item.name;
        })
        .join("; ");
      throw new ManagedRuntimeUnavailableError(
        `Failed to prepare managed MCP runtimes: ${instructions}.`,
        buildPublicMessage(failed, { includeStartup: false }),
        failed.map((item) => item.name),
      );
    }

    return {
      bootstrapResults,
      requiredMcpServers,
    };
  }
}

function buildPublicMessage(
  results: McpBootstrapResult[],
  options: { includeStartup: boolean },
): string {
  const lines = results.map((item) => {
    const doctorCommand = getManagedRuntimeDoctorCommand(item.name);
    const parts = [`Runtime MCP indisponível: ${item.name}.`];
    if (doctorCommand) {
      parts.push(`Diagnostique com: ${doctorCommand}.`);
    }
    if (options.includeStartup && item.startupCommand) {
      parts.push(`Se a sessão operacional realmente estiver ausente, inicie com: ${item.startupCommand}.`);
    }
    return parts.join(" ");
  });

  return lines.join("\n");
}
