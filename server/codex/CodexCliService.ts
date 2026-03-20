import { execFile, spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CodexCliOptions {
  approvalPolicy: string;
  binary: string;
  configPath: string;
  cwd: string;
  execTimeoutMs: number;
  model?: string | null;
  reasoningEffort?: string | null;
  sandboxMode: string;
}

export interface CodexCliExecRequest {
  abortSignal?: AbortSignal;
  cwd?: string;
  ephemeral?: boolean;
  onTextChunk?: (chunk: string) => void;
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

export class CodexCliAbortedError extends Error {
  public constructor(message = "Codex CLI execution aborted.") {
    super(message);
    this.name = "CodexCliAbortedError";
  }
}

export class CodexCliResumeError extends Error {
  public readonly causeMessage: string;
  public readonly retryable: boolean;

  public constructor(message: string, causeMessage: string, retryable = true) {
    super(message);
    this.name = "CodexCliResumeError";
    this.causeMessage = causeMessage;
    this.retryable = retryable;
  }
}

export class CodexCliTimeoutError extends Error {
  public readonly timeoutMs: number;

  public constructor(timeoutMs: number) {
    super(`Codex CLI execution timed out after ${timeoutMs}ms.`);
    this.name = "CodexCliTimeoutError";
    this.timeoutMs = timeoutMs;
  }
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
    const timeoutController = new AbortController();
    const timeoutMs = Math.max(1_000, this.options.execTimeoutMs);
    const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);
    const signal = request.abortSignal
      ? AbortSignal.any([request.abortSignal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const resolved = this.resolveRunOptions(request.overrides);
      const args = this.buildExecArgs(request, outputFile, cwd);
      if (request.onTextChunk) {
        if (!request.resumeLast) {
          return await this.runAppServerStreamingProcess({
            cwd,
            request,
            resolved,
            signal,
            timeoutController,
            timeoutMs,
          });
        }

        return await this.runLegacyStreamingProcess({
          args,
          cwd,
          outputFile,
          request,
          signal,
          timeoutController,
          timeoutMs,
        });
      }

      let stdout: string;
      let stderr: string;
      try {
        const result = await execFileAsync(this.options.binary, args, {
          cwd,
          env: process.env,
          maxBuffer: 10 * 1024 * 1024,
          signal,
        });
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (error) {
        if (timeoutController.signal.aborted && !request.abortSignal?.aborted) {
          if (request.sessionId || request.resumeLast) {
            throw new CodexCliResumeError(
              "Codex CLI timed out while resuming the requested session.",
              `Tempo limite excedido apos ${timeoutMs}ms.`,
              true,
            );
          }
          throw new CodexCliTimeoutError(timeoutMs);
        }
        if (isAbortError(error)) {
          throw new CodexCliAbortedError();
        }
        if (request.sessionId || request.resumeLast) {
          const details = formatExecFailure(error);
          throw new CodexCliResumeError(
            "Codex CLI failed to resume the requested session.",
            details,
            isRetryableResumeFailure(details),
          );
        }
        throw error;
      }
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
      clearTimeout(timeoutHandle);
      await rm(outputDir, { force: true, recursive: true });
    }
  }

  private async runAppServerStreamingProcess(input: {
    cwd: string;
    request: CodexCliExecRequest;
    resolved: ResolvedRunOptions;
    signal: AbortSignal;
    timeoutController: AbortController;
    timeoutMs: number;
  }): Promise<CodexCliExecResult> {
    const port = await reserveFreePort();
    const listenUrl = `ws://127.0.0.1:${port}`;
    const args = [
      ...this.buildGlobalArgs(input.resolved),
      "app-server",
      "--listen",
      listenUrl,
    ];
    const command = [this.options.binary, ...args].join(" ");
    const child = spawn(this.options.binary, args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let threadId: string | null = input.request.sessionId ?? null;
    let turnId: string | null = null;
    let streamedText = "";
    let completedText = "";
    let interruptSent = false;
    let finished = false;
    let socket: WebSocket | null = null;
    let closeSocketResolve: (() => void) | null = null;
    const closeSocketPromise = new Promise<void>((resolve) => {
      closeSocketResolve = resolve;
    });

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });

    const terminateChild = () => {
      if (child.killed) {
        return;
      }

      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 1_000).unref();
    };

    const abortListener = () => {
      if (interruptSent) {
        return;
      }

      interruptSent = true;
      if (!(socket && threadId && turnId)) {
        terminateChild();
      } else {
        try {
          sendJsonRpcNotification(socket, "turn/interrupt", {
            threadId,
            turnId,
          });
        } catch {
          terminateChild();
        }
      }

      setTimeout(() => {
        if (!finished) {
          terminateChild();
        }
      }, 1_500).unref();
    };

    input.signal.addEventListener("abort", abortListener, { once: true });

    try {
      socket = await connectWebSocket(listenUrl, input.signal);
      socket.addEventListener("close", () => {
        closeSocketResolve?.();
      }, { once: true });

      const rpc = new JsonRpcConnection(socket);
      await rpc.request("initialize", {
        capabilities: { experimentalApi: true },
        clientInfo: {
          name: "acoo-web-chat",
          title: "ACOO Web Chat",
          version: "0.1.0",
        },
      }, input.signal);
      rpc.notify("initialized", {});

      const threadResponse = input.request.sessionId
        ? await rpc.request("thread/resume", {
            approvalPolicy: input.resolved.approvalPolicy,
            cwd: input.cwd,
            model: input.resolved.model,
            persistExtendedHistory: false,
            sandbox: input.resolved.sandboxMode,
            threadId: input.request.sessionId,
          }, input.signal)
        : await rpc.request("thread/start", {
            approvalPolicy: input.resolved.approvalPolicy,
            cwd: input.cwd,
            ephemeral: input.request.ephemeral ?? false,
            experimentalRawEvents: false,
            model: input.resolved.model,
            persistExtendedHistory: false,
            sandbox: input.resolved.sandboxMode,
          }, input.signal);
      threadId = extractThreadIdFromRpcResult(threadResponse) ?? threadId;

      rpc.onNotification((message) => {
        if (message.method === "item/agentMessage/delta") {
          const delta = extractDeltaFromNotification(message.params);
          if (delta) {
            streamedText += delta;
            input.request.onTextChunk?.(delta);
          }
          return;
        }

        if (message.method === "item/completed") {
          const text = extractCompletedAgentMessage(message.params);
          if (text) {
            completedText = text;
          }
          return;
        }

        if (message.method === "turn/started") {
          const nextTurnId = extractTurnIdFromNotification(message.params);
          if (nextTurnId) {
            turnId = nextTurnId;
          }
        }
      });

      const turnResponse = await rpc.request("turn/start", {
        cwd: input.cwd,
        effort: normalizeReasoningEffort(input.resolved.reasoningEffort),
        input: [
          {
            text: input.request.prompt,
            text_elements: [],
            type: "text",
          },
        ],
        threadId,
      }, input.signal);
      turnId = extractTurnIdFromRpcResult(turnResponse) ?? turnId;

      const completedTurn = await rpc.waitForNotification("turn/completed", (params) => {
        const completedTurnId = extractTurnIdFromNotification(params);
        return completedTurnId !== null && completedTurnId === turnId;
      }, input.signal);

      const turnError = extractTurnError(completedTurn.params);
      if (turnError) {
        throw new Error(turnError);
      }

      finished = true;
      rpc.dispose();
      socket.close();
      await closeSocketPromise;
      terminateChild();
      await waitForChildExit(child);

      const finalMessage = completedText || streamedText;
      if (!streamedText.trim() && finalMessage.trim()) {
        input.request.onTextChunk?.(finalMessage.trim());
      }

      return {
        command,
        lastMessage: finalMessage.trim(),
        stderr,
        stdout,
        threadId,
      };
    } catch (error) {
      if (input.timeoutController.signal.aborted && !input.request.abortSignal?.aborted) {
        if (input.request.sessionId || input.request.resumeLast) {
          throw new CodexCliResumeError(
            "Codex CLI timed out while resuming the requested session.",
            `Tempo limite excedido apos ${input.timeoutMs}ms.`,
            true,
          );
        }
        throw new CodexCliTimeoutError(input.timeoutMs);
      }

      if (input.request.abortSignal?.aborted || isAbortError(error)) {
        throw new CodexCliAbortedError();
      }

      if (input.request.sessionId) {
        const details = formatExecFailure(error);
        throw new CodexCliResumeError(
          "Codex CLI failed to resume the requested session.",
          details,
          isRetryableResumeFailure(details),
        );
      }

      throw error;
    } finally {
      finished = true;
      input.signal.removeEventListener("abort", abortListener);
      if (socket && socket.readyState < WebSocket.CLOSING) {
        socket.close();
      }
      terminateChild();
      await waitForChildExit(child);
    }
  }

  private async runLegacyStreamingProcess(input: {
    args: string[];
    cwd: string;
    outputFile: string;
    request: CodexCliExecRequest;
    signal: AbortSignal;
    timeoutController: AbortController;
    timeoutMs: number;
  }): Promise<CodexCliExecResult> {
    const child = spawn(this.options.binary, input.args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";
    let streamedText = "";
    let threadId: string | null = null;

    const maybeEmitText = (nextText: string) => {
      if (!nextText || !input.request.onTextChunk) {
        return;
      }

      const prefixLength = longestCommonPrefixLength(streamedText, nextText);
      const delta = nextText.slice(prefixLength);
      streamedText = nextText;

      if (delta) {
        input.request.onTextChunk(delta);
      }
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      stdout += text;
      stdoutBuffer += text;

      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (line.startsWith("{")) {
          const parsed = safeParseJsonEvent(line);
          if (parsed) {
            if (parsed.type === "thread.started" && typeof parsed.thread_id === "string") {
              threadId = parsed.thread_id;
            }
            const agentText = extractAgentTextFromEvent(parsed);
            if (agentText) {
              maybeEmitText(agentText);
            }
          }
        }
        newlineIndex = stdoutBuffer.indexOf("\n");
      }
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });

    const abortListener = () => {
      if (!child.killed) {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 1_000).unref();
      }
    };

    input.signal.addEventListener("abort", abortListener, { once: true });

    try {
      const exitCode = await new Promise<number>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code) => resolve(code ?? 0));
      });

      if (stdoutBuffer.trim().startsWith("{")) {
        const parsed = safeParseJsonEvent(stdoutBuffer.trim());
        const agentText = parsed ? extractAgentTextFromEvent(parsed) : null;
        if (agentText) {
          maybeEmitText(agentText);
        }
      }

      if (input.timeoutController.signal.aborted && !input.request.abortSignal?.aborted) {
        if (input.request.sessionId || input.request.resumeLast) {
          throw new CodexCliResumeError(
            "Codex CLI timed out while resuming the requested session.",
            `Tempo limite excedido apos ${input.timeoutMs}ms.`,
            true,
          );
        }
        throw new CodexCliTimeoutError(input.timeoutMs);
      }

      if (input.request.abortSignal?.aborted) {
        throw new CodexCliAbortedError();
      }

      if (exitCode !== 0) {
        const error = new Error(
          stderr.trim() || stdout.trim() || `Codex CLI exited with code ${exitCode}.`,
        ) as Error & { stderr?: string; stdout?: string };
        error.stderr = stderr;
        error.stdout = stdout;
        if (input.request.sessionId || input.request.resumeLast) {
          const details = formatExecFailure(error);
          throw new CodexCliResumeError(
            "Codex CLI failed to resume the requested session.",
            details,
            isRetryableResumeFailure(details),
          );
        }
        throw error;
      }

      const parsed = parseExecJson(stdout);
      let lastMessage = "";
      try {
        lastMessage = await readFile(input.outputFile, "utf8");
      } catch {
        lastMessage = parsed.lastMessage;
      }

      if (lastMessage.trim() && streamedText.trim().length === 0) {
        input.request.onTextChunk?.(lastMessage.trim());
      }

      return {
        command: [this.options.binary, ...input.args].join(" "),
        lastMessage: lastMessage.trim(),
        stderr,
        stdout,
        threadId: threadId ?? parsed.threadId,
      };
    } catch (error) {
      if (input.timeoutController.signal.aborted && !input.request.abortSignal?.aborted) {
        if (input.request.sessionId || input.request.resumeLast) {
          throw new CodexCliResumeError(
            "Codex CLI timed out while resuming the requested session.",
            `Tempo limite excedido apos ${input.timeoutMs}ms.`,
            true,
          );
        }
        throw new CodexCliTimeoutError(input.timeoutMs);
      }
      if (input.request.abortSignal?.aborted || isAbortError(error)) {
        throw new CodexCliAbortedError();
      }
      throw error;
    } finally {
      input.signal.removeEventListener("abort", abortListener);
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && ((error as { name?: string }).name === "AbortError" || (error as { code?: string }).code === "ABORT_ERR");
}

