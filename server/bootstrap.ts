import path from "node:path";
import { fileURLToPath } from "node:url";
import { OperationalBot } from "./bot/OperationalBot.js";
import { AgentController } from "./controller/AgentController.js";
import { OperationalWorkspace } from "./application/services/OperationalWorkspace.js";
import { loadAppConfig } from "./config/AppConfig.js";
import { CodexRunner } from "./codex/CodexRunner.js";
import { AgentLoop } from "./engine/AgentLoop.js";
import { ToolRegistry } from "./engine/ToolRegistry.js";
import { CodexCliAuthSession } from "./interfaces/cli/CodexCliAuthSession.js";
import { OperationalMcpServer } from "./interfaces/mcp/OperationalMcpServer.js";
import { FileSystemOperationalRepository } from "./infrastructure/repositories/FileSystemOperationalRepository.js";
import { CodexCliProvider } from "./llm/CodexCliProvider.js";
import { SkillRoutingProvider } from "./llm/SkillRoutingProvider.js";
import { JsonConversationRepository } from "./memory/JsonConversationRepository.js";
import { MemoryManager } from "./memory/MemoryManager.js";
import { buildOperationalToolCatalog } from "./mcp/tools.js";
import { SkillExecutor } from "./skills/SkillExecutor.js";
import { SkillLoader } from "./skills/SkillLoader.js";
import { SkillRouter } from "./skills/SkillRouter.js";

export interface OperationalRuntime {
  bot: OperationalBot;
  controller: AgentController;
  codex: CodexRunner;
  engine: AgentLoop;
  interfaces: {
    cli: CodexCliAuthSession;
    mcp: OperationalMcpServer;
  };
  llm: {
    provider: CodexCliProvider;
    router: SkillRoutingProvider;
  };
  memory: MemoryManager;
  registry: ToolRegistry;
  skills: {
    executor: SkillExecutor;
    loader: SkillLoader;
    router: SkillRouter;
  };
  tools: ReturnType<typeof buildOperationalToolCatalog>;
  workspace: OperationalWorkspace;
}

export function createOperationalRuntime(repoRoot = resolveRepoRoot()): OperationalRuntime {
  const config = loadAppConfig(repoRoot);
  const repository = new FileSystemOperationalRepository({ repoRoot });
  const workspace = new OperationalWorkspace(repository);
  const tools = buildOperationalToolCatalog(workspace);
  const registry = new ToolRegistry(tools);
  const codex = new CodexRunner(config.codexCliBinary);
  const cliSession = new CodexCliAuthSession(config.codexConfigPath, repoRoot);
  const llmProvider = new CodexCliProvider(codex, cliSession);
  const routingProvider = new SkillRoutingProvider("rule-based");
  const conversationRepository = new JsonConversationRepository(config.conversationStoreFile);
  const memory = new MemoryManager(conversationRepository, workspace);
  const skillLoader = new SkillLoader({
    roots: config.skillRoots,
  });
  const skillRouter = new SkillRouter(routingProvider);
  const skillExecutor = new SkillExecutor();
  const engine = new AgentLoop(llmProvider, registry, memory, config.maxIterations);
  const controller = new AgentController(
    engine,
    memory,
    skillLoader,
    skillRouter,
    skillExecutor,
    workspace,
  );
  const bot = new OperationalBot(controller);
  const mcp = new OperationalMcpServer(registry);

  return {
    bot,
    controller,
    codex,
    engine,
    interfaces: {
      cli: cliSession,
      mcp,
    },
    llm: {
      provider: llmProvider,
      router: routingProvider,
    },
    memory,
    registry,
    skills: {
      executor: skillExecutor,
      loader: skillLoader,
      router: skillRouter,
    },
    tools,
    workspace,
  };
}

function resolveRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}
