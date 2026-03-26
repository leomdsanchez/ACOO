import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  approvalPolicies,
  reasoningEfforts,
  sandboxModes,
  type CodexApprovalPolicy,
  type CodexReasoningEffort,
  type CodexSandboxMode,
} from "../../shared/runtimeConfig.js";
import { ensureEnvironmentLoaded } from "./loadEnvironment.js";

export interface TelegramConfig {
  allowedUserIds: string[];
  botToken: string | null;
  botUsername: string | null;
  enabled: boolean;
  progressPulseMs: number;
  replyAudioByDefault: boolean;
}

export interface ApiConfig {
  host: string;
  port: number;
}

export interface TranscriptionConfig {
  binary: string;
  enabled: boolean;
  ffmpegBinary: string;
  language: string | null;
  modelDownloaderBinary: string;
  modelPath: string;
  modelUrl: string | null;
  modelVariant: string;
  threads: number;
}

export interface PlaywrightMcpRuntimeConfig {
  autostart: boolean;
  browserExecutablePath: string | null;
  cdpPort: number;
  healthcheckCommand: string | null;
  healthcheckUrl: string;
  headless: boolean;
  outputDir: string;
  ownSession: boolean;
  profileDir: string;
  startupCommand: string;
}

export interface AppConfig {
  api: ApiConfig;
  appName: string;
  backupAgentSlug: string | null;
  codexApprovalPolicy: CodexApprovalPolicy;
  codexCliBinary: string;
  codexConfigPath: string;
  codexExecTimeoutMs: number;
  codexModel: string | null;
  codexReasoningEffort: CodexReasoningEffort;
  codexSandboxMode: CodexSandboxMode;
  defaultAgentSlug: string;
  playwrightMcp: PlaywrightMcpRuntimeConfig;
  repoRoot: string;
  skillRoots: string[];
  telegram: TelegramConfig;
  transcription: TranscriptionConfig;
}

export function loadAppConfig(repoRoot: string): AppConfig {
  ensureEnvironmentLoaded(repoRoot);
  const transcriptionModel = readString("ACOO_STT_MODEL", "base");
  const defaultPlaywrightCdpPort = readNumber("ACOO_PLAYWRIGHT_MCP_CDP_PORT", 9222);
  const defaultPlaywrightHealthcheckCommand = resolveDefaultPlaywrightHealthcheckCommand(repoRoot);

  return {
    api: {
      host: readString("ACOO_API_HOST", "127.0.0.1"),
      port: readNumber("ACOO_API_PORT", 4317),
    },
    appName: readString("VITE_APP_NAME", "ACOO"),
    backupAgentSlug: readOptionalAgentSlug("ACOO_BACKUP_AGENT_SLUG"),
    codexApprovalPolicy: readApprovalPolicy("ACOO_CODEX_APPROVAL_POLICY", "never"),
    codexCliBinary: readString("ACOO_CODEX_CLI_BIN", "codex"),
    codexConfigPath: expandHome(readString("ACOO_CODEX_CONFIG_PATH", "~/.codex/config.toml")),
    codexExecTimeoutMs: readNumber("ACOO_CODEX_EXEC_TIMEOUT_MS", 2_700_000),
    codexModel: readOptionalString("ACOO_CODEX_MODEL"),
    codexReasoningEffort: readReasoningEffort("ACOO_CODEX_REASONING_EFFORT", "high"),
    codexSandboxMode: readSandboxMode("ACOO_CODEX_SANDBOX_MODE", "danger-full-access"),
    defaultAgentSlug: readAgentSlug("ACOO_DEFAULT_AGENT_SLUG", "coo"),
    playwrightMcp: {
      autostart: readBoolean("ACOO_PLAYWRIGHT_MCP_AUTOSTART", true),
      browserExecutablePath: readOptionalString("ACOO_PLAYWRIGHT_MCP_BROWSER_PATH"),
      cdpPort: defaultPlaywrightCdpPort,
      healthcheckCommand:
        readOptionalString("ACOO_PLAYWRIGHT_MCP_HEALTHCHECK_COMMAND") ??
        defaultPlaywrightHealthcheckCommand,
      healthcheckUrl: readString(
        "ACOO_PLAYWRIGHT_MCP_HEALTHCHECK_URL",
        `http://127.0.0.1:${defaultPlaywrightCdpPort}/json/version`,
      ),
      headless: readBoolean("ACOO_PLAYWRIGHT_MCP_HEADLESS", false),
      outputDir: expandHome(
        readString("ACOO_PLAYWRIGHT_MCP_OUTPUT_DIR", path.join(repoRoot, ".acoo", "playwright-mcp")),
      ),
      ownSession: readBoolean("ACOO_PLAYWRIGHT_MCP_OWN_SESSION", true),
      profileDir: expandHome(
        readString(
          "ACOO_PLAYWRIGHT_MCP_PROFILE_DIR",
          "~/Library/Application Support/PlaywrightMCP/brave-profile",
        ),
      ),
      startupCommand: expandHome(
        readString("ACOO_PLAYWRIGHT_MCP_STARTUP_COMMAND", "~/.local/bin/playwright-mcp-brave-open"),
      ),
    },
    repoRoot,
    skillRoots: readList("ACOO_SKILL_ROOTS", [
      path.join(repoRoot, ".agents", "skills"),
      path.join(os.homedir(), ".codex", "skills"),
    ]),
    telegram: {
      allowedUserIds: readList("ACOO_TELEGRAM_ALLOWED_USER_IDS", []),
      botToken: readOptionalString("ACOO_TELEGRAM_BOT_TOKEN"),
      botUsername: readOptionalString("ACOO_TELEGRAM_BOT_USERNAME"),
      enabled: readBoolean("ACOO_TELEGRAM_ENABLED", false),
      progressPulseMs: readNumber("ACOO_TELEGRAM_PROGRESS_PULSE_MS", 4_000),
      replyAudioByDefault: readBoolean("ACOO_TELEGRAM_REPLY_AUDIO_BY_DEFAULT", false),
    },
    transcription: {
      binary: readString("ACOO_STT_BINARY", "whisper-cli"),
      enabled: readBoolean("ACOO_STT_ENABLED", true),
      ffmpegBinary: readString("ACOO_STT_FFMPEG_BIN", "ffmpeg"),
      language: readOptionalString("ACOO_STT_LANGUAGE"),
      modelDownloaderBinary: readString("ACOO_STT_MODEL_DOWNLOADER_BIN", "curl"),
      modelPath:
        readOptionalString("ACOO_STT_MODEL_PATH") ??
        `.acoo/models/ggml-${transcriptionModel}.bin`,
      modelUrl:
        readOptionalString("ACOO_STT_MODEL_URL") ??
        `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${transcriptionModel}.bin`,
      modelVariant: transcriptionModel,
      threads: readNumber("ACOO_STT_THREADS", Math.max(1, Math.min(os.cpus().length, 4))),
    },
  };
}

