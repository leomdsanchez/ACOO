import type { AppConfig } from "../config/AppConfig.js";
import type { CodexCliService } from "../codex/CodexCliService.js";
import type { OperationalWorkspace } from "../application/services/OperationalWorkspace.js";
import type { SkillLoader } from "../skills/SkillLoader.js";
import type { McpRegistryService } from "../mcp/McpRegistryService.js";
import type { AgentRegistryService } from "../agents/AgentRegistryService.js";
import type { McpSessionBootstrapper } from "../mcp/McpSessionBootstrapper.js";
import { TelegramSessionStore } from "../telegram/TelegramSessionStore.js";
import type { LocalTranscriptionService } from "../transcription/LocalTranscriptionService.js";
import os from "node:os";
import path from "node:path";

export interface RuntimeStatus {
  agents: {
    active: number;
    mcpProfiles: number;
    sessions: number;
    slugs: string[];
  };
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
    managedRuntimeHealthy: string[];
    managedRuntimeUnhealthy: string[];
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
    activeChats: number;
    allowedUsersCount: number;
    botUsername: string | null;
    configured: boolean;
    enabled: boolean;
    implemented: true;
    latestActiveAgentSlug: string | null;
    latestSessionId: string | null;
    latestUpdatedAt: string | null;
    replyAudioByDefault: boolean;
    totalChats: number;
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
    private readonly agentRegistry: AgentRegistryService,
    private readonly mcpSessionBootstrapper: McpSessionBootstrapper,
    private readonly skills: SkillLoader,
    private readonly workspace: OperationalWorkspace,
    private readonly transcription: LocalTranscriptionService,
  ) {}

  public async getStatus(): Promise<RuntimeStatus> {
    const telegramSessionStore = new TelegramSessionStore(this.config.repoRoot);
    const [cli, loadedSkills, projects, contacts, threads, tasks, telegramSession, transcription, agents, mcpProfiles, sessions, agentIntegrity, managedMcpRuntime] = await Promise.all([
      this.codex.getStatus(),
      this.skills.loadAll(),
      this.workspace.projects.listProjects(),
      this.workspace.contacts.listContacts(),
      this.workspace.threads.listThreads({ includeArchived: false }),
      this.workspace.tasks.listTasks({ includeCompleted: false }),
      telegramSessionStore.getSummary(),
      this.transcription.getHealth(),
      this.agentRegistry.listAgents(),
      this.agentRegistry.listMcpProfiles(),
      this.agentRegistry.listSessions(),
      this.agentRegistry.getIntegrityReport(),
      this.mcpSessionBootstrapper.getManagedRuntimeHealth(),
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
      agentIntegrity.duplicateSlugs.length > 0
        ? `Registry de agentes contém slugs duplicados: ${agentIntegrity.duplicateSlugs.join(", ")}.`
        : null,
      agentIntegrity.duplicateMcpProfileIds.length > 0
        ? `Registry de MCP profiles contém IDs duplicados: ${agentIntegrity.duplicateMcpProfileIds.join(", ")}.`
        : null,
    ].filter((issue): issue is string => issue !== null);
    const advisories = [
      cli.mcpServers.length > 0
        ? null
        : "Nenhuma integração MCP está configurada na Codex CLI para o ACOO usar.",
      ...managedMcpRuntime
        .filter((runtime) => !runtime.healthy)
        .map((runtime) =>
          runtime.autostart
            ? `MCP runtime gerenciado indisponível: ${runtime.name} (${runtime.healthcheckUrl}).`
            : `MCP runtime gerenciado indisponível: ${runtime.name} (${runtime.healthcheckUrl}). Inicie manualmente com: ${runtime.startupCommand}.`,
        ),
      mcp.recommendedMissing.length > 0
        ? `Integrações MCP recomendadas ausentes: ${mcp.recommendedMissing.join(", ")}.`
        : null,
      this.config.telegram.enabled && !hasTelegramSecrets(this.config)
        ? "Telegram habilitado no env, mas faltam bot token ou usuários autorizados."
        : null,
      this.config.telegram.enabled && telegramSession.activeChats > 0 && !telegramSession.latestSessionId
        ? "Canal Telegram ativo, mas a sessão mais recente ainda está sem thread Codex anexada; a próxima interação abre ou recria a sessão."
        : null,
      this.config.transcription.enabled && !transcription.modelAvailable
        ? `Modelo local de transcrição ainda não encontrado em ${transcription.modelPath}; será baixado na primeira transcrição.`
        : null,
      agentIntegrity.missingMcpProfileIds.length > 0
        ? `Alguns agentes apontam para MCP profiles inexistentes: ${agentIntegrity.missingMcpProfileIds.join(", ")}.`
        : null,
      agentIntegrity.missingAgentIdsInSessions.length > 0
        ? `Existem sessões vinculadas a agentes inexistentes: ${agentIntegrity.missingAgentIdsInSessions.join(", ")}.`
        : null,
      agentIntegrity.duplicateSessionThreadBindings.length > 0
        ? `Existem sessões duplicadas para o mesmo binding agente/canal/thread/codexThreadId: ${agentIntegrity.duplicateSessionThreadBindings.join(", ")}.`
        : null,
      this.config.codexConfigPath !== path.join(os.homedir(), ".codex", "config.toml")
        ? `A Codex CLI documenta ${path.join(os.homedir(), ".codex", "config.toml")} como config padrão; o caminho customizado ${this.config.codexConfigPath} hoje é validado pelo ACOO, mas não é injetado automaticamente na CLI.`
        : null,
    ].filter((advisory): advisory is string => advisory !== null);

    return {
      agents: {
        active: agents.length,
        mcpProfiles: mcpProfiles.length,
        sessions: sessions.length,
        slugs: agents.map((agent) => agent.slug),
      },
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
        managedRuntimeHealthy: managedMcpRuntime.filter((runtime) => runtime.healthy).map((runtime) => runtime.name),
        managedRuntimeUnhealthy: managedMcpRuntime.filter((runtime) => !runtime.healthy).map((runtime) => runtime.name),
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
        activeChats: telegramSession.activeChats,
        allowedUsersCount: this.config.telegram.allowedUserIds.length,
        botUsername: this.config.telegram.botUsername,
        configured: hasTelegramSecrets(this.config),
        enabled: this.config.telegram.enabled,
        implemented: true,
        latestActiveAgentSlug: telegramSession.latestActiveAgentSlug,
        latestSessionId: telegramSession.latestSessionId,
        latestUpdatedAt: telegramSession.latestUpdatedAt,
        replyAudioByDefault: this.config.telegram.replyAudioByDefault,
        totalChats: telegramSession.totalChats,
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
