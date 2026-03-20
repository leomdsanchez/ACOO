import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OperationalRuntime } from "../bootstrap.js";
import { runPlaywrightDoctor } from "../mcp/PlaywrightDoctorRunner.js";
import type {
  AgentMessageAttachmentKind,
  CreateAgentInput,
  UpdateAgentInput,
} from "../domain/models.js";
import { resolveOperationalActiveAgent } from "../agents/OperationalAgentSelector.js";
import { TelegramSessionStore } from "../telegram/TelegramSessionStore.js";
import { AgentRegistryError } from "../agents/AgentRegistryErrors.js";
import { toAgentApiRecord } from "./AgentApiPresenter.js";

interface HttpServerOptions {
  host: string;
  port: number;
  runtime: OperationalRuntime;
}

interface RouteContext {
  pathname: string;
  query: URLSearchParams;
  request: IncomingMessage;
  response: ServerResponse;
}

export class HttpServer {
  private readonly server: Server;

  public constructor(private readonly options: HttpServerOptions) {
    this.server = createServer((request, response) => {
      void this.handleRequest(request, response).catch((error) => {
        const message = error instanceof Error ? error.message : "Internal server error.";
        sendError(response, resolveHttpStatusCode(error), message);
      });
    });
  }

  public async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.options.port, this.options.host, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
  }

  public async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    setCommonHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", `http://${this.options.host}:${this.options.port}`);
    const context: RouteContext = {
      pathname: url.pathname,
      query: url.searchParams,
      request,
      response,
    };

    if (request.method === "GET" && context.pathname === "/healthz") {
      sendJson(response, 200, { data: { ok: true } });
      return;
    }

    if (request.method === "GET" && context.pathname === "/api/status") {
      sendJson(response, 200, { data: await this.options.runtime.status.getStatus() });
      return;
    }

    if (request.method === "GET" && context.pathname === "/api/mcp") {
      const cli = await this.options.runtime.codex.getStatus();
      sendJson(response, 200, {
        data: this.options.runtime.mcpRegistry.getSnapshot(cli),
      });
      return;
    }

    if (request.method === "GET" && context.pathname === "/api/chat") {
      const channelThreadId = emptyToUndefined(context.query.get("channelThreadId"));
      if (!channelThreadId) {
        throw new HttpRequestError(400, "channelThreadId is required.");
      }
      const history = await this.options.runtime.webChat.getHistory({
        agentSlug: emptyToUndefined(context.query.get("agentSlug")),
        channelThreadId,
      });
      sendJson(response, 200, { data: history });
      return;
    }

    if (request.method === "GET" && context.pathname === "/api/chat/catalog") {
      const channel = emptyToUndefined(context.query.get("channel"));
      if (channel && channel !== "telegram") {
        throw new HttpRequestError(400, `Unsupported chat catalog channel "${channel}".`);
      }
      const data = await listChatCatalogEntries(this.options.runtime, {
        channel: channel === "telegram" ? "telegram" : undefined,
      });
      sendJson(response, 200, { data });
      return;
    }

    const attachmentId = matchChatAttachmentId(context.pathname);
    if (request.method === "GET" && attachmentId) {
      const filePath = resolveChatAttachmentPath(this.options.runtime.config.repoRoot, attachmentId);
      try {
        const file = await readFile(filePath);
        const mediaType = emptyToUndefined(context.query.get("mediaType")) || "application/octet-stream";
        response.writeHead(200, {
          "cache-control": "private, max-age=3600",
          "content-type": mediaType,
        });
        response.end(file);
      } catch {
        sendError(response, 404, `Attachment "${attachmentId}" not found.`);
      }
      return;
    }

    if (request.method === "POST" && context.pathname === "/api/chat") {
      const body = await readJsonBody<{
        attachments?: Array<{
          filename?: string | null;
          kind?: AgentMessageAttachmentKind;
          mediaType?: string;
        }>;
        agentSlug?: string | null;
        channelThreadId?: string;
        cwd?: string;
        mode?: "ephemeral" | "resume";
        message?: string;
      }>(request);
      const channelThreadId = body.channelThreadId?.trim();
      const message = body.message?.trim() ?? "";
      const ephemeral = body.mode === "ephemeral";
      const attachments = await normalizeAttachmentInputs(
        this.options.runtime.config.repoRoot,
        body.attachments,
        { persistAssets: !ephemeral },
      );
      if (!channelThreadId) {
        throw new HttpRequestError(400, "channelThreadId is required.");
      }
      if (!message && attachments.length === 0) {
        throw new HttpRequestError(400, "message or attachments are required.");
      }
      const result = await this.options.runtime.webChat.sendMessage({
        attachments,
        agentSlug: body.agentSlug ?? null,
        channelThreadId,
        cwd: body.cwd?.trim() || this.options.runtime.config.repoRoot,
        mode: ephemeral ? "ephemeral" : "resume",
        message,
      });
      sendJson(response, 200, { data: result });
      return;
    }

    if (request.method === "DELETE" && context.pathname === "/api/chat") {
      const channelThreadId = emptyToUndefined(context.query.get("channelThreadId"));
      if (!channelThreadId) {
        throw new HttpRequestError(400, "channelThreadId is required.");
      }
      const result = await this.options.runtime.webChat.deleteHistory({
        agentSlug: emptyToUndefined(context.query.get("agentSlug")),
        channelThreadId,
      });
      sendJson(response, 200, { data: result });
      return;
    }

    if (request.method === "POST" && context.pathname === "/api/chat/stream") {
      const body = await readJsonBody<{
        agentSlug?: string | null;
        channelThreadId?: string;
        cwd?: string;
        mode?: "ephemeral" | "resume";
        messages?: unknown[];
      }>(request);
      const channelThreadId = body.channelThreadId?.trim();
      const ephemeral = body.mode === "ephemeral";
      if (!channelThreadId) {
        throw new HttpRequestError(400, "channelThreadId is required.");
      }

      const userInput = extractLatestUserMessageInput(body.messages);
      if (!userInput) {
        throw new HttpRequestError(400, "A user message with text or files is required in messages.");
      }
      const attachments = await normalizeAttachmentInputs(
        this.options.runtime.config.repoRoot,
        userInput.attachments,
        { persistAssets: !ephemeral },
      );

      const abortController = new AbortController();
      const abortRequest = () => {
        if (!abortController.signal.aborted) {
          abortController.abort();
        }
      };

      request.once("aborted", abortRequest);
      request.once("close", abortRequest);
      response.once("close", abortRequest);

      try {
        startPlainTextStream(response);

        let streamed = false;
        const result = await this.options.runtime.webChat.sendMessage({
          abortSignal: abortController.signal,
          attachments,
          agentSlug: body.agentSlug ?? null,
          channelThreadId,
          cwd: body.cwd?.trim() || this.options.runtime.config.repoRoot,
          mode: ephemeral ? "ephemeral" : "resume",
          message: userInput.text,
          onTextChunk: (chunk) => {
            if (!response.writableEnded && chunk) {
              streamed = true;
              response.write(chunk);
            }
          },
        });

        if (!streamed && !response.writableEnded && result.answer) {
          response.write(result.answer);
        }
        if (!response.writableEnded) {
          response.end();
        }
        return;
      } catch (error) {
        if (abortController.signal.aborted) {
          if (!response.writableEnded) {
            response.end();
          }
          return;
        }
        throw error;
      }
    }

    if (request.method === "POST" && context.pathname === "/api/mcp/doctor/playwright") {
      const result = await runPlaywrightDoctor(this.options.runtime.config.repoRoot);
      sendJson(response, result.exitCode === 0 ? 200 : 503, {
        data: result.payload,
        meta: {
          exitCode: result.exitCode,
          stderr: result.stderr || null,
        },
      });
      return;
    }

    if (request.method === "POST" && context.pathname === "/api/mcp/ensure/playwright") {
      const result = await this.options.runtime.mcpSessionBootstrapper.ensureReadyWithOptions(["playwright"], {
        forceStartup: true,
      });
      sendJson(response, result.every((item) => item.healthy) ? 200 : 503, {
        data: result,
      });
      return;
    }

    if (request.method === "GET" && context.pathname === "/api/agents") {
      const includeDisabled = context.query.get("includeDisabled") === "true";
      const role = context.query.get("role");
      const agents = await this.options.runtime.agentRegistry.listAgents({
        includeDisabled,
        role: isAgentRole(role) ? role : undefined,
      });
      sendJson(response, 200, { data: agents.map(toAgentApiRecord) });
      return;
    }

    if (request.method === "POST" && context.pathname === "/api/agents") {
      const body = await readJsonBody<CreateAgentInput>(request);
      await validateSkillIds(this.options.runtime, body.skillIds ?? []);
      const created = await this.options.runtime.agentRegistry.createAgent(body);
      sendJson(response, 201, { data: toAgentApiRecord(created) });
      return;
    }

    if (request.method === "GET" && context.pathname === "/api/agents/profiles") {
      sendJson(response, 200, {
        data: await this.options.runtime.agentRegistry.listMcpProfiles(),
      });
      return;
    }

    if (request.method === "GET" && context.pathname === "/api/agents/skills") {
      const skills = await this.options.runtime.skills.loader.loadAll();
      sendJson(response, 200, {
        data: skills.map((skill) => ({
          description: skill.description,
          id: skill.id,
          keywords: skill.keywords,
          name: skill.name,
          sourcePath: skill.sourcePath,
        })),
      });
      return;
    }

    const agentSlug = matchAgentSlug(context.pathname);
    if (agentSlug && request.method === "GET") {
      const agent = await this.options.runtime.agentRegistry.getAgentBySlug(agentSlug);
      if (!agent) {
        sendError(response, 404, `Agent "${agentSlug}" not found.`);
        return;
      }
      sendJson(response, 200, { data: toAgentApiRecord(agent) });
      return;
    }

    if (agentSlug && request.method === "PATCH") {
      const body = await readJsonBody<Omit<UpdateAgentInput, "slug">>(request);
      if (body.skillIds) {
        await validateSkillIds(this.options.runtime, body.skillIds);
      }
      const updated = await this.options.runtime.agentRegistry.updateAgent({
        ...body,
        slug: agentSlug,
      });
      sendJson(response, 200, { data: toAgentApiRecord(updated) });
      return;
    }

    if (agentSlug && request.method === "DELETE") {
      const deleted = await this.options.runtime.agentRegistry.deleteAgent(agentSlug);
      const replacementSelection = await resolveOperationalActiveAgent(
        this.options.runtime.agentRegistry,
        {
          backupAgentSlug: this.options.runtime.config.backupAgentSlug,
          defaultAgentSlug: this.options.runtime.config.defaultAgentSlug,
        },
      );
      const replacementAgent = replacementSelection.agent;
      const sessionStore = new TelegramSessionStore(
        this.options.runtime.config.repoRoot,
        this.options.runtime.config.defaultAgentSlug,
      );
      let reassignedChats = 0;
      let reassignmentWarning: string | null = null;
      try {
        reassignedChats = await sessionStore.replaceAgentSlug(deleted.slug, replacementAgent.slug);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        reassignmentWarning =
          `Agent deleted, but Telegram session reassignment from /${deleted.slug} to /${replacementAgent.slug} failed (${detail}). ` +
          "Sessions will be corrected lazily on next Telegram interaction.";
      }

      sendJson(response, 200, {
        data: toAgentApiRecord(deleted),
        meta: {
          operationalAgentResolution: {
            replacementSlug: replacementAgent.slug,
            source: replacementSelection.source,
          },
          telegramSessionReassignment: {
            reassignedChats,
            status: reassignmentWarning ? "failed" : "applied",
            warning: reassignmentWarning,
          },
        },
      });
      return;
    }

    if (request.method === "GET" && context.pathname === "/api/sessions") {
      const channel = context.query.get("channel");
      const status = context.query.get("status");
      const sessions = await this.options.runtime.agentRegistry.listSessions({
        agentId: emptyToUndefined(context.query.get("agentId")),
        channel: isSessionChannel(channel) ? channel : undefined,
        channelThreadId: emptyToUndefined(context.query.get("channelThreadId")),
        status: isSessionStatus(status) ? status : undefined,
      });
      const limit = parseLimit(context.query.get("limit"));
      sendJson(response, 200, {
        data: await enrichSessions(this.options.runtime, limit ? sessions.slice(0, limit) : sessions),
      });
      return;
    }

    if (request.method === "GET" && context.pathname === "/api/runs") {
      const runs = await this.options.runtime.agentRegistry.listRuns({
        agentId: emptyToUndefined(context.query.get("agentId")),
        limit: parseLimit(context.query.get("limit")) ?? undefined,
      });
      sendJson(response, 200, {
        data: await enrichRuns(this.options.runtime, runs),
      });
      return;
    }

    sendError(response, 404, `Route ${request.method ?? "GET"} ${context.pathname} not found.`);
  }
}

