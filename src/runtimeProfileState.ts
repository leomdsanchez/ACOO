import {
  approvalPolicies,
  reasoningEfforts,
  sandboxModes,
  type CodexApprovalPolicy,
  type CodexReasoningEffort,
  type CodexSandboxMode,
  type RuntimeProfile,
} from "../shared/runtimeConfig";

export const runtimeProfileStorageKey = "acoo.runtime-profile";

export function readRuntimeProfileDefaults(): RuntimeProfile {
  return {
    approvalPolicy: readApprovalPolicy("VITE_CODEX_APPROVAL_POLICY_DEFAULT", "never"),
    model: readString("VITE_CODEX_MODEL_DEFAULT", "gpt-5.4"),
    reasoningEffort: readReasoningEffort("VITE_CODEX_REASONING_EFFORT_DEFAULT", "high"),
    sandboxMode: readSandboxMode("VITE_CODEX_SANDBOX_MODE_DEFAULT", "danger-full-access"),
    telegramAllowedUsersCount: readNumber("VITE_TELEGRAM_ALLOWED_USERS_COUNT", 0),
    telegramAudioReplyDefault: readBoolean("VITE_TELEGRAM_AUDIO_REPLY_DEFAULT", false),
    telegramBotUsername: readString("VITE_TELEGRAM_BOT_USERNAME", ""),
    telegramEnabled: readBoolean("VITE_TELEGRAM_ENABLED", false),
  };
}

export function buildCommandPreview(profile: RuntimeProfile): string {
  return [
    "codex",
    "-a",
    profile.approvalPolicy,
    "-c",
    `model_reasoning_effort="${profile.reasoningEffort}"`,
    "exec",
    "--sandbox",
    profile.sandboxMode,
    "--model",
    profile.model,
  ].join(" ");
}

export function loadRuntimeProfile(defaults: RuntimeProfile): RuntimeProfile {
  const raw = window.localStorage.getItem(runtimeProfileStorageKey);
  if (!raw) {
    return defaults;
  }

  try {
    return {
      ...defaults,
      ...JSON.parse(raw),
    } as RuntimeProfile;
  } catch {
    return defaults;
  }
}

function readString(name: string, fallback: string): string {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = import.meta.env[name];
  if (typeof value !== "string") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function readNumber(name: string, fallback: number): number {
  const value = Number(import.meta.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function readApprovalPolicy(
  name: string,
  fallback: CodexApprovalPolicy,
): CodexApprovalPolicy {
  const value = import.meta.env[name];
  return approvalPolicies.includes(value) ? value : fallback;
}

function readReasoningEffort(
  name: string,
  fallback: CodexReasoningEffort,
): CodexReasoningEffort {
  const value = import.meta.env[name];
  return reasoningEfforts.includes(value) ? value : fallback;
}

function readSandboxMode(name: string, fallback: CodexSandboxMode): CodexSandboxMode {
  const value = import.meta.env[name];
  return sandboxModes.includes(value) ? value : fallback;
}
