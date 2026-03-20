import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { CodexCliAbortedError } from "../../codex/CodexCliService.js";
import { WebChatService } from "./WebChatService.js";

test("sendMessage creates a web session, records transcript, and stores a run", async () => {
  const events: string[] = [];
  const session = {
    id: "session-1",
    agentId: "agent-1",
    channel: "web" as const,
    channelThreadId: "thread-1",
    codexThreadId: "codex-1",
    title: null,
    cwd: "/repo",
    mode: "exec" as const,
    status: "active" as const,
    startedAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };
  const messages: Array<{
    attachments: Array<{
      assetId: string | null;
      downloadPath: string | null;
      filename: string | null;
      id: string;
      kind: "audio" | "document" | "file" | "image";
      mediaType: string;
    }>;
    content: string;
    createdAt: string;
    id: string;
    role: "assistant" | "system" | "user";
    sessionId: string;
  }> = [];

  const service = new WebChatService({
    agentRegistry: {
      findLatestChannelSession: async () => null,
      getActiveAgentBySlug: async (slug: string) => ({
        id: "agent-1",
        slug,
        displayName: "COO",
      }),
      listMessages: async () => messages,
      recordMessage: async (input: { content: string; role: "assistant" | "user"; sessionId: string }) => {
        events.push(`message:${input.role}`);
        const record = {
          attachments: [],
          id: `message-${messages.length + 1}`,
          createdAt: new Date().toISOString(),
          ...input,
        };
        messages.push(record);
        return record;
      },
      recordRun: async () => {
        events.push("run");
        return {
          id: "run-1",
        };
      },
      upsertSession: async () => {
        events.push("session");
        return session;
      },
    } as never,
    backupAgentSlug: null,
    controller: {
      handle: async () => ({
        activeAgentName: "COO",
        activeAgentSlug: "coo",
        activeSkill: null,
        answer: "Oi, mundo",
        command: "codex exec ...",
        delivery: {
          requestedOutputMode: "text",
          sourceChannel: "web",
        },
        operationalContext: "",
        stderr: "",
        stdout: "",
        threadId: "codex-1",
      }),
    } as never,
    defaultAgentSlug: "coo",
  });

  const result = await service.sendMessage({
    agentSlug: "coo",
    channelThreadId: "thread-1",
    cwd: "/repo",
    message: "Teste",
  });

  assert.equal(result.session.id, "session-1");
  assert.equal(result.session.codexThreadId, "codex-1");
  assert.equal(result.messages.length, 2);
  assert.deepEqual(events, ["session", "message:user", "session", "message:assistant", "run"]);
});

test("getHistory returns empty transcript when no web session exists", async () => {
  const service = new WebChatService({
    agentRegistry: {
      findLatestChannelSession: async () => null,
      getActiveAgentBySlug: async (slug: string) => ({
        id: "agent-1",
        slug,
        displayName: "COO",
      }),
    } as never,
    backupAgentSlug: null,
    controller: {} as never,
    defaultAgentSlug: "coo",
  });

  const history = await service.getHistory({
    agentSlug: "coo",
    channelThreadId: "thread-2",
  });

  assert.equal(history.messages.length, 0);
  assert.equal(history.session.id, null);
  assert.equal(history.agent.slug, "coo");
});

test("sendMessage in ephemeral mode does not persist session or transcript", async () => {
  const events: string[] = [];

  const service = new WebChatService({
    agentRegistry: {
      findLatestChannelSession: async () => {
        events.push("find");
        return null;
      },
      getActiveAgentBySlug: async (slug: string) => ({
        id: "agent-1",
        slug,
        displayName: "COO",
      }),
      listMessages: async () => [],
      recordMessage: async () => {
        events.push("message");
        throw new Error("should not persist message in ephemeral mode");
      },
      recordRun: async () => {
        events.push("run");
        return {
          id: "run-1",
        };
      },
      upsertSession: async () => {
        events.push("session");
        throw new Error("should not create session in ephemeral mode");
      },
    } as never,
    backupAgentSlug: null,
    controller: {
      handle: async () => ({
        activeAgentName: "COO",
        activeAgentSlug: "coo",
        activeSkill: null,
        answer: "Resposta efemera",
        command: "codex exec ...",
        delivery: {
          requestedOutputMode: "text",
          sourceChannel: "web",
        },
        operationalContext: "",
        stderr: "",
        stdout: "",
        threadId: null,
      }),
    } as never,
    defaultAgentSlug: "coo",
  });

  const result = await service.sendMessage({
    agentSlug: "coo",
    channelThreadId: "thread-ephemeral",
    cwd: "/repo",
    message: "Teste efemero",
    mode: "ephemeral",
  });

  assert.equal(result.session.id, null);
  assert.equal(result.messages.length, 2);
  assert.deepEqual(events, ["run"]);
});

