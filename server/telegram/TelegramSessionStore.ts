import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface TelegramChatSessionState {
  active: boolean;
  activeAgentSlug: string;
  sessionId: string | null;
  updatedAt: string;
}

interface TelegramSessionFile {
  chats: Record<string, TelegramChatSessionState>;
  version: 2;
}

const LEGACY_CHAT_KEY = "__legacy__";

export class TelegramSessionStore {
  private readonly filePath: string;

  public constructor(repoRoot: string) {
    this.filePath = path.join(repoRoot, ".acoo", "telegram", "session.json");
  }

  public async load(chatId: number): Promise<TelegramChatSessionState> {
    const key = String(chatId);
    const file = await this.loadFile();
    if (!file.chats[key] && file.chats[LEGACY_CHAT_KEY]) {
      file.chats[key] = normalizeChatState(file.chats[LEGACY_CHAT_KEY]);
      delete file.chats[LEGACY_CHAT_KEY];
      await this.saveFile(file);
    }
    return normalizeChatState(file.chats[key]);
  }

  public async loadAll(): Promise<Record<string, TelegramChatSessionState>> {
    const file = await this.loadFile();
    return Object.fromEntries(
      Object.entries(file.chats)
        .filter(([chatId]) => chatId !== LEGACY_CHAT_KEY)
        .map(([chatId, state]) => [chatId, normalizeChatState(state)]),
    );
  }

  public async start(chatId: number): Promise<TelegramChatSessionState> {
    return this.update(chatId, (current) => ({
      ...current,
      active: true,
      updatedAt: new Date().toISOString(),
    }));
  }

  public async end(chatId: number): Promise<TelegramChatSessionState> {
    return this.update(chatId, (current) => ({
      ...current,
      active: false,
      updatedAt: new Date().toISOString(),
    }));
  }

  public async startNew(chatId: number): Promise<TelegramChatSessionState> {
    return this.update(chatId, (current) => ({
      active: true,
      activeAgentSlug: current.activeAgentSlug,
      sessionId: null,
      updatedAt: new Date().toISOString(),
    }));
  }

  public async switchAgent(
    chatId: number,
    activeAgentSlug: string,
    options?: { preserveActive?: boolean },
  ): Promise<TelegramChatSessionState> {
    return this.update(chatId, (current) => ({
      ...current,
      active: options?.preserveActive ?? current.active,
      activeAgentSlug,
      sessionId: null,
      updatedAt: new Date().toISOString(),
    }));
  }

  public async attachSession(chatId: number, sessionId: string): Promise<TelegramChatSessionState> {
    return this.update(chatId, (current) => ({
      active: true,
      activeAgentSlug: current.activeAgentSlug,
      sessionId,
      updatedAt: new Date().toISOString(),
    }));
  }

  public async resumeSession(
    chatId: number,
    activeAgentSlug: string,
    sessionId: string,
  ): Promise<TelegramChatSessionState> {
    return this.update(chatId, () => ({
      active: true,
      activeAgentSlug,
      sessionId,
      updatedAt: new Date().toISOString(),
    }));
  }

  public async getSummary(): Promise<{
    activeChats: number;
    latestActiveAgentSlug: string | null;
    latestSessionId: string | null;
    latestUpdatedAt: string | null;
    totalChats: number;
  }> {
    const chats = Object.values(await this.loadAll());
    const sorted = [...chats].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const latest = sorted[0] ?? null;
    return {
      activeChats: chats.filter((chat) => chat.active).length,
      latestActiveAgentSlug: latest?.activeAgentSlug ?? null,
      latestSessionId: latest?.sessionId ?? null,
      latestUpdatedAt: latest?.updatedAt ?? null,
      totalChats: chats.length,
    };
  }

  private async update(
    chatId: number,
    updater: (current: TelegramChatSessionState) => TelegramChatSessionState,
  ): Promise<TelegramChatSessionState> {
    const file = await this.loadFile();
    const key = String(chatId);
    if (!file.chats[key] && file.chats[LEGACY_CHAT_KEY]) {
      file.chats[key] = normalizeChatState(file.chats[LEGACY_CHAT_KEY]);
      delete file.chats[LEGACY_CHAT_KEY];
    }
    const next = normalizeChatState(updater(normalizeChatState(file.chats[key])));
    file.chats[key] = next;
    await this.saveFile(file);
    return next;
  }

  private async loadFile(): Promise<TelegramSessionFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<TelegramSessionFile & TelegramChatSessionState>;
      if (parsed.version === 2 && parsed.chats && typeof parsed.chats === "object") {
        return {
          version: 2,
          chats: parsed.chats,
        };
      }

      if ("active" in parsed || "activeAgentSlug" in parsed || "sessionId" in parsed || "updatedAt" in parsed) {
        return {
          version: 2,
          chats: {
            [LEGACY_CHAT_KEY]: normalizeChatState(parsed),
          },
        };
      }

      return {
        version: 2,
        chats: {},
      };
    } catch {
      return {
        version: 2,
        chats: {},
      };
    }
  }

  private async saveFile(file: TelegramSessionFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(file, null, 2), "utf8");
  }
}

function normalizeChatState(input: Partial<TelegramChatSessionState> | undefined): TelegramChatSessionState {
  return {
    active: input?.active === true,
    activeAgentSlug:
      typeof input?.activeAgentSlug === "string" && input.activeAgentSlug.trim()
        ? input.activeAgentSlug.trim()
        : "coo",
    sessionId: typeof input?.sessionId === "string" && input.sessionId.trim() ? input.sessionId : null,
    updatedAt:
      typeof input?.updatedAt === "string" && input.updatedAt.trim()
        ? input.updatedAt
        : new Date().toISOString(),
  };
}