function readString(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function readOptionalString(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function readList(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(expandHome);
}

function readNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readApprovalPolicy(
  name: string,
  fallback: CodexApprovalPolicy,
): CodexApprovalPolicy {
  const value = process.env[name]?.trim() as CodexApprovalPolicy | undefined;
  return value && approvalPolicies.includes(value) ? value : fallback;
}

function readReasoningEffort(
  name: string,
  fallback: CodexReasoningEffort,
): CodexReasoningEffort {
  const value = process.env[name]?.trim() as CodexReasoningEffort | undefined;
  return value && reasoningEfforts.includes(value) ? value : fallback;
}

function readSandboxMode(name: string, fallback: CodexSandboxMode): CodexSandboxMode {
  const value = process.env[name]?.trim() as CodexSandboxMode | undefined;
  return value && sandboxModes.includes(value) ? value : fallback;
}

function readAgentSlug(name: string, fallback: string): string {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  if (!/^[a-z0-9-]+$/.test(value)) {
    throw new Error(
      `Environment variable ${name} is invalid. Use lowercase letters, numbers and hyphens.`,
    );
  }

  return value;
}

function readOptionalAgentSlug(name: string): string | null {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return null;
  }

  if (!/^[a-z0-9-]+$/.test(value)) {
    throw new Error(
      `Environment variable ${name} is invalid. Use lowercase letters, numbers and hyphens.`,
    );
  }

  return value;
}

function expandHome(value: string): string {
  if (!value.startsWith("~/")) {
    return value;
  }

  return path.join(os.homedir(), value.slice(2));
}

function resolveDefaultPlaywrightHealthcheckCommand(repoRoot: string): string | null {
  const healthcheckScriptPath = path.join(repoRoot, "scripts", "playwright-mcp-healthcheck.mjs");
  return existsSync(healthcheckScriptPath) ? "node scripts/playwright-mcp-healthcheck.mjs" : null;
}