test("sendMessage persists attachment metadata for user messages", async () => {
  const recorded: Array<{ attachments?: unknown; content: string; role: "assistant" | "user" }> = [];
  const prompts: string[] = [];
  const interactionModes: string[] = [];

  const service = new WebChatService({
    agentRegistry: {
      findLatestChannelSession: async () => null,
      getActiveAgentBySlug: async (slug: string) => ({
        id: "agent-1",
        slug,
        displayName: "COO",
      }),
      listMessages: async () => [],
      recordMessage: async (input: {
        attachments?: Array<{
          assetId: string | null;
          downloadPath: string | null;
          filename: string | null;
          id: string;
          kind: string;
          mediaType: string;
        }>;
        content: string;
        role: "assistant" | "user";
        sessionId: string;
      }) => {
        recorded.push(input);
        return {
          attachments: input.attachments ?? [],
          content: input.content,
          createdAt: new Date().toISOString(),
          id: crypto.randomUUID(),
          role: input.role,
          sessionId: input.sessionId,
        };
      },
      recordRun: async () => ({ id: "run-1" }),
      upsertSession: async () => ({
        id: "session-1",
        agentId: "agent-1",
        channel: "web" as const,
        channelThreadId: "thread-1",
        codexThreadId: "codex-1",
        title: null,
        cwd: "/repo",
        mode: "exec" as const,
        status: "active" as const,
        startedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      }),
    } as never,
    backupAgentSlug: null,
    controller: {
      handle: async (input: { interaction: { inputMode: string }; prompt: string }) => {
        prompts.push(input.prompt);
        interactionModes.push(input.interaction.inputMode);
        return ({
        activeAgentName: "COO",
        activeAgentSlug: "coo",
        activeSkill: null,
        answer: "Recebi o arquivo",
        command: "codex exec ...",
        delivery: {
          requestedOutputMode: "text",
          sourceChannel: "web",
        },
        operationalContext: "",
        stderr: "",
        stdout: "",
        threadId: "codex-1",
      });
      },
    } as never,
    defaultAgentSlug: "coo",
  });

  await service.sendMessage({
    agentSlug: "coo",
    attachments: [{
      assetId: null,
      downloadPath: null,
      filename: "audio.webm",
      id: "attachment-1",
      kind: "audio",
      mediaType: "audio/webm",
    }],
    channelThreadId: "thread-1",
    cwd: "/repo",
    message: "",
  });

  assert.equal(recorded[0]?.role, "user");
  assert.equal(Array.isArray(recorded[0]?.attachments), true);
  assert.equal((recorded[0]?.attachments as Array<{ kind: string }>)[0]?.kind, "audio");
  assert.equal(interactionModes[0], "voice");
  assert.match(prompts[0] ?? "", /audio\.webm/);
});

