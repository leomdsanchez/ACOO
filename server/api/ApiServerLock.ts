import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

interface ApiServerLockFile {
  pid: number;
  startedAt: string;
}

export class ApiServerLock {
  private readonly filePath: string;
  private released = false;

  public constructor(repoRoot: string) {
    this.filePath = path.join(repoRoot, ".acoo", "api", "server.lock.json");
  }

  public async acquire(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    const existing = await this.readLockFile();
    if (existing) {
      if (isProcessAlive(existing.pid)) {
        throw new Error(
          `API do ACOO já está ativa neste workspace (pid ${existing.pid}, iniciada em ${existing.startedAt}). Pare a instância atual antes de subir outra.`,
        );
      }
      await this.release();
    }

    const payload: ApiServerLockFile = {
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

  private async readLockFile(): Promise<ApiServerLockFile | null> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<ApiServerLockFile>;
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
