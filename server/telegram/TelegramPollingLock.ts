import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

interface TelegramPollingLockFile {
  pid: number;
  startedAt: string;
}

export class TelegramPollingLock {
  private readonly filePath: string;
  private released = false;

  public constructor(repoRoot: string) {
    this.filePath = path.join(repoRoot, ".acoo", "telegram", "polling.lock.json");
  }

  public async acquire(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    const existing = await this.readLockFile();
    if (existing) {
      if (isProcessAlive(existing.pid)) {
        throw new Error(
          `Telegram polling já está ativo neste workspace (pid ${existing.pid}, iniciado em ${existing.startedAt}). Pare o processo atual antes de subir outro consumer.`,
        );
      }
      await this.release();
    }

    const payload: TelegramPollingLockFile = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
    };
    await writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    this.released = false;
  }

  public async release(): Promise<void> {
    if (this.released) {
      return;
    }

    this.released = true;
    await rm(this.filePath, { force: true });
  }

  private async readLockFile(): Promise<TelegramPollingLockFile | null> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<TelegramPollingLockFile>;
      if (typeof parsed.pid === "number" && typeof parsed.startedAt === "string") {
        return {
          pid: parsed.pid,
          startedAt: parsed.startedAt,
        };
      }
      return null;
    } catch {
      return null;
    }
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
