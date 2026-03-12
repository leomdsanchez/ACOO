import type { OperationalRepository } from "../ports/OperationalRepository.js";
import type { CreateProjectInput, ProjectRecord } from "../../domain/models.js";

export class ProjectService {
  public constructor(private readonly repository: OperationalRepository) {}

  public listProjects(): Promise<ProjectRecord[]> {
    return this.repository.listProjects();
  }

  public createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    return this.repository.createProject(input);
  }
}
