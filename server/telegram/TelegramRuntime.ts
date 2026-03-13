import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentSessionRecord } from "../domain/models.js";
import type { TelegramConfig } from "../config/AppConfig.js";
import type { AgentRegistryService } from "../agents/AgentRegistryService.js";
import type { OperationalBot } from "../bot/OperationalBot.js";
import type { AgentRequest } from "../controller/AgentController.js";
import { CodexCliAbortedError } from "../codex/CodexCliService.js";
import type { LocalTranscriptionService } from "../transcription/LocalTranscriptionService.js";
import {
  TelegramBotApi,
  type TelegramMessage,
  type TelegramUpdate,
  type TelegramUser,
} from "./TelegramBotApi.js";
import type { TelegramSessionStore } from "./TelegramSessionStore.js";

export interface TelegramRuntimeOptions {
  agentRegistry: AgentRegistryService;
  bot: OperationalBot;
  config: TelegramConfig;
  logger?: Pick<Console, "error" | "info" | "warn">;
  pollTimeoutSeconds?: number;
  sessionStore: TelegramSessionStore;
  transcription: LocalTranscriptionService;
}

export interface TelegramRuntimeStatus {
  active: boolean;
  activeAgentSlug: string;
  botUser: TelegramUser;
  busyChats: number;
  offset: number;
  queuedUpdates: number;
  sessionId: string | null;
  updatedAt: string;
}

export class TelegramRuntime {
  private readonly api: TelegramBotApi;
  private readonly allowedUsers: Set<string>;
  private readonly chatAbortControllers = new Map<number, AbortController>();
  private readonly chatBusy = new Set<number>();
  private readonly chatQueues = new Map<number, Promise<void>>();
  private readonly chatQueueDepth = new Map<number, number>();
  private readonly logger: Pick<Console, "error" | "info" | "warn">;
  private offset = 0;
  private readonly pollTimeoutSeconds: number;
  private readonly progressPulseMs: number;
  private readonly sessionBootstrapPrompt =
    "Inicie a sessão do canal Telegram do ACOO. Responda apenas: Sessão iniciada.";

  public constructor(private readonly options: TelegramRuntimeOptions) {
    if (!options.config.botToken) {
      throw new Error("Telegram bot token is missing.");
    }

    this.api = new TelegramBotApi({ token: options.config.botToken });
    this.allowedUsers = new Set(options.config.allowedUserIds);
    this.logger = options.logger ?? console;
    this.pollTimeoutSeconds = options.pollTimeoutSeconds ?? 25;
    this.progressPulseMs = Math.max(2_000, options.config.progressPulseMs);
  }

  public async getStatus(): Promise<TelegramRuntimeStatus> {
    const botUser = await this.api.getMe();
    const session = await this.options.sessionStore.load();
    return {
      active: session.active,
      activeAgentSlug: session.activeAgentSlug,
      botUser,
      busyChats: this.chatBusy.size,
      offset: this.offset,
      queuedUpdates: sumQueuedUpdates(this.chatQueueDepth),
      sessionId: session.sessionId,
      updatedAt: session.updatedAt,
    };
  }

  public async processPendingUpdates(options?: { dropPending?: boolean; once?: boolean }): Promise<void> {
    if (options?.dropPending) {
      const updates = await this.api.getUpdates(this.offset, 1);
      if (updates.length > 0) {
        this.offset = updates.at(-1)!.update_id + 1;
        this.log("info", `backlog descartado: ${updates.length} update(s), offset=${this.offset}`);
      }
      if (options.once) {
        return;
      }
    }

    do {
      const updates = await this.api.getUpdates(this.offset, this.pollTimeoutSeconds);
      if (updates.length > 0) {
        this.log("info", `poll recebeu ${updates.length} update(s), offset=${this.offset}`);
      }
      const pending = updates.map((update) => this.enqueueUpdate(update));
      for (const update of updates) {
        this.offset = Math.max(this.offset, update.update_id + 1);
      }
      if (options?.once && pending.length > 0) {
        await Promise.allSettled(pending);
      }
    } while (!options?.once);
  }

