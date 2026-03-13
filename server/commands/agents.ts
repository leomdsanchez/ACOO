import { createOperationalRuntime } from "../bootstrap.js";
import type { CreateAgentInput, UpdateAgentInput } from "../domain/models.js";

interface ParsedArgs {
  flags: Set<string>;
  positionals: string[];
  values: Map<string, string>;
}

const APPROVAL_POLICIES = new Set(["untrusted", "on-failure", "on-request", "never"]);
const REASONING_EFFORTS = new Set(["low", "medium", "high", "xhigh"]);
const ROLES = new Set(["primary", "specialist", "automation"]);
const SANDBOX_MODES = new Set(["read-only", "workspace-write", "danger-full-access"]);
const STATUSES = new Set(["active", "disabled", "archived"]);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [command = "list", ...rest] = args.positionals;
  const runtime = createOperationalRuntime();
  const registry = runtime.agentRegistry;
  const loadedSkills = await runtime.skills.loader.loadAll();
  const availableSkillIds = new Set(loadedSkills.map((skill) => skill.id));

  switch (command) {
    case "list": {
      const agents = await registry.listAgents({
        includeDisabled: args.flags.has("--all"),
      });
      writeOutput(args, agents, (items) => items.map((agent) =>
        `${agent.slug} | ${agent.displayName} | ${agent.role} | ${agent.status} | mcp=${agent.mcpProfileId}`,
      ));
      return;
    }
    case "get": {
      const slug = rest[0];
      if (!slug) {
        throw new Error("Usage: npm run server:agents -- get <slug> [--json]");
      }
      const agent = await registry.getAgentBySlug(slug);
      if (!agent) {
        throw new Error(`Agent slug "${slug}" is not registered.`);
      }
      writeOutput(args, agent, (item) => [
        `${item.slug} | ${item.displayName} | ${item.role} | ${item.status}`,
        `mcp=${item.mcpProfileId} | model=${item.model ?? "default"} | reasoning=${item.reasoningEffort} | approval=${item.approvalPolicy} | sandbox=${item.sandboxMode} | search=${item.searchEnabled ? "on" : "off"}`,
      ]);
      return;
    }
    case "create": {
      const input = readAgentMutationInput(args, true);
      validateSkillIds(input.skillIds ?? [], availableSkillIds);
      const created = await registry.createAgent(input);
      writeOutput(args, created, (item) => [`created ${item.slug} (${item.displayName})`]);
      return;
    }
    case "update": {
      const input = readAgentMutationInput(args, false);
      if (input.skillIds) {
        validateSkillIds(input.skillIds, availableSkillIds);
      }
      const updated = await registry.updateAgent(input);
      writeOutput(args, updated, (item) => [`updated ${item.slug} (${item.displayName})`]);
      return;
    }
    case "disable": {
      const slug = readRequiredValue(args.values, "--slug");
      const disabled = await registry.disableAgent(slug);
      writeOutput(args, disabled, (item) => [`disabled ${item.slug} (${item.displayName})`]);
      return;
    }
    case "profiles": {
      const profiles = await registry.listMcpProfiles();
      writeOutput(args, profiles, (items) => items.map((profile) =>
        `${profile.id} | ${profile.name} | required=${profile.required.join(",") || "-"} | optional=${profile.optional.join(",") || "-"} | blocked=${profile.blocked.join(",") || "-"}`,
      ));
      return;
    }
    case "skills": {
      writeOutput(args, loadedSkills, (items) => items.map((skill) =>
        `${skill.id} | ${skill.name} | ${skill.sourcePath}`,
      ));
      return;
    }
    default:
      throw new Error(
        "Usage: npm run server:agents -- <list|get|create|update|disable|profiles|skills> [options]",
      );
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.add(token);
      continue;
    }

    values.set(token, next);
    index += 1;
  }

  return { flags, positionals, values };
}

