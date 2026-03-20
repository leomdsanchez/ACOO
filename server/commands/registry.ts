import { createOperationalRuntime } from "../bootstrap.js";
import { operationalRegistryBlueprint } from "../domain/OperationalRegistryBlueprint.js";

interface ParsedArgs {
  flags: Set<string>;
  positionals: string[];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [command = "blueprint"] = args.positionals;
  const runtime = createOperationalRuntime();

  switch (command) {
    case "blueprint": {
      if (args.flags.has("--json")) {
        process.stdout.write(`${JSON.stringify(operationalRegistryBlueprint, null, 2)}\n`);
        return;
      }

      process.stdout.write(renderBlueprintText());
      return;
    }
    case "summary": {
      const summary = await runtime.operationalRegistry.getSummary();
      return writeOutput(args, summary, (value) => [
        `agents=${value.agents} projects=${value.projects} people=${value.people} threads=${value.threads} tasks=${value.tasks}`,
      ]);
    }
    case "projects": {
      const projects = await runtime.operationalRegistry.listProjects();
      return writeOutput(args, projects, (items) =>
        items.map((item) =>
          `${item.slug} | ${item.status} | threads=${item.threadCount} | tasks=${item.taskCount}`,
        ),
      );
    }
    case "people": {
      const people = await runtime.operationalRegistry.listPeople();
      return writeOutput(args, people, (items) =>
        items.map((item) => `${item.name} | company=${item.company ?? "-"} | contacts=${item.contacts.length}`),
      );
    }
    case "threads": {
      const threads = await runtime.operationalRegistry.listThreads();
      return writeOutput(args, threads, (items) =>
        items.map((item) =>
          `${item.slug} | ${item.status} | project=${item.project?.slug ?? "-"} | people=${item.people.length} | logs=${item.logCount}`,
        ),
      );
    }
    case "tasks": {
      const tasks = await runtime.operationalRegistry.listTasks();
      return writeOutput(args, tasks, (items) =>
        items.map((item) =>
          `${item.slug} | ${item.status} | project=${item.project?.slug ?? "-"} | thread=${item.thread?.slug ?? "-"} | logs=${item.logCount}`,
        ),
      );
    }
    default:
      throw new Error("Usage: npm run server:registry -- [blueprint|summary|projects|people|threads|tasks] [--json]");
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (const token of argv) {
    if (token.startsWith("--")) {
      flags.add(token);
      continue;
    }

    positionals.push(token);
  }

  return { flags, positionals };
}

function renderBlueprintText(): string {
  const lines: string[] = [];

  lines.push(`${operationalRegistryBlueprint.name} (${operationalRegistryBlueprint.version})`);
  lines.push(`source-of-truth: ${operationalRegistryBlueprint.sourceOfTruth}`);
  lines.push(`initial-surface: ${operationalRegistryBlueprint.initialSurface.kind}`);
  lines.push("");
  lines.push("statuses:");
  for (const [key, values] of Object.entries(operationalRegistryBlueprint.statuses)) {
    lines.push(`- ${key}: ${values.join(", ")}`);
  }
  lines.push("");
  lines.push("entities:");
  for (const [name, entity] of Object.entries(operationalRegistryBlueprint.entities)) {
    lines.push(`- ${name}: ${entity.fields.join(", ")}`);
  }
  lines.push("");
  lines.push("deferred-decisions:");
  for (const item of operationalRegistryBlueprint.deferredDecisions) {
    lines.push(`- ${item}`);
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function writeOutput<T>(
  args: ParsedArgs,
  value: T,
  formatLines: (value: T) => string[],
): void {
  if (args.flags.has("--json")) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${formatLines(value).join("\n")}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