  private enqueueUpdate(update: TelegramUpdate): Promise<void> {
    const chatId = update.message?.chat.id ?? -1;
    if (chatId !== -1 && this.chatBusy.has(chatId)) {
      const controller = this.chatAbortControllers.get(chatId);
      if (controller && !controller.signal.aborted) {
        controller.abort();
        this.log("info", `execucao interrompida por nova mensagem em chat=${chatId}`);
      }
    }
    const previous = this.chatQueues.get(chatId) ?? Promise.resolve();
    const depth = (this.chatQueueDepth.get(chatId) ?? 0) + 1;
    this.chatQueueDepth.set(chatId, depth);
    if (depth > 1 && chatId !== -1) {
      this.log("info", `update enfileirado em chat=${chatId} depth=${depth}`);
    }

    let current: Promise<void>;
    current = previous
      .catch(() => undefined)
      .then(async () => {
        const abortController = new AbortController();
        this.chatAbortControllers.set(chatId, abortController);
        this.chatBusy.add(chatId);
        try {
          await this.processUpdate(update, abortController.signal);
        } catch (error) {
          if (isInterruptedError(error)) {
            this.log("info", `update interrompido em chat=${chatId}`);
            return;
          }
          this.log(
            "error",
            `falha ao processar update ${update.update_id}: ${error instanceof Error ? error.message : String(error)}`,
          );
          await this.replyWithGenericFailure(update);
        } finally {
          if (this.chatAbortControllers.get(chatId) === abortController) {
            this.chatAbortControllers.delete(chatId);
          }
          this.chatBusy.delete(chatId);
          const nextDepth = (this.chatQueueDepth.get(chatId) ?? 1) - 1;
          if (nextDepth <= 0) {
            this.chatQueueDepth.delete(chatId);
          } else {
            this.chatQueueDepth.set(chatId, nextDepth);
          }
          if (this.chatQueues.get(chatId) === current) {
            this.chatQueues.delete(chatId);
          }
        }
      });

    this.chatQueues.set(chatId, current);
    return current;
  }

  private async processUpdate(update: TelegramUpdate, abortSignal: AbortSignal): Promise<void> {
    const message = update.message;
    if (!message) {
      return;
    }

    const senderId = String(message.from?.id ?? "");
    const chatId = message.chat.id;
    const inputMode = detectInputMode(message);

    if (!this.isAllowedSender(senderId)) {
      await this.api.sendMessage(chatId, "Esse bot está restrito aos usuários autorizados.");
      this.log("warn", `sender bloqueado: ${senderId || "unknown"} chat=${chatId}`);
      return;
    }

    const rawText = message.text?.trim() ?? null;
    if (rawText) {
      const command = this.parseCommand(rawText);
      if (command) {
        this.log(
          "info",
          `in update=${update.update_id} chat=${chatId} sender=${senderId || "unknown"} mode=text text=${formatSnippet(rawText)}`,
        );
        await this.handleCommand(command, chatId, senderId);
        return;
      }
    }

    const session = await this.options.sessionStore.load();
    if (!session.active) {
      await this.api.sendMessage(
        chatId,
        "Sessão encerrada. Use /start para retomar ou /new para abrir uma nova.",
      );
      this.log("warn", `mensagem ignorada sem sessao ativa em chat=${chatId}`);
      return;
    }

    const prompt = await this.resolvePrompt(message, chatId);
    this.log(
      "info",
      `in update=${update.update_id} chat=${chatId} sender=${senderId || "unknown"} mode=${inputMode} text=${formatSnippet(prompt ?? describeUnsupportedMessage(message))}`,
    );

    if (!prompt) {
      const reply = inputMode === "voice"
        ? "Nao consegui transcrever esse audio. Tente novamente ou envie em texto."
        : "Envie texto por enquanto. Documentos ainda nao estao implementados neste runtime.";
      await this.api.sendMessage(chatId, reply);
      this.log("warn", `mensagem sem suporte respondida em chat=${chatId} mode=${inputMode}`);
      return;
    }

    const startedAt = Date.now();
    const response = await this.runWithProgress(chatId, "typing", () =>
      this.handleWithSingleSession({
        activeAgentSlug: session.activeAgentSlug,
        abortSignal,
        chatId,
        inputMode,
        prompt,
        senderId,
      }),
    );

    await this.api.sendMessage(chatId, response.answer);
    this.log(
      "info",
      `out chat=${chatId} skill=${response.activeSkill ?? "none"} session=${response.threadId ?? "none"} took=${Date.now() - startedAt}ms text=${formatSnippet(response.answer)}`,
    );
  }

