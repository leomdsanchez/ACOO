import type {
  OperationalRegistryPersonRecord,
  OperationalRegistryProjectRecord,
  OperationalRegistrySummary,
  OperationalRegistryTaskRecord,
  OperationalRegistryThreadRecord,
} from "../../domain/OperationalRegistry.js";

export interface OperationalRegistryReadRepository {
  getSummary(): Promise<OperationalRegistrySummary>;
  listPeople(): Promise<OperationalRegistryPersonRecord[]>;
  listProjects(): Promise<OperationalRegistryProjectRecord[]>;
  listTasks(): Promise<OperationalRegistryTaskRecord[]>;
  listThreads(): Promise<OperationalRegistryThreadRecord[]>;
}
