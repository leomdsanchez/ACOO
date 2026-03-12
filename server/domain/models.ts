export type OperationalStatus =
  | "Aguardando decisão"
  | "Aguardando execução"
  | "Aguardando terceiro"
  | "Concluído"
  | string;

export type TaskPriority = "Baixa" | "Média" | "Alta" | "Crítica" | string;
export type ProjectStatus = "active" | "archived";
export type ThreadStorageKind = "active" | "archived";
export type TaskStorageKind = "active" | "completed";

export interface ProjectRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ContactRecord {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  company: string | null;
  role: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadSummary {
  id: string;
  slug: string;
  title: string;
  storage: ThreadStorageKind;
  filePath: string;
  status: OperationalStatus | null;
  nextBlocker: string | null;
  lastLogAt: string | null;
}

export interface ThreadRecord extends ThreadSummary {
  content: string;
}

export interface TaskSummary {
  id: string;
  slug: string;
  title: string;
  storage: TaskStorageKind;
  filePath: string;
  status: OperationalStatus | null;
  priority: TaskPriority | null;
  relatedThreadPath: string | null;
  createdAt: string | null;
}

export interface TaskRecord extends TaskSummary {
  content: string;
}

export interface ThreadListOptions {
  includeArchived?: boolean;
}

export interface TaskListOptions {
  includeCompleted?: boolean;
}

export interface CreateProjectInput {
  slug: string;
  name: string;
  description?: string;
  status?: ProjectStatus;
}

export interface CreateContactInput {
  name: string;
  email?: string | null;
  whatsapp?: string | null;
  company?: string | null;
  role?: string | null;
  notes?: string | null;
}

export interface CreateThreadInput {
  slug: string;
  title: string;
  subject: string;
  objective: string;
  people?: string[];
  groups?: string[];
  whatsapp?: string | null;
  emails?: string[];
  otherChannels?: string[];
  timestamp: string;
  status?: OperationalStatus;
  nextBlocker?: string;
}

export interface AppendThreadLogInput {
  threadSlug: string;
  timestamp: string;
  title: string;
  entries: string[];
  status?: OperationalStatus;
  nextBlocker?: string;
}

export interface CreateTaskInput {
  slug: string;
  title: string;
  owner: string;
  priority: TaskPriority;
  status: OperationalStatus;
  objective: string;
  plannedDate: string;
  timestamp: string;
  relatedThreadSlug?: string;
  contextLines?: string[];
  executionLines?: string[];
  checklist?: string[];
  completionCriteria?: string[];
}

export interface UpdateTaskStatusInput {
  taskSlug: string;
  status: OperationalStatus;
  timestamp: string;
  note?: string;
}
