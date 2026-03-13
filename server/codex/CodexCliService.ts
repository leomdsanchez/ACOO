import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CodexCliOptions {
  approvalPolicy: string;
  binary: string;
  configPath: string;
  cwd: string;
  model?: string | null;
  reasoningEffort?: string | null;
  sandboxMode: string;
}

export interface CodexCliExecRequest {
  cwd?: string;
  ephemeral?: boolean;
  overrides?: CodexCliRunOverrides;
  prompt: string;
  resumeLast?: boolean;
  sessionId?: string;
}

export interface CodexCliRunOverrides {
  approvalPolicy?: string | null;
  configOverrides?: string[];
  model?: string | null;
  reasoningEffort?: string | null;
  sandboxMode?: string | null;
  searchEnabled?: boolean;
}

interface ResolvedRunOptions {
  approvalPolicy: string;
  configOverrides: string[];
  model: string | null;
  reasoningEffort: string | null;
  sandboxMode: string;
  searchEnabled: boolean;
}

export interface CodexCliExecResult {
  command: string;
  lastMessage: string;
  stderr: string;
  stdout: string;
  threadId: string | null;
}

export interface CodexCliMcpServer {
  auth: string;
  name: string;
  scope: "command" | "url";
  status: string;
  target: string;
}

export interface CodexCliStatus {
  authMode: string | null;
  authenticated: boolean;
  binaryPath: string | null;
  configExists: boolean;
  configPath: string;
  installed: boolean;
  loginStatus: string;
  mcpServers: CodexCliMcpServer[];
}

export class CodexCliService {
  public constructor(private readonly options: CodexCliOptions) {}

  public async getStatus(): Promise<CodexCliStatus> {
    const [binaryPath, loginStatus, mcpList, configExists] = await Promise.all([
      this.resolveBinaryPath(),
      this.safeRun(["login", "status"]),
      this.safeRun(["mcp", "list"]),
      this.checkConfigExists(),
    ]);

    const normalizedLogin = loginStatus.stdout.trim() || loginStatus.stderr.trim();
    const authMode =
      normalizedLogin.match(/Logged in using (.+)$/m)?.[1]?.trim() ?? null;

    return {
      authMode,
      authenticated: /Logged in/i.test(normalizedLogin),
      binaryPath,
      configExists,
      configPath: this.options.configPath,
      installed: binaryPath !== null,
      loginStatus: normalizedLogin || "Unavailable",
      mcpServers: parseMcpList(mcpList.stdout),
    };
  }

  public async listMcpServers(): Promise<CodexCliMcpServer[]> {
    const mcpList = await this.safeRun(["mcp", "list"]);
    return parseMcpList(mcpList.stdout);
  }

  public async run(request: CodexCliExecRequest): Promise<CodexCliExecResult> {
    await this.assertRunnable();

    const outputDir = await mkdtemp(path.join(os.tmpdir(), "acoo-codex-"));
    const outputFile = path.join(outputDir, "last-message.txt");
    const cwd = request.cwd ?? this.options.cwd;

    try {
      const args = this.buildExecArgs(request, outputFile, cwd);
      const { stdout, stderr } = await execFileAsync(this.options.binary, args, {
        cwd,
        env: process.env,
        maxBuffer: 10 * 1024 * 1024,
      });
      const parsed = parseExecJson(stdout);

      let lastMessage = "";
      try {
        lastMessage = await readFile(outputFile, "utf8");
      } catch {
        lastMessage = parsed.lastMessage;
      }

      return {
        command: [this.options.binary, ...args].join(" "),
        lastMessage: lastMessage.trim(),
        stderr,
        stdout,
        threadId: parsed.threadId,
      };
    } finally {
      await rm(outputDir, { force: true, recursive: true });
    }
  }

  public buildMcpAddUrlCommand(name: string, url: string): string {
    return [this.options.binary, "mcp", "add", name, "--url", url]
      .map(quoteShellArg)
      .join(" ");
  }

  public buildMcpAddStdioCommand(
    name: string,
    command: string[],
    env: Record<string, string> = {},
  ): string {
    const envArgs = Object.entries(env).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
    return [this.options.binary, "mcp", "add", name, ...envArgs, "--", ...command]
      .map(quoteShellArg)
      .join(" ");
  }

  private buildExecArgs(request: CodexCliExecRequest, outputFile: string, cwd: string): string[] {
    const prompt = request.prompt.trim();
    const resolved = this.resolveRunOptions(request.overrides);
    const globalArgs = this.buildGlobalArgs(resolved);
    if (request.resumeLast) {
      return [
        ...globalArgs,
        "exec",
        "resume",
        ...this.buildResumeOptions(outputFile, request, resolved),
        "--last",
        prompt,
      ];
    }

    if (request.sessionId) {
      return [
        ...globalArgs,
        "exec",
        "resume",
        ...this.buildResumeOptions(outputFile, request, resolved),
        request.sessionId,
        prompt,
      ];
    }

    return [...globalArgs, "exec", ...this.buildExecOptions(outputFile, cwd, request, resolved), prompt];
  }

  private buildGlobalArgs(resolved: ResolvedRunOptions): string[] {
    const args: string[] = [];

    if (this.shouldBypassApprovalsAndSandbox(resolved.approvalPolicy, resolved.sandboxMode)) {
      args.push("--dangerously-bypass-approvals-and-sandbox");
    } else {
      args.push("-a", resolved.approvalPolicy);
    }

    for (const override of resolved.configOverrides) {
      args.push("-c", override);
    }

    if (resolved.reasoningEffort) {
      args.push("-c", `model_reasoning_effort="${resolved.reasoningEffort}"`);
    }

    if (resolved.searchEnabled) {
      args.push("--search");
    }

    return args;
  }

