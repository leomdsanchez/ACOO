import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { OperationalRepository } from "../../application/ports/OperationalRepository.js";
import type {
  AppendThreadLogInput,
  ContactRecord,
  CreateContactInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateThreadInput,
  ProjectRecord,
  TaskListOptions,
  TaskRecord,
  TaskSummary,
  ThreadListOptions,
  ThreadRecord,
  ThreadSummary,
  UpdateTaskStatusInput,
} from "../../domain/models.js";
import { parseTaskRecord, parseThreadRecord, toFileSlug } from "../markdown/parsing.js";
import {
  appendTaskStatusUpdate,
  appendThreadLogMarkdown,
  renderThreadMarkdown,
} from "../markdown/templates.js";

export interface FileSystemOperationalRepositoryOptions {
  repoRoot: string;
  activeThreadsDir?: string;
  archivedThreadsDir?: string;
  activeTasksDir?: string;
  completedTasksDir?: string;
  dataDir?: string;
}

export class FileSystemOperationalRepository implements OperationalRepository {
  private static readonly operationsRoot = "operations";
  private readonly activeTasksFile: string;
  private readonly activeThreadsDir: string;
  private readonly archivedThreadsDir: string;
  private readonly activeTasksDir: string;
  private readonly completedTasksFile: string;
  private readonly completedTasksDir: string;
  private readonly projectsFile: string;
  private readonly contactsFile: string;

  public constructor(options: FileSystemOperationalRepositoryOptions) {
    this.activeThreadsDir = path.join(
      options.repoRoot,
      options.activeThreadsDir ??
        path.join(FileSystemOperationalRepository.operationsRoot, "threads"),
    );
    this.archivedThreadsDir = path.join(
      options.repoRoot,
      options.archivedThreadsDir ??
        path.join(FileSystemOperationalRepository.operationsRoot, "threads-arquivadas"),
    );
    this.activeTasksDir = path.join(
      options.repoRoot,
      options.activeTasksDir ??
        path.join(FileSystemOperationalRepository.operationsRoot, "tasks"),
    );
    this.activeTasksFile = path.join(this.activeTasksDir, "TAREFAS_ATIVAS.md");
    this.completedTasksDir = path.join(
      options.repoRoot,
      options.completedTasksDir ??
        path.join(FileSystemOperationalRepository.operationsRoot, "tasks-finalizadas"),
    );
    this.completedTasksFile = path.join(
      this.completedTasksDir,
      "TAREFAS_CONCLUIDAS.md",
    );
    const dataDir = path.join(options.repoRoot, options.dataDir ?? "data");
    this.projectsFile = path.join(dataDir, "projects.json");
    this.contactsFile = path.join(dataDir, "contacts.json");
  }

  public async listProjects(): Promise<ProjectRecord[]> {
    return this.readJsonCollection<ProjectRecord>(this.projectsFile);
  }

  public async createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    const existing = await this.readJsonCollection<ProjectRecord>(this.projectsFile);
    const timestamp = new Date().toISOString();
    const slug = toFileSlug(input.slug || input.name);

    if (existing.some((project) => project.slug === slug)) {
      throw new Error(`Project with slug "${slug}" already exists.`);
    }

    const project: ProjectRecord = {
      id: randomUUID(),
      slug,
      name: input.name,
      description: input.description ?? "",
      status: input.status ?? "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.writeJsonCollection(this.projectsFile, [...existing, project]);
    return project;
  }

  public async listContacts(): Promise<ContactRecord[]> {
    return this.readJsonCollection<ContactRecord>(this.contactsFile);
  }

