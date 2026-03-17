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
  startupCommand: string;
}

export interface McpBootstrapResult {
  healthy: boolean;
  manualStartRequired: boolean;
  managed: boolean;
  name: string;
  startupCommand: string | null;
  startupAttempted: boolean;
}

export class McpSessionBootstrapper {
  private static readonly HEALTH_STABILITY_CHECKS = 2;
  private static readonly HEALTH_WAIT_INTERVAL_MS = 500;
  private static readonly STARTUP_HEALTH_TIMEOUT_MS = 15_000;

  public constructor(
    private readonly runtimeCatalog: McpRuntimeCatalog,
    private readonly cwd: string,
  ) {}

  public async ensureReady(requiredNames: string[]): Promise<McpBootstrapResult[]> {
    const uniqueNames = [...new Set(requiredNames)].sort();
    const results: McpBootstrapResult[] = [];

    for (const name of uniqueNames) {
      const runtime = this.runtimeCatalog.get(name);
      if (!runtime) {
        results.push({
          healthy: true,
          manualStartRequired: false,
          managed: false,
          name,
          startupCommand: null,
          startupAttempted: false,
        });
        continue;
      }

      const healthyBefore = await this.checkHealth(runtime);
      if (healthyBefore) {
        results.push({
          healthy: true,
          manualStartRequired: false,
          managed: true,
          name,
          startupCommand: runtime.startupCommand,
          startupAttempted: false,
        });
        continue;
      }

      if (!runtime.autostart) {
        results.push({
          healthy: false,
          manualStartRequired: true,
          managed: true,
          name,
          startupCommand: runtime.startupCommand,
          startupAttempted: false,
        });
        continue;
      }

      await execFileAsync("zsh", ["-lc", runtime.startupCommand], {
        cwd: this.cwd,
        env: process.env,
        maxBuffer: 1024 * 1024,
      });

      const healthyAfter = await this.waitForHealthy(
        runtime,
        McpSessionBootstrapper.STARTUP_HEALTH_TIMEOUT_MS,
      );
      results.push({
        healthy: healthyAfter,
        manualStartRequired: !healthyAfter,
        managed: true,
        name,
        startupCommand: runtime.startupCommand,
        startupAttempted: true,
      });
    }

    return results;
  }

  public async getManagedRuntimeHealth(): Promise<ManagedMcpRuntimeHealth[]> {
    const runtimes = this.runtimeCatalog.list();
    return Promise.all(
      runtimes.map(async (runtime) => ({
        autostart: runtime.autostart,
        doctorCommand: runtime.doctorCommand,
        healthy: await this.checkHealth(runtime),
        healthcheckCommand: runtime.healthcheckCommand,
        healthcheckUrl: runtime.healthcheckUrl,
        name: runtime.name,
        startupCommand: runtime.startupCommand,
      })),
    );
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
