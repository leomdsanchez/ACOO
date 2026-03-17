import type { AgentRegistryService } from "../agents/AgentRegistryService.js";
import type { AgentPromptLoader } from "../agents/AgentPromptLoader.js";
import type { AgentSessionStarter } from "../agents/AgentSessionStarter.js";
import { resolveOperationalActiveAgent } from "../agents/OperationalAgentSelector.js";
import {
  applyMcpPolicyToExecutionProfile,
  buildAgentExecutionProfile,
  disableMcpServersForRun,
  ensureAgentCanRun,
  renderAgentRuntimeSummary,
} from "../agents/AgentRuntimeProfile.js";
import type { McpPolicyEvaluation, McpPolicyEvaluator } from "../mcp/McpPolicyEvaluator.js";
import type { AgentRecord } from "../domain/models.js";
import type { OperationalContextService } from "../context/OperationalContextService.js";
import type { AgentEngine } from "../engine/AgentEngine.js";
import { ManagedRuntimeUnavailableError } from "../mcp/ManagedRuntimeUnavailableError.js";
import type { SkillLoader } from "../skills/SkillLoader.js";
import type { SkillRouter } from "../skills/SkillRouter.js";
import type { SkillExecutor } from "../skills/SkillExecutor.js";

export type AgentInputMode = "text" | "voice" | "document";
export type AgentOutputMode = "auto" | "text" | "audio" | "file";
export type AgentChannel = "cli" | "telegram";

export interface AgentInteractionContext {
  channel: AgentChannel;
  inputMode: AgentInputMode;
  requestedOutputMode: AgentOutputMode;
  senderId?: string;
}

export interface AgentRequest {
  agentSlug?: string;
  abortSignal?: AbortSignal;
  cwd?: string;
  ephemeral?: boolean;
  interaction?: Partial<AgentInteractionContext>;
  prompt: string;
  preferredThreadSlugs?: string[];
  resumeLast?: boolean;
  sessionId?: string;
}

export interface AgentDeliveryHints {
  requestedOutputMode: AgentOutputMode;
  sourceChannel: AgentChannel;
}

export interface AgentResponse {
  activeAgentName: string | null;
  activeAgentSlug: string | null;
  answer: string;
  activeSkill: string | null;
  command: string;
  delivery: AgentDeliveryHints;
  operationalContext: string;
  stderr: string;
  stdout: string;
  threadId: string | null;
}

export class AgentController {
  public constructor(
    private readonly agentRegistry: AgentRegistryService,
    private readonly agentPromptLoader: AgentPromptLoader,
    private readonly agentSessionStarter: AgentSessionStarter,
    private readonly mcpPolicyEvaluator: McpPolicyEvaluator,
    private readonly engine: AgentEngine,
    private readonly contextService: OperationalContextService,
    private readonly skillLoader: SkillLoader,
    private readonly skillRouter: SkillRouter,
    private readonly skillExecutor: SkillExecutor,
    private readonly defaultAgentSlug: string,
  ) {}

