import type { OperationalRepository } from "../ports/OperationalRepository.js";
import type {
  CreateTaskInput,
  TaskListOptions,
  TaskRecord,
  TaskSummary,
  UpdateTaskStatusInput,
} from "../../domain/models.js";

export class TaskService {
  public constructor(private readonly repository: OperationalRepository) {}

  public listTasks(options?: TaskListOptions): Promise<TaskSummary[]> {
    return this.repository.listTasks(options);
  }

  public getTask(slug: string): Promise<TaskRecord | null> {
    return this.repository.getTaskBySlug(slug);
  }

  public createTask(input: CreateTaskInput): Promise<TaskRecord> {
    return this.repository.createTask(input);
  }

  public updateStatus(input: UpdateTaskStatusInput): Promise<TaskRecord> {
    return this.repository.updateTaskStatus(input);
  }
}