async function validateSkillIds(runtime: OperationalRuntime, skillIds: string[]): Promise<void> {
  const loaded = await runtime.skills.loader.loadAll();
  const available = new Set(loaded.map((skill) => skill.id));
  const unknown = skillIds.filter((skillId) => !available.has(skillId));
  if (unknown.length > 0) {
    throw new HttpRequestError(400, `Unknown skillIds: ${unknown.join(", ")}.`);
  }
}

async function enrichSessions(runtime: OperationalRuntime, sessions: Awaited<ReturnType<OperationalRuntime["agentRegistry"]["listSessions"]>>) {
  const agents = await runtime.agentRegistry.listAgents({ includeDisabled: true });
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  return sessions.map((session) => ({
    ...session,
    agentDisplayName: agentsById.get(session.agentId)?.displayName ?? null,
    agentSlug: agentsById.get(session.agentId)?.slug ?? null,
  }));
}

async function enrichRuns(runtime: OperationalRuntime, runs: Awaited<ReturnType<OperationalRuntime["agentRegistry"]["listRuns"]>>) {
  const agents = await runtime.agentRegistry.listAgents({ includeDisabled: true });
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  return runs.map((run) => ({
    ...run,
    agentDisplayName: agentsById.get(run.agentId)?.displayName ?? null,
    agentSlug: agentsById.get(run.agentId)?.slug ?? null,
  }));
}

