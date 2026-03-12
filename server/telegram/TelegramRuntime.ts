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
  pollTimeoutSeconds?: number;
}

export interface TelegramRuntimeStatus {
  botUser: TelegramUser;
  offset: number;
}

export class TelegramRuntime {
  private readonly api: TelegramBotApi;
  private readonly allowedUsers: Set<string>;
  private offset = 0;
  private readonly pollTimeoutSeconds: number;

  public constructor(private readonly options: TelegramRuntimeOptions) {
    if (!options.config.botToken) {
      throw new Error("Telegram bot token is missing.");
    }

    this.api = new TelegramBotApi({ token: options.config.botToken });
    this.allowedUsers = new Set(options.config.allowedUserIds);
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
      }
      if (options.once) {
        return;
      }
    }

    do {
      const updates = await this.api.getUpdates(this.offset, this.pollTimeoutSeconds);
      for (const update of updates) {
        await this.processUpdate(update);
        this.offset = Math.max(this.offset, update.update_id + 1);
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

    if (!this.isAllowedSender(senderId)) {
      await this.api.sendMessage(chatId, "Esse bot está restrito aos usuários autorizados.");
      return;
    }

    const prompt = normalizeMessagePrompt(message);
    if (!prompt) {
      await this.api.sendMessage(
        chatId,
        "Envie texto por enquanto. Voz e documentos ainda não estão implementados neste runtime.",
      );
      return;
    }

    if (prompt === "/start") {
      await this.api.sendMessage(
        chatId,
        "ACOO online. Pode me mandar texto com contexto operacional que eu respondo por aqui.",
      );
      return;
    }

    await this.api.sendChatAction(chatId, "typing");
    const response = await this.options.bot.handleMessage({
      interaction: {
        channel: "telegram",
        inputMode: detectInputMode(message),
        requestedOutputMode: this.options.config.replyAudioByDefault ? "audio" : "text",
        senderId,
      },
      prompt,
    });

    await this.api.sendMessage(chatId, response.answer);
  }

  private isAllowedSender(senderId: string): boolean {
    if (this.allowedUsers.size === 0) {
      return false;
    }

    return this.allowedUsers.has(senderId);
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