  private buildExecOptions(
    outputFile: string,
    cwd: string,
    request: CodexCliExecRequest,
    resolved: ResolvedRunOptions,
  ): string[] {
    const args = [
      "-C",
      cwd,
      "--json",
      "--output-last-message",
      outputFile,
    ];

    if (!this.shouldBypassApprovalsAndSandbox(resolved.approvalPolicy, resolved.sandboxMode)) {
      args.push("--sandbox", resolved.sandboxMode);
    }

    if (resolved.model) {
      args.push("--model", resolved.model);
    }

    if (request.ephemeral) {
      args.push("--ephemeral");
    }

    return args;
  }

  private buildResumeOptions(
    outputFile: string,
    request: CodexCliExecRequest,
    resolved: ResolvedRunOptions,
  ): string[] {
    const args = ["--json", "--output-last-message", outputFile];

    if (resolved.model) {
      args.push("--model", resolved.model);
    }

    if (request.ephemeral) {
      args.push("--ephemeral");
    }

    return args;
  }

  private shouldBypassApprovalsAndSandbox(approvalPolicy: string, sandboxMode: string): boolean {
    return (
      approvalPolicy === "never" &&
      sandboxMode === "danger-full-access"
    );
  }

  private resolveRunOptions(overrides?: CodexCliRunOverrides): ResolvedRunOptions {
    return {
      approvalPolicy: overrides?.approvalPolicy ?? this.options.approvalPolicy,
      configOverrides: overrides?.configOverrides ?? [],
      model: overrides?.model ?? this.options.model ?? null,
      reasoningEffort: overrides?.reasoningEffort ?? this.options.reasoningEffort ?? null,
      sandboxMode: overrides?.sandboxMode ?? this.options.sandboxMode,
      searchEnabled: overrides?.searchEnabled ?? false,
    };
  }

  private async assertRunnable(): Promise<void> {
    const binaryPath = await this.resolveBinaryPath();
    if (!binaryPath) {
      throw new Error(`Codex CLI binary "${this.options.binary}" was not found in PATH.`);
    }

    const configExists = await this.checkConfigExists();
    if (!configExists) {
      throw new Error(
        `Expected Codex config file was not found at "${this.options.configPath}".`,
      );
    }
  }

  private async resolveBinaryPath(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("which", [this.options.binary], {
        cwd: this.options.cwd,
        env: process.env,
      });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private async safeRun(args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execFileAsync(this.options.binary, args, {
        cwd: this.options.cwd,
        env: process.env,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout, stderr };
    } catch (error) {
      if (error instanceof Error && "stdout" in error && "stderr" in error) {
        return {
          stdout: String(error.stdout ?? ""),
          stderr: String(error.stderr ?? error.message),
        };
      }

      return {
        stdout: "",
        stderr: error instanceof Error ? error.message : "Unknown Codex CLI error",
      };
    }
  }

  private async checkConfigExists(): Promise<boolean> {
    try {
      await access(this.options.configPath);
      return true;
    } catch {
      return false;
    }
  }
}

function quoteShellArg(value: string): string {
  if (/^[a-zA-Z0-9_./:=+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function parseMcpList(stdout: string): CodexCliMcpServer[] {
  const lines = stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const servers: CodexCliMcpServer[] = [];
  let mode: "command" | "url" | null = null;

  for (const line of lines) {
    if (line.startsWith("Name") && line.includes("Command")) {
      mode = "command";
      continue;
    }

    if (line.startsWith("Name") && line.includes("Url")) {
      mode = "url";
      continue;
    }

    if (!mode || line.startsWith("-")) {
      continue;
    }

    const columns = line.split(/\s{2,}/).map((part) => part.trim());
    if (mode === "command" && columns.length >= 6) {
      servers.push({
        auth: columns.at(-1) ?? "Unknown",
        name: columns[0],
        scope: "command",
        status: columns.at(-2) ?? "Unknown",
        target: columns[1],
      });
      continue;
    }

    if (mode === "url" && columns.length >= 5) {
      servers.push({
        auth: columns.at(-1) ?? "Unknown",
        name: columns[0],
        scope: "url",
        status: columns.at(-2) ?? "Unknown",
        target: columns[1],
      });
    }
  }

  return servers;
}

function parseExecJson(stdout: string): { lastMessage: string; threadId: string | null } {
  const events = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((event): event is Record<string, unknown> => event !== null);

  const threadStarted = events.find(
    (event) => event.type === "thread.started" && typeof event.thread_id === "string",
  );
  const threadId =
    threadStarted && typeof threadStarted.thread_id === "string" ? threadStarted.thread_id : null;

  const lastAgentMessage = [...events]
    .reverse()
    .find((event) => {
      if (event.type !== "item.completed") {
        return false;
      }

      const item = event.item;
      return (
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        item.type === "agent_message" &&
        "text" in item &&
        typeof item.text === "string"
      );
    });

  const lastMessage =
    lastAgentMessage &&
    typeof lastAgentMessage.item === "object" &&
    lastAgentMessage.item !== null &&
    "text" in lastAgentMessage.item &&
    typeof lastAgentMessage.item.text === "string"
      ? lastAgentMessage.item.text
      : "";

  return {
    lastMessage,
    threadId,
  };
}