  private isAllowedSender(senderId: string): boolean {
    if (this.allowedUsers.size === 0) {
      return false;
    }

    return this.allowedUsers.has(senderId);
  }

  private log(level: "error" | "info" | "warn", message: string): void {
    this.logger[level](`[telegram] ${new Date().toISOString()} ${message}`);
  }

  private async handleWithSingleSession(input: {
    activeAgentSlug: string;
    abortSignal?: AbortSignal;
    chatId: number;
    inputMode: "text" | "voice" | "document";
    prompt: string;
    senderId: string;
  }): Promise<TelegramBotResponse> {
    const session = await this.options.sessionStore.load();
    const agentId = await this.resolveAgentId(input.activeAgentSlug);
    const request = this.buildAgentRequest(input, session.sessionId);

    try {
      const response = await this.options.bot.handleMessage(request);
      const nextSession = response.threadId && response.threadId !== session.sessionId
        ? await this.options.sessionStore.attachSession(response.threadId)
        : session;
      const sessionMode = session.sessionId ? "exec-resume" : "exec";
      if (!session.sessionId && response.threadId) {
        this.log("info", `sessao criada: ${response.threadId}`);
      }
      await this.persistCompletedRun(agentId, input.chatId, input.prompt, sessionMode, nextSession.sessionId, response);
      return response;
    } catch (error) {
      if (isInterruptedError(error)) {
        await this.persistAbortedRun(agentId, input.chatId, input.prompt, session.sessionId);
        throw error;
      }

      if (!session.sessionId) {
        await this.persistFailedRun(agentId, input.prompt, error);
        throw error;
      }

      this.log("warn", `falha ao retomar sessao ${session.sessionId}; recriando thread`);
      await this.options.sessionStore.startNew();
      const fallbackResponse = await this.options.bot.handleMessage({
        ...request,
        abortSignal: input.abortSignal,
        sessionId: undefined,
      });
      const recreatedSession = fallbackResponse.threadId
        ? await this.options.sessionStore.attachSession(fallbackResponse.threadId)
        : await this.options.sessionStore.load();
      if (fallbackResponse.threadId) {
        this.log("info", `sessao recriada: ${fallbackResponse.threadId}`);
      }
      await this.persistCompletedRun(agentId, input.chatId, input.prompt, "exec", recreatedSession.sessionId, fallbackResponse);
      return fallbackResponse;
    }
  }

