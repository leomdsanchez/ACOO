import type { AgentRecord } from "../domain/models.js";

export interface AgentTelegramOperability {
  command: string;
  operable: boolean;
  reasons: string[];
}

const TELEGRAM_RESERVED_ROUTE_TARGETS = new Set([
  "agents",
  "chats",
  "end",
  "help",
  "new",
  "reset",
  "start",
  "status",
]);

export function isTelegramReservedRouteTarget(target: string): boolean {
  return TELEGRAM_RESERVED_ROUTE_TARGETS.has(target.trim().toLowerCase());
}

export function listTelegramReservedRouteTargets(): string[] {
  return [...TELEGRAM_RESERVED_ROUTE_TARGETS].sort();
}

export function evaluateAgentTelegramOperability(
  agent: Pick<AgentRecord, "slug" | "status">,
): AgentTelegramOperability {
  const command = `/${agent.slug}`;
  const reasons: string[] = [];

  if (agent.status !== "active") {
    reasons.push(`agent status is "${agent.status}"`);
  }

  if (isTelegramReservedRouteTarget(agent.slug)) {
    reasons.push(`slug conflicts with reserved Telegram command "${command}"`);
  }

  return {
    command,
    operable: reasons.length === 0,
    reasons,
  };
}
