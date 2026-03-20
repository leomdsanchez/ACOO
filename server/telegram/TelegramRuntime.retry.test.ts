import test from "node:test";
import assert from "node:assert/strict";
import { TelegramRuntime } from "./TelegramRuntime.js";
import { CodexCliResumeError } from "../codex/CodexCliService.js";
import type { AgentRecord } from "../domain/models.js";

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

test("does not recreate the session when resume fails for a non-retryable cause", async () => {
  let handleCalls = 0;
  let startNewCalls = 0;
  let failedRuns = 0;

  const runtime = new TelegramRuntime({
    agentRegistry: {
      getActiveAgentBySlug: async (slug: string) => (slug === ACTIVE_AGENT.slug ? ACTIVE_AGENT : null),
      getAgentBySlug: async (slug: string) => (slug === ACTIVE_AGENT.slug ? ACTIVE_AGENT : null),
      listAgents: async () => [ACTIVE_AGENT],
      listAgentsByRole: async () => [ACTIVE_AGENT],
      createSession: async () => ({ id: "session-1" }),
      addMessage: async () => undefined,
      recordRun: async () => undefined,
    } as never,
    backupAgentSlug: null,
    bot: {
      handleMessage: async () => {
        handleCalls += 1;
        throw new CodexCliResumeError(
          "resume failed",
          "Insufficient credits for this run.",
          false,
        );
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
      attachSession: async () => ({ active: true, activeAgentSlug: "coo", sessionId: "thread-new", updatedAt: "2026-03-19T00:00:00.000Z" }),
      load: async () => ({
        active: true,
        activeAgentSlug: "coo",
        sessionId: "thread-123",
        updatedAt: "2026-03-19T00:00:00.000Z",
      }),
      startNew: async () => {
        startNewCalls += 1;
        return {
          active: true,
          activeAgentSlug: "coo",
          sessionId: null,
          updatedAt: "2026-03-19T00:00:00.000Z",
        };
      },
      switchAgent: async () => ({
        active: true,
        activeAgentSlug: "coo",
        sessionId: "thread-123",
        updatedAt: "2026-03-19T00:00:00.000Z",
      }),
    } as never,
    transcription: {
      isEnabled: () => false,
    } as never,
  });

  (runtime as any).persistFailedRun = async () => {
    failedRuns += 1;
  };
  (runtime as any).persistCompletedRun = async () => undefined;
  (runtime as any).persistAbortedRun = async () => undefined;

  await assert.rejects(
    () =>
      (runtime as any).handleWithSingleSession({
        activeAgentSlug: "coo",
        chatId: 123,
        inputMode: "text",
        prompt: "Me explica o erro?",
        senderId: "42",
      }),
    /resume failed/,
  );

  assert.equal(handleCalls, 1);
  assert.equal(startNewCalls, 0);
  assert.equal(failedRuns, 1);
});
