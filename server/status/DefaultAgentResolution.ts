import type { AgentRecord } from "../domain/models.js";
import { selectOperationalActiveAgentFromList } from "../agents/OperationalAgentSelector.js";
import { AgentRegistryConflictError } from "../agents/AgentRegistryErrors.js";

export interface DefaultAgentResolution {
  effectiveSlug: string | null;
  source: "configured" | "backup" | "unresolved";
}

export function resolveDefaultAgentResolution(
  activeAgents: AgentRecord[],
  configuredSlug: string,
  backupSlug: string | null = null,
): DefaultAgentResolution {
  if (activeAgents.length === 0) {
    return {
      effectiveSlug: null,
      source: "unresolved",
    };
  }

  let selection: ReturnType<typeof selectOperationalActiveAgentFromList>;
  try {
    selection = selectOperationalActiveAgentFromList(activeAgents, {
      backupAgentSlug: backupSlug,
      defaultAgentSlug: configuredSlug,
    });
  } catch (error) {
    if (error instanceof AgentRegistryConflictError) {
      return {
        effectiveSlug: null,
        source: "unresolved",
      };
    }
    throw error;
  }

  return {
    effectiveSlug: selection.agent.slug,
    source: selection.source === "configured-default" ? "configured" : "backup",
  };
}
