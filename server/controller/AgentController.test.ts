import test from "node:test";
import assert from "node:assert/strict";
import { AgentController } from "./AgentController.js";
import { ManagedRuntimeUnavailableError } from "../mcp/ManagedRuntimeUnavailableError.js";
import type { AgentRecord } from "../domain/models.js";
import type { AgentEngineRequest } from "../engine/AgentEngine.js";
import type { LoadedSkill } from "../skills/Skill.js";
import type { McpPolicyEvaluation } from "../mcp/McpPolicyEvaluator.js";

const AGENT: AgentRecord = {
  id: "agent-1",
  slug: "coo",
  displayName: "AI COO",
  role: "primary",
  description: "test",
  promptTemplatePath: null,
  promptInline: null,
  skillIds: [],
  mcpProfileId: "profile-1",
  model: null,
  reasoningEffort: "high",
  approvalPolicy: "never",
  sandboxMode: "danger-full-access",
  searchEnabled: true,
  status: "active",
  createdAt: "2026-03-16T00:00:00.000Z",
  updatedAt: "2026-03-16T00:00:00.000Z",
};

const SKILL: LoadedSkill = {
  id: "playwright-mcp-brave-session",
  name: "Playwright MCP + Brave Persistent Session",
  description: "test skill",
  keywords: [],
  sourcePath: "/tmp/playwright/SKILL.md",
  content: "test",
};

const MCP_POLICY: McpPolicyEvaluation = {
  blockedConfigured: [],
  configuredNames: ["playwright"],
  configuredOptional: [],
  configuredRequired: ["playwright"],
  disabledForRun: [],
  missingRequired: [],
  profile: null,
};

test("injects a structured runtime error and keeps agent loop running", async () => {
  let capturedPrompt = "";
  let capturedOverrides: string[] = [];

  const runnableController = new AgentController(
    {
      getActiveAgentBySlug: async () => AGENT,
      listAgents: async () => [AGENT],
    } as never,
    {
      load: async () => null,
    } as never,
    {
      prepare: async () => {
        throw new ManagedRuntimeUnavailableError(
          "technical",
          "Runtime MCP indisponível: playwright.",
          ["playwright"],
        );
      },
    } as never,
    {
      evaluate: async () => MCP_POLICY,
    } as never,
    {
      run: async ({ executionProfile, prompt }: AgentEngineRequest) => {
        capturedPrompt = prompt;
        capturedOverrides = executionProfile?.configOverrides ?? [];
        return {
          command: "codex exec",
          lastMessage: "Fallback sem browser aplicado.",
          stderr: "",
          stdout: "ok",
          threadId: "thread-123",
        };
      },
    } as never,
    {
      build: async () => "contexto operacional",
    } as never,
    {
      loadAll: async () => [SKILL],
    } as never,
    {
      chooseSkill: async () => SKILL,
    } as never,
    {
      buildSkillContext: () => "skill context",
    } as never,
    "coo",
  );

  const response = await runnableController.handle({
    prompt: "validar whatsapp",
    interaction: {
      channel: "telegram",
      inputMode: "text",
      requestedOutputMode: "text",
    },
  });

  assert.equal(response.answer, "Fallback sem browser aplicado.");
  assert.equal(response.command, "codex exec");
  assert.equal(response.threadId, "thread-123");
  assert.equal(response.activeAgentSlug, "coo");
  assert.equal(response.delivery.sourceChannel, "telegram");
  assert.match(capturedPrompt, /managed_runtime_unavailable/);
  assert.match(capturedPrompt, /Runtime MCP indisponível: playwright/);
  assert.match(capturedPrompt, /skill context/);
  assert.deepEqual(capturedOverrides, ["mcp_servers.playwright.enabled=false"]);
});

test("rethrows non-user-facing preparation errors", async () => {
  const controller = new AgentController(
    {
      getActiveAgentBySlug: async () => AGENT,
      listAgents: async () => [AGENT],
    } as never,
    {
      load: async () => null,
    } as never,
    {
      prepare: async () => {
        throw new Error("unexpected failure");
      },
    } as never,
    {
      evaluate: async () => MCP_POLICY,
    } as never,
    {
      run: async () => {
        throw new Error("engine should not run");
      },
    } as never,
    {
      build: async () => "contexto operacional",
    } as never,
    {
      loadAll: async () => [SKILL],
    } as never,
    {
      chooseSkill: async () => SKILL,
    } as never,
    {
      buildSkillContext: () => "skill context",
    } as never,
    "coo",
  );

  await assert.rejects(
    () =>
      controller.handle({
        prompt: "validar whatsapp",
      }),
    /unexpected failure/,
  );
});
