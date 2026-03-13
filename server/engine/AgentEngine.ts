import type { CodexCliExecResult, CodexCliService } from "../codex/CodexCliService.js";

export interface AgentExecutionProfile {
  approvalPolicy?: string | null;
  configOverrides?: string[];
  model?: string | null;
  reasoningEffort?: string | null;
  sandboxMode?: string | null;
  searchEnabled?: boolean;
}

export interface AgentEngineRequest {
  abortSignal?: AbortSignal;
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
      abortSignal: request.abortSignal,
      cwd: request.cwd,
      ephemeral: request.ephemeral,
      overrides: request.executionProfile,
      prompt: request.prompt,
      resumeLast: request.resumeLast,
      sessionId: request.sessionId,
    });
  }
}
