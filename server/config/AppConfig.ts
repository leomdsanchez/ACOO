import os from "node:os";
import path from "node:path";

export interface AppConfig {
  appName: string;
  codexApprovalPolicy: string;
  codexCliBinary: string;
  codexConfigPath: string;
  codexModel: string | null;
  codexMcpServerName: string;
  codexSandboxMode: string;
  repoRoot: string;
  skillRoots: string[];
}

export function loadAppConfig(repoRoot: string): AppConfig {
  return {
    appName: readString("VITE_APP_NAME", "ACOO"),
    codexApprovalPolicy: readString("ACOO_CODEX_APPROVAL_POLICY", "never"),
    codexCliBinary: readString("ACOO_CODEX_CLI_BIN", "codex"),
    codexConfigPath: expandHome(readString("ACOO_CODEX_CONFIG_PATH", "~/.codex/config.toml")),
    codexModel: readOptionalString("ACOO_CODEX_MODEL"),
    codexMcpServerName: readString("ACOO_MCP_SERVER_NAME", "acoo"),
    codexSandboxMode: readString("ACOO_CODEX_SANDBOX_MODE", "workspace-write"),
    repoRoot,
    skillRoots: readList("ACOO_SKILL_ROOTS", [
      path.join(repoRoot, "agents"),
      path.join(os.homedir(), ".codex", "skills"),
    ]),
  };
}

function readString(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function readOptionalString(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
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

function expandHome(value: string): string {
  if (!value.startsWith("~/")) {
    return value;
  }

  return path.join(os.homedir(), value.slice(2));
}
