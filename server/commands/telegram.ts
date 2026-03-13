import { createOperationalRuntime } from "../bootstrap.js";
import { TelegramRuntime } from "../telegram/TelegramRuntime.js";
import { TelegramPollingLock } from "../telegram/TelegramPollingLock.js";
import { TelegramSessionStore } from "../telegram/TelegramSessionStore.js";
import { parseFlagArgs } from "./shared.js";

async function main() {
  const args = parseFlagArgs(process.argv.slice(2));
  const runtime = createOperationalRuntime();
  const telegramConfig = runtime.config.telegram;

  if (!telegramConfig.enabled) {
    throw new Error("Telegram está desabilitado no env.");
  }

  const pollingLock = new TelegramPollingLock(runtime.config.repoRoot);

  const telegram = new TelegramRuntime({
    agentRegistry: runtime.agentRegistry,
    bot: runtime.bot,
    config: telegramConfig,
    transcription: runtime.transcription,
    sessionStore: new TelegramSessionStore(runtime.config.repoRoot),
  });

  if (args.flags.has("--status")) {
    process.stdout.write(`${JSON.stringify(await telegram.getStatus(), null, 2)}\n`);
    return;
  }

  const dropPending = args.flags.has("--drop-pending");
  const once = args.flags.has("--once");
  const usesPolling = true;
  if (usesPolling) {
    await pollingLock.acquire();
    registerPollingLockCleanup(pollingLock);
  }
  const status = await telegram.getStatus();
  process.stdout.write(
    `Telegram runtime online como @${status.botUser.username ?? status.botUser.id}. Polling iniciado.\n`,
  );

  try {
    await telegram.processPendingUpdates({ dropPending, once });
  } finally {
    if (usesPolling) {
      await pollingLock.release();
    }
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

function registerPollingLockCleanup(lock: TelegramPollingLock): void {
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    await lock.release();
  };

  process.once("SIGINT", () => {
    void cleanup().finally(() => process.exit(130));
  });
  process.once("SIGTERM", () => {
    void cleanup().finally(() => process.exit(143));
  });
  process.once("exit", () => {
    void cleanup();
  });
}
