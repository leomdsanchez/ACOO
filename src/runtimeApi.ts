export interface AgentRecord {
  approvalPolicy: string;
  description: string;
  displayName: string;
  id: string;
  mcpProfileId: string;
  model: string | null;
  promptInline: string | null;
  promptTemplatePath: string | null;
  reasoningEffort: string;
  role: string;
  sandboxMode: string;
  searchEnabled: boolean;
  skillIds: string[];
  slug: string;
  status: string;
}

export interface AgentMcpProfileRecord {
  blocked: string[];
  description: string;
  id: string;
  name: string;
  optional: string[];
  required: string[];
}

export interface AgentRunRecord {
  agentDisplayName: string | null;
  agentId: string;
  agentSlug: string | null;
  channel: string;
  command: string;
  createdAt: string;
  id: string;
  promptDigest: string;
  resultSummary: string;
  sessionId: string | null;
  status: string;
}

export interface AgentSessionRecord {
  agentDisplayName: string | null;
  agentId: string;
  agentSlug: string | null;
  channel: string;
  channelThreadId: string;
  codexThreadId: string | null;
  cwd: string;
  id: string;
  lastUsedAt: string;
  mode: string;
  startedAt: string;
  status: string;
  title: string | null;
}

export interface SkillSummaryRecord {
  description: string;
  id: string;
  keywords: string[];
  name: string;
  sourcePath: string;
}

export interface RuntimeStatusSnapshot {
  agents: {
    active: number;
    sessions: number;
  };
  advisories: string[];
  channels: {
    telegram: string;
  };
  cli: {
    authenticated: boolean;
    loginStatus: string;
  };
  defaults: {
    approvalPolicy: string;
    model: string | null;
    reasoningEffort: string;
    sandboxMode: string;
  };
  integrations: {
    configured: number;
    managedRuntimeHealthy: string[];
  };
  issues: string[];
  telegram: {
    activeChats: number;
    botUsername: string | null;
    enabled: boolean;
    implemented: boolean;
    totalChats: number;
  };
}

interface ApiEnvelope<T> {
  data: T;
}

export async function fetchRuntimeStatus(): Promise<RuntimeStatusSnapshot> {
  return fetchJson<RuntimeStatusSnapshot>("/api/status");
}

export async function fetchAgents(): Promise<AgentRecord[]> {
  return fetchJson<AgentRecord[]>("/api/agents");
}

export async function fetchAgent(slug: string): Promise<AgentRecord> {
  return fetchJson<AgentRecord>(`/api/agents/${encodeURIComponent(slug)}`);
}

export async function fetchAgentProfiles(): Promise<AgentMcpProfileRecord[]> {
  return fetchJson<AgentMcpProfileRecord[]>("/api/agents/profiles");
}

export async function fetchAgentSkills(): Promise<SkillSummaryRecord[]> {
  return fetchJson<SkillSummaryRecord[]>("/api/agents/skills");
}

export async function fetchAgentSessions(agentId: string): Promise<AgentSessionRecord[]> {
  const search = new URLSearchParams({ agentId, limit: "5" });
  return fetchJson<AgentSessionRecord[]>(`/api/sessions?${search.toString()}`);
}

export async function fetchAgentRuns(agentId: string): Promise<AgentRunRecord[]> {
  const search = new URLSearchParams({ agentId, limit: "5" });
  return fetchJson<AgentRunRecord[]>(`/api/runs?${search.toString()}`);
}

export async function updateAgentOverview(
  slug: string,
  input: Partial<
    Pick<
      AgentRecord,
      | "approvalPolicy"
      | "description"
      | "displayName"
      | "mcpProfileId"
      | "model"
      | "reasoningEffort"
      | "role"
      | "sandboxMode"
      | "searchEnabled"
      | "status"
    >
  >,
): Promise<AgentRecord> {
  return fetchJson<AgentRecord>(`/api/agents/${encodeURIComponent(slug)}`, {
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json",
    },
    method: "PATCH",
  });
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`Request ${input} failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}