async function listChatCatalogEntries(
  runtime: OperationalRuntime,
  options?: { channel?: "telegram" },
): Promise<Array<{
  active: boolean;
  agentDisplayName: string | null;
  agentSlug: string | null;
  availableInChatUi: boolean;
  channel: "telegram";
  channelThreadId: string;
  lastPreview: string | null;
  lastUsedAt: string;
  sessionId: string | null;
  title: string | null;
}>> {
  const includeTelegram = !options?.channel || options.channel === "telegram";
  if (!includeTelegram) {
    return [];
  }

  const telegramSessionStore = new TelegramSessionStore(
    runtime.config.repoRoot,
    runtime.config.defaultAgentSlug,
  );
  const [storeChats, agents, sessions] = await Promise.all([
    telegramSessionStore.loadAll(),
    runtime.agentRegistry.listAgents({ includeDisabled: true }),
    runtime.agentRegistry.listSessions({ channel: "telegram" }),
  ]);

  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const latestSessionByChatId = new Map<string, (typeof sessions)[number]>();
  for (const session of sessions) {
    if (!latestSessionByChatId.has(session.channelThreadId)) {
      latestSessionByChatId.set(session.channelThreadId, session);
    }
  }

  const messagePreviewEntries = await Promise.all(
    Object.entries(storeChats).map(async ([chatId, chat]) => {
      const session = (chat.sessionId ? sessionsById.get(chat.sessionId) : null)
        ?? latestSessionByChatId.get(chatId)
        ?? null;
      const agent = session ? agentsById.get(session.agentId) ?? null : null;
      const latestMessage = session
        ? [...await runtime.agentRegistry.listMessages(session.id)]
            .reverse()
            .find((message) => message.role !== "system")
        : null;
      const preview = summarizeCatalogMessagePreview(latestMessage?.content ?? null, latestMessage?.attachments?.length ?? 0);

      return {
        active: chat.active,
        agentDisplayName: agent?.displayName ?? null,
        agentSlug: agent?.slug ?? chat.activeAgentSlug ?? null,
        availableInChatUi: false,
        channel: "telegram" as const,
        channelThreadId: chatId,
        lastPreview: preview,
        lastUsedAt: session?.lastUsedAt ?? chat.updatedAt,
        sessionId: session?.id ?? chat.sessionId ?? null,
        title: session?.title?.trim() || `Telegram ${chatId}`,
      };
    }),
  );

  return messagePreviewEntries.sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt));
}

