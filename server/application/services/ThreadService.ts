import type { OperationalRepository } from "../ports/OperationalRepository.js";
import type {
  AppendThreadLogInput,
  CreateThreadInput,
  ThreadListOptions,
  ThreadRecord,
  ThreadSummary,
} from "../../domain/models.js";

export class ThreadService {
  public constructor(private readonly repository: OperationalRepository) {}

  public listThreads(options?: ThreadListOptions): Promise<ThreadSummary[]> {
    return this.repository.listThreads(options);
  }

  public getThread(slug: string): Promise<ThreadRecord | null> {
    return this.repository.getThreadBySlug(slug);
  }

  public createThread(input: CreateThreadInput): Promise<ThreadRecord> {
    return this.repository.createThread(input);
  }

  public appendLog(input: AppendThreadLogInput): Promise<ThreadRecord> {
    return this.repository.appendThreadLog(input);
  }
}
