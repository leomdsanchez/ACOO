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
  answer: string;
  activeSkill: string | null;
  command: string;
  delivery: AgentDeliveryHints;
  operationalContext: string;
  stderr: string;
  stdout: string;
}

export class AgentController {
  public constructor(
    private readonly engine: AgentEngine,
    private readonly contextService: OperationalContextService,
    private readonly skillLoader: SkillLoader,
    private readonly skillRouter: SkillRouter,
    private readonly skillExecutor: SkillExecutor,
  ) {}

  public async handle(request: AgentRequest): Promise<AgentResponse> {
    const interaction = resolveInteractionContext(request.interaction);
    const [skills, operationalContext] = await Promise.all([
      this.skillLoader.loadAll(),
      this.contextService.build(request.prompt, request.preferredThreadSlugs, interaction),
    ]);

    const activeSkill = await this.skillRouter.chooseSkill(request.prompt, skills);
    const skillContext = this.skillExecutor.buildSkillContext(activeSkill);
    const result = await this.engine.run({
      cwd: request.cwd ?? process.cwd(),
      ephemeral: request.ephemeral,
      prompt: [skillContext, operationalContext, request.prompt].filter(Boolean).join("\n\n"),
      resumeLast: request.resumeLast,
      sessionId: request.sessionId,
    });

    return {
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
    };
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
