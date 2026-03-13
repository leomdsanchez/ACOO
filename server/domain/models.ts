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
export type AgentRole = "primary" | "specialist" | "automation";
export type AgentLifecycleStatus = "active" | "disabled" | "archived";
export type AgentSessionChannel = "cli" | "telegram" | "web";
export type AgentSessionMode = "interactive" | "exec" | "exec-resume" | "ephemeral";
export type AgentSessionStatus = "active" | "ended";
export type AgentRunStatus = "completed" | "failed";

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

export interface AgentRecord {
  id: string;
  slug: string;
  displayName: string;
  role: AgentRole;
  description: string;
  promptTemplatePath: string | null;
  promptInline: string | null;
  skillIds: string[];
  mcpProfileId: string;
  model: string | null;
  reasoningEffort: "low" | "medium" | "high" | "xhigh";
  approvalPolicy: "untrusted" | "on-failure" | "on-request" | "never";
  sandboxMode: "read-only" | "workspace-write" | "danger-full-access";
  searchEnabled: boolean;
  status: AgentLifecycleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSessionRecord {
  id: string;
  agentId: string;
  channel: AgentSessionChannel;
  channelThreadId: string;
  codexThreadId: string | null;
  cwd: string;
  mode: AgentSessionMode;
  status: AgentSessionStatus;
  startedAt: string;
  lastUsedAt: string;
}

export interface AgentRunRecord {
  id: string;
  agentId: string;
  sessionId: string | null;
  channel: AgentSessionChannel;
  command: string;
  promptDigest: string;
  resultSummary: string;
  status: AgentRunStatus;
  createdAt: string;
}

export interface AgentMcpProfileRecord {
  id: string;
  name: string;
  description: string;
  required: string[];
  optional: string[];
  blocked: string[];
  createdAt: string;
  updatedAt: string;
}
