export type OperationalRegistryProjectStatus = "ativo" | "inativo" | "arquivado";
export type OperationalRegistryThreadStatus = "ativo" | "inativo" | "arquivado";
export type OperationalRegistryTaskStatus =
  | "inbox"
  | "backlog"
  | "this_week"
  | "today"
  | "done"
  | "archived";

export interface OperationalRegistryNameValue {
  id: string;
  name: string;
  value: string;
  createdAt: string;
}

export interface OperationalRegistryStakeholder {
  personId: string;
  personName: string;
  role: string;
  createdAt: string;
}

export interface OperationalRegistryPersonRecord {
  id: string;
  name: string;
  company: string | null;
  relationshipDescription: string | null;
  notes: string | null;
  contacts: OperationalRegistryNameValue[];
  createdAt: string;
  updatedAt: string;
}

export interface OperationalRegistryProjectRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: OperationalRegistryProjectStatus;
  channels: OperationalRegistryNameValue[];
  stakeholders: OperationalRegistryStakeholder[];
  threadCount: number;
  taskCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalRegistryThreadPerson {
  id: string;
  name: string;
  company: string | null;
}

export interface OperationalRegistryThreadRecord {
  id: string;
  slug: string;
  name: string;
  objective: string;
  status: OperationalRegistryThreadStatus;
  project: {
    id: string;
    slug: string;
    name: string;
  } | null;
  channels: OperationalRegistryNameValue[];
  people: OperationalRegistryThreadPerson[];
  logCount: number;
  lastLogAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface OperationalRegistryTaskRecord {
  id: string;
  slug: string;
  name: string;
  objective: string;
  description: string;
  status: OperationalRegistryTaskStatus;
  project: {
    id: string;
    slug: string;
    name: string;
  } | null;
  thread: {
    id: string;
    slug: string;
    name: string;
  } | null;
  logCount: number;
  lastLogAt: string | null;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
  archivedAt: string | null;
}

export interface OperationalRegistrySummary {
  agents: number;
  people: number;
  projects: number;
  tasks: number;
  threads: number;
}
