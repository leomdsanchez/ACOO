import type { AppConfig } from "../config/AppConfig.js";
import type { CodexCliService } from "../codex/CodexCliService.js";
import type { OperationalWorkspace } from "../application/services/OperationalWorkspace.js";
import type { SkillLoader } from "../skills/SkillLoader.js";
import type { McpRegistryService } from "../mcp/McpRegistryService.js";

export interface RuntimeStatus {
  channels: {
    cli: "active";
    telegram: "planned";
  };
  cli: Awaited<ReturnType<CodexCliService["getStatus"]>>;
  defaults: {
    approvalPolicy: AppConfig["codexApprovalPolicy"];
    model: string | null;
    reasoningEffort: AppConfig["codexReasoningEffort"];
    sandboxMode: AppConfig["codexSandboxMode"];
  };
  advisories: string[];
  issues: string[];
  integrations: {
    configured: number;
    customConfigured: number;
    recommendedMissing: string[];
    supportedConfigured: number;
  };
  mcp: Awaited<ReturnType<McpRegistryService["getSnapshot"]>>;
  repository: {
    contacts: number;
    projects: number;
    tasks: number;
    threads: number;
  };
  telegram: {
    allowedUsersCount: number;
    botUsername: string | null;
    configured: boolean;
    enabled: boolean;
    implemented: false;
    replyAudioByDefault: boolean;
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
    private readonly mcpRegistry: McpRegistryService,
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
    const mcp = this.mcpRegistry.getSnapshot(cli);

    const issues = [
      cli.installed ? null : "Codex CLI binary não encontrada no PATH.",
      cli.authenticated ? null : "Codex CLI não autenticada.",
      cli.configExists ? null : `config.toml esperado não encontrado em ${cli.configPath}.`,
      loadedSkills.length > 0 ? null : "Nenhuma skill foi carregada nas roots configuradas.",
    ].filter((issue): issue is string => issue !== null);
    const advisories = [
      cli.mcpServers.length > 0
        ? null
        : "Nenhuma integração MCP está configurada na Codex CLI para o ACOO usar.",
      mcp.recommendedMissing.length > 0
        ? `Integrações MCP recomendadas ausentes: ${mcp.recommendedMissing.join(", ")}.`
        : null,
      this.config.telegram.enabled && !hasTelegramSecrets(this.config)
        ? "Telegram habilitado no env, mas faltam bot token ou usuários autorizados."
        : null,
      this.config.telegram.enabled
        ? "Telegram ainda não está implementado no runtime; apenas a modelagem e os defaults estão preparados."
        : null,
    ].filter((advisory): advisory is string => advisory !== null);

    return {
      channels: {
        cli: "active",
        telegram: "planned",
      },
      cli,
      defaults: {
        approvalPolicy: this.config.codexApprovalPolicy,
        model: this.config.codexModel,
        reasoningEffort: this.config.codexReasoningEffort,
        sandboxMode: this.config.codexSandboxMode,
      },
      advisories,
      issues,
      integrations: {
        configured: mcp.configured.length,
        customConfigured: mcp.configuredUnknown.length,
        recommendedMissing: mcp.recommendedMissing,
        supportedConfigured: mcp.catalog.filter((integration) => integration.configured).length,
      },
      mcp,
      repository: {
        contacts: contacts.length,
        projects: projects.length,
        tasks: tasks.length,
        threads: threads.length,
      },
      telegram: {
        allowedUsersCount: this.config.telegram.allowedUserIds.length,
        botUsername: this.config.telegram.botUsername,
        configured: hasTelegramSecrets(this.config),
        enabled: this.config.telegram.enabled,
        implemented: false,
        replyAudioByDefault: this.config.telegram.replyAudioByDefault,
      },
      skills: {
        count: loadedSkills.length,
        sources: [...new Set(loadedSkills.map((skill) => skill.sourcePath))],
      },
    };
  }
}

function hasTelegramSecrets(config: AppConfig): boolean {
  return Boolean(config.telegram.botToken) && config.telegram.allowedUserIds.length > 0;
}
