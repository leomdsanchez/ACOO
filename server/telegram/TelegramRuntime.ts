import type { TelegramConfig } from "../config/AppConfig.js";
import type { OperationalBot } from "../bot/OperationalBot.js";
import {
  TelegramBotApi,
  type TelegramMessage,
  type TelegramUpdate,
  type TelegramUser,
} from "./TelegramBotApi.js";

export interface TelegramRuntimeOptions {
  bot: OperationalBot;
  config: TelegramConfig;
  logger?: Pick<Console, "error" | "info" | "warn">;
  pollTimeoutSeconds?: number;
}

export interface TelegramRuntimeStatus {
  botUser: TelegramUser;
  offset: number;
}

export class TelegramRuntime {
  private readonly api: TelegramBotApi;
  private readonly allowedUsers: Set<string>;
  private readonly logger: Pick<Console, "error" | "info" | "warn">;
  private offset = 0;
  private readonly pollTimeoutSeconds: number;

  public constructor(private readonly options: TelegramRuntimeOptions) {
    if (!options.config.botToken) {
      throw new Error("Telegram bot token is missing.");
    }

    this.api = new TelegramBotApi({ token: options.config.botToken });
    this.allowedUsers = new Set(options.config.allowedUserIds);
    this.logger = options.logger ?? console;
    this.pollTimeoutSeconds = options.pollTimeoutSeconds ?? 25;
  }

  public async getStatus(): Promise<TelegramRuntimeStatus> {
    const botUser = await this.api.getMe();
    return {
      botUser,
      offset: this.offset,
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
    const prompt = normalizeMessagePrompt(message);

    this.log(
      "info",
      `in update=${update.update_id} chat=${chatId} sender=${senderId || "unknown"} mode=${inputMode} text=${formatSnippet(prompt ?? describeUnsupportedMessage(message))}`,
    );

    if (!this.isAllowedSender(senderId)) {
      await this.api.sendMessage(chatId, "Esse bot está restrito aos usuários autorizados.");
      this.log("warn", `sender bloqueado: ${senderId || "unknown"} chat=${chatId}`);
      return;
    }

    if (!prompt) {
      await this.api.sendMessage(
        chatId,
        "Envie texto por enquanto. Voz e documentos ainda não estão implementados neste runtime.",
      );
      this.log("warn", `mensagem sem suporte respondida em chat=${chatId} mode=${inputMode}`);
      return;
    }

    if (prompt === "/start") {
      await this.api.sendMessage(
        chatId,
        "ACOO online. Pode me mandar texto com contexto operacional que eu respondo por aqui.",
      );
      this.log("info", `respondeu onboarding em chat=${chatId}`);
      return;
    }

    await this.api.sendChatAction(chatId, "typing");
    const startedAt = Date.now();
    const response = await this.options.bot.handleMessage({
      interaction: {
        channel: "telegram",
        inputMode,
        requestedOutputMode: this.options.config.replyAudioByDefault ? "audio" : "text",
        senderId,
      },
      prompt,
    });

    await this.api.sendMessage(chatId, response.answer);
    this.log(
      "info",
      `out chat=${chatId} skill=${response.activeSkill ?? "none"} took=${Date.now() - startedAt}ms text=${formatSnippet(response.answer)}`,
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
}

function detectInputMode(message: TelegramMessage): "text" | "voice" | "document" {
  if (message.voice) {
    return "voice";
  }

  if (message.document) {
    return "document";
  }

  return "text";
}

function normalizeMessagePrompt(message: TelegramMessage): string | null {
  if (message.text?.trim()) {
    return message.text.trim();
  }

  return null;
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
