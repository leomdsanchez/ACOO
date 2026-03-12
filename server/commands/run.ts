import { createOperationalRuntime } from "../bootstrap.js";
import { parseFlagArgs } from "./shared.js";

async function main() {
  const args = parseFlagArgs(process.argv.slice(2));
  const prompt = args.positionals.join(" ").trim();

  if (!prompt) {
    process.stderr.write(
      "Usage: npm run server:run -- [--cwd DIR] [--session ID | --resume-last] [--json] \"seu prompt\"\n",
    );
    process.exitCode = 1;
    return;
  }

  const runtime = createOperationalRuntime();
  const response = await runtime.bot.handleTextMessage({
    cwd: args.values.get("--cwd") ?? process.cwd(),
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
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