test("sendMessage records the user transcript before an aborted stream", async () => {
  const recordedRuns: Array<{ sessionId: string | null; status: string }> = [];
  const recordedMessages: Array<{ content: string; role: "assistant" | "user"; sessionId: string }> = [];
  const session = {
    id: "session-1",
    agentId: "agent-1",
    channel: "web" as const,
    channelThreadId: "thread-1",
    codexThreadId: "codex-1",
    title: null,
    cwd: "/repo",
    mode: "exec-resume" as const,
    status: "active" as const,
    startedAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };

  const service = new WebChatService({
    agentRegistry: {
      findLatestChannelSession: async () => session,
      getActiveAgentBySlug: async (slug: string) => ({
        id: "agent-1",
        slug,
        displayName: "COO",
      }),
      listMessages: async () => [],
      recordMessage: async (input: {
        content: string;
        role: "assistant" | "user";
        sessionId: string;
      }) => {
        recordedMessages.push(input);
        return {
          attachments: [],
          content: input.content,
          createdAt: new Date().toISOString(),
          id: crypto.randomUUID(),
          role: input.role,
          sessionId: input.sessionId,
        };
      },
      recordRun: async (input: { sessionId?: string | null; status: string }) => {
        recordedRuns.push({
          sessionId: input.sessionId ?? null,
          status: input.status,
        });
        return { id: "run-1" };
      },
      upsertSession: async () => session,
    } as never,
    backupAgentSlug: null,
    controller: {
      handle: async () => {
        throw new CodexCliAbortedError();
      },
    } as never,
    defaultAgentSlug: "coo",
  });

  await assert.rejects(
    () =>
      service.sendMessage({
        agentSlug: "coo",
        channelThreadId: "thread-1",
        cwd: "/repo",
        message: "Teste abortado",
      }),
    CodexCliAbortedError,
  );

  assert.deepEqual(recordedMessages, [
    {
      attachments: [],
      content: "Teste abortado",
      role: "user",
      sessionId: "session-1",
    },
  ]);
  assert.deepEqual(recordedRuns, [
    {
      sessionId: "session-1",
      status: "aborted",
    },
  ]);
});

test("sendMessage persists streamed assistant text gathered before abort", async () => {
  const recordedMessages: Array<{ content: string; role: "assistant" | "user"; sessionId: string }> = [];
  const session = {
    id: "session-1",
    agentId: "agent-1",
    channel: "web" as const,
    channelThreadId: "thread-1",
    codexThreadId: "codex-1",
    title: null,
    cwd: "/repo",
    mode: "exec-resume" as const,
    status: "active" as const,
    startedAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };

  const service = new WebChatService({
    agentRegistry: {
      findLatestChannelSession: async () => session,
      getActiveAgentBySlug: async (slug: string) => ({
        id: "agent-1",
        slug,
        displayName: "COO",
      }),
      listMessages: async () => [],
      recordMessage: async (input: {
        content: string;
        role: "assistant" | "user";
        sessionId: string;
      }) => {
        recordedMessages.push(input);
        return {
          attachments: [],
          content: input.content,
          createdAt: new Date().toISOString(),
          id: crypto.randomUUID(),
          role: input.role,
          sessionId: input.sessionId,
        };
      },
      recordRun: async () => ({ id: "run-1" }),
      upsertSession: async () => session,
    } as never,
    backupAgentSlug: null,
    controller: {
      handle: async (input: { onTextChunk?: (chunk: string) => void }) => {
        input.onTextChunk?.("parcial");
        throw new CodexCliAbortedError();
      },
    } as never,
    defaultAgentSlug: "coo",
  });

  await assert.rejects(
    () =>
      service.sendMessage({
        agentSlug: "coo",
        channelThreadId: "thread-1",
        cwd: "/repo",
        message: "Teste abortado",
        onTextChunk: () => undefined,
      }),
    CodexCliAbortedError,
  );

  assert.deepEqual(recordedMessages, [
    {
      attachments: [],
      content: "Teste abortado",
      role: "user",
      sessionId: "session-1",
    },
    {
      content: "parcial",
      role: "assistant",
      sessionId: "session-1",
    },
  ]);
});

test("deleteHistory removes persisted web sessions for the selected thread", async () => {
  const deleted: Array<{ agentId: string; channel: string; channelThreadId: string }> = [];

  const service = new WebChatService({
    agentRegistry: {
      deleteChannelSessions: async (input: {
        agentId: string;
        channel: string;
        channelThreadId: string;
      }) => {
        deleted.push(input);
        return 1;
      },
      getActiveAgentBySlug: async (slug: string) => ({
        id: "agent-1",
        slug,
        displayName: "COO",
      }),
    } as never,
    backupAgentSlug: null,
    controller: {} as never,
    defaultAgentSlug: "coo",
  });

  const result = await service.deleteHistory({
    agentSlug: "coo",
    channelThreadId: "thread-1",
  });

  assert.equal(result.deleted, true);
  assert.deepEqual(deleted, [
    {
      agentId: "agent-1",
      channel: "web",
      channelThreadId: "thread-1",
    },
  ]);
});
