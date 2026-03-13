import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentRegistryRepository } from "./agents/AgentRegistryRepository.js";
import { AgentRegistryService } from "./agents/AgentRegistryService.js";
import { OperationalBot } from "./bot/OperationalBot.js";
import { AgentController } from "./controller/AgentController.js";
import { OperationalWorkspace } from "./application/services/OperationalWorkspace.js";
import { loadAppConfig } from "./config/AppConfig.js";
import { CodexCliService } from "./codex/CodexCliService.js";
import { OperationalContextService } from "./context/OperationalContextService.js";
import { AgentEngine } from "./engine/AgentEngine.js";
import { FileSystemOperationalRepository } from "./infrastructure/repositories/FileSystemOperationalRepository.js";
import { McpRegistryService } from "./mcp/McpRegistryService.js";
import { RuntimeStatusService } from "./status/RuntimeStatusService.js";
import { LocalTranscriptionService } from "./transcription/LocalTranscriptionService.js";
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
  skills: {
    executor: SkillExecutor;
    loader: SkillLoader;
    router: SkillRouter;
  };
  status: RuntimeStatusService;
  transcription: LocalTranscriptionService;
  workspace: OperationalWorkspace;
}

export function createOperationalRuntime(repoRoot = resolveRepoRoot()): OperationalRuntime {
  const config = loadAppConfig(repoRoot);
  const agentRegistry = new AgentRegistryService(new AgentRegistryRepository(repoRoot));
  const repository = new FileSystemOperationalRepository({ repoRoot });
  const workspace = new OperationalWorkspace(repository);
  const codex = new CodexCliService({
    approvalPolicy: config.codexApprovalPolicy,
    binary: config.codexCliBinary,
    configPath: config.codexConfigPath,
    cwd: repoRoot,
    model: config.codexModel,
    reasoningEffort: config.codexReasoningEffort,
    sandboxMode: config.codexSandboxMode,
  });
  const context = new OperationalContextService(workspace);
  const skillLoader = new SkillLoader({
    roots: config.skillRoots,
  });
  const skillRouter = new SkillRouter();
  const skillExecutor = new SkillExecutor();
  const transcription = new LocalTranscriptionService(repoRoot, config.transcription);
  const engine = new AgentEngine(codex);
  const controller = new AgentController(
    agentRegistry,
    engine,
    context,
    skillLoader,
    skillRouter,
    skillExecutor,
  );
  const bot = new OperationalBot(controller);
  const mcpRegistry = new McpRegistryService();
  const status = new RuntimeStatusService(
    config,
    codex,
    mcpRegistry,
    agentRegistry,
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
    skills: {
      executor: skillExecutor,
      loader: skillLoader,
      router: skillRouter,
    },
    status,
    transcription,
    workspace,
  };
}

function resolveRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}
