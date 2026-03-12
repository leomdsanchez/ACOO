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

export interface OperationalRepository {
  listProjects(): Promise<ProjectRecord[]>;
  createProject(input: CreateProjectInput): Promise<ProjectRecord>;
  listContacts(): Promise<ContactRecord[]>;
  createContact(input: CreateContactInput): Promise<ContactRecord>;
  listThreads(options?: ThreadListOptions): Promise<ThreadSummary[]>;
  getThreadBySlug(slug: string): Promise<ThreadRecord | null>;
  createThread(input: CreateThreadInput): Promise<ThreadRecord>;
  appendThreadLog(input: AppendThreadLogInput): Promise<ThreadRecord>;
  listTasks(options?: TaskListOptions): Promise<TaskSummary[]>;
  getTaskBySlug(slug: string): Promise<TaskRecord | null>;
  createTask(input: CreateTaskInput): Promise<TaskRecord>;
  updateTaskStatus(input: UpdateTaskStatusInput): Promise<TaskRecord>;
}
