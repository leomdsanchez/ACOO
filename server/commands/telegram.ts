import { createOperationalRuntime } from "../bootstrap.js";
import { TelegramRuntime } from "../telegram/TelegramRuntime.js";
import { TelegramSessionStore } from "../telegram/TelegramSessionStore.js";
import { parseFlagArgs } from "./shared.js";

async function main() {
  const args = parseFlagArgs(process.argv.slice(2));
  const runtime = createOperationalRuntime();
  const telegramConfig = runtime.config.telegram;

  if (!telegramConfig.enabled) {
    throw new Error("Telegram está desabilitado no env.");
  }

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
  const status = await telegram.getStatus();
  process.stdout.write(
    `Telegram runtime online como @${status.botUser.username ?? status.botUser.id}. Polling iniciado.\n`,
  );

  await telegram.processPendingUpdates({ dropPending, once });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
