export type CodexApprovalPolicy = "untrusted" | "on-failure" | "on-request" | "never";
export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";
export type CodexReasoningEffort = "low" | "medium" | "high" | "xhigh";

export interface RuntimeProfile {
  approvalPolicy: CodexApprovalPolicy;
  model: string;
  reasoningEffort: CodexReasoningEffort;
  sandboxMode: CodexSandboxMode;
  telegramAllowedUsersCount: number;
  telegramAudioReplyDefault: boolean;
  telegramBotUsername: string;
  telegramEnabled: boolean;
}

export const approvalPolicies: CodexApprovalPolicy[] = [
  "untrusted",
  "on-failure",
  "on-request",
  "never",
];

export const reasoningEfforts: CodexReasoningEffort[] = ["low", "medium", "high", "xhigh"];

export const sandboxModes: CodexSandboxMode[] = [
  "read-only",
  "workspace-write",
  "danger-full-access",
];
