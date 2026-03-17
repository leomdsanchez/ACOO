import { createOperationalRuntime } from "../bootstrap.js";
import { getUserFacingErrorMessage } from "../errors/UserFacingError.js";
import { parseFlagArgs } from "./shared.js";

async function main() {
  const args = parseFlagArgs(process.argv.slice(2));
  const prompt = args.positionals.join(" ").trim();

  if (!prompt) {
    process.stderr.write(
      "Usage: npm run server:run -- [--agent SLUG] [--cwd DIR] [--session ID | --resume-last] [--ephemeral] [--json] \"seu prompt\"\n",
    );
    process.exitCode = 1;
    return;
  }

  const runtime = createOperationalRuntime();
  const response = await runtime.bot.handleTextMessage({
    agentSlug: args.values.get("--agent") ?? undefined,
    cwd: args.values.get("--cwd") ?? process.cwd(),
    ephemeral: args.flags.has("--ephemeral"),
    interaction: {
      channel: "cli",
      inputMode: "text",
      requestedOutputMode: "text",
    },
    prompt,
    resumeLast: !args.values.has("--session") && args.flags.has("--resume-last"),
    sessionId: args.values.get("--session"),
  });

  if (args.flags.has("--json")) {
    process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${response.answer}\n`);
}

void main().catch((error) => {
  const publicMessage = getUserFacingErrorMessage(error);
  if (publicMessage) {
    process.stderr.write(`${publicMessage}\n`);
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