  private async handleCommand(
    command: TelegramCommand,
    chatId: number,
    senderId: string,
  ): Promise<void> {
    if (command.kind === "help") {
      await this.api.sendMessage(chatId, formatHelpMessage());
      this.log("info", `help enviado em chat=${chatId}`);
      return;
    }

    if (command.kind === "chats") {
      const [sessions, agents] = await Promise.all([
        this.listRecentChatSessions(chatId),
        this.options.agentRegistry.listAgents({ includeDisabled: true }),
      ]);
      const current = await this.options.sessionStore.load();
      const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
      await this.api.sendMessage(chatId, formatChatsMessage(sessions, agentsById, current.sessionId));
      this.log("info", `chats enviado em chat=${chatId} count=${sessions.length}`);
      return;
    }

    if (command.kind === "agents") {
      const agents = await this.options.agentRegistry.listAgents();
      const session = await this.options.sessionStore.load();
      const lines = agents.map((agent) => {
        const current = agent.slug === session.activeAgentSlug ? " [ativo]" : "";
        return `/${agent.slug} - ${agent.displayName}${current}`;
      });
      await this.api.sendMessage(chatId, formatAgentsMessage(lines));
      this.log("info", `agents enviado em chat=${chatId}`);
      return;
    }

    if (command.kind === "route-target") {
      const selected = await this.options.agentRegistry.getAgentBySlug(command.target);
      if (selected) {
        const current = await this.options.sessionStore.load();
        if (current.sessionId) {
          await this.endRegistrySession(current.activeAgentSlug, chatId);
        }
        await this.options.sessionStore.switchAgent(selected.slug, { preserveActive: current.active });
        let answer = `Agente ativo alterado para /${selected.slug} (${selected.displayName}).`;
        if (current.active) {
          answer = await this.runWithProgress(chatId, "typing", () => this.bootstrapCodexSession(chatId, senderId));
          answer = `Agente ativo alterado para /${selected.slug} (${selected.displayName}). ${answer}`;
        } else {
          answer = `${answer} Use /start para iniciar a sessao ou /new para abrir uma nova.`;
        }
        await this.api.sendMessage(chatId, answer);
        this.log("info", `agente ativo alterado em chat=${chatId} slug=${selected.slug}`);
        return;
      }

      const session = await this.resolveRoutedSession(chatId, command.target);
      if (!session) {
        await this.api.sendMessage(
          chatId,
          `Nao encontrei /${command.target}. Use /agents para listar agentes ou /chats para listar sessoes recentes.`,
        );
        this.log("warn", `atalho desconhecido em chat=${chatId} target=${command.target}`);
        return;
      }

      if (!session.codexThreadId) {
        await this.api.sendMessage(
          chatId,
          "A sessao selecionada nao tem thread Codex anexada para retomar.",
        );
        this.log("warn", `sessao sem thread retomada em chat=${chatId} session=${session.id}`);
        return;
      }

      const current = await this.options.sessionStore.load();
      if (current.sessionId) {
        await this.endRegistrySession(current.activeAgentSlug, chatId);
      }
      const selectedAgent = await this.resolveAgentRecordById(session.agentId);
      await this.options.sessionStore.resumeSession(selectedAgent.slug, session.codexThreadId);
      await this.activateRegistrySession(selectedAgent.slug, chatId, session.codexThreadId, "exec-resume", session.title);
      await this.api.sendMessage(
        chatId,
        formatResumedSessionMessage({
          agentDisplayName: selectedAgent.displayName,
          agentSlug: selectedAgent.slug,
          title: session.title,
        }),
      );
      this.log("info", `sessao retomada em chat=${chatId} session=${session.id}`);
      return;
    }

    if (command.kind === "status") {
      const session = await this.options.sessionStore.load();
      const activeAgent = await this.options.agentRegistry.getAgentBySlug(session.activeAgentSlug);
      const statusText = formatStatusMessage({
        active: session.active,
        agentDisplayName: activeAgent?.displayName ?? null,
        agentSlug: session.activeAgentSlug,
        sessionId: session.sessionId,
      });
      await this.api.sendMessage(chatId, statusText);
      this.log("info", `status enviado em chat=${chatId} session=${session.sessionId ?? "none"}`);
      return;
    }

    if (command.kind === "start") {
      const session = await this.options.sessionStore.start();
      let answer = "Sessão da Codex reativada. Pode continuar deste ponto.";
      if (!session.sessionId) {
        try {
          answer = await this.runWithProgress(chatId, "typing", () =>
            this.bootstrapCodexSession(chatId, senderId),
          );
        } catch (error) {
          await this.options.sessionStore.end();
          throw error;
        }
      } else {
        await this.activateRegistrySession(session.activeAgentSlug, chatId, session.sessionId, "exec-resume");
      }
      await this.api.sendMessage(chatId, answer);
      this.log("info", `sessao iniciada em chat=${chatId} existing=${session.sessionId ?? "none"}`);
      return;
    }

    if (command.kind === "end") {
      const session = await this.options.sessionStore.end();
      if (session.sessionId) {
        await this.endRegistrySession(session.activeAgentSlug, chatId);
      }
      const answer = session.sessionId
        ? "Sessão encerrada. Use /start para retomar ou /new para abrir uma nova."
        : "Nenhuma sessão ativa para encerrar. Use /start para iniciar.";
      await this.api.sendMessage(chatId, answer);
      this.log("warn", `sessao encerrada em chat=${chatId} existing=${session.sessionId ?? "none"}`);
      return;
    }

    const current = await this.options.sessionStore.load();
    if (current.sessionId) {
      await this.endRegistrySession(current.activeAgentSlug, chatId);
    }
    await this.options.sessionStore.startNew();
    let answer: string;
    try {
      answer = await this.runWithProgress(chatId, "typing", () =>
        this.bootstrapCodexSession(chatId, senderId),
      );
    } catch (error) {
      await this.options.sessionStore.end();
      throw error;
    }
    await this.api.sendMessage(chatId, answer);
    this.log("warn", `nova sessao preparada em chat=${chatId}`);
  }

