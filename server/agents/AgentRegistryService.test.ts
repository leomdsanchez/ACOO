import test from "node:test";
import assert from "node:assert/strict";
import { AgentRegistryService } from "./AgentRegistryService.js";
import type {
  AgentMcpProfileRecord,
  AgentRecord,
} from "../domain/models.js";

const MCP_PROFILE: AgentMcpProfileRecord = {
  id: "mcp-profile-coo-default",
  name: "Default",
  description: "test",
  required: [],
  optional: [],
  blocked: [],
  createdAt: "2026-03-17T00:00:00.000Z",
  updatedAt: "2026-03-17T00:00:00.000Z",
};

test("createAgent rejects slugs that collide with Telegram reserved commands", async () => {
  const service = new AgentRegistryService(createRepository([
    makeAgent({ id: "agent-1", slug: "coo" }),
    makeAgent({ id: "agent-2", slug: "ops" }),
  ]) as never);

  await assert.rejects(
    () => service.createAgent({
      slug: "agents",
      displayName: "Agents Command Collision",
      role: "specialist",
      description: "test",
      mcpProfileId: MCP_PROFILE.id,
    }),
    /reserved telegram command/i,
  );
});

test("getActiveAgentBySlug hides disabled/archived agents from operational flows", async () => {
  const service = new AgentRegistryService(createRepository([
    makeAgent({ id: "agent-1", slug: "coo", status: "active" }),
    makeAgent({ id: "agent-2", slug: "ops", status: "disabled" }),
  ]) as never);

  const disabled = await service.getActiveAgentBySlug("ops");
  const active = await service.getActiveAgentBySlug("coo");

  assert.equal(disabled, null);
  assert.equal(active?.slug, "coo");
});

test("deleteAgent blocks deletion of the last active agent", async () => {
  const service = new AgentRegistryService(createRepository([
    makeAgent({ id: "agent-1", slug: "coo", status: "active" }),
    makeAgent({ id: "agent-2", slug: "ops", status: "disabled" }),
  ]) as never);

  await assert.rejects(
    () => service.deleteAgent("coo"),
    /last active agent/i,
  );
});

test("deleteAgent performs hard delete when other active agents exist", async () => {
  const repository = createRepository([
    makeAgent({ id: "agent-1", slug: "coo", status: "active" }),
    makeAgent({ id: "agent-2", slug: "ops", status: "active" }),
  ]);
  const service = new AgentRegistryService(repository as never);

  const deleted = await service.deleteAgent("ops");
  const remaining = await service.listAgents({ includeDisabled: true });

  assert.equal(deleted.slug, "ops");
  assert.deepEqual(remaining.map((agent) => agent.slug), ["coo"]);
});

test("updateAgent blocks deactivation of the last active agent", async () => {
  const service = new AgentRegistryService(createRepository([
    makeAgent({ id: "agent-1", slug: "coo", status: "active" }),
    makeAgent({ id: "agent-2", slug: "ops", status: "disabled" }),
  ]) as never);

  await assert.rejects(
    () =>
      service.updateAgent({
        slug: "coo",
        status: "disabled",
      }),
    /last active agent/i,
  );
});

test("deleteAgent blocks mutations when registry has zero active agents", async () => {
  const service = new AgentRegistryService(createRepository([
    makeAgent({ id: "agent-1", slug: "coo", status: "disabled" }),
    makeAgent({ id: "agent-2", slug: "ops", status: "archived" }),
  ]) as never);

  await assert.rejects(
    () => service.deleteAgent("ops"),
    /no active agents/i,
  );
});

function makeAgent(
  overrides: Partial<AgentRecord> & Pick<AgentRecord, "id" | "slug">,
): AgentRecord {
  return {
    id: overrides.id,
    slug: overrides.slug,
    displayName: overrides.displayName ?? overrides.slug.toUpperCase(),
    role: overrides.role ?? "specialist",
    description: overrides.description ?? "test",
    promptTemplatePath: overrides.promptTemplatePath ?? null,
    promptInline: overrides.promptInline ?? null,
    skillIds: overrides.skillIds ?? [],
    mcpProfileId: overrides.mcpProfileId ?? MCP_PROFILE.id,
    model: overrides.model ?? null,
    reasoningEffort: overrides.reasoningEffort ?? "medium",
    approvalPolicy: overrides.approvalPolicy ?? "never",
    sandboxMode: overrides.sandboxMode ?? "danger-full-access",
    searchEnabled: overrides.searchEnabled ?? false,
    status: overrides.status ?? "active",
    createdAt: overrides.createdAt ?? "2026-03-17T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-17T00:00:00.000Z",
  };
}

function createRepository(seedAgents: AgentRecord[]) {
  const agents = [...seedAgents];

  return {
    createAgent: async (record: AgentRecord) => {
      agents.push(record);
      return record;
    },
    createRun: async () => {
      throw new Error("not used");
    },
    createSession: async () => {
      throw new Error("not used");
    },
    deleteAgentById: async (id: string) => {
      const index = agents.findIndex((agent) => agent.id === id);
      if (index < 0) {
        throw new Error(`Agent "${id}" does not exist.`);
      }
      const [deleted] = agents.splice(index, 1);
      return deleted;
    },
    findAgentBySlug: async (slug: string) => agents.find((agent) => agent.slug === slug) ?? null,
    findMcpProfileById: async (id: string) => (id === MCP_PROFILE.id ? MCP_PROFILE : null),
    findSessionByCodexThreadId: async () => null,
    listAgents: async () => [...agents],
    listMcpProfiles: async () => [MCP_PROFILE],
    listRuns: async () => [],
    listSessions: async () => [],
    loadSnapshot: async () => ({
      agents: [...agents],
      mcpProfiles: [MCP_PROFILE],
      runs: [],
      sessions: [],
    }),
    updateAgent: async (record: AgentRecord) => {
      const index = agents.findIndex((agent) => agent.id === record.id);
      if (index < 0) {
        throw new Error(`Agent "${record.id}" does not exist.`);
      }
      agents[index] = record;
      return record;
    },
    updateSession: async () => {
      throw new Error("not used");
    },
    updateSessionStatus: async () => null,
  };
}
