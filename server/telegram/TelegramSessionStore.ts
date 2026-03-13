import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface TelegramSessionState {
  active: boolean;
  activeAgentSlug: string;
  sessionId: string | null;
  updatedAt: string;
}

export class TelegramSessionStore {
  private readonly filePath: string;

  public constructor(repoRoot: string) {
    this.filePath = path.join(repoRoot, ".acoo", "telegram", "session.json");
  }

  public async load(): Promise<TelegramSessionState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<TelegramSessionState>;
      return normalizeState(parsed);
    } catch {
      return buildEmptyState();
    }
  }

  public async start(): Promise<TelegramSessionState> {
    const current = await this.load();
    const next = {
      ...current,
      active: true,
      updatedAt: new Date().toISOString(),
    };
    await this.saveState(next);
    return next;
  }

  public async end(): Promise<TelegramSessionState> {
    const current = await this.load();
    const next = {
      ...current,
      active: false,
      updatedAt: new Date().toISOString(),
    };
    await this.saveState(next);
    return next;
  }

  public async startNew(): Promise<TelegramSessionState> {
    const current = await this.load();
    const next = {
      active: true,
      activeAgentSlug: current.activeAgentSlug,
      sessionId: null,
      updatedAt: new Date().toISOString(),
    } satisfies TelegramSessionState;
    await this.saveState(next);
    return next;
  }

  public async switchAgent(
    activeAgentSlug: string,
    options?: { preserveActive?: boolean },
  ): Promise<TelegramSessionState> {
    const current = await this.load();
    const next = {
      ...current,
      active: options?.preserveActive ?? current.active,
      activeAgentSlug,
      sessionId: null,
      updatedAt: new Date().toISOString(),
    } satisfies TelegramSessionState;
    await this.saveState(next);
    return next;
  }

  public async attachSession(sessionId: string): Promise<TelegramSessionState> {
    const current = await this.load();
    const next = {
      active: true,
      activeAgentSlug: current.activeAgentSlug,
      sessionId,
      updatedAt: new Date().toISOString(),
    } satisfies TelegramSessionState;
    await this.saveState(next);
    return next;
  }

  public async resumeSession(activeAgentSlug: string, sessionId: string): Promise<TelegramSessionState> {
    const next = {
      active: true,
      activeAgentSlug,
      sessionId,
      updatedAt: new Date().toISOString(),
    } satisfies TelegramSessionState;
    await this.saveState(next);
    return next;
  }

  private async saveState(state: TelegramSessionState): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }
}

function normalizeState(input: Partial<TelegramSessionState>): TelegramSessionState {
  return {
    active: input.active === true,
    activeAgentSlug:
      typeof input.activeAgentSlug === "string" && input.activeAgentSlug.trim()
        ? input.activeAgentSlug.trim()
        : "coo",
    sessionId: typeof input.sessionId === "string" && input.sessionId.trim() ? input.sessionId : null,
    updatedAt:
      typeof input.updatedAt === "string" && input.updatedAt.trim()
        ? input.updatedAt
        : new Date().toISOString(),
  };
}

function buildEmptyState(): TelegramSessionState {
  return {
    active: false,
    activeAgentSlug: "coo",
    sessionId: null,
    updatedAt: new Date().toISOString(),
  };
}
