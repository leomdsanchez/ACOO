import type { AgentRecord } from "../domain/models.js";
import type { AgentExecutionProfile } from "../engine/AgentEngine.js";
import type { McpPolicyEvaluation } from "../mcp/McpPolicyEvaluator.js";

export function buildAgentExecutionProfile(agent: AgentRecord | null): AgentExecutionProfile | undefined {
  if (!agent) {
    return undefined;
  }

  return {
    approvalPolicy: agent.approvalPolicy,
    model: agent.model,
    reasoningEffort: agent.reasoningEffort,
    sandboxMode: agent.sandboxMode,
    searchEnabled: agent.searchEnabled,
  };
}

export function ensureAgentCanRun(agent: AgentRecord | null, mcpPolicy: McpPolicyEvaluation): void {
  if (!agent || mcpPolicy.missingRequired.length === 0) {
    return;
  }

  throw new Error(
    `Agent "${agent.slug}" is missing required MCP integrations: ${mcpPolicy.missingRequired.join(", ")}.`,
  );
}

export function renderAgentRuntimeSummary(
  agent: AgentRecord,
  mcpPolicy: McpPolicyEvaluation,
): string[] {
  const sections = [
    renderExecutionProfile(agent),
    renderMcpPolicy(mcpPolicy),
  ].filter((section): section is string => Boolean(section));

  return sections;
}

function renderExecutionProfile(agent: AgentRecord): string {
  const search = agent.searchEnabled ? "enabled" : "disabled";
  return [
    "Execution profile:",
    `- model: ${agent.model ?? "default"}`,
    `- reasoning effort: ${agent.reasoningEffort}`,
    `- approval policy: ${agent.approvalPolicy}`,
    `- sandbox mode: ${agent.sandboxMode}`,
    `- web search: ${search}`,
  ].join("\n");
}

function renderMcpPolicy(mcpPolicy: McpPolicyEvaluation): string | null {
  if (!mcpPolicy.profile) {
    return null;
  }

  const lines = [`MCP profile: ${mcpPolicy.profile.name}`];

  if (mcpPolicy.configuredRequired.length > 0) {
    lines.push(`- required configured: ${mcpPolicy.configuredRequired.join(", ")}`);
  }

  if (mcpPolicy.configuredOptional.length > 0) {
    lines.push(`- optional configured: ${mcpPolicy.configuredOptional.join(", ")}`);
  }

  if (mcpPolicy.blockedConfigured.length > 0) {
    lines.push(`- blocked for this agent: ${mcpPolicy.blockedConfigured.join(", ")}`);
    lines.push("- do not use blocked MCPs even if globally configured in the CLI");
  }

  return lines.join("\n");
}
