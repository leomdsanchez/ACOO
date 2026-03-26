import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  ManagedMcpRuntimeDefinition,
  McpRuntimeCatalog,
} from "./McpRuntimeCatalog.js";
import type { PlaywrightSessionOwner } from "./PlaywrightSessionOwner.js";

const execFileAsync = promisify(execFile);

export type ManagedRuntimeStatusCode =
  | "ready"
  | "owner_absent"
  | "owner_locked_elsewhere"
  | "context_missing"
  | "mcp_connection_failed"
  | "wrapper_missing"
  | "healthcheck_failed";

export interface ManagedRuntimeProbeResult {
  detail: string | null;
  healthy: boolean;
  state: "off" | "ready" | "broken";
  statusCode: ManagedRuntimeStatusCode;
  summary: string;
}

export interface ManagedMcpRuntimeHealth {
  autostart: boolean;
  detail: string | null;
  doctorCommand: string | null;
  healthy: boolean;
  healthcheckCommand: string | null;
  healthcheckUrl: string;
  name: string;
  state: "off" | "ready" | "broken";
  statusCode: ManagedRuntimeStatusCode;
  startupCommand: string;
  summary: string;
}

export interface McpBootstrapResult {
  errorMessage?: string;
  failureStage?: "startup_command" | "startup_healthcheck" | null;
  healthy: boolean;
  manualStartRequired: boolean;
  managed: boolean;
  name: string;
  statusCode?: ManagedRuntimeStatusCode | null;
  state: "off" | "ready" | "broken" | null;
  startupCommand: string | null;
  startupAttempted: boolean;
}

export class McpSessionBootstrapper {
  private static readonly HEALTH_STABILITY_CHECKS = 2;
  private static readonly HEALTH_WAIT_INTERVAL_MS = 500;
  private static readonly STARTUP_HEALTH_TIMEOUT_MS = 15_000;
  private readonly startupInFlight = new Map<string, Promise<McpBootstrapResult>>();

  public constructor(
    private readonly runtimeCatalog: McpRuntimeCatalog,
    private readonly cwd: string,
    private readonly playwrightSessionOwner?: PlaywrightSessionOwner,
  ) {}

  public async ensureReady(requiredNames: string[]): Promise<McpBootstrapResult[]> {
    return this.ensureReadyWithOptions(requiredNames);
  }

  public async ensureReadyWithOptions(
    requiredNames: string[],
    options: { forceRestart?: boolean; forceStartup?: boolean } = {},
  ): Promise<McpBootstrapResult[]> {
    const uniqueNames = [...new Set(requiredNames)].sort();
    const results: McpBootstrapResult[] = [];

    for (const name of uniqueNames) {
      const runtime = this.runtimeCatalog.get(name);
      if (!runtime) {
        results.push({
          failureStage: null,
          healthy: true,
          manualStartRequired: false,
          managed: false,
          name,
          state: null,
          startupCommand: null,
          startupAttempted: false,
        });
        continue;
      }

      const probeBefore = await this.probeRuntime(runtime);
      if (probeBefore.healthy) {
        results.push({
          failureStage: null,
          healthy: true,
          manualStartRequired: false,
          managed: true,
          name,
          statusCode: probeBefore.statusCode,
          state: "ready",
          startupCommand: runtime.startupCommand,
          startupAttempted: false,
        });
        continue;
      }

      if (!runtime.autostart && !options.forceStartup) {
        results.push({
          failureStage: null,
          healthy: false,
          manualStartRequired: true,
          managed: true,
          name,
          statusCode: probeBefore.statusCode,
          state: probeBefore.state,
          startupCommand: runtime.startupCommand,
          startupAttempted: false,
        });
        continue;
      }

      if (this.shouldRetryBeforeStartup(probeBefore.statusCode)) {
        const recovered = await this.waitForHealthy(runtime, 3_000);
        if (recovered) {
          results.push({
            failureStage: null,
            healthy: true,
            manualStartRequired: false,
            managed: true,
            name,
            statusCode: "ready",
            state: "ready",
            startupCommand: runtime.startupCommand,
            startupAttempted: false,
          });
          continue;
        }
      }

      if (!this.shouldAttemptStartup(probeBefore.statusCode) && !options.forceStartup) {
        results.push({
          failureStage: null,
          healthy: false,
          manualStartRequired: false,
          managed: true,
          name,
          statusCode: probeBefore.statusCode,
          state: probeBefore.state,
          startupCommand: runtime.startupCommand,
          startupAttempted: false,
        });
        continue;
      }

      results.push(await this.ensureManagedRuntime(runtime, options));
    }

    return results;
  }

