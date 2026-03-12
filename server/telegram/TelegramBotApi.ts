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

export interface TelegramFile {
  file_id: string;
  file_path?: string;
  file_size?: number;
  file_unique_id: string;
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
  private readonly fileBaseUrl: string;

  public constructor(options: TelegramBotApiOptions) {
    this.baseUrl = `https://api.telegram.org/bot${options.token}`;
    this.fileBaseUrl = `https://api.telegram.org/file/bot${options.token}`;
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

  public async getFile(fileId: string): Promise<TelegramFile> {
    return this.request<TelegramFile>("getFile", {
      file_id: fileId,
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

  public async downloadFile(filePath: string): Promise<Uint8Array> {
    const response = await fetch(`${this.fileBaseUrl}/${filePath}`);
    if (!response.ok) {
      throw new Error(`Telegram file download failed with HTTP ${response.status}.`);
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
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
      if (response.status === 409) {
        throw new Error(
          "Telegram polling conflict (HTTP 409). Já existe outro consumer ativo chamando getUpdates para este bot.",
        );
      }
      throw new Error(`Telegram API ${method} failed with HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as TelegramApiEnvelope<T>;
    if (!payload.ok) {
      throw new Error(payload.description || `Telegram API ${method} failed.`);
    }

    return payload.result;
  }
}
