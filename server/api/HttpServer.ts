import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { OperationalRuntime } from "../bootstrap.js";
import { runPlaywrightDoctor } from "../mcp/PlaywrightDoctorRunner.js";
import type {
  AgentRecord,
  CreateAgentInput,
  UpdateAgentInput,
} from "../domain/models.js";
import {
  evaluateAgentTelegramOperability,
  type AgentTelegramOperability,
} from "../agents/AgentTelegramOperability.js";
import { resolveOperationalActiveAgent } from "../agents/OperationalAgentSelector.js";
import { TelegramSessionStore } from "../telegram/TelegramSessionStore.js";
import { AgentRegistryError } from "../agents/AgentRegistryErrors.js";

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

function sendError(response: ServerResponse, statusCode: number, message: string): void {
  sendJson(response, statusCode, {
    error: {
      message,
      statusCode,
    },
  });
}

interface AgentApiRecord extends AgentRecord {
  usability: {
    registered: true;
    system: {
      usable: boolean;
      reasons: string[];
    };
    telegram: AgentTelegramOperability;
  };
}

function toAgentApiRecord(agent: AgentRecord): AgentApiRecord {
  const systemReasons = agent.status === "active" ? [] : [`agent status is "${agent.status}"`];
  return {
    ...agent,
    usability: {
      registered: true,
      system: {
        usable: systemReasons.length === 0,
        reasons: systemReasons,
      },
      telegram: evaluateAgentTelegramOperability(agent),
    },
  };
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
