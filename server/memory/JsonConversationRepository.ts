import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConversationRecord, ConversationRepository } from "./ConversationRepository.js";

export class JsonConversationRepository implements ConversationRepository {
  public constructor(private readonly filePath: string) {}

  public async getConversation(conversationId: string): Promise<ConversationRecord> {
    const records = await this.readAll();
    return (
      records.find((record) => record.conversationId === conversationId) ?? {
        conversationId,
        messages: [],
        updatedAt: new Date().toISOString(),
      }
    );
  }

  public async saveConversation(record: ConversationRecord): Promise<void> {
    const records = await this.readAll();
    const next = records.filter((item) => item.conversationId !== record.conversationId);
    next.push({
      ...record,
      updatedAt: new Date().toISOString(),
    });

    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }

  private async readAll(): Promise<ConversationRecord[]> {
    try {
      const content = await readFile(this.filePath, "utf8");
      return JSON.parse(content) as ConversationRecord[];
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }
}
