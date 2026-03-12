export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  username?: string;
  first_name?: string;
  title?: string;
}

export interface TelegramMessage {
  chat: TelegramChat;
  date: number;
  document?: {
    file_id: string;
    file_name?: string;
    mime_type?: string;
  };
  from?: TelegramUser;
  message_id: number;
  text?: string;
  voice?: {
    duration: number;
    file_id: string;
    mime_type?: string;
  };
}

export interface TelegramUpdate {
  message?: TelegramMessage;
  update_id: number;
}

interface TelegramApiEnvelope<T> {
  description?: string;
  ok: boolean;
  result: T;
}

export interface TelegramBotApiOptions {
  token: string;
}

export class TelegramBotApi {
  private readonly baseUrl: string;

  public constructor(options: TelegramBotApiOptions) {
    this.baseUrl = `https://api.telegram.org/bot${options.token}`;
  }

  public async getMe(): Promise<TelegramUser> {
    return this.request<TelegramUser>("getMe");
  }

  public async getUpdates(offset?: number, timeoutSeconds = 25): Promise<TelegramUpdate[]> {
    return this.request<TelegramUpdate[]>("getUpdates", {
      offset,
      timeout: timeoutSeconds,
    });
  }

  public async sendChatAction(
    chatId: number,
    action: "typing" | "record_voice",
  ): Promise<void> {
    await this.request("sendChatAction", {
      action,
      chat_id: chatId,
    });
  }

  public async sendMessage(chatId: number, text: string): Promise<void> {
    await this.request("sendMessage", {
      chat_id: chatId,
      text,
    });
  }

  private async request<T>(
    method: string,
    body?: Record<string, number | string | undefined>,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { "content-type": "application/json" } : undefined,
      method: body ? "POST" : "GET",
    });

    if (!response.ok) {
      throw new Error(`Telegram API ${method} failed with HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as TelegramApiEnvelope<T>;
    if (!payload.ok) {
      throw new Error(payload.description || `Telegram API ${method} failed.`);
    }

    return payload.result;
  }
}