function summarizeCatalogMessagePreview(content: string | null, attachmentCount: number): string | null {
  const trimmed = content?.trim() ?? "";
  if (trimmed) {
    return trimmed.slice(0, 72);
  }

  if (attachmentCount > 0) {
    return "Mensagem com anexo";
  }

  return null;
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    throw new HttpRequestError(400, "JSON body is required.");
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    throw new HttpRequestError(400, "JSON body is required.");
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpRequestError(400, "Invalid JSON body.");
  }
}

function matchAgentSlug(pathname: string): string | null {
  const match = pathname.match(/^\/api\/agents\/([^/]+)$/);
  if (!match) {
    return null;
  }

  const slug = decodeURIComponent(match[1]);
  if (slug === "profiles" || slug === "skills") {
    return null;
  }

  return slug;
}

function parseLimit(raw: string | null): number | null {
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function emptyToUndefined(value: string | null): string | undefined {
  return value && value.trim() ? value : undefined;
}

function isAgentRole(value: string | null): value is "primary" | "specialist" | "automation" {
  return value === "primary" || value === "specialist" || value === "automation";
}

function isSessionChannel(value: string | null): value is "cli" | "telegram" | "web" {
  return value === "cli" || value === "telegram" || value === "web";
}

function isSessionStatus(value: string | null): value is "active" | "ended" {
  return value === "active" || value === "ended";
}

function setCommonHeaders(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-headers", "content-type");
  response.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode);
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function startPlainTextStream(response: ServerResponse, statusCode = 200): void {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    connection: "keep-alive",
    "content-type": "text/plain; charset=utf-8",
    "transfer-encoding": "chunked",
  });
}