  public async getManagedRuntimeHealth(): Promise<ManagedMcpRuntimeHealth[]> {
    const runtimes = this.runtimeCatalog.list();
    return Promise.all(
      runtimes.map(async (runtime) => {
        const probe = await this.probeRuntime(runtime);
        return {
          autostart: runtime.autostart,
          detail: probe.detail,
          doctorCommand: runtime.doctorCommand,
          healthy: probe.healthy,
          healthcheckCommand: runtime.healthcheckCommand,
          healthcheckUrl: runtime.healthcheckUrl,
          name: runtime.name,
          state: probe.state,
          statusCode: probe.statusCode,
          startupCommand: runtime.startupCommand,
          summary: probe.summary,
        };
      }),
    );
  }

  private async ensureManagedRuntime(
    runtime: ManagedMcpRuntimeDefinition,
    options: { forceRestart?: boolean; forceStartup?: boolean } = {},
  ): Promise<McpBootstrapResult> {
    const existing = this.startupInFlight.get(runtime.name);
    if (existing) {
      return existing;
    }

    const startupAttempt = this.startRuntime(runtime, options).finally(() => {
      this.startupInFlight.delete(runtime.name);
    });
    this.startupInFlight.set(runtime.name, startupAttempt);
    return startupAttempt;
  }

  private async startRuntime(
    runtime: ManagedMcpRuntimeDefinition,
    options: { forceRestart?: boolean; forceStartup?: boolean } = {},
  ): Promise<McpBootstrapResult> {
    if (runtime.name === "playwright" && this.playwrightSessionOwner) {
      try {
        await this.playwrightSessionOwner.ensureSession({
          forceRestart: options.forceRestart,
        });
      } catch (error) {
        return {
          errorMessage: formatBootstrapError(error),
          failureStage: "startup_command",
          healthy: false,
          manualStartRequired: false,
          managed: true,
          name: runtime.name,
          statusCode: "healthcheck_failed",
          state: "broken",
          startupCommand: runtime.startupCommand,
          startupAttempted: true,
        };
      }
    } else {
    try {
      await execFileAsync("zsh", ["-lc", runtime.startupCommand], {
        cwd: this.cwd,
        env: {
          ...process.env,
          ...(options.forceRestart ? { PLAYWRIGHT_MCP_BRAVE_FORCE_RESTART: "1" } : {}),
        },
        maxBuffer: 1024 * 1024,
      });
    } catch (error) {
      return {
        errorMessage: formatBootstrapError(error),
        failureStage: "startup_command",
        healthy: false,
        manualStartRequired: false,
        managed: true,
        name: runtime.name,
        statusCode: "healthcheck_failed",
        state: "broken",
        startupCommand: runtime.startupCommand,
        startupAttempted: true,
      };
    }
    }

    const healthyAfter = await this.waitForHealthy(
      runtime,
      McpSessionBootstrapper.STARTUP_HEALTH_TIMEOUT_MS,
    );
    const finalProbe = healthyAfter
      ? {
          detail: null,
          healthy: true,
          state: "ready" as const,
          statusCode: "ready" as const,
          summary: "Runtime pronto para uso.",
        }
      : await this.probeRuntime(runtime);
    return {
      failureStage: healthyAfter ? null : "startup_healthcheck",
      healthy: healthyAfter,
      manualStartRequired: false,
      managed: true,
      name: runtime.name,
      statusCode: finalProbe.statusCode,
      state: healthyAfter ? "ready" : finalProbe.state,
      startupCommand: runtime.startupCommand,
      startupAttempted: true,
    };
  }