function formatExecFailure(error: unknown): string {
  if (error instanceof Error && "stdout" in error && "stderr" in error) {
    const stdout = String(error.stdout ?? "").trim();
    const stderr = String(error.stderr ?? "").trim();
    return stderr || stdout || error.message;
  }

  return error instanceof Error ? error.message : String(error);
}

function isRetryableResumeFailure(details: string): boolean {
  const normalized = details.toLowerCase();
  const nonRetryablePatterns = [
    /insufficient credits/,
    /quota exceeded/,
    /quota/,
    /billing/,
    /payment required/,
    /authentication failed/,
    /not authenticated/,
    /login required/,
    /invalid api key/,
    /rate limit/,
    /too many requests/,
  ];

  return !nonRetryablePatterns.some((pattern) => pattern.test(normalized));
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
    .map((line) => safeParseJsonEvent(line))
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

function safeParseJsonEvent(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractAgentTextFromEvent(event: Record<string, unknown>): string | null {
  const item = event.item;
  if (!item || typeof item !== "object") {
    return null;
  }

  if (!("type" in item) || item.type !== "agent_message") {
    return null;
  }

  if ("text" in item && typeof item.text === "string" && item.text.trim()) {
    return item.text;
  }

  return null;
}

function longestCommonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

async function reserveFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to reserve an app-server port."));
        return;
      }

      const { port } = address;
      server.close((error?: Error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function connectWebSocket(url: string, signal: AbortSignal): Promise<WebSocket> {
  while (true) {
    if (signal.aborted) {
      throw new CodexCliAbortedError();
    }

    try {
      return await new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(url);
        const cleanup = () => {
          socket.removeEventListener("open", handleOpen);
          socket.removeEventListener("error", handleError);
        };
        const handleOpen = () => {
          cleanup();
          resolve(socket);
        };
        const handleError = () => {
          cleanup();
          try {
            socket.close();
          } catch {
            // noop
          }
          reject(new Error(`Failed to connect to Codex app-server at ${url}.`));
        };
        socket.addEventListener("open", handleOpen, { once: true });
        socket.addEventListener("error", handleError, { once: true });
      });
    } catch (error) {
      if (signal.aborted) {
        throw new CodexCliAbortedError();
      }
      if (error instanceof Error && /Failed to connect/.test(error.message)) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      throw error;
    }
  }
}

async function waitForChildExit(child: ReturnType<typeof spawn>): Promise<void> {
  await new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.killed) {
      resolve();
      return;
    }
    child.once("close", () => resolve());
  });
}