function sendError(response: ServerResponse, statusCode: number, message: string): void {
  sendJson(response, statusCode, {
    error: {
      message,
      statusCode,
    },
  });
}

function resolveHttpStatusCode(error: unknown): number {
  if (error instanceof AgentRegistryError) {
    return error.statusCode;
  }

  if (error instanceof HttpRequestError) {
    return error.statusCode;
  }

  return 500;
}

class HttpRequestError extends Error {
  public constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
}

export function extractLatestUserMessageInput(messages: unknown[] | undefined): {
  attachments: Array<{
    dataUrl?: string | null;
    filename: string | null;
    id: string;
    kind: AgentMessageAttachmentKind;
    mediaType: string;
  }>;
  text: string;
} | null {
  if (!Array.isArray(messages)) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const input = extractUserMessageInput(messages[index]);
    if (input) {
      return input;
    }
  }

  return null;
}

function extractUserMessageInput(message: unknown): {
  attachments: Array<{
    dataUrl?: string | null;
    filename: string | null;
    id: string;
    kind: AgentMessageAttachmentKind;
    mediaType: string;
  }>;
  text: string;
} | null {
  if (!message || typeof message !== "object") {
    return null;
  }

  const candidate = message as {
    content?: unknown;
    parts?: unknown;
    role?: unknown;
  };

  if (candidate.role !== "user") {
    return null;
  }

  if (typeof candidate.content === "string" && candidate.content.trim()) {
    return {
      attachments: [],
      text: candidate.content.trim(),
    };
  }

  if (!Array.isArray(candidate.parts)) {
    return null;
  }

  const attachments: Array<{
    dataUrl?: string | null;
    filename: string | null;
    id: string;
    kind: AgentMessageAttachmentKind;
    mediaType: string;
  }> = [];
  const text = candidate.parts
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }
      const textPart = part as {
        filename?: unknown;
        mediaType?: unknown;
        text?: unknown;
        type?: unknown;
        url?: unknown;
      };
      if (textPart.type === "text" && typeof textPart.text === "string") {
        return textPart.text;
      }
      if (textPart.type === "file" && typeof textPart.mediaType === "string") {
        attachments.push({
          dataUrl: typeof textPart.url === "string" && textPart.url.startsWith("data:")
            ? textPart.url
            : null,
          filename: typeof textPart.filename === "string" ? textPart.filename : null,
          id: crypto.randomUUID(),
          kind: inferAttachmentKind(textPart.mediaType),
          mediaType: textPart.mediaType,
        });
      }
      return "";
    })
    .join("")
    .trim();

  if (!text && attachments.length === 0) {
    return null;
  }

  return {
    attachments,
    text,
  };
}

