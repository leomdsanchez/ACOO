import type {
  Agent,
  AgentMcpProfile,
  AgentRun,
  AgentSession,
} from "@prisma/client";
import type {
  AgentMcpProfileRecord,
  AgentRecord,
  AgentRunRecord,
  AgentSessionRecord,
} from "../domain/models.js";
import { getPrismaClient } from "../prisma/client.js";

export interface AgentRegistrySnapshot {
  agents: AgentRecord[];
  mcpProfiles: AgentMcpProfileRecord[];
  runs: AgentRunRecord[];
  sessions: AgentSessionRecord[];
}

export class AgentRegistryRepository {
  private readonly prisma;

  public constructor(repoRoot: string) {
    this.prisma = getPrismaClient(repoRoot);
  }

  public async loadSnapshot(): Promise<AgentRegistrySnapshot> {
    const [agents, mcpProfiles, runs, sessions] = await Promise.all([
      this.listAgents(),
      this.listMcpProfiles(),
      this.listRuns(),
      this.listSessions(),
    ]);

    return { agents, mcpProfiles, runs, sessions };
  }

  public async listAgents(): Promise<AgentRecord[]> {
    const records = await this.prisma.agent.findMany({ orderBy: { displayName: "asc" } });
    return records.map(mapAgentRecord);
  }

  public async findAgentBySlug(slug: string): Promise<AgentRecord | null> {
    const record = await this.prisma.agent.findUnique({ where: { slug } });
    return record ? mapAgentRecord(record) : null;
  }

  public async createAgent(record: AgentRecord): Promise<AgentRecord> {
    const stored = await this.prisma.agent.create({
      data: serializeAgent(record),
    });
    return mapAgentRecord(stored);
  }

  public async updateAgent(record: AgentRecord): Promise<AgentRecord> {
    const stored = await this.prisma.agent.update({
      where: { id: record.id },
      data: serializeAgent(record),
    });
    return mapAgentRecord(stored);
  }

  public async listMcpProfiles(): Promise<AgentMcpProfileRecord[]> {
    const records = await this.prisma.agentMcpProfile.findMany({ orderBy: { name: "asc" } });
    return records.map(mapMcpProfileRecord);
  }

  public async findMcpProfileById(id: string): Promise<AgentMcpProfileRecord | null> {
    const record = await this.prisma.agentMcpProfile.findUnique({ where: { id } });
    return record ? mapMcpProfileRecord(record) : null;
  }

  public async listSessions(): Promise<AgentSessionRecord[]> {
    const records = await this.prisma.agentSession.findMany({ orderBy: { lastUsedAt: "desc" } });
    return records.map(mapSessionRecord);
  }

  public async createSession(record: AgentSessionRecord): Promise<AgentSessionRecord> {
    const stored = await this.prisma.agentSession.create({
      data: serializeSession(record),
    });
    return mapSessionRecord(stored);
  }

  public async updateSession(record: AgentSessionRecord): Promise<AgentSessionRecord> {
    const stored = await this.prisma.agentSession.update({
      where: { id: record.id },
      data: serializeSession(record),
    });
    return mapSessionRecord(stored);
  }

  public async findSessionById(id: string): Promise<AgentSessionRecord | null> {
    const record = await this.prisma.agentSession.findUnique({ where: { id } });
    return record ? mapSessionRecord(record) : null;
  }

  public async findSessionByCodexThreadId(
    agentId: string,
    channel: AgentSessionRecord["channel"],
    channelThreadId: string,
    codexThreadId: string,
  ): Promise<AgentSessionRecord | null> {
    const record = await this.prisma.agentSession.findFirst({
      where: {
        agentId,
        channel,
        channelThreadId,
        codexThreadId,
      },
      orderBy: { lastUsedAt: "desc" },
    });
    return record ? mapSessionRecord(record) : null;
  }

  public async updateSessionStatus(
    agentId: string,
    channel: AgentSessionRecord["channel"],
    channelThreadId: string,
    status: AgentSessionRecord["status"],
  ): Promise<AgentSessionRecord | null> {
    const current = await this.prisma.agentSession.findFirst({
      where: {
        agentId,
        channel,
        channelThreadId,
        status: "active",
      },
      orderBy: { lastUsedAt: "desc" },
    });

    if (!current) {
      return null;
    }

    const stored = await this.prisma.agentSession.update({
      where: { id: current.id },
      data: {
        lastUsedAt: new Date(),
        status,
      },
    });

    return mapSessionRecord(stored);
  }

