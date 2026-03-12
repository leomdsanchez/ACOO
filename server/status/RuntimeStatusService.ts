import type { AppConfig } from "../config/AppConfig.js";
import type { CodexCliService } from "../codex/CodexCliService.js";
import type { OperationalWorkspace } from "../application/services/OperationalWorkspace.js";
import type { SkillLoader } from "../skills/SkillLoader.js";
import type { McpRegistryService } from "../mcp/McpRegistryService.js";
import { TelegramSessionStore } from "../telegram/TelegramSessionStore.js";
import type { LocalTranscriptionService } from "../transcription/LocalTranscriptionService.js";

export interface RuntimeStatus {
  channels: {
    cli: "active";
    telegram: "available";
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
    active: boolean;
    allowedUsersCount: number;
    botUsername: string | null;
    configured: boolean;
    enabled: boolean;
    implemented: true;
    replyAudioByDefault: boolean;
    sessionId: string | null;
    updatedAt: string | null;
  };
  transcription: {
    binary: string;
    enabled: boolean;
    ffmpegAvailable: boolean;
    ffmpegBinary: string;
    language: string | null;
    modelAvailable: boolean;
    modelPath: string;
    modelVariant: string;
    threads: number;
    whisperBinaryAvailable: boolean;
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
    private readonly transcription: LocalTranscriptionService,
  ) {}

  public async getStatus(): Promise<RuntimeStatus> {
    const telegramSessionStore = new TelegramSessionStore(this.config.repoRoot);
    const [cli, loadedSkills, projects, contacts, threads, tasks, telegramSession, transcription] = await Promise.all([
      this.codex.getStatus(),
      this.skills.loadAll(),
      this.workspace.projects.listProjects(),
      this.workspace.contacts.listContacts(),
      this.workspace.threads.listThreads({ includeArchived: false }),
      this.workspace.tasks.listTasks({ includeCompleted: false }),
      telegramSessionStore.load(),
      this.transcription.getHealth(),
    ]);
    const mcp = this.mcpRegistry.getSnapshot(cli);

    const issues = [
      cli.installed ? null : "Codex CLI binary não encontrada no PATH.",
      cli.authenticated ? null : "Codex CLI não autenticada.",
      cli.configExists ? null : `config.toml esperado não encontrado em ${cli.configPath}.`,
      loadedSkills.length > 0 ? null : "Nenhuma skill foi carregada nas roots configuradas.",
      this.config.transcription.enabled && !transcription.whisperBinaryAvailable
        ? `Transcrição local habilitada, mas o binário "${this.config.transcription.binary}" não está disponível.`
        : null,
      this.config.transcription.enabled && !transcription.ffmpegAvailable
        ? `Transcrição local habilitada, mas o binário "${this.config.transcription.ffmpegBinary}" não está disponível.`
        : null,
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
      this.config.telegram.enabled && telegramSession.active && !telegramSession.sessionId
        ? "Canal Telegram ativo, mas ainda sem thread Codex anexada; a próxima interação abre ou recria a sessão."
        : null,
      this.config.transcription.enabled && !transcription.modelAvailable
        ? `Modelo local de transcrição ainda não encontrado em ${transcription.modelPath}; será baixado na primeira transcrição.`
        : null,
    ].filter((advisory): advisory is string => advisory !== null);

    return {
      channels: {
        cli: "active",
        telegram: "available",
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
        active: telegramSession.active,
        allowedUsersCount: this.config.telegram.allowedUserIds.length,
        botUsername: this.config.telegram.botUsername,
        configured: hasTelegramSecrets(this.config),
        enabled: this.config.telegram.enabled,
        implemented: true,
        replyAudioByDefault: this.config.telegram.replyAudioByDefault,
        sessionId: telegramSession.sessionId,
        updatedAt: telegramSession.updatedAt,
      },
      transcription: {
        binary: this.config.transcription.binary,
        enabled: this.config.transcription.enabled,
        ffmpegAvailable: transcription.ffmpegAvailable,
        ffmpegBinary: this.config.transcription.ffmpegBinary,
        language: this.config.transcription.language,
        modelAvailable: transcription.modelAvailable,
        modelPath: this.config.transcription.modelPath,
        modelVariant: this.config.transcription.modelVariant,
        threads: this.config.transcription.threads,
        whisperBinaryAvailable: transcription.whisperBinaryAvailable,
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