async function normalizeAttachmentInputs(
  repoRoot: string,
  attachments: Array<{
    dataUrl?: string | null;
    filename?: string | null;
    kind?: AgentMessageAttachmentKind;
    mediaType?: string;
  }> | undefined,
  options?: {
    persistAssets?: boolean;
  },
) {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return Promise.all(attachments.flatMap(async (attachment) => {
    const mediaType = attachment.mediaType?.trim();
    if (!mediaType) {
      return [];
    }

    return [{
      ...(await persistAttachmentAsset(repoRoot, {
        dataUrl: attachment.dataUrl ?? null,
        mediaType,
      }, options)),
      filename: attachment.filename?.trim() || null,
      id: crypto.randomUUID(),
      kind: attachment.kind ?? inferAttachmentKind(mediaType),
      mediaType,
    }];
  })).then((items) => items.flat());
}

function inferAttachmentKind(mediaType: string): AgentMessageAttachmentKind {
  if (mediaType.startsWith("audio/")) {
    return "audio";
  }
  if (mediaType.startsWith("image/")) {
    return "image";
  }
  if (
    mediaType === "application/pdf" ||
    mediaType.includes("document") ||
    mediaType.includes("sheet") ||
    mediaType.includes("presentation") ||
    mediaType.startsWith("text/")
  ) {
    return "document";
  }
  return "file";
}

async function persistAttachmentAsset(
  repoRoot: string,
  input: {
    dataUrl: string | null;
    mediaType: string;
  },
  options?: {
    persistAssets?: boolean;
  },
): Promise<{
  assetId: string | null;
  downloadPath: string | null;
}> {
  if (!input.dataUrl || options?.persistAssets === false) {
    return {
      assetId: null,
      downloadPath: null,
    };
  }

  const parsed = parseDataUrl(input.dataUrl);
  if (!parsed) {
    return {
      assetId: null,
      downloadPath: null,
    };
  }

  const assetId = crypto.randomUUID();
  const filePath = resolveChatAttachmentPath(repoRoot, assetId);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, parsed.bytes);
  return {
    assetId,
    downloadPath: `/api/chat/attachments/${assetId}?mediaType=${encodeURIComponent(input.mediaType)}`,
  };
}

function parseDataUrl(value: string): { bytes: Buffer } | null {
  const match = value.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) {
    return null;
  }

  try {
    return {
      bytes: Buffer.from(match[1], "base64"),
    };
  } catch {
    return null;
  }
}

function matchChatAttachmentId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/chat\/attachments\/([A-Za-z0-9-]+)$/);
  return match?.[1] ?? null;
}

function resolveChatAttachmentPath(repoRoot: string, attachmentId: string) {
  return path.join(repoRoot, "data", "chat-uploads", attachmentId);
}
