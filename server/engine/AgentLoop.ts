import type { MemoryManager } from "../memory/MemoryManager.js";
import type { AgentMessage, LlmProvider } from "../llm/LlmProvider.js";
import { ToolRegistry } from "./ToolRegistry.js";

export interface AgentLoopRequest {
  conversationId: string;
  prompt: string;
  skillContext?: string | null;
}

export interface AgentLoopResult {
  answer: string;
  iterations: number;
}

export class AgentLoop {
  public constructor(
    private readonly provider: LlmProvider,
    private readonly toolRegistry: ToolRegistry,
    private readonly memoryManager: MemoryManager,
    private readonly maxIterations = 5,
  ) {}

  public async run(request: AgentLoopRequest): Promise<AgentLoopResult> {
    const previousMessages = await this.memoryManager.getConversationMessages(request.conversationId);
    const runtimeMessages: AgentMessage[] = [
      ...previousMessages,
      { role: "user", content: request.prompt },
    ];

    for (let iteration = 1; iteration <= this.maxIterations; iteration += 1) {
      const decision = await this.provider.complete({
        messages: runtimeMessages,
        skillContext: request.skillContext,
        tools: this.toolRegistry.listTools().map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });

      if (decision.type === "final") {
        await this.memoryManager.appendMessages(request.conversationId, [
          { role: "user", content: request.prompt },
          { role: "assistant", content: decision.content },
        ]);

        return {
          answer: decision.content,
          iterations: iteration,
        };
      }

      const toolOutput = await this.toolRegistry.callTool(decision.toolName, decision.toolInput);
      runtimeMessages.push({
        role: "tool",
        name: decision.toolName,
        content: JSON.stringify(toolOutput),
      });
    }

    return {
      answer: "Limite de iterações atingido sem resposta final.",
      iterations: this.maxIterations,
    };
  }
}
