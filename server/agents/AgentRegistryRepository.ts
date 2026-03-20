import type {
  Agent,
  AgentMessage,
  AgentMcpProfile,
  AgentRun,
  AgentSession,
} from "@prisma/client";
import type {
  AgentMessageRecord,
  AgentMcpProfileRecord,
  AgentRecord,
  AgentRunRecord,
  AgentSessionRecord,
} from "../domain/models.js";
import { getPrismaClient } from "../prisma/client.js";

export interface AgentRegistrySnapshot {
  agents: AgentRecord[];
  messages: AgentMessageRecord[];
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
    const [agents, mcpProfiles, runs, sessions, messages] = await Promise.all([
      this.listAgents(),
      this.listMcpProfiles(),
      this.listRuns(),
      this.listSessions(),
      this.listMessages(),
    ]);

    return { agents, messages, mcpProfiles, runs, sessions };
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

  public async deleteAgentById(id: string): Promise<AgentRecord> {
    const stored = await this.prisma.agent.delete({
      where: { id },
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

  public async deleteSessionsByChannelThread(
    agentId: string,
    channel: AgentSessionRecord["channel"],
    channelThreadId: string,
  ): Promise<number> {
    const result = await this.prisma.agentSession.deleteMany({
      where: {
        agentId,
        channel,
        channelThreadId,
      },
    });
    return result.count;
  }

  public async listMessages(sessionId?: string): Promise<AgentMessageRecord[]> {
    const records = await this.prisma.agentMessage.findMany({
      where: sessionId ? { sessionId } : undefined,
      orderBy: { createdAt: "asc" },
    });
    return records.map(mapMessageRecord);
  }

  public async createMessage(record: AgentMessageRecord): Promise<AgentMessageRecord> {
    const stored = await this.prisma.agentMessage.create({
      data: serializeMessage(record),
    });
    return mapMessageRecord(stored);
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

function mapMessageRecord(record: AgentMessage): AgentMessageRecord {
  return {
    attachments: parseMessageAttachments(record.attachmentsJson),
    id: record.id,
    sessionId: record.sessionId,
    role: record.role as AgentMessageRecord["role"],
    content: record.content,
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

function serializeMessage(record: AgentMessageRecord) {
  return {
    attachmentsJson: JSON.stringify(record.attachments),
    id: record.id,
    sessionId: record.sessionId,
    role: record.role,
    content: record.content,
    createdAt: new Date(record.createdAt),
  };
}

function parseMessageAttachments(raw: string | null): AgentMessageRecord["attachments"] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }
      const candidate = entry as {
        assetId?: unknown;
        downloadPath?: unknown;
        filename?: unknown;
        id?: unknown;
        kind?: unknown;
        mediaType?: unknown;
      };
      if (
        typeof candidate.id !== "string" ||
        typeof candidate.kind !== "string" ||
        typeof candidate.mediaType !== "string"
      ) {
        return [];
      }
      return [{
        assetId: typeof candidate.assetId === "string" ? candidate.assetId : null,
        downloadPath: typeof candidate.downloadPath === "string" ? candidate.downloadPath : null,
        filename: typeof candidate.filename === "string" ? candidate.filename : null,
        id: candidate.id,
        kind: candidate.kind as AgentMessageRecord["attachments"][number]["kind"],
        mediaType: candidate.mediaType,
      }];
    });
  } catch {
    return [];
  }
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