  public async createContact(input: CreateContactInput): Promise<ContactRecord> {
    const existing = await this.readJsonCollection<ContactRecord>(this.contactsFile);
    const timestamp = new Date().toISOString();

    const contact: ContactRecord = {
      id: randomUUID(),
      name: input.name,
      email: input.email ?? null,
      whatsapp: input.whatsapp ?? null,
      company: input.company ?? null,
      role: input.role ?? null,
      notes: input.notes ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.writeJsonCollection(this.contactsFile, [...existing, contact]);
    return contact;
  }

  public async listThreads(options?: ThreadListOptions): Promise<ThreadSummary[]> {
    const active = await this.readThreadDirectory(this.activeThreadsDir, "active");
    const archived = options?.includeArchived
      ? await this.readThreadDirectory(this.archivedThreadsDir, "archived")
      : [];

    return [...active, ...archived].sort(compareThreadRecords);
  }

  public async getThreadBySlug(slug: string): Promise<ThreadRecord | null> {
    return this.findThreadRecord(slug);
  }

  public async createThread(input: CreateThreadInput): Promise<ThreadRecord> {
    const slug = toFileSlug(input.slug || input.title);
    const existing = await this.findThreadRecord(slug);
    if (existing) {
      throw new Error(`Thread with slug "${slug}" already exists.`);
    }

    const filePath = path.join(this.activeThreadsDir, `${slug}.md`);
    await mkdir(this.activeThreadsDir, { recursive: true });
    await writeFile(
      filePath,
      renderThreadMarkdown({
        ...input,
        slug,
      }),
      "utf8",
    );

    const created = await this.getThreadBySlug(slug);
    if (!created) {
      throw new Error(`Thread "${slug}" could not be read after creation.`);
    }

    return created;
  }

  public async appendThreadLog(input: AppendThreadLogInput): Promise<ThreadRecord> {
    const thread = await this.findThreadRecord(input.threadSlug);
    if (!thread) {
      throw new Error(`Thread "${input.threadSlug}" not found.`);
    }

    const updated = appendThreadLogMarkdown(thread.content, input);
    await writeFile(thread.filePath, updated, "utf8");

    const refreshed = await this.getThreadBySlug(input.threadSlug);
    if (!refreshed) {
      throw new Error(`Thread "${input.threadSlug}" could not be read after update.`);
    }

    return refreshed;
  }

  public async listTasks(options?: TaskListOptions): Promise<TaskSummary[]> {
    const active = await this.readTaskCollection(this.activeTasksFile, "active");
    const completed = options?.includeCompleted
      ? await this.readTaskCollection(this.completedTasksFile, "completed")
      : [];

    return [...active, ...completed].sort(compareTaskRecords);
  }

  public async getTaskBySlug(slug: string): Promise<TaskRecord | null> {
    return this.findTaskRecord(slug);
  }

  public async createTask(input: CreateTaskInput): Promise<TaskRecord> {
    const slug = toFileSlug(input.slug || input.title);
    const existing = await this.findTaskRecord(slug);
    if (existing) {
      throw new Error(`Task with slug "${slug}" already exists.`);
    }

    const thread = input.relatedThreadSlug
      ? await this.getThreadBySlug(input.relatedThreadSlug)
      : null;
    const taskSlug = `${input.plannedDate}_task-${slug}`;
    const filePath = this.activeTasksFile;
    const tasks = await this.readTaskCollectionEntries(this.activeTasksFile, "active");
    const entry = buildTaskCollectionEntry(
      {
        createdAt: input.timestamp,
        description: input.objective,
        id: `task-${slug}-${input.plannedDate}`,
        latestContext:
          input.contextLines?.[0] ?? "Definir contexto validado na primeira execução.",
        owner: input.owner,
        plannedDate: input.plannedDate,
        priority: input.priority,
        relatedThreadPath: thread?.filePath ?? null,
        slug: taskSlug,
        status: input.status,
        title: input.title,
      },
      filePath,
      "active",
      [
        `${input.timestamp}: task criada pelo core operacional.`,
        ...(input.executionLines ?? []),
        ...(input.checklist ?? []).map((line) => `Checklist pendente: ${line}`),
      ],
    );

    await mkdir(this.activeTasksDir, { recursive: true });
    await writeFile(
      filePath,
      renderTaskCollectionDocument("Tarefas Ativas", [...tasks, entry]),
      "utf8",
    );

    const created = await this.getTaskBySlug(taskSlug);
    if (!created) {
      throw new Error(`Task "${slug}" could not be read after creation.`);
    }

    return created;
  }

  public async updateTaskStatus(input: UpdateTaskStatusInput): Promise<TaskRecord> {
    const activeTasks = await this.readTaskCollectionEntries(this.activeTasksFile, "active");
    const completedTasks = await this.readTaskCollectionEntries(
      this.completedTasksFile,
      "completed",
    );
    const activeTask = activeTasks.find((task) => matchesTaskSlug(task.slug, input.taskSlug));
    const completedTask = completedTasks.find((task) =>
      matchesTaskSlug(task.slug, input.taskSlug),
    );
    const task = activeTask ?? completedTask ?? (await this.findLegacyTaskRecord(input.taskSlug));
    if (!task) {
      throw new Error(`Task "${input.taskSlug}" not found.`);
    }

    const note = input.note
      ? `${input.timestamp}: ${input.note}`
      : `${input.timestamp}: status atualizado para ${input.status}.`;

    if (isTaskCollectionEntry(task)) {
      const updatedTask: TaskCollectionEntry = {
        ...task,
        history: [...task.history, note],
        latestContext: input.note ?? task.latestContext,
        status: input.status,
      };

      if (task.storage === "active" && input.status === "Concluído") {
        const nextActive = activeTasks.filter(
          (current) => !matchesTaskSlug(current.slug, input.taskSlug),
        );
        const completedEntry: TaskCollectionEntry = {
          ...updatedTask,
          filePath: this.completedTasksFile,
          storage: "completed",
        };
        const nextCompleted = [...completedTasks, completedEntry];

        await mkdir(this.activeTasksDir, { recursive: true });
        await mkdir(this.completedTasksDir, { recursive: true });
        await writeFile(
          this.activeTasksFile,
          renderTaskCollectionDocument("Tarefas Ativas", nextActive),
          "utf8",
        );
        await writeFile(
          this.completedTasksFile,
          renderTaskCollectionDocument("Tarefas Concluídas", nextCompleted),
          "utf8",
        );
      } else {
        const sourceTasks = task.storage === "completed" ? completedTasks : activeTasks;
        const nextTasks = sourceTasks.map((current) =>
          matchesTaskSlug(current.slug, input.taskSlug) ? updatedTask : current,
        );
        const targetFile =
          task.storage === "completed" ? this.completedTasksFile : this.activeTasksFile;
        const title =
          task.storage === "completed" ? "Tarefas Concluídas" : "Tarefas Ativas";

        await mkdir(path.dirname(targetFile), { recursive: true });
        await writeFile(targetFile, renderTaskCollectionDocument(title, nextTasks), "utf8");
      }

      const refreshed = await this.getTaskBySlug(input.taskSlug);
      if (!refreshed) {
        throw new Error(`Task "${input.taskSlug}" could not be read after update.`);
      }

      return refreshed;
    }

    const updatedTask: TaskRecord = {
      ...task,
      status: input.status,
    };

    await writeFile(
      task.filePath,
      appendTaskStatusUpdate(task.content, updatedTask, note),
      "utf8",
    );

    const refreshed = await this.getTaskBySlug(input.taskSlug);
    if (!refreshed) {
      throw new Error(`Task "${input.taskSlug}" could not be read after update.`);
    }

    return refreshed;
  }

  private async readThreadDirectory(
    directoryPath: string,
    storage: "active" | "archived",
  ): Promise<ThreadRecord[]> {
    const filePaths = await this.readMarkdownPaths(directoryPath);
    const records = await Promise.all(
      filePaths.map(async (filePath) => {
        const content = await readFile(filePath, "utf8");
        return parseThreadRecord(filePath, content, storage);
      }),
    );

    return records;
  }

  private async readTaskDirectory(
    directoryPath: string,
    storage: "active" | "completed",
  ): Promise<TaskRecord[]> {
    const filePaths = await this.readMarkdownPaths(directoryPath);
    const records = await Promise.all(
      filePaths.map(async (filePath) => {
        const content = await readFile(filePath, "utf8");
        return parseTaskRecord(filePath, content, storage);
      }),
    );

    return records;
  }

  private async readTaskCollection(
    filePath: string,
    storage: "active" | "completed",
  ): Promise<TaskRecord[]> {
    const collection = await this.readTaskCollectionEntries(filePath, storage);
    if (collection.length > 0 || (await this.fileExists(filePath))) {
      return collection;
    }

    const fallbackDir = storage === "active" ? this.activeTasksDir : this.completedTasksDir;
    return this.readTaskDirectory(fallbackDir, storage);
  }

  private async readTaskCollectionEntries(
    filePath: string,
    storage: "active" | "completed",
  ): Promise<TaskCollectionEntry[]> {
    try {
      const content = await readFile(filePath, "utf8");
      return parseTaskCollection(filePath, content, storage);
    } catch (error) {
      if (isMissingPathError(error)) {
        return [];
      }

      throw error;
    }
  }

  private async readMarkdownPaths(directoryPath: string): Promise<string[]> {
    try {
      const entries = await readdir(directoryPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => path.join(directoryPath, entry.name))
        .sort();
    } catch (error) {
      if (isMissingPathError(error)) {
        return [];
      }

      throw error;
    }
  }

  private async findThreadRecord(slug: string): Promise<ThreadRecord | null> {
    const candidates = await Promise.all([
      this.readRecordIfExists(path.join(this.activeThreadsDir, `${slug}.md`), "active"),
      this.readRecordIfExists(path.join(this.archivedThreadsDir, `${slug}.md`), "archived"),
    ]);

    return candidates.find((record): record is ThreadRecord => record !== null) ?? null;
  }

  private async findTaskRecord(slug: string): Promise<TaskRecord | null> {
    const active = await this.findTaskBySlugInCollection(this.activeTasksFile, slug, "active");
    if (active) {
      return active;
    }

    const completed = await this.findTaskBySlugInCollection(
      this.completedTasksFile,
      slug,
      "completed",
    );
    if (completed) {
      return completed;
    }

    return this.findLegacyTaskRecord(slug);
  }

  private async findLegacyTaskRecord(slug: string): Promise<TaskRecord | null> {
    const active = await this.findTaskBySlugInDirectory(this.activeTasksDir, slug, "active");
    if (active) {
      return active;
    }

    return this.findTaskBySlugInDirectory(this.completedTasksDir, slug, "completed");
  }

  private async findTaskBySlugInCollection(
    filePath: string,
    slug: string,
    storage: "active" | "completed",
  ): Promise<TaskRecord | null> {
    const tasks = await this.readTaskCollectionEntries(filePath, storage);
    return tasks.find((task) => matchesTaskSlug(task.slug, slug)) ?? null;
  }

  private async findTaskBySlugInDirectory(
    directoryPath: string,
    slug: string,
    storage: "active" | "completed",
  ): Promise<TaskRecord | null> {
    const filePaths = await this.readMarkdownPaths(directoryPath);
    for (const filePath of filePaths) {
      const fileSlug = path.basename(filePath, ".md");
      if (fileSlug !== slug && !fileSlug.endsWith(`_task-${slug}`)) {
        continue;
      }

      const content = await readFile(filePath, "utf8");
      return parseTaskRecord(filePath, content, storage);
    }

    return null;
  }

  private async readRecordIfExists(
    filePath: string,
    storage: "active" | "archived",
  ): Promise<ThreadRecord | null> {
    try {
      const content = await readFile(filePath, "utf8");
      return parseThreadRecord(filePath, content, storage);
    } catch (error) {
      if (isMissingPathError(error)) {
        return null;
      }

      throw error;
    }
  }

  private async readJsonCollection<T>(filePath: string): Promise<T[]> {
    try {
      const content = await readFile(filePath, "utf8");
      return JSON.parse(content) as T[];
    } catch (error) {
      if (isMissingPathError(error)) {
        return [];
      }

      throw error;
    }
  }

  private async writeJsonCollection<T>(filePath: string, items: T[]): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await readFile(filePath, "utf8");
      return true;
    } catch (error) {
      if (isMissingPathError(error)) {
        return false;
      }

      throw error;
    }
  }
}

