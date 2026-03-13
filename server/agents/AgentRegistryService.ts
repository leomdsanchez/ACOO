import crypto from "node:crypto";
import type {
  AgentMcpProfileRecord,
  AgentRecord,
  AgentRunRecord,
  AgentSessionChannel,
  AgentSessionMode,
  AgentSessionRecord,
  AgentSessionStatus,
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
