import { resolveOperationalActiveAgent } from "../../agents/OperationalAgentSelector.js";
import type { AgentRegistryService } from "../../agents/AgentRegistryService.js";
import type { AgentController } from "../../controller/AgentController.js";
import { CodexCliAbortedError } from "../../codex/CodexCliService.js";
import type {
  AgentMessageAttachmentRecord,
  AgentRecord,
  AgentSessionRecord,
} from "../../domain/models.js";

export interface WebChatHistory {
  agent: {
    displayName: string;
    id: string;
    slug: string;
  };
  messages: Array<{
    attachments: AgentMessageAttachmentRecord[];
    content: string;
    createdAt: string;
    id: string;
    role: "assistant" | "system" | "user";
  }>;
  session: {
    channelThreadId: string;
    codexThreadId: string | null;
    id: string | null;
    mode: "ephemeral" | "exec" | "exec-resume" | "interactive" | null;
    status: "active" | "ended" | null;
  };
}

export interface WebChatMessageInput {
  attachments?: AgentMessageAttachmentRecord[];
  agentSlug?: string | null;
  abortSignal?: AbortSignal;
  channelThreadId: string;
  cwd: string;
  mode?: "ephemeral" | "resume";
  message: string;
  onTextChunk?: (chunk: string) => void;
}

export interface WebChatMessageResult extends WebChatHistory {
  answer: string;
}

interface WebChatServiceOptions {
  agentRegistry: AgentRegistryService;
  backupAgentSlug: string | null;
  controller: AgentController;
  defaultAgentSlug: string;
}

export class WebChatService {
  public constructor(private readonly options: WebChatServiceOptions) {}

  public async getHistory(input: {
    agentSlug?: string | null;
    channelThreadId: string;
  }): Promise<WebChatHistory> {
    const agent = await this.resolveAgent(input.agentSlug ?? null);
    const session = await this.options.agentRegistry.findLatestChannelSession({
      agentId: agent.id,
      channel: "web",
      channelThreadId: input.channelThreadId,
    });
    const messages = session
      ? await this.options.agentRegistry.listMessages(session.id)
      : [];

    return {
      agent: {
        displayName: agent.displayName,
        id: agent.id,
        slug: agent.slug,
      },
      messages,
      session: summarizeSession(session, input.channelThreadId),
    };
  }

  public async sendMessage(input: WebChatMessageInput): Promise<WebChatMessageResult> {
    const message = input.message.trim();
    const attachments = input.attachments ?? [];
    let streamedAnswer = "";
    if (!message && attachments.length === 0) {
      throw new Error("message or attachments are required.");
    }
    const prompt = composePrompt(message, attachments);

    const agent = await this.resolveAgent(input.agentSlug ?? null);
    const ephemeral = input.mode === "ephemeral";
    const existing = ephemeral
      ? null
      : await this.options.agentRegistry.findLatestChannelSession({
          agentId: agent.id,
          channel: "web",
          channelThreadId: input.channelThreadId,
        });
    const session = ephemeral
      ? null
      : await this.options.agentRegistry.upsertSession({
          agentId: agent.id,
          channel: "web",
          channelThreadId: input.channelThreadId,
          codexThreadId: existing?.codexThreadId ?? null,
          cwd: input.cwd,
          mode: existing?.codexThreadId ? "exec-resume" : "exec",
          status: "active",
          title: null,
        });

    if (session) {
      await this.options.agentRegistry.recordMessage({
        attachments,
        content: message,
        role: "user",
        sessionId: session.id,
      });
    }

    try {
      const response = await this.options.controller.handle({
        agentSlug: agent.slug,
        abortSignal: input.abortSignal,
        cwd: input.cwd,
        ephemeral,
        interaction: {
          channel: "web",
          inputMode: resolveInputMode(attachments),
          requestedOutputMode: "text",
        },
        onTextChunk: (chunk) => {
          streamedAnswer += chunk;
          input.onTextChunk?.(chunk);
        },
        prompt,
        sessionId: existing?.codexThreadId ?? undefined,
      });

      const persistedSession = session
        ? await this.options.agentRegistry.upsertSession({
            agentId: agent.id,
            channel: "web",
            channelThreadId: input.channelThreadId,
            codexThreadId: response.threadId ?? existing?.codexThreadId ?? null,
            cwd: input.cwd,
            mode: existing?.codexThreadId ? "exec-resume" : "exec",
            status: "active",
            title: null,
          })
        : null;

      if (persistedSession) {
        await this.options.agentRegistry.recordMessage({
          content: response.answer,
          role: "assistant",
          sessionId: persistedSession.id,
        });
        await this.options.agentRegistry.recordRun({
          agentId: agent.id,
          channel: "web",
          command: response.command,
          prompt,
          resultSummary: summarizeResult(response.answer),
          sessionId: persistedSession.id,
          status: "completed",
        });
      } else {
        await this.options.agentRegistry.recordRun({
          agentId: agent.id,
          channel: "web",
          command: response.command,
          prompt,
          resultSummary: summarizeResult(response.answer),
          sessionId: null,
          status: "completed",
        });
      }

      return {
        agent: {
          displayName: agent.displayName,
          id: agent.id,
          slug: agent.slug,
        },
        answer: response.answer,
        messages: persistedSession
          ? await this.options.agentRegistry.listMessages(persistedSession.id)
          : [
              {
                attachments,
                content: message,
                createdAt: new Date().toISOString(),
                id: "ephemeral-user",
                role: "user",
              },
              {
                attachments: [],
                content: response.answer,
                createdAt: new Date().toISOString(),
                id: "ephemeral-assistant",
                role: "assistant",
              },
            ],
        session: summarizeSession(persistedSession, input.channelThreadId),
      };
    } catch (error) {
      if (isAbortError(error)) {
        if (session && streamedAnswer.trim()) {
          await this.options.agentRegistry.recordMessage({
            content: streamedAnswer,
            role: "assistant",
            sessionId: session.id,
          });
        }
        await this.options.agentRegistry.recordRun({
          agentId: agent.id,
          channel: "web",
          command: "codex exec aborted",
          prompt,
          resultSummary: "Execucao abortada pelo cliente web.",
          sessionId: session?.id ?? existing?.id ?? null,
          status: "aborted",
        });
      }
      throw error;
    }
  }

