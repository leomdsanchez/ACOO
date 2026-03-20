import type { OperationalRegistryReadRepository } from "../ports/OperationalRegistryReadRepository.js";
import type {
  OperationalRegistryPersonRecord,
  OperationalRegistryProjectRecord,
  OperationalRegistrySummary,
  OperationalRegistryTaskRecord,
  OperationalRegistryThreadRecord,
} from "../../domain/OperationalRegistry.js";

export class OperationalRegistryService {
  public constructor(private readonly repository: OperationalRegistryReadRepository) {}

  public getSummary(): Promise<OperationalRegistrySummary> {
    return this.repository.getSummary();
  }

  public listProjects(): Promise<OperationalRegistryProjectRecord[]> {
    return this.repository.listProjects();
  }

  public listPeople(): Promise<OperationalRegistryPersonRecord[]> {
    return this.repository.listPeople();
  }

  public listThreads(): Promise<OperationalRegistryThreadRecord[]> {
    return this.repository.listThreads();
  }

  public listTasks(): Promise<OperationalRegistryTaskRecord[]> {
    return this.repository.listTasks();
  }
}
