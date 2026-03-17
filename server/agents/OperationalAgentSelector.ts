import type { AgentRecord } from "../domain/models.js";
import { AgentRegistryConflictError } from "./AgentRegistryErrors.js";
import type { AgentRegistryService } from "./AgentRegistryService.js";

export type ActiveAgentSelectionSource =
  | "preferred"
  | "configured-default"
  | "fallback-first-active";

export interface ActiveAgentSelection<T extends { slug: string } = AgentRecord> {
  agent: T;
  source: ActiveAgentSelectionSource;
}

export interface ActiveAgentSelectionInput {
  defaultAgentSlug: string;
  preferredSlug?: string | null;
}

// Shared policy used by controller, Telegram and API:
// 1) preferred active slug, 2) configured default active slug, 3) first active slug.
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

  const first = activeAgents[0];
  if (first) {
    return {
      agent: first,
      source: "fallback-first-active",
    };
  }

  throw new AgentRegistryConflictError("No active agents available in the registry.");
}

export async function resolveOperationalActiveAgent(
  registry: AgentRegistryService,
  input: ActiveAgentSelectionInput,
): Promise<ActiveAgentSelection> {
  const activeAgents = await registry.listAgents();
  return selectOperationalActiveAgentFromList(activeAgents, input);
}
