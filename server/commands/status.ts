import { createOperationalRuntime } from "../bootstrap.js";
import { parseFlagArgs } from "./shared.js";

async function main() {
  const args = parseFlagArgs(process.argv.slice(2));
  const runtime = createOperationalRuntime();
  const status = await runtime.status.getStatus();
  const output = args.flags.has("--pretty")
    ? JSON.stringify(status, null, 2)
    : JSON.stringify(status);

  process.stdout.write(`${output}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