  public async listRuns(): Promise<AgentRunRecord[]> {
    const records = await this.prisma.agentRun.findMany({ orderBy: { createdAt: "desc" } });
    return records.map(mapRunRecord);
  }

  public async createRun(record: AgentRunRecord): Promise<AgentRunRecord> {
    const stored = await this.prisma.agentRun.create({
      data: serializeRun(record),
    });

    return mapRunRecord(stored);
  }
}

function mapAgentRecord(record: Agent): AgentRecord {
  return {
    id: record.id,
    slug: record.slug,
    displayName: record.displayName,
    role: record.role as AgentRecord["role"],
    description: record.description,
    promptTemplatePath: record.promptTemplatePath,
    promptInline: record.promptInline,
    skillIds: parseStringArray(record.skillIdsJson),
    mcpProfileId: record.mcpProfileId,
    model: record.model,
    reasoningEffort: record.reasoningEffort as AgentRecord["reasoningEffort"],
    approvalPolicy: record.approvalPolicy as AgentRecord["approvalPolicy"],
    sandboxMode: record.sandboxMode as AgentRecord["sandboxMode"],
    searchEnabled: record.searchEnabled,
    status: record.status as AgentRecord["status"],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapMcpProfileRecord(record: AgentMcpProfile): AgentMcpProfileRecord {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    required: parseStringArray(record.requiredJson),
    optional: parseStringArray(record.optionalJson),
    blocked: parseStringArray(record.blockedJson),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapSessionRecord(record: AgentSession): AgentSessionRecord {
  return {
    id: record.id,
    agentId: record.agentId,
    channel: record.channel as AgentSessionRecord["channel"],
    channelThreadId: record.channelThreadId,
    codexThreadId: record.codexThreadId,
    title: record.title,
    cwd: record.cwd,
    mode: record.mode as AgentSessionRecord["mode"],
    status: record.status as AgentSessionRecord["status"],
    startedAt: record.startedAt.toISOString(),
    lastUsedAt: record.lastUsedAt.toISOString(),
  };
}

function mapRunRecord(record: AgentRun): AgentRunRecord {
  return {
    id: record.id,
    agentId: record.agentId,
    sessionId: record.sessionId,
    channel: record.channel as AgentRunRecord["channel"],
    command: record.command,
    promptDigest: record.promptDigest,
    resultSummary: record.resultSummary,
    status: record.status as AgentRunRecord["status"],
    createdAt: record.createdAt.toISOString(),
  };
}

function serializeSession(record: AgentSessionRecord) {
  return {
    id: record.id,
    agentId: record.agentId,
    channel: record.channel,
    channelThreadId: record.channelThreadId,
    codexThreadId: record.codexThreadId,
    title: record.title,
    cwd: record.cwd,
    mode: record.mode,
    status: record.status,
    startedAt: new Date(record.startedAt),
    lastUsedAt: new Date(record.lastUsedAt),
  };
}

function serializeAgent(record: AgentRecord) {
  return {
    id: record.id,
    slug: record.slug,
    displayName: record.displayName,
    role: record.role,
    description: record.description,
    promptTemplatePath: record.promptTemplatePath,
    promptInline: record.promptInline,
    skillIdsJson: JSON.stringify(record.skillIds),
    mcpProfileId: record.mcpProfileId,
    model: record.model,
    reasoningEffort: record.reasoningEffort,
    approvalPolicy: record.approvalPolicy,
    sandboxMode: record.sandboxMode,
    searchEnabled: record.searchEnabled,
    status: record.status,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function serializeRun(record: AgentRunRecord) {
  return {
    id: record.id,
    agentId: record.agentId,
    sessionId: record.sessionId,
    channel: record.channel,
    command: record.command,
    promptDigest: record.promptDigest,
    resultSummary: record.resultSummary,
    status: record.status,
    createdAt: new Date(record.createdAt),
  };
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
