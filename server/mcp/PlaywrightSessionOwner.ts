import { createConnection } from "@playwright/mcp";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext } from "playwright-core";
import type { PlaywrightMcpRuntimeConfig } from "../config/AppConfig.js";
import { PlaywrightProfileLease } from "./PlaywrightProfileLease.js";

const MAC_BRAVE_PATHS = [
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
];

const LINUX_BRAVE_PATHS = [
  "/usr/bin/brave-browser",
  "/usr/bin/brave-browser-stable",
  "/usr/bin/brave",
  "/snap/bin/brave",
];

export interface OwnedPlaywrightSessionState {
  cdpEndpoint: string;
  executablePath: string | null;
  hasContext: boolean;
  lockOwner: "none" | "current_process" | "other_process";
  locked: boolean;
  outputDir: string;
  profileExists: boolean;
  profileDir: string;
}

export class PlaywrightSessionOwner {
  private context: BrowserContext | null = null;
  private inFlight: Promise<OwnedPlaywrightSessionState> | null = null;
  private lease: PlaywrightProfileLease | null = null;
  private mcpConnection: { close?: () => Promise<void> | void } | null = null;

  public constructor(private readonly config: PlaywrightMcpRuntimeConfig) {}

  public async getState(): Promise<OwnedPlaywrightSessionState> {
    const lockState = await PlaywrightProfileLease.inspect(this.getLockPath());
    return {
      cdpEndpoint: this.getCdpEndpoint(),
      executablePath: this.resolveExecutablePath(),
      hasContext: Boolean(this.context),
      lockOwner: lockState.lockOwner,
      locked: lockState.locked,
      outputDir: this.config.outputDir,
      profileExists: existsSync(this.config.profileDir),
      profileDir: this.config.profileDir,
    };
  }

  public async ensureSession(options: { forceRestart?: boolean } = {}): Promise<OwnedPlaywrightSessionState> {
    if (options.forceRestart) {
      await this.dispose();
    }

    if (this.context) {
      return await this.getState();
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.start().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  public async dispose(): Promise<void> {
    await Promise.resolve(this.mcpConnection?.close?.()).catch(() => {});
    this.mcpConnection = null;
    await this.context?.close().catch(() => {});
    this.context = null;
    await this.lease?.release().catch(() => {});
    this.lease = null;
  }

  private async start(): Promise<OwnedPlaywrightSessionState> {
    const executablePath = this.resolveExecutablePath();
    if (!executablePath) {
      throw new Error("Brave não encontrado no host para o runtime próprio do ACOO.");
    }

    await Promise.all([
      mkdir(this.config.profileDir, { recursive: true }),
      mkdir(this.config.outputDir, { recursive: true }),
    ]);

    this.lease = await PlaywrightProfileLease.acquire(this.getLockPath());

    try {
      this.context = await chromium.launchPersistentContext(this.config.profileDir, {
        executablePath,
        headless: this.config.headless,
        args: [`--remote-debugging-port=${this.config.cdpPort}`],
      });

      this.mcpConnection = (await createConnection(
        {
          browser: {
            browserName: "chromium",
            userDataDir: this.config.profileDir,
            launchOptions: {
              executablePath,
              headless: this.config.headless,
            },
          },
          outputDir: this.config.outputDir,
          saveSession: true,
          sharedBrowserContext: true,
        } as never,
        async () => this.context as never,
      )) as { close?: () => Promise<void> | void };

      return this.getState();
    } catch (error) {
      await this.dispose().catch(() => {});
      throw error;
    }
  }

  private getCdpEndpoint(): string {
    return `http://127.0.0.1:${this.config.cdpPort}`;
  }

  private getLockPath(): string {
    return path.join(this.config.profileDir, ".profile.lock");
  }

  private resolveExecutablePath(): string | null {
    if (this.config.browserExecutablePath && existsSync(this.config.browserExecutablePath)) {
      return this.config.browserExecutablePath;
    }

    const candidates = process.platform === "darwin" ? MAC_BRAVE_PATHS : LINUX_BRAVE_PATHS;
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }
}
