import test from "node:test";
import assert from "node:assert/strict";
import type { AgentRecord } from "../domain/models.js";
import { TelegramRuntime } from "./TelegramRuntime.js";

const ACTIVE_AGENT: AgentRecord = {
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
  createdAt: "2026-03-17T00:00:00.000Z",
  updatedAt: "2026-03-17T00:00:00.000Z",
};

test("status command is read-only even when session points to an unavailable agent", async () => {
  const harness = createHarness({
    activeAgentSlugInSession: "ghost",
  });

  await harness.runCommand({ kind: "status" });

  assert.equal(harness.switchAgentCalls, 0);
  assert.match(harness.messages[0] ?? "", /Agente: \/coo/);
});

test("agents command marks the resolved active agent without mutating session state", async () => {
  const harness = createHarness({
    activeAgentSlugInSession: "ghost",
  });

  await harness.runCommand({ kind: "agents" });

  assert.equal(harness.switchAgentCalls, 0);
  assert.match(harness.messages[0] ?? "", /\/coo - AI COO \[ativo\]/);
});

test("execution path syncs session when preferred agent is unavailable", async () => {
  const harness = createHarness({
    activeAgentSlugInSession: "ghost",
  });

  const resolved = await harness.runSync("ghost");

  assert.equal(resolved, "coo");
  assert.equal(harness.switchAgentCalls, 1);
});

function createHarness(input: { activeAgentSlugInSession: string }) {
  let switchAgentCalls = 0;
  const messages: string[] = [];
  const sessionState = {
    active: true,
    activeAgentSlug: input.activeAgentSlugInSession,
    sessionId: "thread-123",
    updatedAt: "2026-03-17T00:00:00.000Z",
  };

  const runtime = new TelegramRuntime({
    agentRegistry: {
      getActiveAgentBySlug: async (slug: string) => (slug === ACTIVE_AGENT.slug ? ACTIVE_AGENT : null),
      listAgents: async () => [ACTIVE_AGENT],
    } as never,
    backupAgentSlug: null,
    bot: {
      handleMessage: async () => {
        throw new Error("not used in this test");
      },
    } as never,
    config: {
      allowedUserIds: ["42"],
      botToken: "telegram-token",
      botUsername: "acoo_bot",
      enabled: true,
      progressPulseMs: 4_000,
      replyAudioByDefault: false,
    },
    defaultAgentSlug: "coo",
    sessionStore: {
      load: async () => ({ ...sessionState }),
      switchAgent: async (_chatId: number, nextSlug: string) => {
        switchAgentCalls += 1;
        sessionState.activeAgentSlug = nextSlug;
        return { ...sessionState };
      },
    } as never,
    transcription: {
      isEnabled: () => false,
    } as never,
  });

  (runtime as any).api = {
    sendMessage: async (_chatId: number, text: string) => {
      messages.push(text);
    },
  };

  return {
    messages,
    runCommand: async (command: { kind: "agents" | "status" }) => {
      await (runtime as any).handleCommand(command, 123, "42");
    },
    runSync: async (preferredSlug: string) => {
      return (runtime as any).syncOperationalAgentSlug(123, preferredSlug);
    },
    get switchAgentCalls() {
      return switchAgentCalls;
    },
  };
}