function readAgentMutationInput(args: ParsedArgs, requireAll: true): CreateAgentInput;
function readAgentMutationInput(args: ParsedArgs, requireAll: false): UpdateAgentInput;
function readAgentMutationInput(args: ParsedArgs, requireAll: boolean): CreateAgentInput | UpdateAgentInput {
  const slug = readRequiredValue(args.values, "--slug");
  const maybe = (flag: string) => args.values.get(flag);

  if (requireAll) {
    return {
      approvalPolicy: parseEnum<CreateAgentInput["approvalPolicy"]>(maybe("--approval"), APPROVAL_POLICIES, "--approval"),
      description: readRequiredValue(args.values, "--description"),
      displayName: readRequiredValue(args.values, "--name"),
      mcpProfileId: readRequiredValue(args.values, "--mcp-profile"),
      model: maybe("--model") ?? null,
      promptInline: maybe("--prompt-inline") ?? null,
      promptTemplatePath: maybe("--prompt-template") ?? null,
      reasoningEffort: parseEnum<CreateAgentInput["reasoningEffort"]>(maybe("--reasoning"), REASONING_EFFORTS, "--reasoning"),
      role: parseRequiredEnum<CreateAgentInput["role"]>(readRequiredValue(args.values, "--role"), ROLES, "--role"),
      sandboxMode: parseEnum<CreateAgentInput["sandboxMode"]>(maybe("--sandbox"), SANDBOX_MODES, "--sandbox"),
      searchEnabled: parseBoolean(maybe("--search")),
      skillIds: parseCsvList(maybe("--skills")),
      slug,
      status: parseEnum<CreateAgentInput["status"]>(maybe("--status"), STATUSES, "--status"),
    };
  }

  return {
    approvalPolicy: parseEnum<UpdateAgentInput["approvalPolicy"]>(maybe("--approval"), APPROVAL_POLICIES, "--approval"),
    description: maybe("--description"),
    displayName: maybe("--name"),
    mcpProfileId: maybe("--mcp-profile"),
    model: args.values.has("--model") ? maybe("--model") ?? null : undefined,
    promptInline: args.values.has("--prompt-inline") ? maybe("--prompt-inline") ?? null : undefined,
    promptTemplatePath: args.values.has("--prompt-template") ? maybe("--prompt-template") ?? null : undefined,
    reasoningEffort: parseEnum<UpdateAgentInput["reasoningEffort"]>(maybe("--reasoning"), REASONING_EFFORTS, "--reasoning"),
    role: parseEnum<UpdateAgentInput["role"]>(maybe("--role"), ROLES, "--role"),
    sandboxMode: parseEnum<UpdateAgentInput["sandboxMode"]>(maybe("--sandbox"), SANDBOX_MODES, "--sandbox"),
    searchEnabled: args.values.has("--search") ? parseBoolean(maybe("--search")) : undefined,
    skillIds: args.values.has("--skills") ? parseCsvList(maybe("--skills")) : undefined,
    slug,
    status: parseEnum<UpdateAgentInput["status"]>(maybe("--status"), STATUSES, "--status"),
  };
}

function readRequiredValue(values: Map<string, string>, flag: string): string {
  const value = values.get(flag)?.trim();
  if (!value) {
    throw new Error(`Missing required flag ${flag}.`);
  }
  return value;
}

function parseCsvList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(raw: string | undefined): boolean | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  throw new Error(`Boolean flag value "${raw}" is invalid. Use true or false.`);
}

function parseEnum<T extends string | undefined>(
  raw: string | undefined,
  allowed: Set<string>,
  flag: string,
): T | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (!allowed.has(raw)) {
    throw new Error(`Value "${raw}" is invalid for ${flag}.`);
  }

  return raw as T;
}

function parseRequiredEnum<T extends string | undefined>(raw: string, allowed: Set<string>, flag: string): T {
  const value = parseEnum<T>(raw, allowed, flag);
  if (!value) {
    throw new Error(`Missing required flag ${flag}.`);
  }
  return value;
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

function validateSkillIds(skillIds: string[], availableSkillIds: Set<string>): void {
  const missing = skillIds.filter((skillId) => !availableSkillIds.has(skillId));
  if (missing.length === 0) {
    return;
  }

  throw new Error(`Unknown skillIds: ${missing.join(", ")}.`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
