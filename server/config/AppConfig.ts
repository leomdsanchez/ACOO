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
  replyAudioByDefault: boolean;
}

export interface AppConfig {
  appName: string;
  codexApprovalPolicy: CodexApprovalPolicy;
  codexCliBinary: string;
  codexConfigPath: string;
  codexModel: string | null;
  codexReasoningEffort: CodexReasoningEffort;
  codexSandboxMode: CodexSandboxMode;
  repoRoot: string;
  skillRoots: string[];
  telegram: TelegramConfig;
}

export function loadAppConfig(repoRoot: string): AppConfig {
  ensureEnvironmentLoaded(repoRoot);

  return {
    appName: readString("VITE_APP_NAME", "ACOO"),
    codexApprovalPolicy: readApprovalPolicy("ACOO_CODEX_APPROVAL_POLICY", "never"),
    codexCliBinary: readString("ACOO_CODEX_CLI_BIN", "codex"),
    codexConfigPath: expandHome(readString("ACOO_CODEX_CONFIG_PATH", "~/.codex/config.toml")),
    codexModel: readOptionalString("ACOO_CODEX_MODEL"),
    codexReasoningEffort: readReasoningEffort("ACOO_CODEX_REASONING_EFFORT", "high"),
    codexSandboxMode: readSandboxMode("ACOO_CODEX_SANDBOX_MODE", "workspace-write"),
    repoRoot,
    skillRoots: readList("ACOO_SKILL_ROOTS", [
      path.join(repoRoot, "agents"),
      path.join(os.homedir(), ".codex", "skills"),
    ]),
    telegram: {
      allowedUserIds: readList("ACOO_TELEGRAM_ALLOWED_USER_IDS", []),
      botToken: readOptionalString("ACOO_TELEGRAM_BOT_TOKEN"),
      botUsername: readOptionalString("ACOO_TELEGRAM_BOT_USERNAME"),
      enabled: readBoolean("ACOO_TELEGRAM_ENABLED", false),
      replyAudioByDefault: readBoolean("ACOO_TELEGRAM_REPLY_AUDIO_BY_DEFAULT", false),
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

function expandHome(value: string): string {
  if (!value.startsWith("~/")) {
    return value;
  }

  return path.join(os.homedir(), value.slice(2));
}
