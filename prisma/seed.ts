import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPrismaClient } from "../server/prisma/client.js";
const repoRoot = process.cwd();
const prisma = getPrismaClient(repoRoot);

async function main() {
  const [agents, mcpProfiles, sessions, runs] = await Promise.all([
    readJsonFile("data/agents.json"),
    readJsonFile("data/agent-mcp-profiles.json"),
    readJsonFile("data/agent-sessions.json"),
    readJsonFile("data/agent-runs.json"),
  ]);

  await prisma.agentRun.deleteMany();
  await prisma.agentSession.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.agentMcpProfile.deleteMany();

  for (const profile of mcpProfiles) {
    await prisma.agentMcpProfile.create({
      data: {
        id: profile.id,
        name: profile.name,
        description: profile.description,
        requiredJson: JSON.stringify(profile.required ?? []),
        optionalJson: JSON.stringify(profile.optional ?? []),
        blockedJson: JSON.stringify(profile.blocked ?? []),
        createdAt: new Date(profile.createdAt),
        updatedAt: new Date(profile.updatedAt),
      },
    });
  }

  for (const agent of agents) {
    await prisma.agent.create({
      data: {
        id: agent.id,
        slug: agent.slug,
        displayName: agent.displayName,
        role: agent.role,
        description: agent.description,
        promptTemplatePath: agent.promptTemplatePath,
        promptInline: agent.promptInline,
        skillIdsJson: JSON.stringify(agent.skillIds ?? []),
        mcpProfileId: agent.mcpProfileId,
        model: agent.model,
        reasoningEffort: agent.reasoningEffort,
        approvalPolicy: agent.approvalPolicy,
        sandboxMode: agent.sandboxMode,
        searchEnabled: Boolean(agent.searchEnabled),
        status: agent.status,
        createdAt: new Date(agent.createdAt),
        updatedAt: new Date(agent.updatedAt),
      },
    });
  }

  for (const session of sessions) {
    await prisma.agentSession.create({
      data: {
        id: session.id,
        agentId: session.agentId,
        channel: session.channel,
        channelThreadId: session.channelThreadId,
        codexThreadId: session.codexThreadId,
        cwd: session.cwd,
        mode: session.mode,
        status: session.status,
        startedAt: new Date(session.startedAt),
        lastUsedAt: new Date(session.lastUsedAt),
      },
    });
  }

  for (const run of runs) {
    await prisma.agentRun.create({
      data: {
        id: run.id,
        agentId: run.agentId,
        sessionId: run.sessionId,
        channel: run.channel,
        command: run.command,
        promptDigest: run.promptDigest,
        resultSummary: run.resultSummary,
        status: run.status,
        createdAt: new Date(run.createdAt),
      },
    });
  }
}

async function readJsonFile(relativePath: string): Promise<any[]> {
  const filePath = path.join(repoRoot, relativePath);
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as any[];
}

void main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