class JsonRpcConnection {
  private readonly pending = new Map<number, {
    reject: (error: Error) => void;
    resolve: (value: unknown) => void;
  }>();
  private readonly notificationWaiters: Array<{
    method: string;
    predicate?: (params: Record<string, unknown>) => boolean;
    reject: (error: Error) => void;
    resolve: (message: JsonRpcNotification) => void;
  }> = [];
  private readonly notificationListeners = new Set<(message: JsonRpcNotification) => void>();
  private nextId = 1;
  private closed = false;

  public constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      this.handleRawMessage(String(event.data));
    });
    socket.addEventListener("close", () => {
      this.closed = true;
      this.failPending(new Error("Codex app-server connection closed."));
    });
    socket.addEventListener("error", () => {
      this.failPending(new Error("Codex app-server connection failed."));
    });
  }

  public dispose(): void {
    this.notificationListeners.clear();
    this.failPending(new Error("Codex app-server connection disposed."));
  }

  public notify(method: string, params: Record<string, unknown>): void {
    sendJsonRpcNotification(this.socket, method, params);
  }

  public onNotification(listener: (message: JsonRpcNotification) => void): void {
    this.notificationListeners.add(listener);
  }

  public async request(
    method: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (this.closed) {
      throw new Error("Codex app-server connection is closed.");
    }

    const id = this.nextId++;
    return await new Promise<unknown>((resolve, reject) => {
      const abortListener = () => {
        this.pending.delete(id);
        reject(new CodexCliAbortedError());
      };

      this.pending.set(id, {
        reject: (error) => {
          signal.removeEventListener("abort", abortListener);
          reject(error);
        },
        resolve: (value) => {
          signal.removeEventListener("abort", abortListener);
          resolve(value);
        },
      });
      signal.addEventListener("abort", abortListener, { once: true });

      this.socket.send(JSON.stringify({
        id,
        jsonrpc: "2.0",
        method,
        params,
      }));
    });
  }

  public async waitForNotification(
    method: string,
    predicate: ((params: Record<string, unknown>) => boolean) | undefined,
    signal: AbortSignal,
  ): Promise<JsonRpcNotification> {
    return await new Promise<JsonRpcNotification>((resolve, reject) => {
      const abortListener = () => {
        this.removeNotificationWaiter(waiter);
        reject(new CodexCliAbortedError());
      };
      const waiter = {
        method,
        predicate,
        reject: (error: Error) => {
          signal.removeEventListener("abort", abortListener);
          reject(error);
        },
        resolve: (message: JsonRpcNotification) => {
          signal.removeEventListener("abort", abortListener);
          resolve(message);
        },
      };
      this.notificationWaiters.push(waiter);
      signal.addEventListener("abort", abortListener, { once: true });
    });
  }

  private removeNotificationWaiter(waiter: JsonRpcConnection["notificationWaiters"][number]): void {
    const index = this.notificationWaiters.indexOf(waiter);
    if (index >= 0) {
      this.notificationWaiters.splice(index, 1);
    }
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();

    for (const waiter of this.notificationWaiters.splice(0)) {
      waiter.reject(error);
    }
  }

  private handleRawMessage(raw: string): void {
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(raw) as JsonRpcMessage;
    } catch {
      return;
    }

    if ("id" in message && typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);

      if ("error" in message && message.error) {
        pending.reject(new Error(message.error.message || "Codex app-server request failed."));
        return;
      }

      pending.resolve(message.result);
      return;
    }

    if (!("method" in message) || typeof message.method !== "string") {
      return;
    }

    const notification: JsonRpcNotification = {
      method: message.method,
      params: isRecord(message.params) ? message.params : {},
    };

    for (const listener of this.notificationListeners) {
      listener(notification);
    }

    const waiter = this.notificationWaiters.find((candidate) => {
      if (candidate.method !== notification.method) {
        return false;
      }
      return candidate.predicate ? candidate.predicate(notification.params) : true;
    });
    if (!waiter) {
      return;
    }
    this.removeNotificationWaiter(waiter);
    waiter.resolve(notification);
  }
}

