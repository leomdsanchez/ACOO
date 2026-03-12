import type { OperationalWorkspace } from "../application/services/OperationalWorkspace.js";
import type { AgentLoop } from "../engine/AgentLoop.js";
import type { MemoryManager } from "../memory/MemoryManager.js";
import type { SkillLoader } from "../skills/SkillLoader.js";
import type { SkillRouter } from "../skills/SkillRouter.js";
import type { SkillExecutor } from "../skills/SkillExecutor.js";

export interface AgentRequest {
  conversationId: string;
  prompt: string;
  preferredThreadSlugs?: string[];
}

export interface AgentResponse {
  answer: string;
  activeSkill: string | null;
  operationalContext: string;
  iterations: number;
}

export class AgentController {
  public constructor(
    private readonly engine: AgentLoop,
    private readonly memoryManager: MemoryManager,
    private readonly skillLoader: SkillLoader,
    private readonly skillRouter: SkillRouter,
    private readonly skillExecutor: SkillExecutor,
    private readonly workspace: OperationalWorkspace,
  ) {}

  public async handle(request: AgentRequest): Promise<AgentResponse> {
    const [skills, operationalContext] = await Promise.all([
      this.skillLoader.loadAll(),
      this.memoryManager.buildOperationalContext(request.prompt, request.preferredThreadSlugs),
    ]);

    const activeSkill = await this.skillRouter.chooseSkill(request.prompt, skills);
    const skillContext = this.skillExecutor.buildSkillContext(activeSkill);
    const result = await this.engine.run({
      conversationId: request.conversationId,
      prompt: [operationalContext, request.prompt].join("\n\n"),
      skillContext,
    });

    return {
      answer: result.answer,
      activeSkill: activeSkill?.name ?? null,
      operationalContext,
      iterations: result.iterations,
    };
  }

  public getWorkspace(): OperationalWorkspace {
    return this.workspace;
  }
}