  public async handle(request: AgentRequest): Promise<AgentResponse> {
    const interaction = resolveInteractionContext(request.interaction);
    const activeAgent = await this.resolveActiveAgent(request.agentSlug);
    const [skills, operationalContext, mcpPolicy] = await Promise.all([
      this.skillLoader.loadAll(),
      this.contextService.build(request.prompt, request.preferredThreadSlugs, interaction),
      this.mcpPolicyEvaluator.evaluate(activeAgent),
    ]);
    ensureAgentCanRun(activeAgent, mcpPolicy);
    const promptOverlay = await this.buildAgentPromptOverlay(
      activeAgent,
      mcpPolicy,
      request.cwd ?? process.cwd(),
    );

    const availableSkills = filterSkillsForAgent(skills, activeAgent);
    const activeSkill = await this.skillRouter.chooseSkill(request.prompt, availableSkills);
    const skillContext = this.skillExecutor.buildSkillContext(activeSkill);
    let executionProfile = applyMcpPolicyToExecutionProfile(
      buildAgentExecutionProfile(activeAgent),
      mcpPolicy,
    );
    let runtimeRecoveryContext: string | null = null;
    try {
      await this.agentSessionStarter.prepare(activeSkill, mcpPolicy, request.prompt);
    } catch (error) {
      if (error instanceof ManagedRuntimeUnavailableError) {
        executionProfile = disableMcpServersForRun(executionProfile, error.runtimeNames);
        runtimeRecoveryContext = buildRuntimeRecoveryContext(error);
      } else {
        throw error;
      }
    }
    const result = await this.engine.run({
      abortSignal: request.abortSignal,
      cwd: request.cwd ?? process.cwd(),
      ephemeral: request.ephemeral,
      executionProfile,
      prompt: [
        promptOverlay,
        skillContext,
        runtimeRecoveryContext,
        operationalContext,
        request.prompt,
      ]
        .filter(Boolean)
        .join("\n\n"),
      resumeLast: request.resumeLast,
      sessionId: request.sessionId,
    });

    return {
      activeAgentName: activeAgent.displayName,
      activeAgentSlug: activeAgent.slug,
      answer: result.lastMessage || result.stdout || "Codex CLI executada sem mensagem final capturada.",
      activeSkill: activeSkill?.name ?? null,
      command: result.command,
      delivery: {
        requestedOutputMode: interaction.requestedOutputMode,
        sourceChannel: interaction.channel,
      },
      operationalContext,
      stderr: result.stderr,
      stdout: result.stdout,
      threadId: result.threadId,
    };
  }

  private async resolveActiveAgent(agentSlug: string | undefined): Promise<AgentRecord> {
    const explicitSlug = agentSlug?.trim();
    if (explicitSlug) {
      const explicitAgent = await this.agentRegistry.getActiveAgentBySlug(explicitSlug);
      if (!explicitAgent) {
        throw new Error(`Agent slug "${explicitSlug}" is not active in the registry.`);
      }
      return explicitAgent;
    }

    const { agent } = await resolveOperationalActiveAgent(this.agentRegistry, {
      defaultAgentSlug: this.defaultAgentSlug,
    });
    return agent;
  }

  private async buildAgentPromptOverlay(
    agent: AgentRecord,
    mcpPolicy: McpPolicyEvaluation,
    cwd: string,
  ): Promise<string | null> {
    const promptTemplate = await this.agentPromptLoader.load(agent, cwd);
    const sections = [
      `Agente ativo: ${agent.displayName} (${agent.slug})`,
      agent.description.trim(),
      ...renderAgentRuntimeSummary(agent, mcpPolicy),
      agent.promptInline?.trim() ?? "",
      promptTemplate,
    ].filter(Boolean);

    return sections.length > 0 ? sections.join("\n\n") : null;
  }
}

function buildRuntimeRecoveryContext(error: ManagedRuntimeUnavailableError): string {
  const payload = {
    code: "managed_runtime_unavailable",
    public_message: error.publicMessage,
    recoverable: true,
    runtime_names: error.runtimeNames,
    technical_message: error.message,
  };

  return [
    "SYSTEM EVENT: managed runtime unavailable before tool execution.",
    "Use the structured event below and continue this turn without using unavailable MCP runtimes.",
    "Unavailable MCP runtimes are already disabled for this run.",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "Required behavior: provide a practical fallback path, and only ask the user for action if there is no viable non-browser alternative.",
  ].join("\n");
}

function resolveInteractionContext(
  partial: Partial<AgentInteractionContext> | undefined,
): AgentInteractionContext {
  return {
    channel: partial?.channel ?? "cli",
    inputMode: partial?.inputMode ?? "text",
    requestedOutputMode: partial?.requestedOutputMode ?? "text",
    senderId: partial?.senderId,
  };
}

function filterSkillsForAgent<T extends { id: string }>(skills: T[], agent: AgentRecord): T[] {
  if (agent.skillIds.length === 0) {
    return skills;
  }

  const allowed = new Set(agent.skillIds);
  return skills.filter((skill) => allowed.has(skill.id));
}
