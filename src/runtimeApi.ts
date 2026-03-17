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
  usability: {
    registered: true;
    system: {
      reasons: string[];
      usable: boolean;
    };
    telegram: {
      command: string;
      operable: boolean;
      reasons: string[];
    };
  };
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
    agentSlug: string;
    agentSlugConfigured: string;
    agentSlugEffective: string | null;
    agentSlugSource: "configured" | "fallback" | "unresolved";
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
  error?: {
    message?: string;
    statusCode?: number;
  };
}

export interface CreateAgentInput {
  approvalPolicy?: string;
  description: string;
  displayName: string;
  mcpProfileId: string;
  model?: string | null;
  promptInline?: string | null;
  promptTemplatePath?: string | null;
  reasoningEffort?: string;
  role: string;
  sandboxMode?: string;
  searchEnabled?: boolean;
  skillIds?: string[];
  slug: string;
  status?: string;
}

export interface UpdateAgentInput {
  approvalPolicy?: string;
  description?: string;
  displayName?: string;
  mcpProfileId?: string;
  model?: string | null;
  promptInline?: string | null;
  promptTemplatePath?: string | null;
  reasoningEffort?: string;
  role?: string;
  sandboxMode?: string;
  searchEnabled?: boolean;
  skillIds?: string[];
  status?: string;
}

export async function fetchRuntimeStatus(): Promise<RuntimeStatusSnapshot> {
  return fetchJson<RuntimeStatusSnapshot>("/api/status");
}

export async function fetchAgents(options?: { includeDisabled?: boolean }): Promise<AgentRecord[]> {
  const search = new URLSearchParams();
  if (options?.includeDisabled) {
    search.set("includeDisabled", "true");
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return fetchJson<AgentRecord[]>(`/api/agents${suffix}`);
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

export async function createAgent(input: CreateAgentInput): Promise<AgentRecord> {
  return fetchJson<AgentRecord>("/api/agents", {
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
}

export async function updateAgent(
  slug: string,
  input: UpdateAgentInput,
): Promise<AgentRecord> {
  return fetchJson<AgentRecord>(`/api/agents/${encodeURIComponent(slug)}`, {
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json",
    },
    method: "PATCH",
  });
}

export async function archiveAgent(slug: string): Promise<AgentRecord> {
  return updateAgent(slug, { status: "archived" });
}

export async function deleteAgent(slug: string): Promise<AgentRecord> {
  return fetchJson<AgentRecord>(`/api/agents/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message?.trim();
    throw new Error(message || `Request ${input} failed with HTTP ${response.status}.`);
  }

  if (!payload || !("data" in payload)) {
    throw new Error(`Request ${input} returned an invalid payload.`);
  }

  return payload.data;
}
