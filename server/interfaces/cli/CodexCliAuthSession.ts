import os from "node:os";
import path from "node:path";

export class CodexCliAuthSession {
  public constructor(
    private readonly configPath = path.join(os.homedir(), ".codex", "config.toml"),
    private readonly defaultWorkingDirectory = process.cwd(),
  ) {}

  public getConfigPath(): string {
    return this.configPath;
  }

  public getDefaultWorkingDirectory(): string {
    return this.defaultWorkingDirectory;
  }

  public buildMcpAddCommand(name: string, url: string): string {
    return `codex mcp add ${name} --url ${url}`;
  }

  public buildSharedConfigHint(): string {
    return "Codex CLI e extensão IDE compartilham a configuração MCP em ~/.codex/config.toml.";
  }
}
