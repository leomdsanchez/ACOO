import type { CodexCliExecResult, CodexCliService } from "../codex/CodexCliService.js";

export interface AgentExecutionProfile {
  approvalPolicy?: string | null;
  model?: string | null;
  reasoningEffort?: string | null;
  sandboxMode?: string | null;
  searchEnabled?: boolean;
}

export interface AgentEngineRequest {
  cwd: string;
  executionProfile?: AgentExecutionProfile;
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
      overrides: request.executionProfile,
      prompt: request.prompt,
      resumeLast: request.resumeLast,
      sessionId: request.sessionId,
    });
  }
}
