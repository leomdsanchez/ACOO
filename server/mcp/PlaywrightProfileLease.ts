import { existsSync } from "node:fs";
import { open, readFile, rm } from "node:fs/promises";

export class PlaywrightProfileLease {
  public constructor(
    private readonly lockPath: string,
    private readonly handle: Awaited<ReturnType<typeof open>>,
  ) {}

  public static async acquire(lockPath: string): Promise<PlaywrightProfileLease> {
    const direct = await tryOpenLease(lockPath);
    if (direct) {
      return direct;
    }

    if (existsSync(lockPath)) {
      const pid = await readLeasePid(lockPath);
      if (!isProcessAlive(pid)) {
        await rm(lockPath, { force: true }).catch(() => {});
      }
    }

    const retried = await tryOpenLease(lockPath);
    if (!retried) {
      throw new Error("Profile persistente do Playwright já está em uso por outro processo.");
    }

    return retried;
  }

  public async release(): Promise<void> {
    await this.handle.close().catch(() => {});
    await rm(this.lockPath, { force: true }).catch(() => {});
  }

  public static async inspect(lockPath: string): Promise<{
    locked: boolean;
    lockOwner: "none" | "current_process" | "other_process";
  }> {
    if (!existsSync(lockPath)) {
      return {
        locked: false,
        lockOwner: "none",
      };
    }

    const pid = await readLeasePid(lockPath);
    if (!isProcessAlive(pid)) {
      await rm(lockPath, { force: true }).catch(() => {});
      return {
        locked: false,
        lockOwner: "none",
      };
    }

    return {
      locked: true,
      lockOwner: pid === process.pid ? "current_process" : "other_process",
    };
  }
}

async function tryOpenLease(lockPath: string): Promise<PlaywrightProfileLease | null> {
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(
      JSON.stringify(
        {
          acquiredAt: new Date().toISOString(),
          pid: process.pid,
        },
        null,
        2,
      ),
      "utf-8",
    );
    return new PlaywrightProfileLease(lockPath, handle);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : null;
    if (code === "EEXIST") {
      return null;
    }
    throw error;
  }
}

async function readLeasePid(lockPath: string): Promise<number | null> {
  try {
    const raw = await readFile(lockPath, "utf-8");
    const parsed = JSON.parse(raw) as { pid?: unknown };
    return typeof parsed.pid === "number" ? parsed.pid : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number | null): boolean {
  if (!pid || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
