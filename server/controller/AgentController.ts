import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentRegistryService } from "../agents/AgentRegistryService.js";
import type { AgentRecord } from "../domain/models.js";
import type { OperationalContextService } from "../context/OperationalContextService.js";
import type { AgentEngine } from "../engine/AgentEngine.js";
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
    private readonly engine: AgentEngine,
    private readonly contextService: OperationalContextService,
    private readonly skillLoader: SkillLoader,
    private readonly skillRouter: SkillRouter,
    private readonly skillExecutor: SkillExecutor,
  ) {}

  public async handle(request: AgentRequest): Promise<AgentResponse> {
    const interaction = resolveInteractionContext(request.interaction);
    const activeAgent = await this.resolveActiveAgent(request.agentSlug);
    const [skills, operationalContext, promptOverlay] = await Promise.all([
      this.skillLoader.loadAll(),
      this.contextService.build(request.prompt, request.preferredThreadSlugs, interaction),
      this.buildAgentPromptOverlay(activeAgent, request.cwd ?? process.cwd()),
    ]);

    const availableSkills = filterSkillsForAgent(skills, activeAgent);
    const activeSkill = await this.skillRouter.chooseSkill(request.prompt, availableSkills);
    const skillContext = this.skillExecutor.buildSkillContext(activeSkill);
    const result = await this.engine.run({
      cwd: request.cwd ?? process.cwd(),
      ephemeral: request.ephemeral,
      prompt: [promptOverlay, skillContext, operationalContext, request.prompt].filter(Boolean).join("\n\n"),
      resumeLast: request.resumeLast,
      sessionId: request.sessionId,
    });

    return {
      activeAgentName: activeAgent?.displayName ?? null,
      activeAgentSlug: activeAgent?.slug ?? null,
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

  private async resolveActiveAgent(agentSlug: string | undefined): Promise<AgentRecord | null> {
    const slug = agentSlug?.trim() || "coo";
    const agent = await this.agentRegistry.getAgentBySlug(slug);
    if (!agent && agentSlug?.trim()) {
      throw new Error(`Agent slug "${slug}" is not registered.`);
    }
    return agent;
  }

  private async buildAgentPromptOverlay(
    agent: AgentRecord | null,
    cwd: string,
  ): Promise<string | null> {
    if (!agent) {
      return null;
    }

    const sections = [
      `Agente ativo: ${agent.displayName} (${agent.slug})`,
      agent.description.trim(),
      agent.promptInline?.trim() ?? "",
    ].filter(Boolean);

    if (agent.promptTemplatePath) {
      const templatePath = path.isAbsolute(agent.promptTemplatePath)
        ? agent.promptTemplatePath
        : path.join(cwd, agent.promptTemplatePath);
      try {
        const promptTemplate = await readFile(templatePath, "utf8");
        sections.push(promptTemplate.trim());
      } catch {
        sections.push(`Prompt template esperado em ${agent.promptTemplatePath}, mas o arquivo nao foi lido.`);
      }
    }

    return sections.length > 0 ? sections.join("\n\n") : null;
  }
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

function filterSkillsForAgent<T extends { id: string }>(skills: T[], agent: AgentRecord | null): T[] {
  if (!agent || agent.skillIds.length === 0) {
    return skills;
  }

  const allowed = new Set(agent.skillIds);
  return skills.filter((skill) => allowed.has(skill.id));
}
