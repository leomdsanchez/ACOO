import type { AppConfig } from "../config/AppConfig.js";
import type { CodexCliService } from "../codex/CodexCliService.js";
import type { OperationalWorkspace } from "../application/services/OperationalWorkspace.js";
import type { SkillLoader } from "../skills/SkillLoader.js";

export interface RuntimeStatus {
  cli: Awaited<ReturnType<CodexCliService["getStatus"]>>;
  configuredMcpServerName: string;
  issues: string[];
  mcpServerConfigured: boolean;
  repository: {
    contacts: number;
    projects: number;
    tasks: number;
    threads: number;
  };
  skills: {
    count: number;
    sources: string[];
  };
}

export class RuntimeStatusService {
  public constructor(
    private readonly config: AppConfig,
    private readonly codex: CodexCliService,
    private readonly skills: SkillLoader,
    private readonly workspace: OperationalWorkspace,
  ) {}

  public async getStatus(): Promise<RuntimeStatus> {
    const [cli, loadedSkills, projects, contacts, threads, tasks] = await Promise.all([
      this.codex.getStatus(),
      this.skills.loadAll(),
      this.workspace.projects.listProjects(),
      this.workspace.contacts.listContacts(),
      this.workspace.threads.listThreads({ includeArchived: false }),
      this.workspace.tasks.listTasks({ includeCompleted: false }),
    ]);

    const mcpServerConfigured = cli.mcpServers.some(
      (server) => server.name === this.config.codexMcpServerName,
    );

    const issues = [
      cli.installed ? null : "Codex CLI binary não encontrada no PATH.",
      cli.authenticated ? null : "Codex CLI não autenticada.",
      cli.configExists ? null : `config.toml esperado não encontrado em ${cli.configPath}.`,
      mcpServerConfigured
        ? null
        : `Servidor MCP "${this.config.codexMcpServerName}" ainda não está configurado na Codex CLI.`,
      loadedSkills.length > 0 ? null : "Nenhuma skill foi carregada nas roots configuradas.",
    ].filter((issue): issue is string => issue !== null);

    return {
      cli,
      configuredMcpServerName: this.config.codexMcpServerName,
      issues,
      mcpServerConfigured,
      repository: {
        contacts: contacts.length,
        projects: projects.length,
        tasks: tasks.length,
        threads: threads.length,
      },
      skills: {
        count: loadedSkills.length,
        sources: [...new Set(loadedSkills.map((skill) => skill.sourcePath))],
      },
    };
  }
}