function sendJsonRpcNotification(
  socket: WebSocket,
  method: string,
  params: Record<string, unknown>,
): void {
  socket.send(JSON.stringify({
    jsonrpc: "2.0",
    method,
    params,
  }));
}

function extractThreadIdFromRpcResult(result: unknown): string | null {
  if (!isRecord(result) || !isRecord(result.thread) || typeof result.thread.id !== "string") {
    return null;
  }
  return result.thread.id;
}

function extractTurnIdFromRpcResult(result: unknown): string | null {
  if (!isRecord(result) || !isRecord(result.turn) || typeof result.turn.id !== "string") {
    return null;
  }
  return result.turn.id;
}

function extractTurnIdFromNotification(params: Record<string, unknown>): string | null {
  if (!isRecord(params.turn) || typeof params.turn.id !== "string") {
    return null;
  }
  return params.turn.id;
}

function extractTurnError(params: Record<string, unknown>): string | null {
  if (!isRecord(params.turn) || params.turn.error === null || params.turn.error === undefined) {
    return null;
  }

  if (typeof params.turn.error === "string") {
    return params.turn.error;
  }

  if (isRecord(params.turn.error) && typeof params.turn.error.message === "string") {
    return params.turn.error.message;
  }

  return "Codex app-server completed the turn with an unknown error.";
}

function extractDeltaFromNotification(params: Record<string, unknown>): string | null {
  return typeof params.delta === "string" && params.delta.length > 0 ? params.delta : null;
}

function extractCompletedAgentMessage(params: Record<string, unknown>): string | null {
  if (!isRecord(params.item) || params.item.type !== "agentMessage" || typeof params.item.text !== "string") {
    return null;
  }
  return params.item.text;
}

function normalizeReasoningEffort(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh" || value === "none") {
    return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

interface JsonRpcNotification {
  method: string;
  params: Record<string, unknown>;
}

type JsonRpcMessage =
  | {
      error?: { message?: string };
      id: number;
      result?: unknown;
    }
  | {
      method: string;
      params?: unknown;
    };
