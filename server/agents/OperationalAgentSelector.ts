import type { AgentRecord } from "../domain/models.js";
import { AgentRegistryConflictError } from "./AgentRegistryErrors.js";
import type { AgentRegistryService } from "./AgentRegistryService.js";

export type ActiveAgentSelectionSource =
  | "preferred"
  | "configured-default"
  | "configured-backup";

export interface ActiveAgentSelection<T extends { slug: string } = AgentRecord> {
  agent: T;
  source: ActiveAgentSelectionSource;
}

export interface ActiveAgentSelectionInput {
  defaultAgentSlug: string;
  backupAgentSlug?: string | null;
  preferredSlug?: string | null;
}

// Shared policy used by controller, Telegram and API:
// 1) preferred active slug, 2) configured default active slug, 3) configured backup active slug.
export function selectOperationalActiveAgentFromList<T extends { slug: string }>(
  activeAgents: T[],
  input: ActiveAgentSelectionInput,
): ActiveAgentSelection<T> {
  const preferredSlug = input.preferredSlug?.trim() ?? "";
  if (preferredSlug) {
    const preferred = activeAgents.find((agent) => agent.slug === preferredSlug);
    if (preferred) {
      return {
        agent: preferred,
        source: "preferred",
      };
    }
  }

  const defaultAgent = activeAgents.find((agent) => agent.slug === input.defaultAgentSlug);
  if (defaultAgent) {
    return {
      agent: defaultAgent,
      source: "configured-default",
    };
  }

  const backupSlug = input.backupAgentSlug?.trim() ?? "";
  if (backupSlug) {
    const backupAgent = activeAgents.find((agent) => agent.slug === backupSlug);
    if (backupAgent) {
      return {
        agent: backupAgent,
        source: "configured-backup",
      };
    }
  }

  if (activeAgents.length === 0) {
    throw new AgentRegistryConflictError("No active agents available in the registry.");
  }

  throw new AgentRegistryConflictError(
    `No active agent matched preferred/default/backup policy (preferred=${preferredSlug || "none"}, default=${input.defaultAgentSlug}, backup=${backupSlug || "none"}).`,
  );
}

export async function resolveOperationalActiveAgent(
  registry: AgentRegistryService,
  input: ActiveAgentSelectionInput,
): Promise<ActiveAgentSelection> {
  const activeAgents = await registry.listAgents();
  return selectOperationalActiveAgentFromList(activeAgents, input);
}
