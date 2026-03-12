import type { OperationalContextService } from "../context/OperationalContextService.js";
import type { AgentEngine } from "../engine/AgentEngine.js";
import type { SkillLoader } from "../skills/SkillLoader.js";
import type { SkillRouter } from "../skills/SkillRouter.js";
import type { SkillExecutor } from "../skills/SkillExecutor.js";

export interface AgentRequest {
  cwd?: string;
  prompt: string;
  preferredThreadSlugs?: string[];
  resumeLast?: boolean;
  sessionId?: string;
}

export interface AgentResponse {
  answer: string;
  activeSkill: string | null;
  command: string;
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
    const [skills, operationalContext] = await Promise.all([
      this.skillLoader.loadAll(),
      this.contextService.build(request.prompt, request.preferredThreadSlugs),
    ]);

    const activeSkill = await this.skillRouter.chooseSkill(request.prompt, skills);
    const skillContext = this.skillExecutor.buildSkillContext(activeSkill);
    const result = await this.engine.run({
      cwd: request.cwd ?? process.cwd(),
      prompt: [skillContext, operationalContext, request.prompt].filter(Boolean).join("\n\n"),
      resumeLast: request.resumeLast,
      sessionId: request.sessionId,
    });

    return {
      answer: result.lastMessage || result.stdout || "Codex CLI executada sem mensagem final capturada.",
      activeSkill: activeSkill?.name ?? null,
      command: result.command,
      operationalContext,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  }
}
