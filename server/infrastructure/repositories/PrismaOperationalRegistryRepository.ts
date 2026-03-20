import type {
  PersonContact,
  ProjectChannel,
  ThreadChannel,
} from "@prisma/client";
import type { OperationalRegistryReadRepository } from "../../application/ports/OperationalRegistryReadRepository.js";
import type {
  OperationalRegistryNameValue,
  OperationalRegistryPersonRecord,
  OperationalRegistryProjectRecord,
  OperationalRegistrySummary,
  OperationalRegistryTaskRecord,
  OperationalRegistryThreadRecord,
} from "../../domain/OperationalRegistry.js";
import { getPrismaClient } from "../../prisma/client.js";

export class PrismaOperationalRegistryRepository implements OperationalRegistryReadRepository {
  private readonly prisma;

  public constructor(repoRoot: string) {
    this.prisma = getPrismaClient(repoRoot);
  }

  public async getSummary(): Promise<OperationalRegistrySummary> {
    const [agents, people, projects, tasks, threads] = await Promise.all([
      this.prisma.agent.count(),
      this.prisma.person.count(),
      this.prisma.project.count(),
      this.prisma.task.count(),
      this.prisma.thread.count(),
    ]);

    return { agents, people, projects, tasks, threads };
  }

  public async listProjects(): Promise<OperationalRegistryProjectRecord[]> {
    const records = await this.prisma.project.findMany({
      include: {
        channels: true,
        stakeholders: {
          include: {
            person: true,
          },
          orderBy: [{ createdAt: "asc" }, { role: "asc" }],
        },
        _count: {
          select: {
            tasks: true,
            threads: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return records.map((record) => ({
      channels: record.channels.map(mapNameValue),
      createdAt: record.createdAt.toISOString(),
      description: record.description,
      id: record.id,
      name: record.name,
      slug: record.slug,
      stakeholders: record.stakeholders.map((item) => ({
        createdAt: item.createdAt.toISOString(),
        personId: item.personId,
        personName: item.person.name,
        role: item.role,
      })),
      status: record.status,
      taskCount: record._count.tasks,
      threadCount: record._count.threads,
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  public async listPeople(): Promise<OperationalRegistryPersonRecord[]> {
    const records = await this.prisma.person.findMany({
      include: {
        contacts: {
          orderBy: [{ createdAt: "asc" }, { name: "asc" }],
        },
      },
      orderBy: { name: "asc" },
    });

    return records.map((record) => ({
      company: record.company,
      contacts: record.contacts.map(mapNameValue),
      createdAt: record.createdAt.toISOString(),
      id: record.id,
      name: record.name,
      notes: record.notes,
      relationshipDescription: record.relationshipDescription,
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  public async listThreads(): Promise<OperationalRegistryThreadRecord[]> {
    const records = await this.prisma.thread.findMany({
      include: {
        channels: {
          orderBy: [{ createdAt: "asc" }, { name: "asc" }],
        },
        logs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        people: {
          include: {
            person: true,
          },
          orderBy: { createdAt: "asc" },
        },
        project: true,
        _count: {
          select: {
            logs: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return records.map((record) => ({
      archivedAt: record.archivedAt?.toISOString() ?? null,
      channels: record.channels.map(mapNameValue),
      createdAt: record.createdAt.toISOString(),
      id: record.id,
      lastLogAt: record.logs[0]?.createdAt.toISOString() ?? null,
      logCount: record._count.logs,
      name: record.name,
      objective: record.objective,
      people: record.people.map((item) => ({
        company: item.person.company,
        id: item.person.id,
        name: item.person.name,
      })),
      project: record.project
        ? {
            id: record.project.id,
            name: record.project.name,
            slug: record.project.slug,
          }
        : null,
      slug: record.slug,
      status: record.status,
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  public async listTasks(): Promise<OperationalRegistryTaskRecord[]> {
    const records = await this.prisma.task.findMany({
      include: {
        logs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        project: true,
        thread: true,
        _count: {
          select: {
            logs: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return records.map((record) => ({
      archivedAt: record.archivedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      description: record.description,
      doneAt: record.doneAt?.toISOString() ?? null,
      id: record.id,
      lastLogAt: record.logs[0]?.createdAt.toISOString() ?? null,
      logCount: record._count.logs,
      name: record.name,
      objective: record.objective,
      project: record.project
        ? {
            id: record.project.id,
            name: record.project.name,
            slug: record.project.slug,
          }
        : null,
      slug: record.slug,
      status: record.status,
      thread: record.thread
        ? {
            id: record.thread.id,
            name: record.thread.name,
            slug: record.thread.slug,
          }
        : null,
      updatedAt: record.updatedAt.toISOString(),
    }));
  }
}

function mapNameValue(
  record: PersonContact | ProjectChannel | ThreadChannel,
): OperationalRegistryNameValue {
  return {
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    name: record.name,
    value: record.value,
  };
}
