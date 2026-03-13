import crypto from "node:crypto";
import type {
  CreateAgentInput,
  AgentMcpProfileRecord,
  AgentRecord,
  AgentRunRecord,
  AgentSessionChannel,
  AgentSessionMode,
  AgentSessionRecord,
  AgentSessionStatus,
  UpdateAgentInput,
} from "../domain/models.js";
import { AgentRegistryRepository } from "./AgentRegistryRepository.js";

export interface CreateAgentSessionInput {
  agentId: string;
  channel: AgentSessionChannel;
  channelThreadId: string;
  codexThreadId?: string | null;
  cwd: string;
  mode: AgentSessionMode;
  status?: AgentSessionStatus;
}

export interface RecordAgentRunInput {
  agentId: string;
  channel: AgentSessionChannel;
  command: string;
  prompt: string;
  resultSummary: string;
  sessionId?: string | null;
  status: AgentRunRecord["status"];
}

export interface AgentRegistryIntegrityReport {
  duplicateMcpProfileIds: string[];
  duplicateSessionKeys: string[];
  duplicateSlugs: string[];
  missingAgentIdsInSessions: string[];
  missingMcpProfileIds: string[];
}

const allowedSandboxModes = new Set(["read-only", "workspace-write", "danger-full-access"]);
const allowedApprovalPolicies = new Set(["untrusted", "on-failure", "on-request", "never"]);
const allowedReasoningEfforts = new Set(["low", "medium", "high", "xhigh"]);
const allowedRoles = new Set(["primary", "specialist", "automation"]);
const allowedStatuses = new Set(["active", "disabled", "archived"]);

export class AgentRegistryService {
  public constructor(private readonly repository: AgentRegistryRepository) {}

