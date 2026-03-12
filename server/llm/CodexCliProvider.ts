import { CodexRunner } from "../codex/CodexRunner.js";
import type {
  AgentToolDescriptor,
  FinalDecision,
  LlmCompletionRequest,
  LlmProvider,
} from "./LlmProvider.js";
import { CodexCliAuthSession } from "../interfaces/cli/CodexCliAuthSession.js";

export class CodexCliProvider implements LlmProvider {
  public constructor(
    private readonly runner: CodexRunner,
    private readonly authSession: CodexCliAuthSession,
  ) {}

  public async complete(request: LlmCompletionRequest): Promise<FinalDecision> {
    const prompt = buildPrompt(request.messages, request.tools, request.skillContext);
    const plan = this.runner.createExecutionPlan({
      prompt,
      cwd: this.authSession.getDefaultWorkingDirectory(),
      toolNames: request.tools.map((tool) => tool.name),
    });

    return {
      type: "final",
      content: [
        "Codex CLI provider preparado, mas ainda sem executor real acoplado.",
        `CLI: ${plan.binary}`,
        `Config: ${this.authSession.getConfigPath()}`,
        `Prompt chars: ${plan.prompt.length}`,
      ].join("\n"),
    };
  }
}

function buildPrompt(
  messages: LlmCompletionRequest["messages"],
  tools: AgentToolDescriptor[],
  skillContext?: string | null,
): string {
  const sections = [
    skillContext ? `## Skill Context\n${skillContext}` : null,
    `## Tools\n${tools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n")}`,
    `## Conversation\n${messages.map((message) => `[${message.role}] ${message.content}`).join("\n\n")}`,
  ];

  return sections.filter(Boolean).join("\n\n");
}
