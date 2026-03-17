import type { AgentRecord, RuntimeStatusSnapshot } from "../runtimeApi";

export function telegramAvailabilitySummary(agent: AgentRecord, telegramEnabled: boolean): string {
  if (!telegramEnabled) {
    return "canal desabilitado no runtime";
  }
  if (agent.usability.telegram.operable) {
    return "operavel agora (/agents e /slug)";
  }
  if (agent.usability.telegram.reasons.length > 0) {
    return `bloqueado: ${agent.usability.telegram.reasons.join("; ")}`;
  }
  return "nao operavel";
}

export function formatDefaultAgentSummary(runtimeStatus: RuntimeStatusSnapshot): string {
  const runtimeLabel = `${runtimeStatus.defaults.model ?? "default"} / ${runtimeStatus.defaults.reasoningEffort}`;
  const source = runtimeStatus.defaults.agentSlugSource;
  const effective = runtimeStatus.defaults.agentSlugEffective;
  const configured = runtimeStatus.defaults.agentSlugConfigured;

  if (source === "configured") {
    return `padrao /${configured} · ${runtimeLabel}`;
  }

  if (source === "backup" && effective) {
    return `operando com /${effective} como backup de /${configured}`;
  }

  return `sem agente ativo para assumir o padrao /${configured}`;
}

export function resolveDefaultAgentTone(
  runtimeStatus: RuntimeStatusSnapshot,
): "good" | "warn" | "danger" {
  switch (runtimeStatus.defaults.agentSlugSource) {
    case "configured":
      return "good";
    case "backup":
      return "warn";
    case "unresolved":
    default:
      return "danger";
  }
}

export function sortAgents(agents: AgentRecord[]): AgentRecord[] {
  return [...agents].sort((left, right) => {
    const leftRank = left.status === "active" ? 0 : left.status === "disabled" ? 1 : 2;
    const rightRank = right.status === "active" ? 0 : right.status === "disabled" ? 1 : 2;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return left.displayName.localeCompare(right.displayName);
  });
}

export function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
