import os from "node:os";
import path from "node:path";

export interface AppConfig {
  appName: string;
  codexCliBinary: string;
  codexConfigPath: string;
  codexMcpServerName: string;
  conversationStoreFile: string;
  defaultConversationId: string;
  maxIterations: number;
  repoRoot: string;
  skillRoots: string[];
}

export function loadAppConfig(repoRoot: string): AppConfig {
  return {
    appName: readString("VITE_APP_NAME", "ACOO"),
    codexCliBinary: readString("ACOO_CODEX_CLI_BIN", "codex"),
    codexConfigPath: expandHome(readString("ACOO_CODEX_CONFIG_PATH", "~/.codex/config.toml")),
    codexMcpServerName: readString("ACOO_MCP_SERVER_NAME", "acoo"),
    conversationStoreFile: path.resolve(
      repoRoot,
      readString("ACOO_CONVERSATIONS_FILE", "data/conversations.json"),
    ),
    defaultConversationId: readString("ACOO_DEFAULT_CONVERSATION_ID", "local-main"),
    maxIterations: readInteger("ACOO_MAX_ITERATIONS", 5),
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

function readInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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
