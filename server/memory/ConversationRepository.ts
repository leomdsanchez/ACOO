import type { AgentMessage } from "../llm/LlmProvider.js";

export interface ConversationRecord {
  conversationId: string;
  messages: AgentMessage[];
  updatedAt: string;
}

export interface ConversationRepository {
  getConversation(conversationId: string): Promise<ConversationRecord>;
  saveConversation(record: ConversationRecord): Promise<void>;
}
