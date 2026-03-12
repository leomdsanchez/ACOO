export interface CodexExecutionPlan {
  binary: string;
  args: string[];
  prompt: string;
  cwd: string;
  notes: string[];
}

export interface CodexRunRequest {
  prompt: string;
  cwd: string;
  contextPaths?: string[];
  toolNames?: string[];
}

export class CodexRunner {
  public constructor(private readonly binary = "codex") {}

  public createExecutionPlan(request: CodexRunRequest): CodexExecutionPlan {
    const notes = [
      "Usar sessão autenticada do Codex CLI já disponível no host.",
      "Injetar o catálogo MCP operacional antes da execução real.",
    ];

    if (request.contextPaths && request.contextPaths.length > 0) {
      notes.push(`Contextos sugeridos: ${request.contextPaths.join(", ")}`);
    }

    if (request.toolNames && request.toolNames.length > 0) {
      notes.push(`Tools sugeridas: ${request.toolNames.join(", ")}`);
    }

    return {
      binary: this.binary,
      args: [],
      prompt: request.prompt,
      cwd: request.cwd,
      notes,
    };
  }
}