  private async replyWithGenericFailure(update: TelegramUpdate): Promise<void> {
    const chatId = update.message?.chat.id;
    if (!chatId) {
      return;
    }

    try {
      await this.api.sendMessage(
        chatId,
        "Falhei ao processar esta mensagem. Tente de novo, ou use /new para abrir uma sessão nova.",
      );
    } catch {
      this.log("error", `nao foi possivel enviar erro generico para chat=${chatId}`);
    }
  }

  private async resolvePrompt(message: TelegramMessage, chatId: number): Promise<string | null> {
    if (message.text?.trim()) {
      return message.text.trim();
    }

    if (!isAudioMessage(message)) {
      return null;
    }

    if (!this.options.transcription.isEnabled()) {
      throw new Error("Transcrição local está desabilitada.");
    }

    this.log("info", `transcrevendo audio em chat=${chatId}`);
    const startedAt = Date.now();
    const fileId = message.voice?.file_id ?? message.document?.file_id;
    if (!fileId) {
      return null;
    }

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "acoo-telegram-audio-"));
    try {
      const file = await this.api.getFile(fileId);
      if (!file.file_path) {
        throw new Error("Telegram não retornou file_path para o áudio.");
      }

      const bytes = await this.api.downloadFile(file.file_path);
      const extension = resolveAudioExtension(file.file_path);
      const audioPath = path.join(tempDir, `input${extension}`);
      await writeFile(audioPath, bytes);
      const transcript = await this.runWithProgress(chatId, "typing", () =>
        this.options.transcription.transcribe(audioPath),
      );
      const text = transcript.text.trim();
      this.log(
        "info",
        `transcricao concluida em chat=${chatId} took=${Date.now() - startedAt}ms lang=${transcript.language ?? "unknown"} text=${formatSnippet(text)}`,
      );
      return text || null;
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  }

  private async bootstrapCodexSession(chatId: number, senderId: string): Promise<string> {
    const session = await this.options.sessionStore.load();
    const response = await this.handleWithSingleSession({
      activeAgentSlug: session.activeAgentSlug,
      chatId,
      inputMode: "text",
      prompt: this.sessionBootstrapPrompt,
      senderId,
    });
    return response.threadId
      ? "Sessao iniciada e thread Codex anexada. Pode continuar."
      : response.answer || "Sessao iniciada.";
  }

  private async runWithProgress<T>(
    chatId: number,
    action: "typing" | "record_voice",
    operation: () => Promise<T>,
  ): Promise<T> {
    const pulse = async () => {
      try {
        await this.api.sendChatAction(chatId, action);
      } catch (error) {
        this.log(
          "warn",
          `falha ao enviar chat action ${action} em chat=${chatId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    await pulse();
    const interval = setInterval(() => {
      void pulse();
    }, this.progressPulseMs);

    try {
      return await operation();
    } finally {
      clearInterval(interval);
    }
  }

  private parseCommand(prompt: string): TelegramCommand | null {
    const token = prompt.trim().split(/\s+/, 1)[0] ?? "";
    const normalized = normalizeCommandToken(token, this.options.config.botUsername);
    if (!normalized.startsWith("/")) {
      return null;
    }

    switch (normalized) {
      case "/start":
        return { kind: "start" };
      case "/end":
        return { kind: "end" };
      case "/new":
      case "/reset":
        return { kind: "new" };
      case "/help":
        return { kind: "help" };
      case "/chats":
        return { kind: "chats" };
      case "/status":
        return { kind: "status" };
      case "/agents":
        return { kind: "agents" };
      default: {
        const target = normalized.slice(1);
        if (!target) {
          return null;
        }
        return { kind: "route-target", target };
      }
    }
  }

  private async resolveAgentId(agentSlug: string): Promise<string> {
    const agent = await this.options.agentRegistry.getAgentBySlug(agentSlug);
    if (!agent) {
      throw new Error(`Agent slug "${agentSlug}" is not registered.`);
    }
    return agent.id;
  }

  private async resolveAgentRecordById(agentId: string) {
    const agents = await this.options.agentRegistry.listAgents({ includeDisabled: true });
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) {
      throw new Error(`Agent id "${agentId}" is not registered.`);
    }
    return agent;
  }

  private async listRecentChatSessions(chatId: number): Promise<AgentSessionRecord[]> {
    return this.options.agentRegistry.listRecentChannelSessions({
      channel: "telegram",
      channelThreadId: String(chatId),
      limit: 5,
    });
  }

  private async resolveRoutedSession(chatId: number, target: string): Promise<AgentSessionRecord | null> {
    if (!/^\d+$/.test(target)) {
      return null;
    }

    const index = Number(target);
    if (!Number.isInteger(index) || index < 1) {
      return null;
    }

    const sessions = await this.listRecentChatSessions(chatId);
    return sessions[index - 1] ?? null;
  }

  private async activateRegistrySession(
    agentSlug: string,
    chatId: number,
    codexThreadId: string | null,
    mode: "exec" | "exec-resume",
    title?: string | null,
  ): Promise<void> {
    const agentId = await this.resolveAgentId(agentSlug);
    await this.options.agentRegistry.upsertSession({
      agentId,
      channel: "telegram",
      channelThreadId: String(chatId),
      codexThreadId,
      cwd: process.cwd(),
      mode,
      status: "active",
      title,
    });
  }

  private async endRegistrySession(agentSlug: string, chatId: number): Promise<void> {
    const agentId = await this.resolveAgentId(agentSlug);
    await this.options.agentRegistry.setSessionStatus({
      agentId,
      channel: "telegram",
      channelThreadId: String(chatId),
      status: "ended",
    });
  }

  private buildAgentRequest(
    input: {
      activeAgentSlug: string;
      abortSignal?: AbortSignal;
      inputMode: "text" | "voice" | "document";
      prompt: string;
      senderId: string;
    },
    sessionId: string | null,
  ): AgentRequest {
    return {
      agentSlug: input.activeAgentSlug,
      abortSignal: input.abortSignal,
      interaction: {
        channel: "telegram",
        inputMode: input.inputMode,
        requestedOutputMode: this.options.config.replyAudioByDefault ? "audio" : "text",
        senderId: input.senderId,
      },
      prompt: input.prompt,
      sessionId: sessionId ?? undefined,
    };
  }

  private async persistCompletedRun(
    agentId: string,
    chatId: number,
    prompt: string,
    mode: "exec" | "exec-resume",
    codexThreadId: string | null,
    response: TelegramBotResponse,
  ): Promise<void> {
    const title = deriveSessionTitle(prompt, this.sessionBootstrapPrompt);
    const agentSession = await this.options.agentRegistry.upsertSession({
      agentId,
      channel: "telegram",
      channelThreadId: String(chatId),
      codexThreadId,
      cwd: process.cwd(),
      mode,
      status: "active",
      title,
    });
    await this.options.agentRegistry.recordRun({
      agentId,
      channel: "telegram",
      command: response.command,
      prompt,
      resultSummary: response.answer,
      sessionId: agentSession.id,
      status: "completed",
    });
  }

  private async persistFailedRun(agentId: string, prompt: string, error: unknown): Promise<void> {
    await this.options.agentRegistry.recordRun({
      agentId,
      channel: "telegram",
      command: "",
      prompt,
      resultSummary: error instanceof Error ? error.message : String(error),
      sessionId: null,
      status: "failed",
    });
  }

  private async persistAbortedRun(
    agentId: string,
    chatId: number,
    prompt: string,
    codexThreadId: string | null,
  ): Promise<void> {
    const agentSession = codexThreadId
      ? await this.options.agentRegistry.upsertSession({
        agentId,
        channel: "telegram",
        channelThreadId: String(chatId),
        codexThreadId,
        cwd: process.cwd(),
        mode: "exec-resume",
        status: "active",
      })
      : null;

    await this.options.agentRegistry.recordRun({
      agentId,
      channel: "telegram",
      command: "",
      prompt,
      resultSummary: "Execution aborted by a newer Telegram message.",
      sessionId: agentSession?.id ?? null,
      status: "aborted",
    });
  }
}

type TelegramBotResponse = Awaited<ReturnType<OperationalBot["handleMessage"]>>;

type TelegramCommand =
  | { kind: "agents" }
  | { kind: "chats" }
  | { kind: "end" }
  | { kind: "help" }
  | { kind: "new" }
  | { kind: "route-target"; target: string }
  | { kind: "start" }
  | { kind: "status" };

function detectInputMode(message: TelegramMessage): "text" | "voice" | "document" {
  if (message.voice) {
    return "voice";
  }

  if (message.document) {
    return "document";
  }

  return "text";
}

function normalizeCommandToken(token: string, botUsername?: string | null): string {
  if (!token.startsWith("/")) {
    return token;
  }

  const [command, mention] = token.split("@", 2);
  if (!mention) {
    return command;
  }

  if (!botUsername) {
    return token;
  }

  return mention.toLowerCase() === botUsername.toLowerCase() ? command : token;
}

function isAudioMessage(message: TelegramMessage): boolean {
  if (message.voice) {
    return true;
  }

  const mimeType = message.document?.mime_type?.toLowerCase() ?? "";
  return mimeType.startsWith("audio/");
}

function resolveAudioExtension(filePath: string): string {
  const extension = path.extname(filePath).trim();
  return extension || ".ogg";
}

function describeUnsupportedMessage(message: TelegramMessage): string {
  if (message.voice) {
    return `voice:${message.voice.duration}s`;
  }

  if (message.document) {
    return `document:${message.document.file_name ?? message.document.mime_type ?? "unknown"}`;
  }

  return "unsupported";
}

function formatSnippet(value: string, maxLength = 140): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function sumQueuedUpdates(depths: Map<number, number>): number {
  let total = 0;
  for (const value of depths.values()) {
    total += value;
  }
  return total;
}

function formatHelpMessage(): string {
  return [
    "Comandos disponiveis:",
    "/help - mostra este resumo",
    "/agents - lista os agentes ativos",
    "/chats - lista as 5 sessoes mais recentes",
    "/<slug> - seleciona um agente",
    "/1, /2, /3... - retomam uma sessao recente da lista",
    "/status - mostra o agente e a sessao atual",
    "/start - inicia ou reativa a sessao",
    "/new - abre uma nova sessao para o agente atual",
    "/end - encerra a sessao atual",
    "/reset - alias de /new",
  ].join("\n");
}

function formatAgentsMessage(lines: string[]): string {
  if (lines.length === 0) {
    return "Nenhum agente ativo disponivel no registry.";
  }

  return ["Agentes disponiveis:", ...lines, "", "Use /<slug> para trocar o agente ativo."].join("\n");
}

function formatChatsMessage(
  sessions: AgentSessionRecord[],
  agentsById: Map<string, { displayName: string; slug: string }>,
  currentCodexThreadId: string | null,
): string {
  if (sessions.length === 0) {
    return "Nenhuma sessao recente encontrada neste chat.";
  }

  const lines = sessions.map((session) => {
    const index = sessions.indexOf(session) + 1;
    const agent = agentsById.get(session.agentId);
    const current = session.codexThreadId && session.codexThreadId === currentCodexThreadId ? " [atual]" : "";
    const title = session.title ? ` - ${session.title}` : "";
    return `/${index} - ${agent ? agent.displayName : "Agente desconhecido"}${title}${current}`;
  });
  return ["Sessoes recentes:", ...lines, "", "Use /1, /2, /3... para retomar uma sessao."].join("\n");
}

function formatStatusMessage(input: {
  active: boolean;
  agentDisplayName: string | null;
  agentSlug: string;
  sessionId: string | null;
}): string {
  const agentLine = `Agente: /${input.agentSlug}${input.agentDisplayName ? ` (${input.agentDisplayName})` : ""}`;
  if (input.active) {
    return ["Sessao ativa.", agentLine, `Thread Codex: ${input.sessionId ?? "ainda nao anexada"}.`].join("\n");
  }

  return ["Sessao inativa.", agentLine, "Use /start para retomar ou /new para abrir uma nova."].join("\n");
}

function formatResumedSessionMessage(input: {
  agentDisplayName: string;
  agentSlug: string;
  title: string | null;
}): string {
  const titleLine = input.title ? ` - ${input.title}` : "";
  return `Sessao retomada com /${input.agentSlug} (${input.agentDisplayName})${titleLine}.`;
}

function deriveSessionTitle(prompt: string, bootstrapPrompt: string): string | null {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized || normalized === bootstrapPrompt) {
    return null;
  }

  return normalized.length <= 72 ? normalized : `${normalized.slice(0, 69)}...`;
}

function isInterruptedError(error: unknown): boolean {
  return error instanceof CodexCliAbortedError;
}
