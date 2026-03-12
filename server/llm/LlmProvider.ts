export type AgentMessageRole = "system" | "user" | "assistant" | "tool";

export interface AgentMessage {
  role: AgentMessageRole;
  content: string;
  name?: string;
}

export interface AgentToolDescriptor {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface ToolCallDecision {
  type: "tool_call";
  toolName: string;
  toolInput: Record<string, unknown>;
  thought?: string;
}

export interface FinalDecision {
  type: "final";
  content: string;
}

export type LlmDecision = ToolCallDecision | FinalDecision;

export interface LlmCompletionRequest {
  messages: AgentMessage[];
  tools: AgentToolDescriptor[];
  skillContext?: string | null;
}

export interface LlmProvider {
  complete(request: LlmCompletionRequest): Promise<LlmDecision>;
}
