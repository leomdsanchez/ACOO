import path from "node:path";
import { fileURLToPath } from "node:url";
import { OperationalBot } from "./bot/OperationalBot.js";
import { AgentController } from "./controller/AgentController.js";
import { OperationalWorkspace } from "./application/services/OperationalWorkspace.js";
import { loadAppConfig } from "./config/AppConfig.js";
import { CodexCliService } from "./codex/CodexCliService.js";
import { OperationalContextService } from "./context/OperationalContextService.js";
import { AgentEngine } from "./engine/AgentEngine.js";
import { ToolRegistry } from "./engine/ToolRegistry.js";
import { OperationalMcpServer } from "./interfaces/mcp/OperationalMcpServer.js";
import { FileSystemOperationalRepository } from "./infrastructure/repositories/FileSystemOperationalRepository.js";
import { buildOperationalToolCatalog } from "./mcp/tools.js";
import { RuntimeStatusService } from "./status/RuntimeStatusService.js";
import { SkillExecutor } from "./skills/SkillExecutor.js";
import { SkillLoader } from "./skills/SkillLoader.js";
import { SkillRouter } from "./skills/SkillRouter.js";

export interface OperationalRuntime {
  bot: OperationalBot;
  config: ReturnType<typeof loadAppConfig>;
  context: OperationalContextService;
  controller: AgentController;
  codex: CodexCliService;
  engine: AgentEngine;
  interfaces: {
    mcp: OperationalMcpServer;
  };
  registry: ToolRegistry;
  skills: {
    executor: SkillExecutor;
    loader: SkillLoader;
    router: SkillRouter;
  };
  status: RuntimeStatusService;
  tools: ReturnType<typeof buildOperationalToolCatalog>;
  workspace: OperationalWorkspace;
}

export function createOperationalRuntime(repoRoot = resolveRepoRoot()): OperationalRuntime {
  const config = loadAppConfig(repoRoot);
  const repository = new FileSystemOperationalRepository({ repoRoot });
  const workspace = new OperationalWorkspace(repository);
  const tools = buildOperationalToolCatalog(workspace);
  const registry = new ToolRegistry(tools);
  const codex = new CodexCliService({
    approvalPolicy: config.codexApprovalPolicy,
    binary: config.codexCliBinary,
    configPath: config.codexConfigPath,
    cwd: repoRoot,
    model: config.codexModel,
    sandboxMode: config.codexSandboxMode,
  });
  const context = new OperationalContextService(workspace);
  const skillLoader = new SkillLoader({
    roots: config.skillRoots,
  });
  const skillRouter = new SkillRouter();
  const skillExecutor = new SkillExecutor();
  const engine = new AgentEngine(codex);
  const controller = new AgentController(
    engine,
    context,
    skillLoader,
    skillRouter,
    skillExecutor,
  );
  const bot = new OperationalBot(controller);
  const mcp = new OperationalMcpServer(registry);
  const status = new RuntimeStatusService(config, codex, skillLoader, workspace);

  return {
    bot,
    config,
    context,
    controller,
    codex,
    engine,
    interfaces: {
      mcp,
    },
    registry,
    skills: {
      executor: skillExecutor,
      loader: skillLoader,
      router: skillRouter,
    },
    status,
    tools,
    workspace,
  };
}

function resolveRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}