function compareThreadRecords(left: ThreadSummary, right: ThreadSummary): number {
  return `${right.lastLogAt ?? ""}:${right.slug}`.localeCompare(
    `${left.lastLogAt ?? ""}:${left.slug}`,
  );
}

function compareTaskRecords(left: TaskSummary, right: TaskSummary): number {
  return `${right.createdAt ?? ""}:${right.slug}`.localeCompare(
    `${left.createdAt ?? ""}:${left.slug}`,
  );
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

interface TaskCollectionEntry extends TaskRecord {
  description: string;
  history: string[];
  latestContext: string | null;
  owner: string | null;
  plannedDate: string | null;
}

function isTaskCollectionEntry(task: TaskRecord | TaskCollectionEntry): task is TaskCollectionEntry {
  return "history" in task && Array.isArray(task.history);
}

function parseTaskCollection(
  filePath: string,
  content: string,
  storage: "active" | "completed",
): TaskCollectionEntry[] {
  const sections = content
    .split(/^##\s+/m)
    .slice(1)
    .map((section) => {
      const [heading, ...lines] = section.split("\n");
      return {
        body: lines.join("\n").trim(),
        raw: `## ${section.trim()}`,
        slug: heading.trim(),
      };
    });

  return sections.map((section) => {
    const slug = section.slug;
    const body = section.body;
    const historyBlock = body.match(/### Histórico\n([\s\S]*)$/m)?.[1] ?? "";
    const fieldBlock = body.replace(/\n### Histórico[\s\S]*$/m, "");
    const fields = new Map(
      [...fieldBlock.matchAll(/^- ([^:]+):\s*(.+)$/gm)].map((match) => [
        match[1].trim(),
        match[2].trim(),
      ]),
    );
    const history = [...historyBlock.matchAll(/^- `([^`]+)`$/gm)].map((match) => match[1]);
    const relatedThreadPath = readInlineMarkdownTarget(fields.get("Thread associada"));

    return buildTaskCollectionEntry(
      {
        createdAt: readBacktickedValue(fields.get("Criada em")) ?? null,
        description: readBacktickedValue(fields.get("Descrição")) ?? "",
        id: readBacktickedValue(fields.get("ID")) ?? slug,
        latestContext: readBacktickedValue(fields.get("Último contexto relevante")),
        owner: readBacktickedValue(fields.get("Responsável")),
        plannedDate: readBacktickedValue(fields.get("Prazo")),
        priority: readBacktickedValue(fields.get("Prioridade")),
        relatedThreadPath,
        slug,
        status: readBacktickedValue(fields.get("Status")),
        title: readBacktickedValue(fields.get("Nome")) ?? slug,
      },
      filePath,
      storage,
      history,
      section.raw,
    );
  });
}

function buildTaskCollectionEntry(
  input: {
    createdAt: string | null;
    description: string;
    id: string;
    latestContext: string | null;
    owner: string | null;
    plannedDate: string | null;
    priority: string | null;
    relatedThreadPath: string | null;
    slug: string;
    status: string | null;
    title: string;
  },
  filePath: string,
  storage: "active" | "completed",
  history: string[] = [],
  content?: string,
): TaskCollectionEntry {
  const entry: TaskCollectionEntry = {
    content: content ?? "",
    createdAt: input.createdAt,
    description: input.description,
    filePath,
    history,
    id: input.id,
    latestContext: input.latestContext,
    owner: input.owner,
    plannedDate: input.plannedDate,
    priority: input.priority,
    relatedThreadPath: input.relatedThreadPath,
    slug: input.slug,
    status: input.status,
    storage,
    title: input.title,
  };
  entry.content = content ?? renderTaskCollectionEntry(entry);
  return entry;
}

function renderTaskCollectionDocument(
  title: "Tarefas Ativas" | "Tarefas Concluídas",
  tasks: TaskCollectionEntry[],
): string {
  const header = [
    `# ${title}`,
    "",
    "> Documento canônico de tarefas do ACOO.",
    "",
  ].join("\n");

  if (tasks.length === 0) {
    return `${header}Nenhuma tarefa registrada.\n`;
  }

  const ordered = [...tasks].sort(compareTaskRecords);
  return `${header}${ordered.map((task) => renderTaskCollectionEntry(task)).join("\n\n")}\n`;
}

function renderTaskCollectionEntry(task: TaskCollectionEntry): string {
  const threadLine = task.relatedThreadPath
    ? `[${path.basename(task.relatedThreadPath)}](${task.relatedThreadPath})`
    : "Não vinculada.";
  const history =
    task.history.length > 0
      ? task.history.map((item) => `- \`${item}\``).join("\n")
      : "- `Sem histórico adicional registrado.`";

  return [
    `## ${task.slug}`,
    `- ID: \`${task.id}\``,
    `- Nome: \`${task.title}\``,
    `- Descrição: ${task.description || "Sem descrição."}`,
    `- Status: \`${task.status ?? "Pendente"}\``,
    `- Thread associada: ${threadLine}`,
    `- Responsável: \`${task.owner ?? "Sem responsável"}\``,
    `- Prazo: \`${task.plannedDate ?? "Sem prazo"}\``,
    `- Prioridade: \`${task.priority ?? "Sem prioridade"}\``,
    `- Criada em: \`${task.createdAt ?? "Sem data"}\``,
    `- Último contexto relevante: ${task.latestContext ?? "Sem contexto resumido."}`,
    "### Histórico",
    history,
  ].join("\n");
}

function matchesTaskSlug(candidate: string, slug: string): boolean {
  return candidate === slug || candidate.endsWith(`_task-${slug}`);
}

function readBacktickedValue(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/`([^`]+)`/);
  return match?.[1]?.trim() ?? value.trim();
}

function readInlineMarkdownTarget(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/\[[^\]]+\]\(([^)]+)\)/);
  return match?.[1] ?? null;
}