  public async listAgents(options?: {
    includeDisabled?: boolean;
    role?: AgentRecord["role"];
  }): Promise<AgentRecord[]> {
    const agents = await this.repository.listAgents();
    return agents
      .filter((agent) => options?.includeDisabled || agent.status === "active")
      .filter((agent) => !options?.role || agent.role === options.role)
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  public async getAgentBySlug(slug: string): Promise<AgentRecord | null> {
    return this.repository.findAgentBySlug(slug);
  }

  public async createAgent(input: CreateAgentInput): Promise<AgentRecord> {
    const slug = normalizeAgentSlug(input.slug);
    const existing = await this.repository.findAgentBySlug(slug);
    if (existing) {
      throw new Error(`Agent slug "${slug}" already exists.`);
    }

    const record = await this.buildAgentRecord({ ...input, slug });
    return this.repository.createAgent(record);
  }

  public async updateAgent(input: UpdateAgentInput): Promise<AgentRecord> {
    const slug = normalizeAgentSlug(input.slug);
    const current = await this.repository.findAgentBySlug(slug);
    if (!current) {
      throw new Error(`Agent slug "${slug}" is not registered.`);
    }

    const record = await this.buildAgentRecord(
      {
        ...current,
        ...input,
        slug: current.slug,
      },
      current,
    );
    return this.repository.updateAgent(record);
  }

  public async disableAgent(slug: string): Promise<AgentRecord> {
    return this.updateAgent({ slug, status: "disabled" });
  }

  public async listMcpProfiles(): Promise<AgentMcpProfileRecord[]> {
    return this.repository.listMcpProfiles();
  }

  public async getMcpProfileById(id: string): Promise<AgentMcpProfileRecord | null> {
    return this.repository.findMcpProfileById(id);
  }

  public async listSessions(options?: {
    agentId?: string;
    channel?: AgentSessionChannel;
    status?: AgentSessionStatus;
  }): Promise<AgentSessionRecord[]> {
    const sessions = await this.repository.listSessions();
    return sessions
      .filter((session) => !options?.agentId || session.agentId === options.agentId)
      .filter((session) => !options?.channel || session.channel === options.channel)
      .filter((session) => !options?.status || session.status === options.status)
      .sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt));
  }

  public async upsertSession(input: CreateAgentSessionInput): Promise<AgentSessionRecord> {
    const agents = await this.repository.listAgents();
    ensureAgentExists(agents, input.agentId);
    const now = new Date().toISOString();
    const sessions = await this.repository.listSessions();
    const current = sessions.find((session) => (
      session.agentId === input.agentId &&
      session.channel === input.channel &&
      session.channelThreadId === input.channelThreadId
    ));

    const next: AgentSessionRecord = current
      ? {
          ...current,
          codexThreadId: input.codexThreadId ?? current.codexThreadId,
          cwd: input.cwd,
          lastUsedAt: now,
          mode: input.mode,
          status: input.status ?? current.status,
        }
      : {
          id: crypto.randomUUID(),
          agentId: input.agentId,
          channel: input.channel,
          channelThreadId: input.channelThreadId,
          codexThreadId: input.codexThreadId ?? null,
          cwd: input.cwd,
          lastUsedAt: now,
          mode: input.mode,
          startedAt: now,
          status: input.status ?? "active",
        };

    return this.repository.upsertSession(next);
  }

  public async setSessionStatus(input: {
    agentId: string;
    channel: AgentSessionChannel;
    channelThreadId: string;
    status: AgentSessionStatus;
  }): Promise<AgentSessionRecord | null> {
    const agents = await this.repository.listAgents();
    ensureAgentExists(agents, input.agentId);
    return this.repository.updateSessionStatus(
      input.agentId,
      input.channel,
      input.channelThreadId,
      input.status,
    );
  }

  public async listRuns(options?: { agentId?: string; limit?: number }): Promise<AgentRunRecord[]> {
    const runs = await this.repository.listRuns();
    const filtered = runs
      .filter((run) => !options?.agentId || run.agentId === options.agentId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return typeof options?.limit === "number" ? filtered.slice(0, options.limit) : filtered;
  }

  public async recordRun(input: RecordAgentRunInput): Promise<AgentRunRecord> {
    const [agents, sessions] = await Promise.all([
      this.repository.listAgents(),
      input.sessionId ? this.repository.listSessions() : Promise.resolve([]),
    ]);
    ensureAgentExists(agents, input.agentId);

    if (input.sessionId) {
      ensureSessionExists(sessions, input.sessionId);
    }

    const record: AgentRunRecord = {
      id: crypto.randomUUID(),
      agentId: input.agentId,
      channel: input.channel,
      command: input.command,
      createdAt: new Date().toISOString(),
      promptDigest: createDigest(input.prompt),
      resultSummary: input.resultSummary,
      sessionId: input.sessionId ?? null,
      status: input.status,
    };

    return this.repository.createRun(record);
  }

  public async getIntegrityReport(): Promise<AgentRegistryIntegrityReport> {
    const snapshot = await this.repository.loadSnapshot();

    return {
      duplicateMcpProfileIds: findDuplicates(snapshot.mcpProfiles.map((profile) => profile.id)),
      duplicateSessionKeys: findDuplicates(
        snapshot.sessions.map((session) => (
          `${session.agentId}:${session.channel}:${session.channelThreadId}`
        )),
      ),
      duplicateSlugs: findDuplicates(snapshot.agents.map((agent) => agent.slug)),
      missingAgentIdsInSessions: snapshot.sessions
        .filter((session) => !snapshot.agents.some((agent) => agent.id === session.agentId))
        .map((session) => session.agentId)
        .filter(uniqueValue),
      missingMcpProfileIds: snapshot.agents
        .filter((agent) => !snapshot.mcpProfiles.some((profile) => profile.id === agent.mcpProfileId))
        .map((agent) => agent.mcpProfileId)
        .filter(uniqueValue),
    };
  }

  private async buildAgentRecord(
    input: CreateAgentInput | (UpdateAgentInput & AgentRecord),
    current?: AgentRecord,
  ): Promise<AgentRecord> {
    const now = new Date().toISOString();
    const mcpProfileId = normalizeRequiredText(input.mcpProfileId, "mcpProfileId");
    const mcpProfile = await this.repository.findMcpProfileById(mcpProfileId);
    if (!mcpProfile) {
      throw new Error(`MCP profile "${mcpProfileId}" is not registered.`);
    }

    return {
      id: current?.id ?? crypto.randomUUID(),
      slug: normalizeAgentSlug(input.slug),
      displayName: normalizeRequiredText(input.displayName, "displayName"),
      role: normalizeEnumValue(
        input.role,
        allowedRoles,
        "role",
      ) as AgentRecord["role"],
      description: normalizeRequiredText(input.description, "description"),
      promptTemplatePath: normalizeOptionalText(input.promptTemplatePath ?? null),
      promptInline: normalizeOptionalText(input.promptInline ?? null),
      skillIds: normalizeStringList(input.skillIds ?? []),
      mcpProfileId,
      model: normalizeOptionalText(input.model ?? null),
      reasoningEffort: normalizeEnumValue(
        input.reasoningEffort ?? current?.reasoningEffort ?? "medium",
        allowedReasoningEfforts,
        "reasoningEffort",
      ) as AgentRecord["reasoningEffort"],
      approvalPolicy: normalizeEnumValue(
        input.approvalPolicy ?? current?.approvalPolicy ?? "never",
        allowedApprovalPolicies,
        "approvalPolicy",
      ) as AgentRecord["approvalPolicy"],
      sandboxMode: normalizeEnumValue(
        input.sandboxMode ?? current?.sandboxMode ?? "danger-full-access",
        allowedSandboxModes,
        "sandboxMode",
      ) as AgentRecord["sandboxMode"],
      searchEnabled: input.searchEnabled ?? current?.searchEnabled ?? false,
      status: normalizeEnumValue(
        input.status ?? current?.status ?? "active",
        allowedStatuses,
        "status",
      ) as AgentRecord["status"],
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
  }
}

function createDigest(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function findDuplicates(items: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const item of items) {
    if (seen.has(item)) {
      duplicates.add(item);
      continue;
    }
    seen.add(item);
  }

  return [...duplicates].sort();
}

function ensureAgentExists(agents: AgentRecord[], agentId: string): void {
  if (!agents.some((agent) => agent.id === agentId)) {
    throw new Error(`Agent "${agentId}" does not exist in the registry.`);
  }
}

function ensureSessionExists(sessions: AgentSessionRecord[], sessionId: string): void {
  if (!sessions.some((session) => session.id === sessionId)) {
    throw new Error(`Agent session "${sessionId}" does not exist in the registry.`);
  }
}

function uniqueValue<T>(value: T, index: number, items: T[]): boolean {
  return items.indexOf(value) === index;
}

function normalizeAgentSlug(value: string): string {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`Agent slug "${value}" is invalid. Use lowercase letters, numbers and hyphens.`);
  }
  return slug;
}

function normalizeRequiredText(value: string | null | undefined, fieldName: string): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    throw new Error(`Field "${fieldName}" is required.`);
  }
  return normalized;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function normalizeStringList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeEnumValue<T extends string>(
  value: string,
  allowed: Set<string>,
  fieldName: string,
): T {
  if (!allowed.has(value)) {
    throw new Error(`Field "${fieldName}" has invalid value "${value}".`);
  }
  return value as T;
}
