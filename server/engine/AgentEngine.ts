import type { CodexCliExecResult, CodexCliService } from "../codex/CodexCliService.js";

export interface AgentEngineRequest {
  cwd: string;
  ephemeral?: boolean;
  prompt: string;
  resumeLast?: boolean;
  sessionId?: string;
}

export class AgentEngine {
  public constructor(private readonly codex: CodexCliService) {}

  public run(request: AgentEngineRequest): Promise<CodexCliExecResult> {
    return this.codex.run({
      cwd: request.cwd,
      ephemeral: request.ephemeral,
      prompt: request.prompt,
      resumeLast: request.resumeLast,
      sessionId: request.sessionId,
    });
  }
}