  public async deleteHistory(input: {
    agentSlug?: string | null;
    channelThreadId: string;
  }): Promise<{ deleted: boolean }> {
    const agent = await this.resolveAgent(input.agentSlug ?? null);
    const deletedCount = await this.options.agentRegistry.deleteChannelSessions({
      agentId: agent.id,
      channel: "web",
      channelThreadId: input.channelThreadId,
    });
    return { deleted: deletedCount > 0 };
  }

  private async resolveAgent(explicitSlug: string | null): Promise<AgentRecord> {
    const slug = explicitSlug?.trim();
    if (slug) {
      const explicit = await this.options.agentRegistry.getActiveAgentBySlug(slug);
      if (!explicit) {
        throw new Error(`Agent slug "${slug}" is not active in the registry.`);
      }
      return explicit;
    }

    const { agent } = await resolveOperationalActiveAgent(this.options.agentRegistry, {
      backupAgentSlug: this.options.backupAgentSlug,
      defaultAgentSlug: this.options.defaultAgentSlug,
    });
    return agent;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof CodexCliAbortedError
    || (error instanceof Error && error.name === "AbortError");
}

function summarizeSession(session: AgentSessionRecord | null, channelThreadId: string) {
  return {
    channelThreadId,
    codexThreadId: session?.codexThreadId ?? null,
    id: session?.id ?? null,
    mode: session?.mode ?? null,
    status: session?.status ?? null,
  };
}

function summarizeResult(answer: string): string {
  const trimmed = answer.trim();
  if (!trimmed) {
    return "Resposta vazia.";
  }
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

function composePrompt(
  message: string,
  attachments: AgentMessageAttachmentRecord[],
): string {
  if (attachments.length === 0) {
    return message;
  }

  const attachmentLines = attachments.map((attachment) => {
    const filename = attachment.filename?.trim() || "sem-nome";
    return `- ${filename} (${attachment.mediaType}; ${attachment.kind})`;
  });

  if (!message) {
    return [
      "O usuário enviou anexos sem texto adicional.",
      "Anexos:",
      ...attachmentLines,
      "Se precisar do conteúdo binário real, peça esclarecimento ou transcrição.",
    ].join("\n");
  }

  return [
    message,
    "",
    "Anexos enviados com a mensagem:",
    ...attachmentLines,
    "",
    "Considere os anexos como contexto declarado pelo usuário. Se o conteúdo do arquivo for necessário, peça detalhes adicionais.",
  ].join("\n");
}

function resolveInputMode(attachments: AgentMessageAttachmentRecord[]): "document" | "text" | "voice" {
  if (attachments.some((attachment) => attachment.kind === "audio")) {
    return "voice";
  }

  if (attachments.length > 0) {
    return "document";
  }

  return "text";
}
