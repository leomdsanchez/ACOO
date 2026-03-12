import type { OperationalWorkspace } from "../application/services/OperationalWorkspace.js";
import type { AgentMessage } from "../llm/LlmProvider.js";
import type { ConversationRepository } from "./ConversationRepository.js";
import { OperationalContextAssembler } from "./OperationalContextAssembler.js";

export class MemoryManager {
  private readonly contextAssembler: OperationalContextAssembler;

  public constructor(
    private readonly repository: ConversationRepository,
    workspace: OperationalWorkspace,
  ) {
    this.contextAssembler = new OperationalContextAssembler(workspace);
  }

  public async getConversationMessages(conversationId: string): Promise<AgentMessage[]> {
    const record = await this.repository.getConversation(conversationId);
    return record.messages;
  }

  public async appendMessages(conversationId: string, messages: AgentMessage[]): Promise<void> {
    const current = await this.repository.getConversation(conversationId);
    await this.repository.saveConversation({
      conversationId,
      messages: [...current.messages, ...messages],
      updatedAt: new Date().toISOString(),
    });
  }

  public buildOperationalContext(prompt: string, preferredThreadSlugs?: string[]): Promise<string> {
    return this.contextAssembler.buildContext(prompt, preferredThreadSlugs);
  }
}
