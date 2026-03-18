import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  ManagedMcpRuntimeDefinition,
  McpRuntimeCatalog,
} from "./McpRuntimeCatalog.js";

const execFileAsync = promisify(execFile);

export interface ManagedMcpRuntimeHealth {
  autostart: boolean;
  doctorCommand: string | null;
  healthy: boolean;
  healthcheckCommand: string | null;
  healthcheckUrl: string;
  name: string;
  state: "off" | "ready";
  startupCommand: string;
}

export interface McpBootstrapResult {
  errorMessage?: string;
  failureStage?: "startup_command" | "startup_healthcheck" | null;
  healthy: boolean;
  manualStartRequired: boolean;
  managed: boolean;
  name: string;
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

      const healthyBefore = await this.checkHealth(runtime);
      if (healthyBefore) {
        results.push({
          failureStage: null,
          healthy: true,
          manualStartRequired: false,
          managed: true,
          name,
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
          state: "off",
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
        const healthy = await this.checkHealth(runtime);
        return {
          autostart: runtime.autostart,
          doctorCommand: runtime.doctorCommand,
          healthy,
          healthcheckCommand: runtime.healthcheckCommand,
          healthcheckUrl: runtime.healthcheckUrl,
          name: runtime.name,
          state: healthy ? "ready" : "off",
          startupCommand: runtime.startupCommand,
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
        state: "broken",
        startupCommand: runtime.startupCommand,
        startupAttempted: true,
      };
    }

    const healthyAfter = await this.waitForHealthy(
      runtime,
      McpSessionBootstrapper.STARTUP_HEALTH_TIMEOUT_MS,
    );
    return {
      failureStage: healthyAfter ? null : "startup_healthcheck",
      healthy: healthyAfter,
      manualStartRequired: false,
      managed: true,
      name: runtime.name,
      state: healthyAfter ? "ready" : "broken",
      startupCommand: runtime.startupCommand,
      startupAttempted: true,
    };
  }

  private async checkHealth(runtime: ManagedMcpRuntimeDefinition): Promise<boolean> {
    if (runtime.healthcheckCommand) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6_000);
      try {
        await execFileAsync("zsh", ["-lc", runtime.healthcheckCommand], {
          cwd: this.cwd,
          env: process.env,
          maxBuffer: 1024 * 1024,
          signal: controller.signal,
        });
        return true;
      } catch {
        return false;
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
      return response.ok;
    } catch {
      return false;
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
      if (await this.checkHealth(runtime)) {
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
}

function formatBootstrapError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
