import type {
  AppendThreadLogInput,
  CreateContactInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateThreadInput,
  UpdateTaskStatusInput,
} from "../domain/models.js";
import type { OperationalWorkspace } from "../application/services/OperationalWorkspace.js";

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface McpToolDefinition<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  run(input: TInput): Promise<TOutput>;
}

export function buildOperationalToolCatalog(
  workspace: OperationalWorkspace,
): Array<McpToolDefinition<unknown, unknown>> {
  return [
    defineTool<Record<string, never>, unknown>(
      "list_projects",
      "Lista os projetos estruturados.",
      {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      async () => workspace.projects.listProjects(),
    ),
    defineTool<CreateProjectInput, unknown>(
      "create_project",
      "Cria um projeto estruturado no seed local.",
      {
        type: "object",
        properties: {
          slug: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          status: { type: "string" },
        },
        required: ["slug", "name"],
        additionalProperties: false,
      },
      async (input) => workspace.projects.createProject(input),
    ),
    defineTool<Record<string, never>, unknown>(
      "list_contacts",
      "Lista os contatos estruturados.",
      {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      async () => workspace.contacts.listContacts(),
    ),
    defineTool<CreateContactInput, unknown>(
      "create_contact",
      "Cria um contato estruturado no seed local.",
      {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          whatsapp: { type: "string" },
          company: { type: "string" },
          role: { type: "string" },
          notes: { type: "string" },
        },
        required: ["name"],
        additionalProperties: false,
      },
      async (input) => workspace.contacts.createContact(input),
    ),
    defineTool<Record<string, never>, unknown>(
      "list_fronts",
      "Lista as frentes ativas derivadas das threads.",
      {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      async () => workspace.fronts.listFronts(),
    ),
    defineTool<{ includeArchived?: boolean }, unknown>(
      "list_threads",
      "Lista threads operacionais.",
      {
        type: "object",
        properties: {
          includeArchived: { type: "boolean" },
        },
        additionalProperties: false,
      },
      async (input) => workspace.threads.listThreads(input),
    ),
    defineTool<{ slug: string }, unknown>(
      "get_thread",
      "Lê uma thread pelo slug do arquivo.",
      {
        type: "object",
        properties: {
          slug: { type: "string" },
        },
        required: ["slug"],
        additionalProperties: false,
      },
      async ({ slug }) => workspace.threads.getThread(slug),
    ),
    defineTool<CreateThreadInput, unknown>(
      "create_thread",
      "Cria uma nova thread operacional em Markdown.",
      {
        type: "object",
        properties: {
          slug: { type: "string" },
          title: { type: "string" },
          subject: { type: "string" },
          objective: { type: "string" },
          people: { type: "array" },
          groups: { type: "array" },
          whatsapp: { type: "string" },
          emails: { type: "array" },
          otherChannels: { type: "array" },
          timestamp: { type: "string" },
          status: { type: "string" },
          nextBlocker: { type: "string" },
        },
        required: ["slug", "title", "subject", "objective", "timestamp"],
        additionalProperties: false,
      },
      async (input) => workspace.threads.createThread(input),
    ),
    defineTool<AppendThreadLogInput, unknown>(
      "append_thread_log",
      "Anexa um log estruturado a uma thread existente.",
      {
        type: "object",
        properties: {
          threadSlug: { type: "string" },
          timestamp: { type: "string" },
          title: { type: "string" },
          entries: { type: "array" },
          status: { type: "string" },
          nextBlocker: { type: "string" },
        },
        required: ["threadSlug", "timestamp", "title", "entries"],
        additionalProperties: false,
      },
      async (input) => workspace.threads.appendLog(input),
    ),
    defineTool<{ includeCompleted?: boolean }, unknown>(
      "list_tasks",
      "Lista tasks operacionais.",
      {
        type: "object",
        properties: {
          includeCompleted: { type: "boolean" },
        },
        additionalProperties: false,
      },
      async (input) => workspace.tasks.listTasks(input),
    ),
    defineTool<{ slug: string }, unknown>(
      "get_task",
      "Lê uma task pelo slug do arquivo.",
      {
        type: "object",
        properties: {
          slug: { type: "string" },
        },
        required: ["slug"],
        additionalProperties: false,
      },
      async ({ slug }) => workspace.tasks.getTask(slug),
    ),
    defineTool<CreateTaskInput, unknown>(
      "create_task",
      "Cria uma task operacional em Markdown.",
      {
        type: "object",
        properties: {
          slug: { type: "string" },
          title: { type: "string" },
          owner: { type: "string" },
          priority: { type: "string" },
          status: { type: "string" },
          objective: { type: "string" },
          plannedDate: { type: "string" },
          timestamp: { type: "string" },
          relatedThreadSlug: { type: "string" },
          contextLines: { type: "array" },
          executionLines: { type: "array" },
          checklist: { type: "array" },
          completionCriteria: { type: "array" },
        },
        required: [
          "slug",
          "title",
          "owner",
          "priority",
          "status",
          "objective",
          "plannedDate",
          "timestamp",
        ],
        additionalProperties: false,
      },
      async (input) => workspace.tasks.createTask(input),
    ),
    defineTool<UpdateTaskStatusInput, unknown>(
      "update_task_status",
      "Atualiza o status textual de uma task existente.",
      {
        type: "object",
        properties: {
          taskSlug: { type: "string" },
          status: { type: "string" },
          timestamp: { type: "string" },
          note: { type: "string" },
        },
        required: ["taskSlug", "status", "timestamp"],
        additionalProperties: false,
      },
      async (input) => workspace.tasks.updateStatus(input),
    ),
  ];
}

function defineTool<TInput, TOutput>(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  run: (input: TInput) => Promise<TOutput>,
): McpToolDefinition<TInput, TOutput> {
  return {
    name,
    description,
    inputSchema,
    run,
  };
}
