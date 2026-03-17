import type { AgentRecord } from "../domain/models.js";
import {
  evaluateAgentTelegramOperability,
  type AgentTelegramOperability,
} from "../agents/AgentTelegramOperability.js";

export interface AgentApiRecord extends AgentRecord {
  usability: {
    registered: true;
    system: {
      usable: boolean;
      reasons: string[];
    };
    telegram: AgentTelegramOperability;
  };
}

export function toAgentApiRecord(agent: AgentRecord): AgentApiRecord {
  const systemReasons = agent.status === "active" ? [] : [`agent status is "${agent.status}"`];
  return {
    ...agent,
    usability: {
      registered: true,
      system: {
        usable: systemReasons.length === 0,
        reasons: systemReasons,
      },
      telegram: evaluateAgentTelegramOperability(agent),
    },
  };
}
