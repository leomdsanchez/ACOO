import { createOperationalRuntime } from "../bootstrap.js";
import { runPlaywrightDoctor as executePlaywrightDoctor } from "../mcp/PlaywrightDoctorRunner.js";
import { parseFlagArgs } from "./shared.js";

async function main() {
  const args = parseFlagArgs(process.argv.slice(2));
  if (args.positionals[0] === "doctor" && args.positionals[1] === "playwright") {
    await runPlaywrightDoctor(args.flags.has("--pretty"));
    return;
  }

  const runtime = createOperationalRuntime();
  const cliStatus = await runtime.codex.getStatus();
  const snapshot = runtime.mcpRegistry.getSnapshot(cliStatus);

  if (args.flags.has("--pretty")) {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }

  const lines = [
    "Configured MCP integrations:",
    ...snapshot.configured.map((server) => `- ${server.name} [${server.scope}] ${server.status}`),
    "",
    "Supported catalog:",
    ...snapshot.catalog.map(
      (integration) =>
        `- ${integration.name}: ${integration.configured ? "configured" : "available to add"}${integration.recommended ? " (recommended)" : ""}`,
    ),
  ];

  if (snapshot.recommendedMissing.length > 0) {
    lines.push("", "Recommended but not configured:");
    lines.push(...snapshot.recommendedMissing.map((name) => `- ${name}`));
  }

  if (snapshot.configuredUnknown.length > 0) {
    lines.push("", "Configured custom MCP integrations:");
    lines.push(...snapshot.configuredUnknown.map((server) => `- ${server.name} [${server.scope}]`));
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

async function runPlaywrightDoctor(pretty: boolean) {
  const result = await executePlaywrightDoctor(process.cwd());
  process.stdout.write(`${JSON.stringify(result.payload, null, pretty ? 2 : 0)}\n`);
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exitCode = result.exitCode;
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