  private async probeRuntime(
    runtime: ManagedMcpRuntimeDefinition,
  ): Promise<ManagedRuntimeProbeResult> {
    if (runtime.healthcheckCommand) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6_000);
      try {
        const result = await execFileAsync("zsh", ["-lc", runtime.healthcheckCommand], {
          cwd: this.cwd,
          env: process.env,
          maxBuffer: 1024 * 1024,
          signal: controller.signal,
        });
        return parseManagedRuntimeProbeOutput(result.stdout, result.stderr);
      } catch (error) {
        return parseManagedRuntimeProbeOutput(
          readProcessOutput(error, "stdout"),
          readProcessOutput(error, "stderr"),
          error,
        );
      } finally {
        clearTimeout(timer);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_500);
    try {
      const response = await fetch(runtime.healthcheckUrl, {
        method: "GET",
        signal: controller.signal,
      });
      return response.ok
        ? {
            detail: null,
            healthy: true,
            state: "ready",
            statusCode: "ready",
            summary: "Runtime saudável e anexável.",
          }
        : {
            detail: `HTTP ${response.status}`,
            healthy: false,
            state: "broken",
            statusCode: "context_missing",
            summary: "Endpoint de healthcheck respondeu, mas sem sucesso.",
          };
    } catch {
      return {
        detail: null,
        healthy: false,
        state: "broken",
        statusCode: "context_missing",
        summary: "Endpoint de healthcheck indisponível.",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async waitForHealthy(
    runtime: ManagedMcpRuntimeDefinition,
    timeoutMs: number,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    let consecutiveSuccesses = 0;

    while (Date.now() < deadline) {
      if ((await this.probeRuntime(runtime)).healthy) {
        consecutiveSuccesses += 1;
        if (consecutiveSuccesses >= McpSessionBootstrapper.HEALTH_STABILITY_CHECKS) {
          return true;
        }
      } else {
        consecutiveSuccesses = 0;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, McpSessionBootstrapper.HEALTH_WAIT_INTERVAL_MS),
      );
    }

    return false;
  }

  private shouldRetryBeforeStartup(statusCode: ManagedRuntimeStatusCode): boolean {
    return statusCode === "context_missing" || statusCode === "mcp_connection_failed";
  }

  private shouldAttemptStartup(statusCode: ManagedRuntimeStatusCode): boolean {
    return statusCode !== "wrapper_missing" && statusCode !== "owner_locked_elsewhere";
  }
}

function formatBootstrapError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function parseManagedRuntimeProbeOutput(
  stdout: string,
  stderr: string,
  error?: unknown,
): ManagedRuntimeProbeResult {
  const payload = parseStructuredPayload(stdout) ?? parseStructuredPayload(stderr);
  if (payload) {
    const statusCode = normalizeStatusCode(payload.code);
    return {
      detail: readOptionalString(payload.detail),
      healthy: payload.ok === true || statusCode === "ready",
      state: mapProbeState(statusCode),
      statusCode,
      summary: readOptionalString(payload.summary) ?? fallbackSummary(statusCode),
    };
  }

  return {
    detail: formatBootstrapError(error ?? (stderr || stdout)),
    healthy: false,
    state: "broken",
    statusCode: "healthcheck_failed",
    summary: fallbackSummary("healthcheck_failed"),
  };
}

function parseStructuredPayload(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeStatusCode(value: unknown): ManagedRuntimeStatusCode {
  switch (value) {
    case "ready":
    case "owner_absent":
    case "owner_locked_elsewhere":
    case "context_missing":
    case "mcp_connection_failed":
    case "wrapper_missing":
      return value;
    default:
      return "healthcheck_failed";
  }
}

function mapProbeState(statusCode: ManagedRuntimeStatusCode): "off" | "ready" | "broken" {
  switch (statusCode) {
    case "ready":
      return "ready";
    case "owner_absent":
    case "owner_locked_elsewhere":
      return "off";
    default:
      return "broken";
  }
}

function fallbackSummary(statusCode: ManagedRuntimeStatusCode): string {
  switch (statusCode) {
    case "ready":
      return "Runtime saudável e anexável.";
    case "owner_absent":
      return "Sessão operacional do owner local ausente.";
    case "owner_locked_elsewhere":
      return "O profile operacional está sob posse de outro processo.";
    case "context_missing":
      return "O owner local existe, mas o contexto operacional não ficou utilizável.";
    case "mcp_connection_failed":
      return "A sessão operacional existe, mas a conexão MCP não ficou pronta.";
    case "wrapper_missing":
      return "Wrapper MCP do Playwright não está executável.";
    default:
      return "Falha ao avaliar o runtime.";
  }
}

function readProcessOutput(error: unknown, key: "stdout" | "stderr"): string {
  if (error && typeof error === "object" && key in error) {
    const value = (error as Record<string, unknown>)[key];
    return typeof value === "string" ? value : "";
  }

  return "";
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
