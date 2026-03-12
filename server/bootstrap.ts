import path from "node:path";
import { fileURLToPath } from "node:url";
import { OperationalWorkspace } from "./application/services/OperationalWorkspace.js";
import { CodexRunner } from "./codex/CodexRunner.js";
import { FileSystemOperationalRepository } from "./infrastructure/repositories/FileSystemOperationalRepository.js";
import { buildOperationalToolCatalog } from "./mcp/tools.js";

export interface OperationalRuntime {
  codex: CodexRunner;
  tools: ReturnType<typeof buildOperationalToolCatalog>;
  workspace: OperationalWorkspace;
}

export function createOperationalRuntime(repoRoot = resolveRepoRoot()): OperationalRuntime {
  const repository = new FileSystemOperationalRepository({ repoRoot });
  const workspace = new OperationalWorkspace(repository);

  return {
    codex: new CodexRunner(),
    tools: buildOperationalToolCatalog(workspace),
    workspace,
  };
}

function resolveRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}
