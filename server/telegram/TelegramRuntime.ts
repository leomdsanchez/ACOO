import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TelegramConfig } from "../config/AppConfig.js";
import type { AgentRegistryService } from "../agents/AgentRegistryService.js";
import type { OperationalBot } from "../bot/OperationalBot.js";
import type { AgentRequest } from "../controller/AgentController.js";
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
  offset: number;
  sessionId: string | null;
  updatedAt: string;
}

export class TelegramRuntime {
  private readonly api: TelegramBotApi;
  private readonly allowedUsers: Set<string>;
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
      offset: this.offset,
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
      for (const update of updates) {
        try {
          await this.processUpdate(update);
        } catch (error) {
          this.log(
            "error",
            `falha ao processar update ${update.update_id}: ${error instanceof Error ? error.message : String(error)}`,
          );
          await this.replyWithGenericFailure(update);
        } finally {
          this.offset = Math.max(this.offset, update.update_id + 1);
        }
      }
    } while (!options?.once);
  }

  private async processUpdate(update: TelegramUpdate): Promise<void> {
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
      if (!session.sessionId) {
        await this.persistFailedRun(agentId, input.prompt, error);
        throw error;
      }

      this.log("warn", `falha ao retomar sessao ${session.sessionId}; recriando thread`);
      await this.options.sessionStore.startNew();
      const fallbackResponse = await this.options.bot.handleMessage({
        ...request,
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
      await this.api.sendMessage(
        chatId,
        "Comandos: /agents lista agentes, /coo volta ao agente principal, /start inicia ou reativa a sessao, /end encerra a sessao atual, /new abre uma nova sessao, /status mostra o estado atual e /reset e alias de /new.",
      );
      this.log("info", `help enviado em chat=${chatId}`);
      return;
    }

    if (command.kind === "agents") {
      const agents = await this.options.agentRegistry.listAgents();
      const session = await this.options.sessionStore.load();
      const lines = agents.map((agent) => {
        const current = agent.slug === session.activeAgentSlug ? " [ativo]" : "";
        return `/${agent.slug} - ${agent.displayName}${current}`;
      });
      await this.api.sendMessage(chatId, `Agentes disponiveis:\n${lines.join("\n")}`);
      this.log("info", `agents enviado em chat=${chatId}`);
      return;
    }

    if (command.kind === "select-agent") {
      const selected = await this.options.agentRegistry.getAgentBySlug(command.agentSlug);
      if (!selected) {
        await this.api.sendMessage(chatId, `Agente /${command.agentSlug} nao existe.`);
        this.log("warn", `agente inexistente solicitado em chat=${chatId} slug=${command.agentSlug}`);
        return;
      }

      const current = await this.options.sessionStore.load();
      if (current.sessionId) {
        await this.endRegistrySession(current.activeAgentSlug, chatId);
      }
      await this.options.sessionStore.switchAgent(selected.slug);
      await this.api.sendMessage(
        chatId,
        `Agente ativo alterado para /${selected.slug} (${selected.displayName}). A sessao anterior foi encerrada para evitar misturar contexto. Use /start ou /new para abrir uma thread da Codex para ele.`,
      );
      this.log("info", `agente ativo alterado em chat=${chatId} slug=${selected.slug}`);
      return;
    }

    if (command.kind === "status") {
      const session = await this.options.sessionStore.load();
      const activeAgent = await this.options.agentRegistry.getAgentBySlug(session.activeAgentSlug);
      const statusText = session.active
        ? `Sessao ativa.\nAgente: /${session.activeAgentSlug}${activeAgent ? ` (${activeAgent.displayName})` : ""}\nThread Codex: ${session.sessionId ?? "ainda nao anexada"}.`
        : `Sessao inativa.\nAgente: /${session.activeAgentSlug}${activeAgent ? ` (${activeAgent.displayName})` : ""}\nUse /start para retomar ou /new para abrir uma nova.`;
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
      case "/status":
        return { kind: "status" };
      case "/agents":
        return { kind: "agents" };
      default: {
        const slug = normalized.slice(1);
        if (!slug) {
          return null;
        }
        return { kind: "select-agent", agentSlug: slug };
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

  private async activateRegistrySession(
    agentSlug: string,
    chatId: number,
    codexThreadId: string | null,
    mode: "exec" | "exec-resume",
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
      inputMode: "text" | "voice" | "document";
      prompt: string;
      senderId: string;
    },
    sessionId: string | null,
  ): AgentRequest {
    return {
      agentSlug: input.activeAgentSlug,
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
    const agentSession = await this.options.agentRegistry.upsertSession({
      agentId,
      channel: "telegram",
      channelThreadId: String(chatId),
      codexThreadId,
      cwd: process.cwd(),
      mode,
      status: "active",
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
}

type TelegramBotResponse = Awaited<ReturnType<OperationalBot["handleMessage"]>>;

type TelegramCommand =
  | { kind: "agents" }
  | { kind: "end" }
  | { kind: "help" }
  | { kind: "new" }
  | { kind: "select-agent"; agentSlug: string }
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
