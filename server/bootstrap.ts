import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentRegistryRepository } from "./agents/AgentRegistryRepository.js";
import { AgentRegistryService } from "./agents/AgentRegistryService.js";
import { AgentPromptLoader } from "./agents/AgentPromptLoader.js";
import { AgentSessionStarter } from "./agents/AgentSessionStarter.js";
import { OperationalBot } from "./bot/OperationalBot.js";
import { AgentController } from "./controller/AgentController.js";
import { OperationalWorkspace } from "./application/services/OperationalWorkspace.js";
import { OperationalRegistryService } from "./application/services/OperationalRegistryService.js";
import { WebChatService } from "./application/services/WebChatService.js";
import { loadAppConfig } from "./config/AppConfig.js";
import { CodexCliService } from "./codex/CodexCliService.js";
import { OperationalContextService } from "./context/OperationalContextService.js";
import { AgentEngine } from "./engine/AgentEngine.js";
import { FileSystemOperationalRepository } from "./infrastructure/repositories/FileSystemOperationalRepository.js";
import { PrismaOperationalRegistryRepository } from "./infrastructure/repositories/PrismaOperationalRegistryRepository.js";
import { McpPolicyEvaluator } from "./mcp/McpPolicyEvaluator.js";
import { McpRuntimeCatalog } from "./mcp/McpRuntimeCatalog.js";
import { McpRegistryService } from "./mcp/McpRegistryService.js";
import { McpSessionBootstrapper } from "./mcp/McpSessionBootstrapper.js";
import { PlaywrightSessionOwner } from "./mcp/PlaywrightSessionOwner.js";
import { RuntimeStatusService } from "./status/RuntimeStatusService.js";
import { LocalTranscriptionService } from "./transcription/LocalTranscriptionService.js";
import { SkillDependencyResolver } from "./skills/SkillDependencyResolver.js";
import { SkillExecutor } from "./skills/SkillExecutor.js";
import { SkillLoader } from "./skills/SkillLoader.js";
import { SkillRouter } from "./skills/SkillRouter.js";

export interface OperationalRuntime {
  agentRegistry: AgentRegistryService;
  bot: OperationalBot;
  config: ReturnType<typeof loadAppConfig>;
  context: OperationalContextService;
  controller: AgentController;
  codex: CodexCliService;
  engine: AgentEngine;
  mcpRegistry: McpRegistryService;
  mcpSessionBootstrapper: McpSessionBootstrapper;
  operationalRegistry: OperationalRegistryService;
  skills: {
    dependencyResolver: SkillDependencyResolver;
    executor: SkillExecutor;
    loader: SkillLoader;
    router: SkillRouter;
  };
  status: RuntimeStatusService;
  transcription: LocalTranscriptionService;
  webChat: WebChatService;
  workspace: OperationalWorkspace;
}

export function createOperationalRuntime(repoRoot = resolveRepoRoot()): OperationalRuntime {
  const config = loadAppConfig(repoRoot);
  const agentRegistry = new AgentRegistryService(new AgentRegistryRepository(repoRoot));
  const repository = new FileSystemOperationalRepository({ repoRoot });
  const workspace = new OperationalWorkspace(repository);
  const operationalRegistry = new OperationalRegistryService(
    new PrismaOperationalRegistryRepository(repoRoot),
  );
  const codex = new CodexCliService({
    approvalPolicy: config.codexApprovalPolicy,
    binary: config.codexCliBinary,
    configPath: config.codexConfigPath,
    cwd: repoRoot,
    execTimeoutMs: config.codexExecTimeoutMs,
    model: config.codexModel,
    reasoningEffort: config.codexReasoningEffort,
    sandboxMode: config.codexSandboxMode,
  });
  const context = new OperationalContextService(workspace);
  const agentPromptLoader = new AgentPromptLoader();
  const mcpPolicyEvaluator = new McpPolicyEvaluator(agentRegistry, codex);
  const mcpRuntimeCatalog = new McpRuntimeCatalog(config.playwrightMcp);
  const playwrightSessionOwner = config.playwrightMcp.ownSession
    ? new PlaywrightSessionOwner(config.playwrightMcp)
    : undefined;
  const mcpSessionBootstrapper = new McpSessionBootstrapper(
    mcpRuntimeCatalog,
    repoRoot,
    playwrightSessionOwner,
  );
  const skillLoader = new SkillLoader({
    roots: config.skillRoots,
  });
  const skillDependencyResolver = new SkillDependencyResolver();
  const skillRouter = new SkillRouter();
  const skillExecutor = new SkillExecutor();
  const transcription = new LocalTranscriptionService(repoRoot, config.transcription);
  const engine = new AgentEngine(codex);
  const agentSessionStarter = new AgentSessionStarter(mcpSessionBootstrapper, skillDependencyResolver);
  const controller = new AgentController(
    agentRegistry,
    agentPromptLoader,
    agentSessionStarter,
    mcpPolicyEvaluator,
    engine,
    context,
    skillLoader,
    skillRouter,
    skillExecutor,
    config.defaultAgentSlug,
    config.backupAgentSlug,
  );
  const bot = new OperationalBot(controller);
  const mcpRegistry = new McpRegistryService();
  const webChat = new WebChatService({
    agentRegistry,
    backupAgentSlug: config.backupAgentSlug,
    controller,
    defaultAgentSlug: config.defaultAgentSlug,
  });
  const status = new RuntimeStatusService(
    config,
    codex,
    mcpRegistry,
    agentRegistry,
    mcpSessionBootstrapper,
    playwrightSessionOwner,
    skillLoader,
    workspace,
    transcription,
  );

  return {
    agentRegistry,
    bot,
    config,
    context,
    controller,
    codex,
    engine,
    mcpRegistry,
    mcpSessionBootstrapper,
    operationalRegistry,
    skills: {
      dependencyResolver: skillDependencyResolver,
      executor: skillExecutor,
      loader: skillLoader,
      router: skillRouter,
    },
    status,
    transcription,
    webChat,
    workspace,
  };
}

function resolveRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}
