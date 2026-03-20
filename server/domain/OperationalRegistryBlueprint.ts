export interface RegistryBlueprintEntity {
  description: string;
  fields: string[];
}

export interface RegistryBlueprintRelation {
  description: string;
  from: string;
  to: string;
}

export interface OperationalRegistryBlueprint {
  name: string;
  version: string;
  sourceOfTruth: string;
  operationalContext: string[];
  initialSurface: {
    kind: "cli";
    rationale: string;
    futureExtensions: string[];
  };
  statuses: Record<string, string[]>;
  entities: Record<string, RegistryBlueprintEntity>;
  relations: RegistryBlueprintRelation[];
  deferredDecisions: string[];
}

export const operationalRegistryBlueprint: OperationalRegistryBlueprint = {
  name: "Operational Registry Tool",
  version: "v1-blueprint",
  sourceOfTruth: "SQLite/Prisma for structured entities; operations/* preserved as operational context and audit trail.",
  operationalContext: [
    "operations/threads/",
    "operations/tasks/",
    "operations/projects/",
    "operations/people/",
  ],
  initialSurface: {
    kind: "cli",
    rationale: "Start with an internal CLI surface because this is an ACOO control-plane concern tightly coupled to the local runtime. MCP can wrap the same services later if interoperability becomes necessary.",
    futureExtensions: [
      "HTTP local API",
      "UI control plane screens",
      "MCP facade over the same domain services",
    ],
  },
  statuses: {
    project: ["ativo", "inativo", "arquivado"],
    thread: ["ativo", "inativo", "arquivado"],
    task: ["inbox", "backlog", "this_week", "today", "done", "archived"],
  },
  entities: {
    Agent: {
      description: "Existing runtime agent registry entity; remains part of the control plane and coexists with the new operational registry.",
      fields: [
        "id",
        "slug",
        "displayName",
        "role",
        "description",
        "promptTemplatePath",
        "promptInline",
        "skillIds",
        "mcpProfileId",
        "model",
        "reasoningEffort",
        "approvalPolicy",
        "sandboxMode",
        "searchEnabled",
        "status",
        "createdAt",
        "updatedAt",
      ],
    },
    Project: {
      description: "Operational project/front that aggregates related threads, tasks, stakeholders and channels.",
      fields: ["id", "slug", "name", "description", "status", "createdAt", "updatedAt"],
    },
    Person: {
      description: "Operational contact/person with contextual relationship to Leonardo and reusable contact points.",
      fields: ["id", "name", "company", "relationshipDescription", "notes", "createdAt", "updatedAt"],
    },
    Thread: {
      description: "Canonical operational subject with objective, participants, channels and logs.",
      fields: ["id", "slug", "name", "objective", "status", "projectId?", "createdAt", "updatedAt", "archivedAt?"],
    },
    Task: {
      description: "Executable operational work item optionally linked to a thread and project.",
      fields: [
        "id",
        "slug",
        "name",
        "objective",
        "description",
        "status",
        "threadId?",
        "projectId?",
        "createdAt",
        "updatedAt",
        "doneAt?",
        "archivedAt?",
      ],
    },
    ProjectStakeholder: {
      description: "Links a person to a project with a project-specific role.",
      fields: ["projectId", "personId", "role", "createdAt"],
    },
    PersonContact: {
      description: "Named contact line for a person, stored as name/value.",
      fields: ["id", "personId", "name", "value", "createdAt"],
    },
    ProjectChannel: {
      description: "Named channel line for a project, stored as name/value.",
      fields: ["id", "projectId", "name", "value", "createdAt"],
    },
    ThreadChannel: {
      description: "Named channel line for a thread, stored as name/value.",
      fields: ["id", "threadId", "name", "value", "createdAt"],
    },
    ThreadPerson: {
      description: "Links involved people to a thread.",
      fields: ["threadId", "personId", "createdAt"],
    },
    ThreadLog: {
      description: "Chronological thread log entry with optional author attribution.",
      fields: ["id", "threadId", "content", "authorName?", "createdAt"],
    },
    TaskLog: {
      description: "Chronological task log entry with optional author attribution.",
      fields: ["id", "taskId", "content", "authorName?", "createdAt"],
    },
  },
  relations: [
    {
      from: "Project",
      to: "Thread",
      description: "A project can own many threads; a thread belongs to zero or one project in v1.",
    },
    {
      from: "Project",
      to: "Task",
      description: "A project can own many tasks; a task belongs to zero or one project in v1.",
    },
    {
      from: "Thread",
      to: "Task",
      description: "A thread can originate many tasks; a task belongs to zero or one thread in v1.",
    },
    {
      from: "Project",
      to: "ProjectStakeholder",
      description: "Stakeholders are contextual links between projects and people.",
    },
    {
      from: "Person",
      to: "PersonContact",
      description: "A person can hold many name/value contact points.",
    },
    {
      from: "Project",
      to: "ProjectChannel",
      description: "A project can hold many name/value channels.",
    },
    {
      from: "Thread",
      to: "ThreadChannel",
      description: "A thread can hold many name/value channels.",
    },
    {
      from: "Thread",
      to: "ThreadPerson",
      description: "A thread can involve many people via a join entity.",
    },
    {
      from: "Thread",
      to: "ThreadLog",
      description: "A thread keeps chronological operational logs.",
    },
    {
      from: "Task",
      to: "TaskLog",
      description: "A task keeps chronological execution logs.",
    },
  ],
  deferredDecisions: [
    "Whether v1 surface after blueprint should include CLI only or CLI plus HTTP at the same time.",
    "Import strategy from existing Markdown/JSON sources into Prisma.",
    "Export strategy back to operations/* as derived documents.",
    "Whether tasks or threads will ever require many-to-many project associations beyond v1.",
  ],
};

