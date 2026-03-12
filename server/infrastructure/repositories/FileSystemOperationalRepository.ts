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
  renderTaskMarkdown,
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
  private readonly activeThreadsDir: string;
  private readonly archivedThreadsDir: string;
  private readonly activeTasksDir: string;
  private readonly completedTasksDir: string;
  private readonly projectsFile: string;
  private readonly contactsFile: string;

  public constructor(options: FileSystemOperationalRepositoryOptions) {
    this.activeThreadsDir = path.join(
      options.repoRoot,
      options.activeThreadsDir ?? "threads",
    );
    this.archivedThreadsDir = path.join(
      options.repoRoot,
      options.archivedThreadsDir ?? "threads-arquivadas",
    );
    this.activeTasksDir = path.join(options.repoRoot, options.activeTasksDir ?? "tasks");
    this.completedTasksDir = path.join(
      options.repoRoot,
      options.completedTasksDir ?? "tasks-finalizadas",
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
    const active = await this.readTaskDirectory(this.activeTasksDir, "active");
    const completed = options?.includeCompleted
      ? await this.readTaskDirectory(this.completedTasksDir, "completed")
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
    const fileName = `${input.plannedDate}_task-${slug}.md`;
    const filePath = path.join(this.activeTasksDir, fileName);

    await mkdir(this.activeTasksDir, { recursive: true });
    await writeFile(
      filePath,
      renderTaskMarkdown(
        {
          ...input,
          slug,
        },
        thread,
        filePath,
      ),
      "utf8",
    );

    const created = await this.getTaskBySlug(`${input.plannedDate}_task-${slug}`);
    if (!created) {
      throw new Error(`Task "${slug}" could not be read after creation.`);
    }

    return created;
  }

  public async updateTaskStatus(input: UpdateTaskStatusInput): Promise<TaskRecord> {
    const task = await this.findTaskRecord(input.taskSlug);
    if (!task) {
      throw new Error(`Task "${input.taskSlug}" not found.`);
    }

    const updatedTask: TaskRecord = {
      ...task,
      status: input.status,
    };
    const note = input.note
      ? `${input.timestamp}: ${input.note}`
      : `${input.timestamp}: status atualizado para ${input.status}.`;

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
    const active = await this.findTaskBySlugInDirectory(this.activeTasksDir, slug, "active");
    if (active) {
      return active;
    }

    return this.findTaskBySlugInDirectory(this.completedTasksDir, slug, "completed");
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
